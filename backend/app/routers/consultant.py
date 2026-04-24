"""
Flow Natura Backend - Consultant Router
Profile management, growth path, and reports.
"""
import uuid
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, and_, extract
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.db.models import ConsultantProfile, Order, OrderItem, Product, Inventory, Customer
from app.dependencies import get_current_user
from app.models.schemas import ConsultantProfileResponse
from app.services.pricing import CAMINO_CRECIMIENTO, get_level_by_sales, get_all_level_prices

router = APIRouter(prefix="/consultant", tags=["Consultant"])


@router.get("/profile", response_model=ConsultantProfileResponse)
async def get_profile(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the authenticated consultant's profile."""
    stmt = select(ConsultantProfile).where(ConsultantProfile.id == user_id)
    result = await db.execute(stmt)
    profile = result.scalar_one_or_none()

    if not profile:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")

    return profile


@router.get("/growth")
async def get_growth_data(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Calculate growth path data from actual sales.
    Shows current level, progress to next level, and sales breakdown.
    """
    now = datetime.now(timezone.utc)
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Get profile
    profile_stmt = select(ConsultantProfile).where(ConsultantProfile.id == user_id)
    profile_result = await db.execute(profile_stmt)
    profile = profile_result.scalar_one_or_none()

    # Total sales this month
    month_stmt = select(
        func.coalesce(func.sum(Order.total_amount), 0)
    ).where(
        and_(
            Order.consultant_id == user_id,
            Order.created_at >= start_of_month,
            Order.status != "cancelled",
        )
    )
    month_result = await db.execute(month_stmt)
    month_sales = float(month_result.scalar() or 0)

    # Total accumulated sales (all time)
    total_stmt = select(
        func.coalesce(func.sum(Order.total_amount), 0)
    ).where(
        and_(
            Order.consultant_id == user_id,
            Order.status != "cancelled",
        )
    )
    total_result = await db.execute(total_stmt)
    total_sales = float(total_result.scalar() or 0)

    # Determine level
    level_info = get_level_by_sales(total_sales)
    current_level = level_info.level

    # Progress to next level
    levels = list(CAMINO_CRECIMIENTO.keys())
    current_idx = levels.index(current_level)
    next_level = levels[current_idx + 1] if current_idx < len(levels) - 1 else None
    next_level_info = CAMINO_CRECIMIENTO.get(next_level) if next_level else None

    progress = 100.0
    remaining = 0.0
    if next_level_info:
        range_size = next_level_info.min_sales - level_info.min_sales
        progress_amount = total_sales - level_info.min_sales
        progress = min(100.0, (progress_amount / range_size) * 100) if range_size > 0 else 100.0
        remaining = max(0, next_level_info.min_sales - total_sales)

    # Monthly breakdown (last 6 months)
    six_months_ago = now - timedelta(days=180)
    monthly_stmt = (
        select(
            extract("year", Order.created_at).label("year"),
            extract("month", Order.created_at).label("month"),
            func.sum(Order.total_amount).label("total"),
            func.count(Order.id).label("orders"),
        )
        .where(
            and_(
                Order.consultant_id == user_id,
                Order.created_at >= six_months_ago,
                Order.status != "cancelled",
            )
        )
        .group_by("year", "month")
        .order_by("year", "month")
    )
    monthly_result = await db.execute(monthly_stmt)

    monthly_breakdown = [
        {
            "year": int(r.year),
            "month": int(r.month),
            "total": float(r.total),
            "orders": int(r.orders),
        }
        for r in monthly_result.all()
    ]

    return {
        "profile_level": profile.level if profile else "Semilla",
        "calculated_level": current_level,
        "total_sales": total_sales,
        "month_sales": month_sales,
        "profit_percentage": level_info.profit_percentage,
        "price_factor": level_info.price_factor,
        "net_profit_msg": level_info.net_profit_msg,
        "next_level": next_level,
        "next_level_min_sales": next_level_info.min_sales if next_level_info else None,
        "progress_to_next": round(progress, 1),
        "remaining_to_next": remaining,
        "monthly_breakdown": monthly_breakdown,
        "latest_growth_data": profile.latest_growth_data if profile else None,
    }


@router.get("/pricing/{price}")
async def get_pricing_by_level(price: float):
    """
    Given a retail price, return the consultant cost for ALL levels.
    No auth required — useful for quick lookups.
    """
    if price <= 0:
        raise HTTPException(status_code=400, detail="El precio debe ser mayor a 0")

    return get_all_level_prices(price)


def _get_period_start(period: str, now: datetime) -> datetime:
    if period == "week":
        return now - timedelta(days=7)
    elif period == "year":
        return now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _aggregate_order_stats(orders: list[Order]) -> tuple[Decimal, Decimal, int, list[dict]]:
    total_revenue = Decimal("0")
    total_cost = Decimal("0")
    total_units = 0
    product_stats: dict[uuid.UUID, dict] = {}

    for order in orders:
        total_revenue += order.total_amount
        for item in order.items:
            total_units += item.quantity
            cost = item.product.cost if item.product else Decimal("0")
            total_cost += cost * item.quantity
            pid = item.product_id
            if pid not in product_stats:
                product_stats[pid] = {
                    "name": item.product.name if item.product else "?",
                    "qty": 0,
                    "revenue": Decimal("0"),
                }
            product_stats[pid]["qty"] += item.quantity
            product_stats[pid]["revenue"] += item.unit_price * item.quantity

    top_products = sorted(
        [
            {"name": d["name"], "units": d["qty"], "revenue": float(d["revenue"])}
            for d in product_stats.values()
        ],
        key=lambda x: x["revenue"],
        reverse=True,
    )[:10]

    return total_revenue, total_cost, total_units, top_products


@router.get("/reports/summary")
async def get_report_summary(
    period: str = "month",  # month, week, year
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Summary report for a given period.
    Returns revenue, costs, profit, top products, and customer stats.
    """
    now = datetime.now(timezone.utc)
    start = _get_period_start(period, now)

    # Orders with items
    orders_stmt = (
        select(Order)
        .options(selectinload(Order.items).selectinload(OrderItem.product))
        .where(
            and_(
                Order.consultant_id == user_id,
                Order.created_at >= start,
                Order.status != "cancelled",
            )
        )
    )
    result = await db.execute(orders_stmt)
    orders = result.scalars().unique().all()

    total_revenue, total_cost, total_units, top_products = _aggregate_order_stats(orders)

    # Customer count
    cust_stmt = select(func.count(Customer.id)).where(
        Customer.consultant_id == user_id
    )
    cust_result = await db.execute(cust_stmt)

    return {
        "period": period,
        "start_date": start.isoformat(),
        "total_orders": len(orders),
        "total_revenue": float(total_revenue),
        "total_cost": float(total_cost),
        "gross_profit": float(total_revenue - total_cost),
        "profit_margin": round(float((total_revenue - total_cost) / total_revenue * 100), 1) if total_revenue > 0 else 0,
        "total_units_sold": total_units,
        "total_customers": cust_result.scalar() or 0,
        "avg_order_value": round(float(total_revenue / len(orders)), 2) if orders else 0,
        "top_products": top_products,
    }
