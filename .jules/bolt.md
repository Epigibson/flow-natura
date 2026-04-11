## 2026-03-26 - Repeated JSON.parse in Render Loops
**Learning:** Found a pattern where structured data (payment terms) is stored in a stringified `notes` column. This leads to `JSON.parse(o.notes)` being called multiple times per row inside rendering and filtering loops (which execute on every keystroke).
**Action:** Always pre-parse JSON strings into object properties immediately after data fetch so that subsequent filters and renders can just access the object properties without expensive recalculations.
## 2024-05-24 - Main Thread Blocking in Filter Loops
**Learning:** Adding synchronous filters (using `oninput` or `addEventListener` without debouncing) to inputs that filter large lists and trigger DOM re-renders heavily blocks the main thread in Astro pages rendered client-side, causing noticeable lag on every keystroke.
**Action:** Always implement a `setTimeout` debounce (~150ms) on text inputs that trigger filtering or DOM rendering loops (e.g. `clearTimeout(timer); timer = setTimeout(renderFn, 150)`).
