## 2024-06-05 - Avoid N+1 queries in SQLAlchemy
**Learning:** In endpoints that process multiple items (like `create_order` or `cancel_order`), executing a `select` query for each item within a loop creates an N+1 query problem, severely degrading performance as the number of items increases.
**Action:** Use the SQLAlchemy `.in_()` operator to fetch all required related records (e.g., `Product`, `Inventory`) in a single bulk query before the loop. Map the results to a dictionary keyed by ID for O(1) lookup during the iteration.
