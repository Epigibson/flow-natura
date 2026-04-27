"""
╔══════════════════════════════════════════════════════════════╗
║   Importador de Catálogos a Supabase                        ║
║   Sube productos e imágenes extraídas del PDF               ║
╚══════════════════════════════════════════════════════════════╝

Uso:
  python import-to-supabase.py "C:\\ruta\\scan_catalogo"
  python import-to-supabase.py ALL    (importa todas las carpetas scan_*)

Requisitos:
  pip install requests
"""

import sys
import os
import json
import requests
import time
import argparse
from pathlib import Path
from dotenv import load_dotenv

# Cargar .env del proyecto
env_path = Path(__file__).parent.parent / '.env'
if env_path.exists():
    load_dotenv(env_path)

SUPABASE_URL = os.getenv('PUBLIC_SUPABASE_URL', '')
SERVICE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')

HEADERS = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation,resolution=merge-duplicates'
}

STORAGE_HEADERS = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
}

BUCKET_NAME = 'product-images'


def ensure_bucket():
    """Crear el bucket de imágenes si no existe."""
    url = f"{SUPABASE_URL}/storage/v1/bucket"
    res = requests.get(url, headers=STORAGE_HEADERS)
    buckets = res.json() if res.ok else []
    
    if not any(b.get('name') == BUCKET_NAME for b in buckets):
        print(f"  📦 Creando bucket '{BUCKET_NAME}'...")
        create_res = requests.post(url, headers={**STORAGE_HEADERS, 'Content-Type': 'application/json'}, json={
            'id': BUCKET_NAME,
            'name': BUCKET_NAME,
            'public': True,
            'file_size_limit': 5242880,  # 5MB
            'allowed_mime_types': ['image/jpeg', 'image/png', 'image/webp']
        })
        if create_res.ok:
            print(f"  ✅ Bucket '{BUCKET_NAME}' creado")
        else:
            print(f"  ⚠️ Error creando bucket: {create_res.text[:200]}")
            return False
    else:
        print(f"  📦 Bucket '{BUCKET_NAME}' ya existe")
    
    return True


def upload_image(image_path: str, code: str) -> str:
    """Sube una imagen a Supabase Storage. Retorna la URL pública."""
    file_path = Path(image_path)
    if not file_path.exists():
        return ''
    
    ext = file_path.suffix.lower()
    mime_map = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'}
    content_type = mime_map.get(ext, 'image/jpeg')
    
    storage_path = f"catalogo/{code}{ext}"
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{storage_path}"
    
    with open(file_path, 'rb') as f:
        file_bytes = f.read()
    
    upload_headers = {
        **STORAGE_HEADERS,
        'Content-Type': content_type,
        'x-upsert': 'true'
    }
    
    res = requests.post(url, headers=upload_headers, data=file_bytes)
    
    if res.ok or res.status_code == 200:
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{storage_path}"
        return public_url
    else:
        return ''


