"""
╔══════════════════════════════════════════════════════════════╗
║   Natura Catalog Scanner + Image Extractor — Local Edition  ║
║   Extrae productos e imágenes de catálogos PDF              ║
║   100% offline, gratis, sin límites                         ║
╚══════════════════════════════════════════════════════════════╝

Uso:
  python scan-catalog-images.py "C:\\ruta\\catalogo.pdf"
  python scan-catalog-images.py "C:\\ruta\\catalogo.pdf" --start 10 --end 50
  python scan-catalog-images.py "C:\\ruta\\catalogo.pdf" --min-size 5000

Requisitos:
  pip install pdfplumber PyMuPDF Pillow
"""

import sys
import os
import re
import json
import csv
import argparse
from pathlib import Path
from io import BytesIO

try:
    import pdfplumber
except ImportError:
    print("❌ pip install pdfplumber"); sys.exit(1)

try:
    import fitz  # PyMuPDF
except ImportError:
    print("❌ pip install PyMuPDF"); sys.exit(1)

try:
    from PIL import Image
except ImportError:
    print("❌ pip install Pillow"); sys.exit(1)


def extract_product_images(fitz_page, fitz_doc, min_size=3000, min_dim=50):
    """
    Extrae imágenes de una página con su posición (bounding box).
    Filtra imágenes demasiado pequeñas (iconos, decoraciones).
    Retorna lista de dicts: {image_bytes, ext, bbox, width, height}
    """
    images_data = []
    page_images = fitz_page.get_images(full=True)
    
    for img_info in page_images:
        xref = img_info[0]
        try:
            base_img = fitz_doc.extract_image(xref)
        except:
            continue
        
        img_bytes = base_img["image"]
        ext = base_img["ext"]
        width = base_img["width"]
        height = base_img["height"]
        
        # Filtrar imágenes muy pequeñas (iconos, logos, decoraciones)
        if len(img_bytes) < min_size or width < min_dim or height < min_dim:
            continue
        
        # Obtener posición en la página
        try:
            rects = fitz_page.get_image_rects(img_info)
            bbox = rects[0] if rects else None
        except:
            bbox = None
        
        images_data.append({
            'bytes': img_bytes,
            'ext': ext if ext != 'jpx' else 'jpg',  # jpeg2000 -> jpg
            'bbox': bbox,
            'width': width,
            'height': height,
            'center_y': bbox.y0 + (bbox.height / 2) if bbox else 0,
            'center_x': bbox.x0 + (bbox.width / 2) if bbox else 0,
            'size': len(img_bytes)
        })
    
    return images_data


def extract_text_with_positions(plumber_page):
    """
    Extrae texto con posiciones usando pdfplumber.
    Retorna el texto completo y las posiciones de códigos encontrados.
    """
    text = plumber_page.extract_text() or ''
    
    # También extraer tablas
    tables = plumber_page.extract_tables() or []
    for table in tables:
        for row in table:
            if row:
                text += '\n' + ' '.join(str(cell) for cell in row if cell)
    
    # Buscar códigos con posiciones usando words
    words = plumber_page.extract_words() or []
    code_positions = []
    
    for word in words:
        # Buscar códigos entre paréntesis en el texto del word
        w_text = word.get('text', '')
        code_match = re.search(r'\((\d{4,6})\)', w_text)
        if not code_match:
            code_match = re.match(r'^(\d{4,6})$', w_text)
        
        if code_match:
            code = code_match.group(1)
            code_positions.append({
                'code': code,
                'x': float(word.get('x0', 0)),
                'y': float(word.get('top', 0)),
                'x1': float(word.get('x1', 0)),
                'y1': float(word.get('bottom', 0)),
            })
    
    return text, code_positions


def match_images_to_codes(images_data, code_positions, page_width):
    """
    Asocia imágenes con códigos de producto por proximidad espacial.
    Estrategia: para cada código, buscar la imagen más cercana
    (preferiblemente arriba o a la izquierda del código).
    """
    matches = {}
    used_images = set()
    
    for cp in code_positions:
        code = cp['code']
        code_y = cp['y']
        code_x = cp['x']
        
        best_img_idx = None
        best_dist = 999999
        
        for idx, img in enumerate(images_data):
            if idx in used_images:
                continue
            
            if img['bbox'] is None:
                continue
            
            # Distancia vertical (la imagen suele estar arriba del código)
            img_center_y = img['center_y']
            img_center_x = img['center_x']
            
            # Calcular distancia ponderada
            # La imagen del producto suele estar arriba o cerca del código/precio
            dy = abs(img_center_y - code_y)
            dx = abs(img_center_x - code_x)
            
            # Preferir imágenes que están arriba del código (dy negativo)
            dist = (dy * 1.0) + (dx * 0.5)
            
            # Preferir imágenes más grandes (más probable que sea el producto)
            if img['size'] > 10000:
                dist *= 0.7
            
            if dist < best_dist and dist < 500:  # Max distancia razonable
                best_dist = dist
                best_img_idx = idx
        
        if best_img_idx is not None:
            matches[code] = best_img_idx
            used_images.add(best_img_idx)
    
    return matches


