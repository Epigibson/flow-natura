"""
Flow Natura Backend - Dashboard Router
Replaces the massive <script> block in index.astro with a single API call.
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.db.models import Order, OrderItem, Inventory
from app.dependencies import get_current_user
from app.models.schemas import DashboardResponse
from app.services.dashboard import (
    calculate_kpis, get_recent_orders, get_top_clients,
    get_stock_alerts, get_top_products, get_upcoming_payments
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
    all_orders = list(result.scalars().unique().all())

    # Filter valid (non-cancelled) orders
    valid_orders = [o for o in all_orders if o.status != "cancelled"]

    # ── 2. Fetch inventory ──
    inv_stmt = (
        select(Inventory)
        .options(selectinload(Inventory.product))
        .where(Inventory.consultant_id == user_id)
    )
    inv_result = await db.execute(inv_stmt)
    inventory = list(inv_result.scalars().unique().all())

    # ── 3. Build response using service layer ──
    return DashboardResponse(
        kpis=calculate_kpis(valid_orders, inventory),
        recent_orders=get_recent_orders(all_orders),
        top_clients=get_top_clients(valid_orders),
        stock_alerts=get_stock_alerts(inventory),
        top_products=get_top_products(valid_orders),
        upcoming_payments=get_upcoming_payments(valid_orders),
    )
