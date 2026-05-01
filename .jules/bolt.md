## 2026-03-26 - Repeated JSON.parse in Render Loops
**Learning:** Found a pattern where structured data (payment terms) is stored in a stringified `notes` column. This leads to `JSON.parse(o.notes)` being called multiple times per row inside rendering and filtering loops (which execute on every keystroke).
**Action:** Always pre-parse JSON strings into object properties immediately after data fetch so that subsequent filters and renders can just access the object properties without expensive recalculations.

## 2026-03-26 - Missing Debounce in Search Inputs
**Learning:** Found synchronous `oninput` handlers causing expensive DOM operations and data filtering on every keystroke in certain views.
**Action:** Always implement a `setTimeout` debounce (typically ~150-200ms) on text input fields that trigger list filtering or re-rendering to prevent main thread blocking and jank.

## 2026-03-26 - SQLAlchemy N+1 Queries in Order Processing
**Learning:** The FastAPI backend had classic O(N) "N+1" database query anti-patterns inside the `create_order` and `cancel_order` functions, querying for individual `Product` and `Inventory` records within a `for item in items:` loop. In SQLAlchemy, doing database await calls inside an iterative loop creates enormous latency scaling linearly with cart size.
**Action:** Always pre-fetch related entities in bulk using `Model.id.in_([ids])` outside of the loop, map them into a Python dictionary via `{x.id: x for x in result.scalars().all()}`, and then perform O(1) in-memory `.get()` lookups inside the loop to avoid redundant query overhead.
