
## 2026-03-28 - Optimización de parseo JSON en notas
**Learning:** Repetitive `JSON.parse` operations on stringified JSON columns (like `notes` storing payment terms) inside filtering and mapping functions cause unnecessary CPU overhead, especially when processing large datasets on the frontend.
**Action:** Always pre-parse stringified JSON strings into a temporary object property (e.g., `_parsedNotes`) immediately after data fetching. Then, use this property in subsequent mapping, filtering, and rendering logic to avoid redundant and expensive JSON string parsing.
