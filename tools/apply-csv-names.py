import os
import requests
import csv
from dotenv import load_dotenv

load_dotenv()
SUPABASE_URL = os.getenv("PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal,resolution=merge-duplicates"
}

def main():
    updates = []
    try:
        with open('productos_a_arreglar.csv', 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                correct_name = row.get('NOMBRE_CORRECTO_AQUI', '').strip()
                if correct_name:
                    updates.append({
                        'id': row['ID'],
                        'name': correct_name  # Actualizamos solo el nombre
                    })
    except FileNotFoundError:
        print("❌ No se encontró el archivo 'productos_a_arreglar.csv'.")
        return

    if not updates:
        print("⚠️ No hay nombres nuevos agregados en la columna 'NOMBRE_CORRECTO_AQUI'.")
        return

    print(f"💾 Guardando {len(updates)} correcciones desde el CSV en Supabase...")
    
    # Supabase permite upserts en batch
    chunk_size = 100
    for i in range(0, len(updates), chunk_size):
        chunk = updates[i:i + chunk_size]
        res = requests.post(
            f"{SUPABASE_URL}/rest/v1/products?on_conflict=id",
            headers=HEADERS,
            json=chunk
        )
        if res.status_code not in (200, 201, 204):
            print(f"⚠️ Error guardando en Supabase: {res.text}")
            return
            
    print("🎉 ¡Nombres corregidos con éxito!")

if __name__ == "__main__":
    main()
