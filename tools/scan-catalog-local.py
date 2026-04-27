"""
╔══════════════════════════════════════════════════════════╗
║   Natura Catalog Scanner — Local Edition (sin API)      ║
║   Extrae productos de catálogos PDF con pdfplumber      ║
║   100% offline, gratis, sin límites                     ║
╚══════════════════════════════════════════════════════════╝

Uso:
  python scan-catalog-local.py "C:\\ruta\\catalogo.pdf"
  python scan-catalog-local.py "C:\\ruta\\catalogo.pdf" --start 10 --end 50

Requisitos:
  pip install pdfplumber
"""

import sys
import os
import re
import json
import csv
import argparse
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    print("❌ Instala pdfplumber: pip install pdfplumber")
    sys.exit(1)


# Patterns for detecting variants in product names
VARIANT_PATTERNS = [
    # Tones: "24F", "24N", "03W", "Nude", "Rosado Claro"
    (r'\b(\d{1,3}[A-Z]{1,2})\b', 'tono'),
    # Sizes: "100ml", "200 ml", "50g"
    (r'(\d+(?:[.,]\d+)?\s*(?:ml|g|kg|l))\b', 'tamaño'),
    # Common shade words
    (r'\b(Nude|Rosado|Beige|Natural|Claro|Medio|Oscuro|Moreno|Canela|Miel|Caramelo|Chocolate|Café)\b', 'tono'),
]

def detect_variant(name: str) -> tuple:
    """Detect if a product name contains a variant. Returns (base_name, variant_label, variant_type) or (name, None, None)."""
    for pattern, vtype in VARIANT_PATTERNS:
        match = re.search(pattern, name, re.IGNORECASE)
        if match:
            variant_label = match.group(1).strip()
            # Build base name by removing the variant part
            base_name = name[:match.start()].strip().rstrip('-,').strip()
            if not base_name or len(base_name) < 5:
                base_name = name  # Don't strip if base would be too short
                continue
            return base_name, variant_label, vtype
    return name, None, None


