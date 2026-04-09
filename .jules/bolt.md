## 2026-03-26 - Repeated JSON.parse in Render Loops
**Learning:** Found a pattern where structured data (payment terms) is stored in a stringified `notes` column. This leads to `JSON.parse(o.notes)` being called multiple times per row inside rendering and filtering loops (which execute on every keystroke).
**Action:** Always pre-parse JSON strings into object properties immediately after data fetch so that subsequent filters and renders can just access the object properties without expensive recalculations.
## 2026-03-26 - Main-Thread Blocking in Real-Time Search
**Learning:** Adding a basic `oninput` or `addEventListener` that loops over potentially large lists and synchronously updates the innerHTML blocks the main thread with every keystroke, causing severe typing latency and a poor user experience.
**Action:** To avoid expensive synchronous DOM operations and prevent main-thread blocking, always implement a `setTimeout` debounce (typically ~150-200ms) on text input fields that trigger list filtering or re-rendering (e.g., replacing `searchInput.oninput` with `searchInput.addEventListener('input', ...)` and `clearTimeout`).
