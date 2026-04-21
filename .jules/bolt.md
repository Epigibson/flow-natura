## 2026-03-26 - Repeated JSON.parse in Render Loops
**Learning:** Found a pattern where structured data (payment terms) is stored in a stringified `notes` column. This leads to `JSON.parse(o.notes)` being called multiple times per row inside rendering and filtering loops (which execute on every keystroke).
**Action:** Always pre-parse JSON strings into object properties immediately after data fetch so that subsequent filters and renders can just access the object properties without expensive recalculations.
## 2026-04-21 - Main-thread Blocking on Text Inputs
**Learning:** Found that attaching synchronous render functions directly to `oninput` events of text inputs (e.g., `searchInput.oninput = () => renderTable();`) causes expensive DOM operations on every single keystroke, blocking the main thread and making the UI feel sluggish.
**Action:** Always implement a `setTimeout` debounce (typically ~200ms) on text input fields that trigger list filtering or re-rendering to avoid executing these operations continuously.
