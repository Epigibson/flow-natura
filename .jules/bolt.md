## 2026-03-26 - Repeated JSON.parse in Render Loops
**Learning:** Found a pattern where structured data (payment terms) is stored in a stringified `notes` column. This leads to `JSON.parse(o.notes)` being called multiple times per row inside rendering and filtering loops (which execute on every keystroke).
**Action:** Always pre-parse JSON strings into object properties immediately after data fetch so that subsequent filters and renders can just access the object properties without expensive recalculations.

## 2026-03-26 - Missing Debounce in Search Inputs
**Learning:** Found synchronous `oninput` handlers causing expensive DOM operations and data filtering on every keystroke in certain views.
**Action:** Always implement a `setTimeout` debounce (typically ~150-200ms) on text input fields that trigger list filtering or re-rendering to prevent main thread blocking and jank.
