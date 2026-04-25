## 2026-03-26 - Repeated JSON.parse in Render Loops
**Learning:** Found a pattern where structured data (payment terms) is stored in a stringified `notes` column. This leads to `JSON.parse(o.notes)` being called multiple times per row inside rendering and filtering loops (which execute on every keystroke).
**Action:** Always pre-parse JSON strings into object properties immediately after data fetch so that subsequent filters and renders can just access the object properties without expensive recalculations.
## 2026-04-03 - N+1 Query in FastAPI Endpoints
**Learning:** Found an N+1 query pattern in `backend/app/routers/orders.py`. The `create_order` and `cancel_order` functions were making iterative database calls (`select`) for `Product` and `Inventory` entities inside `for` loops.
**Action:** Always fetch related records in bulk using the `.in_()` operator prior to iteration, mapping the results into a Python dictionary (`{entity.id: entity for entity in results}`) for O(1) constant-time access during the loop.
