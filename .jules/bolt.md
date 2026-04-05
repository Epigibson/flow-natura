## 2026-03-26 - Repeated JSON.parse in Render Loops
**Learning:** Found a pattern where structured data (payment terms) is stored in a stringified `notes` column. This leads to `JSON.parse(o.notes)` being called multiple times per row inside rendering and filtering loops (which execute on every keystroke).
**Action:** Always pre-parse JSON strings into object properties immediately after data fetch so that subsequent filters and renders can just access the object properties without expensive recalculations.

## 2026-04-05 - Debouncing Search Inputs to Prevent Main-Thread Blocking
**Learning:** Found a pattern where search input event listeners were executing expensive filtering operations and synchronous DOM re-renders on every keystroke. This causes main-thread blocking, particularly detrimental on lower-end devices or with larger datasets.
**Action:** Always implement a `setTimeout` debounce (typically ~150-200ms) on text input fields that trigger list filtering or re-rendering (e.g., using `clearTimeout` and `setTimeout` inside the `input` event listener).
