## 2026-03-26 - Repeated JSON.parse in Render Loops
**Learning:** Found a pattern where structured data (payment terms) is stored in a stringified `notes` column. This leads to `JSON.parse(o.notes)` being called multiple times per row inside rendering and filtering loops (which execute on every keystroke).
**Action:** Always pre-parse JSON strings into object properties immediately after data fetch so that subsequent filters and renders can just access the object properties without expensive recalculations.

## 2026-03-26 - Missing Debounce in Search Inputs
**Learning:** Found synchronous `oninput` handlers causing expensive DOM operations and data filtering on every keystroke in certain views.
**Action:** Always implement a `setTimeout` debounce (typically ~150-200ms) on text input fields that trigger list filtering or re-rendering to prevent main thread blocking and jank.

## 2024-04-27 - N+1 Queries in Iterative Data Processing
**Learning:** Found N+1 queries in the FastAPI backend (`backend/app/routers/orders.py`) where `create_order` and `cancel_order` were performing database queries for related models (Product, Inventory) inside loops iterating over request items. This architecture bottleneck causes a new database query per item.
**Action:** When processing lists of items that require related records, always perform a bulk fetch of related records using SQLAlchemy's `.in_()` operator *before* iterating. Map the bulk fetch results to a dictionary keyed by ID for O(1) lookups during the loop.
