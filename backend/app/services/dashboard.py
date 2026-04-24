"""
Flow Natura Backend - Dashboard Service
Extracts business logic from the router for better maintainability.
"""
import json
import uuid
from decimal import Decimal
from app.db.models import Order, Inventory
from app.models.schemas import (
    DashboardKPIs, RecentOrder, StockAlert,
    TopClient, TopProduct
)

def calculate_kpis(valid_orders: list[Order], inventory: list[Inventory]) -> DashboardKPIs:
    total_revenue = sum(float(o.total_amount) for o in valid_orders)
    out_of_stock = sum(1 for inv in inventory if inv.quantity <= 0)

    total_debt = Decimal("0")
    for o in valid_orders:
        if o.payment_method == "abonos" and o.notes:
            try:
                t = json.loads(o.notes)
                enganche = Decimal(str(t.get("enganche", 0)))
                cuotas = int(t.get("pagos", 1))
                pagados = int(t.get("pagos_completados", 0))
                remaining = o.total_amount - enganche
                per_cuota = remaining / cuotas if cuotas > 0 else Decimal("0")
                debt = o.total_amount - enganche - (per_cuota * pagados)
                total_debt += max(Decimal("0"), debt)
            except (json.JSONDecodeError, ValueError):
                pass

    return DashboardKPIs(
        total_revenue=Decimal(str(total_revenue)),
        total_orders=len(valid_orders),
        pending_debt=total_debt,
        out_of_stock=out_of_stock,
    )

def get_recent_orders(all_orders: list[Order], limit: int = 5) -> list[RecentOrder]:
    recent_orders = []
    for o in all_orders[:limit]:
        items_summary = ", ".join(
            item.product.name for item in o.items if item.product
        ) or "—"
        recent_orders.append(RecentOrder(
            id=o.id,
            customer_name=o.customer.full_name if o.customer else "Cliente",
            items_summary=items_summary,
            total_amount=o.total_amount,
            payment_method=o.payment_method,
            status=o.status,
            created_at=o.created_at,
        ))
    return recent_orders

def get_top_clients(valid_orders: list[Order], limit: int = 3) -> list[TopClient]:
    client_spend: dict[uuid.UUID, dict] = {}
    for o in valid_orders:
        cid = o.customer_id
        name = o.customer.full_name if o.customer else "Cliente"
        if cid not in client_spend:
            client_spend[cid] = {"name": name, "total": Decimal("0")}
        client_spend[cid]["total"] += o.total_amount

    return sorted(
        [
            TopClient(customer_id=cid, name=d["name"], total=d["total"])
            for cid, d in client_spend.items()
        ],
        key=lambda x: x.total,
        reverse=True,
    )[:limit]

def get_stock_alerts(inventory: list[Inventory], limit: int = 5, threshold: int = 3) -> list[StockAlert]:
    return sorted(
        [
            StockAlert(
                product_name=inv.product.name if inv.product else "?",
                category=inv.product.category if inv.product else None,
                stock=inv.quantity,
                is_out=inv.quantity <= 0,
            )
            for inv in inventory
            if inv.quantity <= threshold
        ],
        key=lambda x: x.stock,
    )[:limit]

def get_top_products(valid_orders: list[Order], limit: int = 5) -> list[TopProduct]:
    prod_sales: dict[uuid.UUID, dict] = {}
    for o in valid_orders:
        for item in o.items:
            pid = item.product_id
            name = item.product.name if item.product else "Producto"
            if pid not in prod_sales:
                prod_sales[pid] = {"name": name, "qty": 0, "rev": Decimal("0")}
            prod_sales[pid]["qty"] += item.quantity
            prod_sales[pid]["rev"] += item.quantity * item.unit_price

    return sorted(
        [
            TopProduct(
                product_name=d["name"],
                units_sold=d["qty"],
                revenue=d["rev"],
            )
            for d in prod_sales.values()
        ],
        key=lambda x: x.revenue,
        reverse=True,
    )[:limit]

def get_upcoming_payments(valid_orders: list[Order]) -> list[RecentOrder]:
    upcoming = []
    for o in valid_orders:
        if o.payment_method != "abonos" or not o.notes:
            continue
        try:
            t = json.loads(o.notes)
            cuotas = int(t.get("pagos", 1))
            pagados = int(t.get("pagos_completados", 0))
            if pagados >= cuotas:
                continue
            enganche = Decimal(str(t.get("enganche", 0)))
            remaining = o.total_amount - enganche
            per_cuota = remaining / cuotas if cuotas > 0 else Decimal("0")
            upcoming.append(RecentOrder(
                id=o.id,
                customer_name=o.customer.full_name if o.customer else "Cliente",
                items_summary=f"Pago {pagados + 1} de {cuotas} • ${per_cuota:.2f}/pago",
                total_amount=o.total_amount,
                payment_method="abonos",
                status=o.status,
                created_at=o.created_at,
            ))
        except (json.JSONDecodeError, ValueError):
            pass
    return upcoming
