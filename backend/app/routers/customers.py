"""
Flow Natura Backend - Customers Router
CRUD for customers with analytics.
"""
import uuid
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.db.models import Customer, Order, OrderItem, Product
from app.dependencies import get_current_user
from app.models.schemas import CustomerCreate, CustomerUpdate, CustomerResponse

router = APIRouter(prefix="/customers", tags=["Customers"])


@router.get("", response_model=list[CustomerResponse])
async def list_customers(
    search: str | None = Query(None, description="Search by name, phone, or email"),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all customers for the authenticated consultant."""
    stmt = (
        select(Customer)
        .where(Customer.consultant_id == user_id)
        .order_by(Customer.full_name)
        .offset(offset)
        .limit(limit)
    )

    if search:
        q = f"%{search}%"
        stmt = stmt.where(
            or_(
                Customer.full_name.ilike(q),
                Customer.phone.ilike(q),
                Customer.email.ilike(q),
            )
        )

    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single customer with their stats."""
    stmt = select(Customer).where(
        and_(Customer.id == customer_id, Customer.consultant_id == user_id)
    )
    result = await db.execute(stmt)
    customer = result.scalar_one_or_none()

    if not customer:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    return customer


@router.get("/{customer_id}/stats")
async def get_customer_stats(
    customer_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get purchase statistics for a customer."""
    # Total orders and revenue
    stats_stmt = select(
        func.count(Order.id).label("total_orders"),
        func.coalesce(func.sum(Order.total_amount), 0).label("total_spent"),
        func.max(Order.created_at).label("last_purchase"),
    ).where(
        and_(
            Order.customer_id == customer_id,
            Order.consultant_id == user_id,
            Order.status != "cancelled",
        )
    )
    result = await db.execute(stats_stmt)
    row = result.first()

    # Top products for this customer
    top_stmt = (
        select(
            Product.name,
            func.sum(OrderItem.quantity).label("qty"),
            func.sum(OrderItem.quantity * OrderItem.unit_price).label("revenue"),
        )
        .join(OrderItem, OrderItem.product_id == Product.id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            and_(
                Order.customer_id == customer_id,
                Order.consultant_id == user_id,
                Order.status != "cancelled",
            )
        )
        .group_by(Product.name)
        .order_by(func.sum(OrderItem.quantity * OrderItem.unit_price).desc())
        .limit(5)
    )
    top_result = await db.execute(top_stmt)
    top_products = [
        {"name": r.name, "quantity": int(r.qty), "revenue": float(r.revenue)}
        for r in top_result.all()
    ]

    # Pending debt (abonos)
    import json
    debt_stmt = (
        select(Order)
        .where(
            and_(
                Order.customer_id == customer_id,
                Order.consultant_id == user_id,
                Order.payment_method == "abonos",
                Order.status != "cancelled",
            )
        )
    )
    debt_result = await db.execute(debt_stmt)
    total_debt = Decimal("0")
    for o in debt_result.scalars().all():
        if o.notes:
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

    return {
        "total_orders": row.total_orders if row else 0,
        "total_spent": float(row.total_spent) if row else 0,
        "last_purchase": row.last_purchase if row else None,
        "pending_debt": float(total_debt),
        "top_products": top_products,
    }


@router.post("", response_model=CustomerResponse, status_code=201)
async def create_customer(
    data: CustomerCreate,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new customer."""
    customer = Customer(
        consultant_id=user_id,
        full_name=data.full_name,
        phone=data.phone,
        email=data.email,
        address=data.address,
        preferences=data.preferences,
    )
    db.add(customer)
    await db.commit()
    await db.refresh(customer)
    return customer


@router.put("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: uuid.UUID,
    data: CustomerUpdate,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a customer."""
    stmt = select(Customer).where(
        and_(Customer.id == customer_id, Customer.consultant_id == user_id)
    )
    result = await db.execute(stmt)
    customer = result.scalar_one_or_none()

    if not customer:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(customer, key, value)

    await db.commit()
    await db.refresh(customer)
    return customer


@router.delete("/{customer_id}", status_code=204)
async def delete_customer(
    customer_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a customer (only if no orders)."""
    stmt = select(Customer).where(
        and_(Customer.id == customer_id, Customer.consultant_id == user_id)
    )
    result = await db.execute(stmt)
    customer = result.scalar_one_or_none()

    if not customer:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # Check for existing orders
    order_count_stmt = select(func.count(Order.id)).where(
        Order.customer_id == customer_id
    )
    order_count = await db.execute(order_count_stmt)
    if order_count.scalar() > 0:
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar un cliente con ventas registradas",
        )

    await db.delete(customer)
    await db.commit()
