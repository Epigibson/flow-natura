import os
import requests
import json
import re
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

SUPABASE_URL = os.getenv("PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
GEMINI_KEY = os.getenv("GEMINI_API_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Faltan credenciales de Supabase en .env")
    exit(1)

if not GEMINI_KEY or "expired" in GEMINI_KEY.lower() or GEMINI_KEY.startswith("AIzaSyDCmOg"):
    print("❌ Por favor actualiza tu GEMINI_API_KEY en el archivo .env con una clave válida.")
    exit(1)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal,resolution=merge-duplicates"
}

def get_bad_products():
    print("🔍 Recuperando productos con nombres rotos desde Supabase...")
    bad_products = []
    limit = 1000
    offset = 0
    
    while True:
        res = requests.get(
            f"{SUPABASE_URL}/rest/v1/products?select=id,name,code,brand,price,points,cost&order=id.asc&limit={limit}&offset={offset}",
            headers=HEADERS
        )
        if res.status_code != 200:
            print(f"❌ Error al consultar la API: {res.text}")
            break
            
        products = res.json()
        if len(products) == 0:
            break
            
        for p in products:
            name = p.get('name', '')
            if not name: continue
            
            # Heurísticas de nombres rotos extraídos previamente
            if (
                'Repuesto Repuesto' in name or 
                'Pts' in name or 
                name.startswith('$') or 
                name.endswith(')') or
                'Vegano**' in name or
                'Te Ahorras' in name or
                re.search(r'^\d+$', name)
            ):
                bad_products.append(p)
                
        offset += limit
        
    print(f"📦 Se encontraron {len(bad_products)} productos con nombres rotos.")
    return bad_products

def ask_gemini_to_fix(products_chunk):
    # Formateamos una lista simple para el prompt
    items_text = ""
    for p in products_chunk:
        items_text += f"- ID: {p['id']} | Código Natura: {p['code']} | Nombre roto: {p['name']}\n"
        
    prompt = f"""
Eres un experto en el catálogo de productos Natura México y Avon.
Tengo una lista de productos extraídos escaneando un PDF, pero el diseño de las páginas hizo que se extrajera texto basura (precios, puntajes "Pts", la palabra "Repuesto" repetida, u otras frases que no son el nombre).

Tu trabajo es reparar el nombre oficial del producto guiándote por el 'Código Natura' y el 'Nombre roto'.
Ejemplo 1: Código 156237 con nombre "$ 117 9 Pts Repuesto Repuesto" -> "Repuesto Jabon para Manos de Pitanga, 180ML"
Ejemplo 2: Código 118999 -> "Repuesto Frescor Eau de Toilette Ishpink Maracuyá"

Reglas:
1. Devuelve ÚNICAMENTE un arreglo JSON válido, no uses markdown ni texto extra.
2. Cada objeto del JSON debe tener las claves: "id" y "name".
3. El "name" debe ser el nombre real corregido (Capitalized/Title Case), y con su medida (ej. 150ML, 75G) si es aplicable.

Lista a corregir:
{items_text}
"""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json"
        }
    }
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_KEY}"
    res = requests.post(url, json=payload)
    
    if res.status_code != 200:
        print(f"❌ Error de Gemini: {res.status_code}")
        print(res.text)
        return []
        
    try:
        data = res.json()
        response_text = data['candidates'][0]['content']['parts'][0]['text']
        # Limpiar por si acaso manda markdown
        response_text = response_text.replace("```json", "").replace("```", "").strip()
        fixed_list = json.loads(response_text)
        return fixed_list
    except Exception as e:
        print(f"❌ Excepción al parsear respuesta de Gemini: {e}")
        return []

import time

def main():
    bad_products = get_bad_products()
    if not bad_products:
        print("✅ No hay productos rotos para arreglar.")
        return
        
    all_updates = []
    chunk_size = 30 # Enviamos a Gemini de 30 en 30 para no saturar el prompt
    
    print("🤖 Consultando a Gemini para arreglar nombres...")
    for i in range(0, len(bad_products), chunk_size):
        chunk = bad_products[i:i + chunk_size]
        print(f"  -> Procesando lote {i//chunk_size + 1} de {(len(bad_products) + chunk_size - 1)//chunk_size}...")
        
        fixed_chunk = ask_gemini_to_fix(chunk)
        if fixed_chunk:
            # Asociar de nuevo la fila completa para el upsert (por seguridad en Supabase)
            # Solo actualizamos el nombre
            for fix in fixed_chunk:
                original = next((p for p in chunk if p['id'] == fix['id']), None)
                if original:
                    original['name'] = fix['name']
                    all_updates.append(original)
                    print(f"    ✨ Arreglado: [{original['code']}] {fix['name']}")
        
        time.sleep(5)
                    
    if all_updates:
        print(f"💾 Guardando {len(all_updates)} correcciones en Supabase...")
        res = requests.post(
            f"{SUPABASE_URL}/rest/v1/products?on_conflict=id",
            headers=HEADERS,
            json=all_updates
        )
        if res.status_code in (200, 201, 204):
            print("🎉 ¡Nombres rotos corregidos con éxito en la base de datos!")
        else:
            print(f"⚠️ Error guardando en Supabase: {res.text}")
            
if __name__ == "__main__":
    main()
