## 2026-03-26 - Repeated JSON.parse in Render Loops
**Learning:** Found a pattern where structured data (payment terms) is stored in a stringified `notes` column. This leads to `JSON.parse(o.notes)` being called multiple times per row inside rendering and filtering loops (which execute on every keystroke).
**Action:** Always pre-parse JSON strings into object properties immediately after data fetch so that subsequent filters and renders can just access the object properties without expensive recalculations.

## 2026-03-26 - Missing Debounce in Search Inputs
**Learning:** Found synchronous `oninput` handlers causing expensive DOM operations and data filtering on every keystroke in certain views.
**Action:** Always implement a `setTimeout` debounce (typically ~150-200ms) on text input fields that trigger list filtering or re-rendering to prevent main thread blocking and jank.

## 2026-03-27 - Consultas N+1 en bucles de procesos en bloque
**Learning:** La aplicación tiene un patrón en el que las listas de elementos se procesan de forma síncrona (como al iterar sobre las líneas de pedido para actualizar/verificar el inventario o recuperar detalles de productos), lo que provoca un problema de consultas N+1 dentro de los bucles (`db.execute` en cada iteración).
**Action:** Siempre refactorice las iteraciones de múltiples consultas a la base de datos dentro de los bucles `for` realizando una recuperación en bloque (bulk fetch) por adelantado con el operador `.in_()` de SQLAlchemy, y cree mapas de diccionarios locales para una búsqueda rápida en memoria `O(1)` durante la iteración.
