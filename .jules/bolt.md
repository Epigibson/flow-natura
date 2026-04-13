## 2026-03-26 - Repeated JSON.parse in Render Loops
**Learning:** Found a pattern where structured data (payment terms) is stored in a stringified `notes` column. This leads to `JSON.parse(o.notes)` being called multiple times per row inside rendering and filtering loops (which execute on every keystroke).
**Action:** Always pre-parse JSON strings into object properties immediately after data fetch so that subsequent filters and renders can just access the object properties without expensive recalculations.

## 2026-03-26 - Missing debouncing on key UI inputs
**Learning:** Found multiple instances where search inputs triggering filtering and rendering loops did not have debouncing, leading to main-thread blocking and immediate expensive UI updates on every keystroke.
**Action:** Always implement a `setTimeout` debounce (typically ~150-200ms) on text input fields that trigger list filtering or re-rendering (e.g., replace `searchInput.addEventListener('input', ...)` directly executing the filter with a `clearTimeout` / `setTimeout` pattern).