def extract_products_from_text(text: str, page_num: int) -> list:
    """Extrae productos del texto (misma lógica del scanner local)."""
    products = []
    if not text or len(text.strip()) < 10:
        return products
    
    code_pattern = re.compile(r'\((\d{4,6})\)', re.MULTILINE)
    price_pattern = re.compile(r'\$\s*([\d,]+(?:\.\d{1,2})?)', re.MULTILINE)
    points_pattern = re.compile(r'(\d+)\s*pts', re.IGNORECASE)
    
    codes = [(m.group(1), m.start()) for m in code_pattern.finditer(text)]
    prices = [(m.group(1), m.start()) for m in price_pattern.finditer(text)]
    points = [(m.group(1), m.start()) for m in points_pattern.finditer(text)]
    
    for code, code_pos in codes:
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
        
        name_start = max(0, code_pos - 150)
        name_region = text[name_start:code_pos]
        name_lines = [l.strip() for l in name_region.split('\n') if l.strip() and len(l.strip()) > 2]
        name_lines = [l for l in name_lines if not re.match(r'^[\$\d,.\s]+$', l)
                      and not re.match(r'^\d+\s*pts?$', l, re.IGNORECASE)
                      and not re.match(r'^\(\d+\)', l)
                      and not re.match(r'^(de|a|en)\s', l, re.IGNORECASE)
                      and 'descuento' not in l.lower()
                      and 'oportunidades' not in l.lower()
                      and 'ciclo' not in l.lower()]
        
        name = ' '.join(name_lines[-3:]) if name_lines else f'Producto {code}'
        name = re.sub(r'\s+', ' ', name).strip()
        
        if any(p['codigo'] == code for p in products):
            continue
        
        products.append({
            'codigo': code,
            'nombre': name[:120],
            'precio': best_price,
            'puntos': best_points,
            'categoria': None,
            'pagina': page_num
        })
    
    # Estrategia 2: Códigos sin paréntesis
    alt_code_pattern = re.compile(r'(?:Cód\.?\s*|cod\.?\s*|código\s*)(\d{4,6})', re.IGNORECASE)
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
            products.append({
                'codigo': code, 'nombre': f'Producto {code}', 'precio': best_price,
                'puntos': None, 'categoria': None, 'pagina': page_num
            })
    
    return products


def save_image(img_data: dict, output_dir: str, code: str) -> str:
    """Guarda una imagen de producto. Retorna el path relativo."""
    ext = img_data['ext']
    if ext in ('jpx', 'jp2'):
        ext = 'jpg'
    
    filename = f"{code}.{ext}"
    filepath = os.path.join(output_dir, filename)
    
    try:
        # Intentar convertir con Pillow para normalizar formato
        img = Image.open(BytesIO(img_data['bytes']))
        if img.mode in ('RGBA', 'P', 'LA'):
            img = img.convert('RGB')
        img.save(filepath, quality=85, optimize=True)
    except:
        # Fallback: guardar bytes crudos
        with open(filepath, 'wb') as f:
            f.write(img_data['bytes'])
    
    return filename


