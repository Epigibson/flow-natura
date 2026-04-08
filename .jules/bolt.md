## 2026-03-26 - Repeated JSON.parse in Render Loops
**Learning:** Found a pattern where structured data (payment terms) is stored in a stringified `notes` column. This leads to `JSON.parse(o.notes)` being called multiple times per row inside rendering and filtering loops (which execute on every keystroke).
**Action:** Always pre-parse JSON strings into object properties immediately after data fetch so that subsequent filters and renders can just access the object properties without expensive recalculations.

## 2026-03-26 - Retraso (Debouncing) en Filtros de Búsqueda del DOM
**Learning:** Se descubrió un patrón donde los campos de búsqueda (`searchInput`) activaban filtros y re-renderizados síncronos en el DOM en cada pulsación de tecla (`searchInput.addEventListener('input', () => render...)`). Esto bloqueaba el hilo principal durante la escritura rápida.
**Action:** Siempre implementar un retraso (debounce) con `setTimeout` (aprox. 200ms) en los campos de entrada de texto que activan filtrados o re-renderizados para evitar operaciones costosas y bloqueantes en el DOM con cada tecla presionada. Usar variables JS estándar (ej. `let searchTimer;`) en Astro para evitar errores de sintaxis TypeScript.
