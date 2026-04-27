"""
╔══════════════════════════════════════════════════════════╗
║   Natura Catalog Scanner — Powered by Gemini AI         ║
║   Extrae productos de catálogos PDF automáticamente     ║
╚══════════════════════════════════════════════════════════╝

Uso:
  python scan-catalog.py catalogo.pdf
  python scan-catalog.py catalogo.pdf --start 50 --end 100
  python scan-catalog.py catalogo.pdf --keys key1,key2,key3

Requisitos:
  pip install google-genai PyPDF2
"""

import sys
import os
import json
import csv
import time
import base64
import io
import argparse
from pathlib import Path

try:
    from google import genai
except ImportError:
    print("❌ Falta la librería google-genai. Instálala con:")
    print("   pip install google-genai")
    sys.exit(1)

try:
    from PyPDF2 import PdfReader, PdfWriter
except ImportError:
    print("❌ Falta la librería PyPDF2. Instálala con:")
    print("   pip install PyPDF2")
    sys.exit(1)


GEMINI_PROMPT = """Escanéa esta página de un catálogo de Natura y extrae todos los productos que encuentres.
Un producto válido debe tener al menos un código y un precio.

REGLA CRÍTICA DE VARIANTES:
Si ves un MISMO PRODUCTO con múltiples opciones (tonos de maquillaje, fragancias, tamaños), 
AGRÚPALOS bajo un solo nombre base. Cada opción es una "variante".
Ejemplos de variantes:
- Tonos de base/labial: "24F", "24N", "Nude", "Rosado"
- Tamaños: "100ml", "200ml", "400ml"
- Fragancias: "Cereza", "Vainilla", "Floral"

Devuelve el resultado EXCLUSIVAMENTE como un JSON Array estricto.
Cada objeto del arreglo debe tener esta estructura:
{
  "codigo": "string",
  "nombre": "string",
  "precio": 125.50,
  "puntos": 10,
  "categoria": "string",
  "variante": "string o null",
  "tipo_variante": "tono|tamaño|fragancia|null",
  "nombre_base": "string"
}

Reglas:
- "nombre": el nombre completo incluyendo la variante (ej: "Base Sérum Nude Me Una 24F")
- "nombre_base": el nombre SIN la variante (ej: "Base Sérum Nude Me Una"). 
  Si no tiene variante, es igual a "nombre".
- "variante": solo la parte de la variante (ej: "24F", "400ml", "Cereza"). 
  NULL si el producto no tiene variante.
- "tipo_variante": "tono" para colores/tonos, "tamaño" para ml/g, "fragancia" para aromas, null si no aplica.
- Si el precio dice "R$ 125,50" o "$125.50", conviértelo a flotante 125.50.
- Si la página no tiene productos legibles con código y precio, devuelve [].

IMPORTANTE: NO incluyas markdown, NO pongas ```json, SOLO devuelve el arreglo [] crudo."""


def extract_page_as_pdf_bytes(reader: PdfReader, page_index: int) -> bytes:
    """Extrae una página individual del PDF como bytes."""
    writer = PdfWriter()
    writer.add_page(reader.pages[page_index])
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def parse_gemini_response(text: str) -> list:
    """Limpia y parsea la respuesta JSON de Gemini."""
    json_str = text.strip()
    if json_str.startswith('```json'):
        json_str = json_str[7:]
    if json_str.startswith('```'):
        json_str = json_str[3:]
    if json_str.endswith('```'):
        json_str = json_str[:-3]
    
    import re
    match = re.search(r'\[[\s\S]*\]', json_str)
    if match:
        json_str = match.group(0)
    
    return json.loads(json_str)


def process_page(client, page_bytes: bytes, page_num: int, model: str) -> list:
    """Envía una página a Gemini y retorna los productos encontrados."""
    b64_data = base64.b64encode(page_bytes).decode('utf-8')
    
    response = client.models.generate_content(
        model=model,
        contents=[
            {
                "role": "user",
                "parts": [
                    {
                        "inline_data": {
                            "data": b64_data,
                            "mime_type": "application/pdf"
                        }
                    },
                    {"text": GEMINI_PROMPT}
                ]
            }
        ],
        config={"temperature": 0.1}
    )
    
    response_text = response.text or ''
    return parse_gemini_response(response_text)


def save_progress(products: list, output_dir: str, base_name: str):
    """Guarda los productos en CSV y JSON."""
    csv_path = os.path.join(output_dir, f"{base_name}.csv")
    json_path = os.path.join(output_dir, f"{base_name}.json")
    
    # CSV
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['codigo', 'nombre', 'precio', 'puntos', 'categoria'])
        writer.writeheader()
        writer.writerows(products)
    
    # JSON
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(products, f, ensure_ascii=False, indent=2)
    
    return csv_path, json_path


