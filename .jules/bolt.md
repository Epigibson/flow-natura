## 2026-03-26 - Repeated JSON.parse in Render Loops
**Learning:** Found a pattern where structured data (payment terms) is stored in a stringified `notes` column. This leads to `JSON.parse(o.notes)` being called multiple times per row inside rendering and filtering loops (which execute on every keystroke).
**Action:** Always pre-parse JSON strings into object properties immediately after data fetch so that subsequent filters and renders can just access the object properties without expensive recalculations.

## 2026-03-26 - Missing Debounce on Large Lists
**Learning:** Certain `oninput` handlers for search bars in large list views (like `src/pages/ventas/index.astro`, `clientes.astro`, `inventario.astro`) were executing synchronously on every keystroke without debouncing, blocking the main thread during expensive rendering or filtering.
**Action:** Always implement a `setTimeout` debounce (typically ~150ms) on text input fields that trigger list filtering or re-rendering (e.g., using `addEventListener('input', ...)` and `clearTimeout(timer)`).