def upsert_products(products: list) -> dict:
    """Inserta o actualiza productos en la tabla products, agrupando variantes bajo un producto padre."""
    results = {'inserted': 0, 'variants': 0, 'errors': 0}
    
    # Group products by base name to detect variants
    from collections import defaultdict
    groups = defaultdict(list)
    
    for p in products:
        base_name = p.get('nombre_base', p.get('nombre', ''))
        if not base_name:
            base_name = p.get('nombre', f'Producto {p.get("codigo", "")}')
        groups[base_name].append(p)
    
    url = f"{SUPABASE_URL}/rest/v1/rpc/upsert_product_with_variants"
    rpc_headers = {
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json',
    }
    
    # Simple upsert URL (for products without variants, faster)
    simple_url = f"{SUPABASE_URL}/rest/v1/products"
    simple_headers = {
        **HEADERS,
        'Prefer': 'return=minimal,resolution=merge-duplicates',
    }
    
    for base_name, items in groups.items():
        if len(items) == 1 and not items[0].get('variante'):
            # Single product without variants — simple upsert
            p = items[0]
            row = {
                'code': str(p.get('codigo', '')),
                'name': str(p.get('nombre', f'Producto {p.get("codigo", "")}')),
                'price': float(p.get('precio', 0)),
                'cost': 0,
                'points': int(p.get('puntos', 0)) if p.get('puntos') else 0,
                'category': str(p.get('categoria', '')) or None,
                'brand': 'Natura',
                'image_url': p.get('image_url', None),
                'has_variants': False,
            }
            
            res = requests.post(
                f"{simple_url}?on_conflict=code",
                headers=simple_headers,
                json=[row]
            )
            
            if res.ok or res.status_code in (200, 201):
                results['inserted'] += 1
            else:
                results['errors'] += 1
        else:
            # Multiple items or has variant flag — use RPC for grouped insert
            # Use the first item as the parent product
            parent = items[0]
            
            # Build variants array
            variants = []
            for item in items:
                variant_label = item.get('variante') or item.get('nombre', '')
                if not variant_label or variant_label == base_name:
                    # For items without a detected variant, use the full name as label
                    variant_label = item.get('nombre', f'Variante {item.get("codigo", "")}')
                    # Try to extract just the different part
                    if variant_label.startswith(base_name):
                        diff = variant_label[len(base_name):].strip(' -,')
                        if diff:
                            variant_label = diff
                
                variants.append({
                    'code': str(item.get('codigo', '')),
                    'label': variant_label,
                    'type': item.get('tipo_variante', 'tono'),
                    'price': float(item.get('precio', 0)) if item.get('precio') else None,
                    'cost': None,
                    'points': int(item.get('puntos', 0)) if item.get('puntos') else None,
                    'image_url': item.get('image_url', None),
                    'sort_order': items.index(item),
                })
            
            payload = {
                'p_code': str(parent.get('codigo', '')),
                'p_name': base_name,
                'p_price': float(parent.get('precio', 0)),
                'p_cost': 0,
                'p_points': int(parent.get('puntos', 0)) if parent.get('puntos') else 0,
                'p_category': str(parent.get('categoria', '')) or None,
                'p_brand': 'Natura',
                'p_image_url': parent.get('image_url', None),
                'p_variants': json.dumps(variants),
            }
            
            res = requests.post(url, headers=rpc_headers, json=payload)
            
            if res.ok or res.status_code in (200, 201):
                results['inserted'] += 1
                results['variants'] += len(variants)
            else:
                # Fallback: try inserting as individual products
                print(f"  ⚠️ RPC falló para '{base_name}': {res.text[:100]}")
                for item in items:
                    row = {
                        'code': str(item.get('codigo', '')),
                        'name': str(item.get('nombre', '')),
                        'price': float(item.get('precio', 0)),
                        'cost': 0,
                        'points': int(item.get('puntos', 0)) if item.get('puntos') else 0,
                        'category': str(item.get('categoria', '')) or None,
                        'brand': 'Natura',
                        'image_url': item.get('image_url', None),
                    }
                    fb_res = requests.post(
                        f"{simple_url}?on_conflict=code",
                        headers=simple_headers,
                        json=[row]
                    )
                    if fb_res.ok or fb_res.status_code in (200, 201):
                        results['inserted'] += 1
                    else:
                        results['errors'] += 1
    
    return results


