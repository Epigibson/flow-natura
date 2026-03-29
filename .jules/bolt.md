
## 2026-03-29 - Pre-parse JSON in loops
**Learning:** La columna `notes` a menudo contiene JSON en formato de cadena (ej. términos de pago) que se estaba parseando repetidamente dentro de bucles `filter` y `forEach` (como en `ventas/index.astro`), causando cuellos de botella de rendimiento O(N*M) costosos en cada búsqueda por teclado.
**Action:** Siempre pre-parsear estas cadenas JSON en propiedades de objetos (ej. `_parsedNotes`) inmediatamente después de obtener los datos para evitar llamadas costosas y repetidas a `JSON.parse()` dentro de bucles de filtrado y renderizado.
