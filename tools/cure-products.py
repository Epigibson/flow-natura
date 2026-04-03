import os
import requests
from dotenv import load_dotenv
import re
import sys

# Cargar variables de entorno
load_dotenv()

SUPABASE_URL = os.getenv("PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Faltan credenciales de Supabase en .env")
    sys.exit(1)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal,resolution=merge-duplicates"
}

# Unidades posibles
SIZES = ['ml', 'g', 'kg', 'l', 'mililitros', 'gramos', 'kilos', 'litros']

def cure_name(name):
    original = name
    
    # --- LIMPIEZA DE BASURA ---
    # Eliminar textos promocionales o basura que se haya colado del PDF
    garbage_patterns = [
        r'Vegano\*\*.*',
        r'Repuesto \d+ Pts.*',
        r'Te Ahorras.*',
        r'\$\s*\d+.*', # Cosas que sigan con un precio colado
        r'\(\d{5,}\).*', # Códigos atrapados en paréntesis 
        r'Jabones en Barra.*', # Textos largos que se pegaron a jabones
        r'(?i)puntos.*'
    ]
    for p in garbage_patterns:
        name = re.sub(p, '', name)

    # 1. Extraer el tamaño si existe en cualquier parte del string
    pattern = r'(?i)(?:\b|(?<=\d))(\d+(?:[.,]\d+)?)\s*(' + '|'.join(SIZES) + r')\b'
    match = re.search(pattern, name)
    size_part = ''
    
    if match:
        size_val = match.group(1).replace(',', '.') # Normalizar coma a punto
        size_unit = match.group(2).upper()
        
        # Reducir algunos nombres largos
        if size_unit in ['MILILITROS']: size_unit = 'ML'
        if size_unit in ['GRAMOS']: size_unit = 'G'
        if size_unit in ['KILOS']: size_unit = 'KG'
        if size_unit in ['LITROS']: size_unit = 'L'
            
        size_part = f', {size_val}{size_unit}'
        # Quitar el tamaño del nombre original
        name = re.sub(pattern, '', name)

    # 2. Limpieza de caracteres residuales (- , .) al final o inicio, y comillas dobles o simples erróneas
    name = re.sub(r'^[-\s,.\'"]+|[-\s,.\'"]+$', '', name)
    
    # 3. Quitar espacios múltiples
    name = re.sub(r'\s+', ' ', name).strip()
    
    # 4. Convertir a Start Case / Title Case
    words = name.split(' ')
    lowercase_words = ['de', 'la', 'el', 'en', 'y', 'con', 'para', 'o', 'las', 'los']
    cured_words = []
    
    for i, word in enumerate(words):
        word_lower = word.lower()
        if i > 0 and word_lower in lowercase_words:
            cured_words.append(word_lower)
        else:
            cured_words.append(word.capitalize())
            
    cured_name_base = ' '.join(cured_words)
    
    # Excepciones que el capitalize rompió (ej. Dia -> Día)
    cured_name_base = cured_name_base.replace('Dia ', 'Día ').replace('Tododia', 'Todo Día')
    # A veces quedó vacío si todo era basura
    if not cured_name_base:
        return original
        
    final_name = cured_name_base + size_part
    
    # Un último sanity check para no dejar coma sola
    final_name = re.sub(r'^\s*,\s*', '', final_name)
    return final_name

def process_batch():
    try:
        limit = 1000
        offset = 0
        total_updated = 0
        
        print("🔍 Recuperando productos de Supabase...")
        
        while True:
            # Added order=id.asc to avoid skipping rows when they are updated
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
                
            updates = []
            for p in products:
                original = p['name']
                if not original: continue
                
                cured = cure_name(original)
                if cured != original:
                    p['name'] = cured
                    updates.append(p)
            
            # Upsert
            if updates:
                chunk_size = 100
                for i in range(0, len(updates), chunk_size):
                    chunk = updates[i:i + chunk_size]
                    upsert_res = requests.post(
                        f"{SUPABASE_URL}/rest/v1/products?on_conflict=id",
                        headers=HEADERS,
                        json=chunk
                    )
                    if upsert_res.status_code not in (200, 201, 204):
                        print(f"⚠️ Error upserting chunk: {upsert_res.text}")
                    
                total_updated += len(updates)
                
            print(f"🔹 Evaluados: offset {offset} -> Curados en este lote: {len(updates)}")
            offset += limit
            
        print(f"\n🎉 ¡Proceso completado! Se han curado {total_updated} nombres de productos.")
        
    except Exception as e:
        print(f"❌ Error al curar productos: {e}")

if __name__ == "__main__":
    process_batch()
