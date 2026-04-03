"""Diagnóstico: ver estructura de imágenes en el PDF."""
import sys
import fitz  # PyMuPDF

pdf_path = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\hackm\Downloads\pdf\Natura 3 LB.pdf"

doc = fitz.open(pdf_path)
print(f"Total páginas: {len(doc)}\n")

# Analizar páginas 28-32 (que sabemos tienen productos)
for page_idx in [28, 29, 30, 31, 32]:
    page = doc[page_idx]
    images = page.get_images(full=True)
    print(f"═══ Página {page_idx + 1}: {len(images)} imágenes ═══")
    
    for i, img in enumerate(images):
        xref = img[0]
        base_img = doc.extract_image(xref)
        ext = base_img["ext"]
        width = base_img["width"]
        height = base_img["height"]
        size_kb = len(base_img["image"]) / 1024
        print(f"  [{i}] xref={xref} | {width}x{height} | {ext} | {size_kb:.1f} KB")
    
    # También ver bboxes de las imágenes
    img_rects = page.get_image_rects(page.get_images()[0]) if images else []
    if img_rects:
        print(f"  Rect img[0]: {img_rects[0]}")
    print()

doc.close()