def main():
    parser = argparse.ArgumentParser(
        description='🌿 Natura Catalog Scanner — Extrae productos de PDFs con Gemini AI'
    )
    parser.add_argument('pdf', help='Ruta al archivo PDF del catálogo')
    parser.add_argument('--start', type=int, default=1, help='Página de inicio (default: 1)')
    parser.add_argument('--end', type=int, default=0, help='Página final (default: última)')
    parser.add_argument('--keys', type=str, default='', help='API keys separadas por coma (para rotar)')
    parser.add_argument('--key', type=str, default='', help='Una sola API key')
    parser.add_argument('--model', type=str, default='gemini-2.0-flash', help='Modelo de Gemini (default: gemini-2.0-flash)')
    parser.add_argument('--delay', type=float, default=2.0, help='Segundos entre peticiones (default: 2.0)')
    parser.add_argument('--output', type=str, default='', help='Directorio de salida (default: mismo que el PDF)')
    
    args = parser.parse_args()
    
    # Validar PDF
    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        print(f"❌ No se encontró el archivo: {pdf_path}")
        sys.exit(1)
    
    # API Keys
    api_keys = []
    if args.keys:
        api_keys = [k.strip() for k in args.keys.split(',') if k.strip()]
    elif args.key:
        api_keys = [args.key.strip()]
    else:
        # Intentar leer de .env
        env_path = Path(__file__).parent.parent / '.env'
        if env_path.exists():
            with open(env_path) as f:
                for line in f:
                    if line.startswith('GEMINI_API_KEY='):
                        api_keys = [line.split('=', 1)[1].strip()]
                        break
    
    if not api_keys:
        print("❌ Necesitas una API Key de Gemini.")
        print("   Opciones:")
        print("   --key TU_API_KEY")
        print("   --keys KEY1,KEY2,KEY3  (para rotar)")
        print("   O añade GEMINI_API_KEY=... en tu .env")
        sys.exit(1)
    
    # Cargar PDF
    print(f"\n🌿 Natura Catalog Scanner")
    print(f"{'─' * 50}")
    print(f"📄 Archivo: {pdf_path.name}")
    
    reader = PdfReader(str(pdf_path))
    total_pages = len(reader.pages)
    print(f"📑 Total páginas: {total_pages}")
    print(f"🤖 Modelo: {args.model}")
    print(f"🔑 API Keys: {len(api_keys)} disponible(s)")
    
    start_idx = max(0, args.start - 1)
    end_idx = min(total_pages - 1, (args.end - 1) if args.end > 0 else total_pages - 1)
    pages_to_process = end_idx - start_idx + 1
    
    print(f"📖 Rango: página {start_idx + 1} a {end_idx + 1} ({pages_to_process} páginas)")
    print(f"{'─' * 50}\n")
    
    # Output
    output_dir = args.output or str(pdf_path.parent)
    base_name = f"productos_{pdf_path.stem}"
    
    all_products = []
    current_key_idx = 0
    errors = 0
    
    for i in range(start_idx, end_idx + 1):
        page_num = i + 1
        progress = i - start_idx + 1
        pct = (progress / pages_to_process) * 100
        
        print(f"[{progress}/{pages_to_process}] ({pct:.0f}%) Procesando página {page_num}...", end=' ', flush=True)
        
        # Extraer página
        page_bytes = extract_page_as_pdf_bytes(reader, i)
        page_kb = len(page_bytes) / 1024
        
        # Intentar con retry y rotación de keys
        max_retries = 3 * len(api_keys)  # 3 intentos por key
        success = False
        
        for attempt in range(max_retries):
            api_key = api_keys[current_key_idx % len(api_keys)]
            client = genai.Client(api_key=api_key)
            
            try:
                products = process_page(client, page_bytes, page_num, args.model)
                
                if products:
                    all_products.extend(products)
                    print(f"✅ {len(products)} productos ({page_kb:.0f} KB)")
                else:
                    print(f"— sin productos ({page_kb:.0f} KB)")
                
                success = True
                break
                
            except Exception as e:
                err_msg = str(e)
                
                if '429' in err_msg or 'quota' in err_msg.lower() or 'rate' in err_msg.lower():
                    # Rotar a siguiente key
                    current_key_idx += 1
                    if current_key_idx < len(api_keys):
                        print(f"\n   ⚠️  Cuota agotada en key #{current_key_idx}. Rotando a key #{current_key_idx + 1}...")
                        continue
                    else:
                        # Todas las keys agotadas, esperar
                        wait = min(60 * (attempt + 1), 300)
                        print(f"\n   ⏳ Todas las keys agotadas. Esperando {wait}s...")
                        current_key_idx = 0  # Reset para volver a intentar
                        time.sleep(wait)
                        continue
                else:
                    print(f"❌ {err_msg[:100]}")
                    errors += 1
                    break
        
        if not success:
            errors += 1
        
        # Guardar progreso cada 10 páginas
        if progress % 10 == 0 and all_products:
            csv_path, json_path = save_progress(all_products, output_dir, base_name)
            print(f"   💾 Progreso guardado: {len(all_products)} productos")
        
        # Delay entre peticiones
        if i < end_idx:
            time.sleep(args.delay)
    
    # Guardar resultado final
    print(f"\n{'═' * 50}")
    
    if all_products:
        csv_path, json_path = save_progress(all_products, output_dir, base_name)
        print(f"✅ Extracción completada!")
        print(f"   📊 Total productos: {len(all_products)}")
        print(f"   ❌ Errores: {errors}")
        print(f"   📁 CSV: {csv_path}")
        print(f"   📁 JSON: {json_path}")
    else:
        print(f"⚠️  No se extrajeron productos. Errores: {errors}")
    
    print(f"{'═' * 50}\n")


if __name__ == '__main__':
    main()
