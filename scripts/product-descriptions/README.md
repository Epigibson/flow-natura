# Descripciones enriquecidas de productos

Pipeline que generó las descripciones del catálogo (`products.description`) a partir de
**investigación web verificada** — nada de claims inventados.

## Contenido

- `knowledge_natura_perfumes.json` — 104 familias olfativas Natura (Fragrantica + natura.com.mx): pirámide de notas, estilo, sensación, fuente.
- `knowledge_natura_cuidado.json` — 46 familias de cuidado Natura (Chronos, Ekos, Tododia, Lumina, Faces/Una): beneficios, ingredientes, resultados, fuente.
- `knowledge_avon_perfumes.json` — 113 familias Avon (avon.mx, avonstore.es, avon.com.br).
- `knowledge_avon_cuidado.json` — 26 familias Avon (Anew, Advance Techniques, Foot Works, Avon Care…).
- `knowledge_casa_estilo.json` — 49 tipos de producto + 25 diseños licenciados (fichas avon.mx).
- `generate.py` — compone la descripción final por producto: hechos de la familia + atributos literales (presentación, tono, licencia). Kits: componentes visibles en el nombre + hechos de la línea (restringidos a la línea del kit).
- `backup_descriptions.json` — descripciones previas al enriquecimiento (rollback).

## Reglas del generador

1. Solo datos con fuente en los `knowledge_*.json` + atributos del nombre del producto.
2. Sin familia/override verificable → descripción factual derivada del nombre (qué es + presentación), sin claims.
3. Nada de placeholders ("según línea", "(ficha …)") en el texto final.

## Cómo regenerar

1. Exportar productos a `desc_<segmento>.json` (segmentos: `natura_perfumes`, `natura_cuidado`,
   `avon_perfumes`, `avon_cuidado`, `casa_estilo`; campos `id, code, name, brand, category, desc`):

   ```sql
   SELECT id, code, name, brand, category, coalesce(description,'')
   FROM public.products WHERE deleted_at IS NULL;
   ```

2. `python generate.py` (o `python generate.py <dir>`), produce `generated.json` (`[{id, description}]`).
3. Aplicar con UPDATE por lotes sobre `public.products.description`.

Generado en la ronda de descripciones 2026-11-12: 2,193/2,639 productos enriquecidos (85 kits por componentes).
