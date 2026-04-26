## 2026-03-26 - Repeated JSON.parse in Render Loops
**Learning:** Found a pattern where structured data (payment terms) is stored in a stringified `notes` column. This leads to `JSON.parse(o.notes)` being called multiple times per row inside rendering and filtering loops (which execute on every keystroke).
**Action:** Always pre-parse JSON strings into object properties immediately after data fetch so that subsequent filters and renders can just access the object properties without expensive recalculations.
## 2026-04-26 - Prevent N+1 queries using SQLAlchemy in_()
**Learning:** Found an N+1 database performance bottleneck in the backend route 'orders.py', where related tables (Product and Inventory) were queried inside a for-loop for every individual order item during validation and cancellation.
**Action:** Always pre-fetch needed records outside the loop using bulk queries with 'in_()' for validation and restoration loops, mapping the results to a dictionary to allow O(1) in-memory lookups instead of making repeated database calls.