def extract_products_from_text(text: str, page_num: int) -> list:
    """
    Extrae productos del texto de una página del catálogo Natura.
    Busca patrones de: código, nombre, precio, puntos.
    """
    products = []
    
    if not text or len(text.strip()) < 10:
        return products
    
    # === ESTRATEGIA 1: Buscar códigos de producto (5-6 dígitos entre paréntesis) ===
    # Patrón: (69062) seguido de puntos "74 pts" y precio "$ 1,189"
    code_pattern = re.compile(
        r'\((\d{4,6})\)',  # Código entre paréntesis
        re.MULTILINE
    )
    
    # Buscar todos los precios en el texto
    price_pattern = re.compile(
        r'\$\s*([\d,]+(?:\.\d{1,2})?)',  # $1,189 o $765.50
        re.MULTILINE
    )
    
    # Buscar puntos
    points_pattern = re.compile(
        r'(\d+)\s*pts',
        re.IGNORECASE
    )
    
    codes = [(m.group(1), m.start()) for m in code_pattern.finditer(text)]
    prices = [(m.group(1), m.start()) for m in price_pattern.finditer(text)]
    points = [(m.group(1), m.start()) for m in points_pattern.finditer(text)]
    
    for code, code_pos in codes:
        # Buscar el precio más cercano al código (dentro de 300 chars)
        best_price = None
        best_price_dist = 999999
        for price_str, price_pos in prices:
            dist = abs(price_pos - code_pos)
            if dist < best_price_dist and dist < 300:
                best_price_dist = dist
                price_clean = price_str.replace(',', '')
                try:
                    best_price = float(price_clean)
                except:
                    pass
        
        if best_price is None or best_price < 1:
            continue
        
        # Buscar puntos más cercanos al código
        best_points = None
        best_pts_dist = 999999
        for pts_str, pts_pos in points:
            dist = abs(pts_pos - code_pos)
            if dist < best_pts_dist and dist < 200:
                best_pts_dist = dist
                try:
                    best_points = int(pts_str)
                except:
                    pass
        
        # Extraer nombre: texto entre líneas alrededor del código
        # Tomar texto antes del código (hasta 150 chars, sin incluir otro código)
        name_start = max(0, code_pos - 150)
        name_region = text[name_start:code_pos]
        
        # Limpiar: quitar líneas vacías y texto demasiado corto
        name_lines = [l.strip() for l in name_region.split('\n') if l.strip() and len(l.strip()) > 2]
        # Filtrar líneas que son solo precios, puntos, o patrones no deseados
        name_lines = [l for l in name_lines if not re.match(r'^[\$\d,.\s]+$', l) 
                      and not re.match(r'^\d+\s*pts?$', l, re.IGNORECASE)
                      and not re.match(r'^\(\d+\)', l)
                      and not re.match(r'^(de|a|en)\s', l, re.IGNORECASE)
                      and 'descuento' not in l.lower()
                      and 'oportunidades' not in l.lower()
                      and 'ciclo' not in l.lower()]
        
        name = ' '.join(name_lines[-3:]) if name_lines else f'Producto {code}'
        name = re.sub(r'\s+', ' ', name).strip()
        
        # Evitar duplicados por código
        if any(p['codigo'] == code for p in products):
            continue
        
        # Detect variants
        base_name, variant_label, variant_type = detect_variant(name[:120])
        
        products.append({
            'codigo': code,
            'nombre': name[:120],
            'nombre_base': base_name,
            'variante': variant_label,
            'tipo_variante': variant_type,
            'precio': best_price,
            'puntos': best_points,
            'categoria': None,
            'pagina': page_num
        })
    
    # === ESTRATEGIA 2: Buscar códigos sin paréntesis (formato "Cód. 12345" o solo número suelto) ===
    alt_code_pattern = re.compile(
        r'(?:Cód\.?\s*|cod\.?\s*|código\s*)(\d{4,6})',
        re.IGNORECASE
    )
    for m in alt_code_pattern.finditer(text):
        code = m.group(1)
        code_pos = m.start()
        
        if any(p['codigo'] == code for p in products):
            continue
        
        best_price = None
        best_price_dist = 999999
        for price_str, price_pos in prices:
            dist = abs(price_pos - code_pos)
            if dist < best_price_dist and dist < 300:
                best_price_dist = dist
                price_clean = price_str.replace(',', '')
                try:
                    best_price = float(price_clean)
                except:
                    pass
        
        if best_price and best_price >= 1:
            name_start = max(0, code_pos - 150)
            name_region = text[name_start:code_pos]
            name_lines = [l.strip() for l in name_region.split('\n') if l.strip() and len(l.strip()) > 2]
            name_lines = [l for l in name_lines if not re.match(r'^[\$\d,.\s]+$', l)]
            name = ' '.join(name_lines[-2:]) if name_lines else f'Producto {code}'
            
            base_name, variant_label, variant_type = detect_variant(name[:120])
            
            products.append({
                'codigo': code,
                'nombre': name[:120],
                'nombre_base': base_name,
                'variante': variant_label,
                'tipo_variante': variant_type,
                'precio': best_price,
                'puntos': None,
                'categoria': None,
                'pagina': page_num
            })
    
    return products


def save_results(products: list, output_dir: str, base_name: str):
    """Guarda en CSV y JSON."""
    csv_path = os.path.join(output_dir, f"{base_name}.csv")
    json_path = os.path.join(output_dir, f"{base_name}.json")
    
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['codigo', 'nombre', 'nombre_base', 'variante', 'tipo_variante', 'precio', 'puntos', 'categoria', 'pagina'])
        writer.writeheader()
        writer.writerows(products)
    
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(products, f, ensure_ascii=False, indent=2)
    
    return csv_path, json_path