def process_scan_folder(scan_dir: str):
    """Procesa una carpeta scan_* e importa a Supabase."""
    scan_path = Path(scan_dir)
    
    # Buscar JSON de productos
    json_files = list(scan_path.glob('productos_*.json'))
    if not json_files:
        print(f"  ⚠️ No se encontró JSON de productos en {scan_path.name}")
        return
    
    json_file = json_files[0]
    with open(json_file, 'r', encoding='utf-8') as f:
        products = json.load(f)
    
    print(f"  📊 {len(products)} productos encontrados")
    
    # Subir imágenes
    images_dir = scan_path / 'imagenes'
    images_uploaded = 0
    
    if images_dir.exists():
        image_files = {f.stem: f for f in images_dir.iterdir() if f.suffix.lower() in ('.jpg', '.jpeg', '.png', '.webp')}
        
        total_images = sum(1 for p in products if p.get('codigo') in image_files)
        print(f"  🖼️  {total_images} imágenes para subir...")
        
        for i, product in enumerate(products):
            code = product.get('codigo', '')
            if code in image_files:
                img_path = image_files[code]
                public_url = upload_image(str(img_path), code)
                if public_url:
                    product['image_url'] = public_url
                    images_uploaded += 1
                    
                    if images_uploaded % 50 == 0:
                        print(f"     🖼️ {images_uploaded}/{total_images} imágenes subidas...")
        
        print(f"  ✅ {images_uploaded} imágenes subidas a Storage")
    
    # Insertar/actualizar productos en DB
    print(f"  📤 Insertando productos en Supabase...")
    results = upsert_products(products)
    print(f"  ✅ {results['inserted']} productos importados, {results.get('variants', 0)} variantes, {results['errors']} errores")
    
    return {
        'products': len(products),
        'images_uploaded': images_uploaded,
        'db_inserted': results['inserted'],
        'db_errors': results['errors']
    }


def main():
    parser = argparse.ArgumentParser(description='🌿 Importar catálogos a Supabase')
    parser.add_argument('path', help='Carpeta scan_* o "ALL" para todas')
    parser.add_argument('--no-images', action='store_true', help='Solo importar datos, sin imágenes')
    parser.add_argument('--pdf-dir', default=r'C:\Users\hackm\Downloads\pdf', help='Directorio base de PDFs')
    
    args = parser.parse_args()
    
    if not SUPABASE_URL or not SERVICE_KEY:
        print("❌ No se encontraron credenciales de Supabase.")
        print("   Asegúrate de tener PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env")
        sys.exit(1)
    
    print(f"\n🌿 Importador de Catálogos → Supabase")
    print(f"{'─' * 55}")
    print(f"🔗 Supabase: {SUPABASE_URL}")
    
    # Asegurar bucket
    if not args.no_images:
        if not ensure_bucket():
            print("⚠️  Continuando sin imágenes...")
            args.no_images = True
    
    # Determinar carpetas a procesar
    if args.path.upper() == 'ALL':
        pdf_dir = Path(args.pdf_dir)
        scan_dirs = sorted(pdf_dir.glob('scan_*'))
        if not scan_dirs:
            print(f"❌ No se encontraron carpetas scan_* en {pdf_dir}")
            sys.exit(1)
        print(f"📁 {len(scan_dirs)} catálogos encontrados")
    else:
        scan_path = Path(args.path)
        if not scan_path.exists():
            print(f"❌ No se encontró: {scan_path}")
            sys.exit(1)
        scan_dirs = [scan_path]
    
    print(f"{'─' * 55}\n")
    
    # Procesar cada catálogo
    totals = {'products': 0, 'images': 0, 'inserted': 0, 'errors': 0}
    
    for scan_dir in scan_dirs:
        print(f"📂 {scan_dir.name}")
        result = process_scan_folder(str(scan_dir))
        if result:
            totals['products'] += result['products']
            totals['images'] += result['images_uploaded']
            totals['inserted'] += result['db_inserted']
            totals['errors'] += result['db_errors']
        print()
    
    # Resumen final
    print(f"{'═' * 55}")
    print(f"✅ Importación completada!")
    print(f"   📊 Total productos procesados: {totals['products']}")
    print(f"   🖼️  Total imágenes subidas: {totals['images']}")
    print(f"   📤 Insertados/actualizados en DB: {totals['inserted']}")
    if totals['errors']:
        print(f"   ❌ Errores: {totals['errors']}")
    print(f"{'═' * 55}\n")


if __name__ == '__main__':
    main()