def main():
    parser = argparse.ArgumentParser(description='🌿 Natura Scanner + Imágenes (Local)')
    parser.add_argument('pdf', help='Ruta al PDF del catálogo')
    parser.add_argument('--start', type=int, default=1, help='Página de inicio')
    parser.add_argument('--end', type=int, default=0, help='Página final')
    parser.add_argument('--output', type=str, default='', help='Directorio de salida')
    parser.add_argument('--min-size', type=int, default=3000, help='Tamaño mínimo de imagen en bytes (default: 3000)')
    parser.add_argument('--no-images', action='store_true', help='Solo extraer datos, sin imágenes')
    
    args = parser.parse_args()
    
    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        print(f"❌ No se encontró: {pdf_path}")
        sys.exit(1)
    
    # Setup output
    output_dir = args.output or str(pdf_path.parent / f"scan_{pdf_path.stem}")
    images_dir = os.path.join(output_dir, "imagenes")
    os.makedirs(images_dir, exist_ok=True)
    
    print(f"\n🌿 Natura Catalog Scanner + Imágenes")
    print(f"{'─' * 55}")
    print(f"📄 Archivo: {pdf_path.name} ({pdf_path.stat().st_size / 1024 / 1024:.1f} MB)")
    
    # Abrir con ambas librerías
    fitz_doc = fitz.open(str(pdf_path))
    plumber_pdf = pdfplumber.open(str(pdf_path))
    
    total_pages = len(fitz_doc)
    print(f"📑 Páginas: {total_pages}")
    
    start_idx = max(0, args.start - 1)
    end_idx = min(total_pages - 1, (args.end - 1) if args.end > 0 else total_pages - 1)
    pages_to_process = end_idx - start_idx + 1
    
    print(f"📖 Rango: {start_idx + 1} a {end_idx + 1} ({pages_to_process} páginas)")
    print(f"📁 Output: {output_dir}")
    if not args.no_images:
        print(f"🖼️  Imágenes: {images_dir}")
    print(f"{'─' * 55}\n")
    
    all_products = []
    total_images_saved = 0
    total_images_matched = 0
    
    for i in range(start_idx, end_idx + 1):
        page_num = i + 1
        progress = i - start_idx + 1
        pct = (progress / pages_to_process) * 100
        
        # Extraer texto con pdfplumber
        plumber_page = plumber_pdf.pages[i]
        text, code_positions = extract_text_with_positions(plumber_page)
        
        # Extraer productos
        products = extract_products_from_text(text, page_num)
        
        if not products:
            reason = "sin texto" if not text.strip() else "sin códigos"
            print(f"[{progress}/{pages_to_process}] ({pct:3.0f}%) Pág {page_num}: — {reason}")
            continue
        
        # Extraer imágenes con PyMuPDF
        img_count = 0
        if not args.no_images:
            fitz_page = fitz_doc[i]
            images_data = extract_product_images(fitz_page, fitz_doc, min_size=args.min_size)
            
            if images_data and code_positions:
                # Asociar imágenes a códigos por proximidad
                matches = match_images_to_codes(images_data, code_positions, plumber_page.width)
                
                for code, img_idx in matches.items():
                    img = images_data[img_idx]
                    filename = save_image(img, images_dir, code)
                    
                    # Actualizar el producto con la ruta de la imagen
                    for p in products:
                        if p['codigo'] == code:
                            p['imagen'] = f"imagenes/{filename}"
                            break
                    
                    img_count += 1
                    total_images_matched += 1
                
                total_images_saved += img_count
        
        all_products.extend(products)
        
        codes_str = ', '.join(p['codigo'] for p in products[:4])
        extra = f" +{len(products)-4}" if len(products) > 4 else ""
        img_str = f" | 🖼️ {img_count}" if img_count > 0 else ""
        print(f"[{progress}/{pages_to_process}] ({pct:3.0f}%) Pág {page_num}: ✅ {len(products)} prods [{codes_str}{extra}]{img_str}")
    
    # Deduplicar
    seen = set()
    unique_products = []
    for p in all_products:
        if p['codigo'] not in seen:
            seen.add(p['codigo'])
            unique_products.append(p)
    
    dupes = len(all_products) - len(unique_products)
    
    # Guardar resultados
    print(f"\n{'═' * 55}")
    
    if unique_products:
        # CSV
        csv_path = os.path.join(output_dir, f"productos_{pdf_path.stem}.csv")
        fieldnames = ['codigo', 'nombre', 'precio', 'puntos', 'categoria', 'pagina', 'imagen']
        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(unique_products)
        
        # JSON
        json_path = os.path.join(output_dir, f"productos_{pdf_path.stem}.json")
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(unique_products, f, ensure_ascii=False, indent=2)
        
        print(f"✅ Extracción completada!")
        print(f"   📊 Productos únicos: {len(unique_products)}")
        if dupes:
            print(f"   🔄 Duplicados eliminados: {dupes}")
        if not args.no_images:
            prods_with_img = sum(1 for p in unique_products if p.get('imagen'))
            print(f"   🖼️  Imágenes extraídas: {total_images_saved}")
            print(f"   🔗 Productos con imagen: {prods_with_img}/{len(unique_products)}")
        print(f"   📁 CSV: {csv_path}")
        print(f"   📁 JSON: {json_path}")
        if not args.no_images:
            print(f"   📁 Imágenes: {images_dir}")
    else:
        print(f"⚠️  No se extrajeron productos.")
    
    print(f"{'═' * 55}\n")
    
    fitz_doc.close()
    plumber_pdf.close()


if __name__ == '__main__':
    main()
