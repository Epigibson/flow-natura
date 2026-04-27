"""
Flow Natura Backend - Dashboard Router
Replaces the massive <script> block in index.astro with a single API call.
"""
import json
import uuid
from decimal import Decimal
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import select, func, and_, case, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.db.models import Order, OrderItem, Product, Inventory, Customer, ConsultantProfile
from app.dependencies import get_current_user
from app.models.schemas import (
    DashboardResponse, DashboardKPIs, RecentOrder, StockAlert,
    TopClient, TopProduct,
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("", response_model=DashboardResponse)
async def get_dashboard(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Single endpoint that returns ALL dashboard data.
    Replaces 6+ separate Supabase queries from the frontend.
    """
    now = datetime.now(timezone.utc)
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # ── 1. Fetch all orders this month (with items + customer) ──
    orders_stmt = (
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.product),
            selectinload(Order.customer),
        )
        .where(
            and_(
                Order.consultant_id == user_id,
                Order.created_at >= start_of_month,
            )
        )
        .order_by(Order.created_at.desc())
    )
    result = await db.execute(orders_stmt)
    all_orders = result.scalars().unique().all()

    # Filter valid (non-cancelled) orders
    valid_orders = [o for o in all_orders if o.status != "cancelled"]

    # ── 2. Fetch inventory ──
    inv_stmt = (
        select(Inventory)
        .options(selectinload(Inventory.product))
        .where(Inventory.consultant_id == user_id)
    )
    inv_result = await db.execute(inv_stmt)
    inventory = inv_result.scalars().unique().all()

    # ── 3. Calculate KPIs ──
    total_revenue = sum(float(o.total_amount) for o in valid_orders)
    out_of_stock = sum(1 for inv in inventory if inv.quantity <= 0)

    # Calculate pending debt (abonos)
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

    kpis = DashboardKPIs(
        total_revenue=Decimal(str(total_revenue)),
        total_orders=len(valid_orders),
        pending_debt=total_debt,
        out_of_stock=out_of_stock,
    )

    # ── 4. Recent Orders (top 5) ──
    recent_orders = []
    for o in all_orders[:5]:
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

    # ── 5. Top Clients ──
    client_spend: dict[uuid.UUID, dict] = {}
    for o in valid_orders:
        cid = o.customer_id
        name = o.customer.full_name if o.customer else "Cliente"
        if cid not in client_spend:
            client_spend[cid] = {"name": name, "total": Decimal("0")}
        client_spend[cid]["total"] += o.total_amount

    top_clients = sorted(
        [
            TopClient(customer_id=cid, name=d["name"], total=d["total"])
            for cid, d in client_spend.items()
        ],
        key=lambda x: x.total,
        reverse=True,
    )[:3]

    # ── 6. Stock Alerts (low stock ≤ 3) ──
    stock_alerts = sorted(
        [
            StockAlert(
                product_name=inv.product.name if inv.product else "?",
                category=inv.product.category if inv.product else None,
                stock=inv.quantity,
                is_out=inv.quantity <= 0,
            )
            for inv in inventory
            if inv.quantity <= 3
        ],
        key=lambda x: x.stock,
    )[:5]

    # ── 7. Top Products ──
    prod_sales: dict[uuid.UUID, dict] = {}
    for o in valid_orders:
        for item in o.items:
            pid = item.product_id
            name = item.product.name if item.product else "Producto"
            if pid not in prod_sales:
                prod_sales[pid] = {"name": name, "qty": 0, "rev": Decimal("0")}
            prod_sales[pid]["qty"] += item.quantity
            prod_sales[pid]["rev"] += item.quantity * item.unit_price

    top_products = sorted(
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
    )[:5]

    # ── 8. Upcoming Payments (abonos con cuotas pendientes) ──
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

    return DashboardResponse(
        kpis=kpis,
        recent_orders=recent_orders,
        top_clients=top_clients,
        stock_alerts=stock_alerts,
        top_products=top_products,
        upcoming_payments=upcoming,
    )