def main():
    parser = argparse.ArgumentParser(description='🌿 Natura Catalog Scanner — Local (sin API)')
    parser.add_argument('pdf', help='Ruta al PDF del catálogo')
    parser.add_argument('--start', type=int, default=1, help='Página de inicio')
    parser.add_argument('--end', type=int, default=0, help='Página final (default: última)')
    parser.add_argument('--output', type=str, default='', help='Directorio de salida')
    parser.add_argument('--verbose', action='store_true', help='Mostrar texto extraído')
    
    args = parser.parse_args()
    
    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        print(f"❌ No se encontró: {pdf_path}")
        sys.exit(1)
    
    print(f"\n🌿 Natura Catalog Scanner (Local — sin API)")
    print(f"{'─' * 50}")
    print(f"📄 Archivo: {pdf_path.name} ({pdf_path.stat().st_size / 1024 / 1024:.1f} MB)")
    
    with pdfplumber.open(str(pdf_path)) as pdf:
        total_pages = len(pdf.pages)
        print(f"📑 Páginas: {total_pages}")
        
        start_idx = max(0, args.start - 1)
        end_idx = min(total_pages - 1, (args.end - 1) if args.end > 0 else total_pages - 1)
        pages_to_process = end_idx - start_idx + 1
        
        print(f"📖 Rango: {start_idx + 1} a {end_idx + 1} ({pages_to_process} páginas)")
        print(f"{'─' * 50}\n")
        
        all_products = []
        pages_with_products = 0
        pages_empty = 0
        
        for i in range(start_idx, end_idx + 1):
            page_num = i + 1
            progress = i - start_idx + 1
            pct = (progress / pages_to_process) * 100
            
            page = pdf.pages[i]
            text = page.extract_text() or ''
            
            # También extraer tablas y combinar
            tables = page.extract_tables() or []
            for table in tables:
                for row in table:
                    if row:
                        text += '\n' + ' '.join(str(cell) for cell in row if cell)
            
            if args.verbose and text.strip():
                print(f"\n{'─' * 40}")
                print(f"Texto pág {page_num}:\n{text[:500]}")
                print(f"{'─' * 40}")
            
            products = extract_products_from_text(text, page_num)
            
            if products:
                all_products.extend(products)
                pages_with_products += 1
                codes = ', '.join(p['codigo'] for p in products[:5])
                extra = f" +{len(products)-5} más" if len(products) > 5 else ""
                print(f"[{progress}/{pages_to_process}] ({pct:3.0f}%) Pág {page_num}: ✅ {len(products)} productos [{codes}{extra}]")
            else:
                pages_empty += 1
                reason = "sin texto" if not text.strip() else "sin códigos"
                print(f"[{progress}/{pages_to_process}] ({pct:3.0f}%) Pág {page_num}: — {reason}")
        
        # Deduplicar por código
        seen = set()
        unique_products = []
        for p in all_products:
            if p['codigo'] not in seen:
                seen.add(p['codigo'])
                unique_products.append(p)
        
        dupes = len(all_products) - len(unique_products)
        
        print(f"\n{'═' * 50}")
        
        output_dir = args.output or str(pdf_path.parent)
        base_name = f"productos_{pdf_path.stem}"
        
        if unique_products:
            csv_path, json_path = save_results(unique_products, output_dir, base_name)
            print(f"✅ Extracción completada!")
            print(f"   📊 Productos únicos: {len(unique_products)}")
            if dupes: print(f"   🔄 Duplicados eliminados: {dupes}")
            print(f"   📄 Páginas con productos: {pages_with_products}")
            print(f"   📄 Páginas vacías: {pages_empty}")
            print(f"   📁 CSV: {csv_path}")
            print(f"   📁 JSON: {json_path}")
        else:
            print(f"⚠️  No se extrajeron productos.")
            print(f"   Este catálogo puede ser 100% imágenes (sin texto embebido).")
            print(f"   En ese caso necesitas la versión con Gemini AI:")
            print(f"   python tools/scan-catalog.py {args.pdf} --key TU_API_KEY")
        
        print(f"{'═' * 50}\n")


if __name__ == '__main__':
    main()
