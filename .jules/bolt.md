## 2026-03-26 - Repeated JSON.parse in Render Loops
**Learning:** Found a pattern where structured data (payment terms) is stored in a stringified `notes` column. This leads to `JSON.parse(o.notes)` being called multiple times per row inside rendering and filtering loops (which execute on every keystroke).
**Action:** Always pre-parse JSON strings into object properties immediately after data fetch so that subsequent filters and renders can just access the object properties without expensive recalculations.

## 2026-03-26 - Synchronous Main-Thread Blocking in Search Filters
**Learning:** Found a common pattern across `ventas` and `inventario` routes where text input fields trigger synchronous list filtering and complete DOM re-renders (`innerHTML`) on every single keystroke. This blocks the main thread during rapid typing and makes the UI feel sluggish.
**Action:** Always implement a `setTimeout` debounce (typically ~150-200ms) on text input fields that trigger list filtering or re-rendering to batch operations and keep the UI responsive.
