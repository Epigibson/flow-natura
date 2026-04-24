"""
Flow Natura Backend - Orders Router
Sales management with installment tracking and automatic inventory deduction.
"""
import json
import uuid
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.db.models import Order, OrderItem, Product, Inventory, Customer
from app.dependencies import get_current_user
from app.models.schemas import OrderCreate, OrderResponse, OrderItemResponse

router = APIRouter(prefix="/orders", tags=["Orders"])


@router.get("", response_model=list[OrderResponse])
async def list_orders(
    status: str | None = Query(None, description="Filter by status"),
    customer_id: uuid.UUID | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all orders for the authenticated consultant."""
    stmt = (
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.product),
            selectinload(Order.customer),
        )
        .where(Order.consultant_id == user_id)
        .order_by(Order.created_at.desc())
        .offset(offset)
        .limit(limit)
    )

    if status:
        stmt = stmt.where(Order.status == status)
    if customer_id:
        stmt = stmt.where(Order.customer_id == customer_id)

    result = await db.execute(stmt)
    orders = result.scalars().unique().all()

    return [_order_to_response(o) for o in orders]


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single order with all items."""
    stmt = (
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.product),
            selectinload(Order.customer),
        )
        .where(and_(Order.id == order_id, Order.consultant_id == user_id))
    )
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Venta no encontrada")

    return _order_to_response(order)


@router.post("", response_model=OrderResponse, status_code=201)
async def create_order(
    data: OrderCreate,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new sale.
    - Validates stock availability
    - Deducts inventory automatically
    - Calculates total from items
    """
    # Validate customer belongs to consultant
    cust_stmt = select(Customer).where(
        and_(Customer.id == data.customer_id, Customer.consultant_id == user_id)
    )
    cust_result = await db.execute(cust_stmt)
    if not cust_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # Calculate total and validate stock
    total = Decimal("0")
    order_items = []
    stock_updates = []

    for item in data.items:
        # Check product exists
        prod_stmt = select(Product).where(Product.id == item.product_id)
        prod_result = await db.execute(prod_stmt)
        product = prod_result.scalar_one_or_none()
        if not product:
            raise HTTPException(
                status_code=404,
                detail=f"Producto {item.product_id} no encontrado",
            )

        # Check stock
        inv_stmt = select(Inventory).where(
            and_(
                Inventory.product_id == item.product_id,
                Inventory.consultant_id == user_id,
            )
        )
        inv_result = await db.execute(inv_stmt)
        inv = inv_result.scalar_one_or_none()

        if not inv or inv.quantity < item.quantity:
            available = inv.quantity if inv else 0
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuficiente para '{product.name}'. "
                       f"Disponible: {available}, Solicitado: {item.quantity}",
            )

        subtotal = item.unit_price * item.quantity
        total += subtotal

        order_items.append(OrderItem(
            product_id=item.product_id,
            quantity=item.quantity,
            unit_price=item.unit_price,
        ))
        stock_updates.append((inv, item.quantity))

    # Create order
    order = Order(
        consultant_id=user_id,
        customer_id=data.customer_id,
        total_amount=total,
        payment_method=data.payment_method,
        notes=data.notes,
        status="pending",
    )
    db.add(order)
    await db.flush()  # Get order.id

    # Add items
    for oi in order_items:
        oi.order_id = order.id
        db.add(oi)

    # Deduct inventory
    for inv, qty in stock_updates:
        inv.quantity -= qty

    await db.commit()

    # Reload with relationships
    stmt = (
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.product),
            selectinload(Order.customer),
        )
        .where(Order.id == order.id)
    )
    result = await db.execute(stmt)
    final_order = result.scalar_one()

    return _order_to_response(final_order)


@router.patch("/{order_id}/cancel", response_model=OrderResponse)
async def cancel_order(
    order_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel an order and restore inventory."""
    stmt = (
        select(Order)
        .options(selectinload(Order.items).selectinload(OrderItem.product),
                 selectinload(Order.customer))
        .where(and_(Order.id == order_id, Order.consultant_id == user_id))
    )
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Venta no encontrada")

    if order.status == "cancelled":
        raise HTTPException(status_code=400, detail="La venta ya está cancelada")

    # Restore inventory
    for item in order.items:
        inv_stmt = select(Inventory).where(
            and_(
                Inventory.product_id == item.product_id,
                Inventory.consultant_id == user_id,
            )
        )
        inv_result = await db.execute(inv_stmt)
        inv = inv_result.scalar_one_or_none()
        if inv:
            inv.quantity += item.quantity

    order.status = "cancelled"
    await db.commit()
    await db.refresh(order)

    return _order_to_response(order)


def _parse_installment_data(notes: str | None) -> dict:
    """Safely parse installment JSON data from order notes."""
    try:
        return json.loads(notes) if notes else {}
    except json.JSONDecodeError:
        return {}


def _calculate_installment_response(
    order_id: uuid.UUID,
    status: str,
    total_amount: Decimal,
    notes_data: dict,
    cuotas: int,
    pagados: int,
) -> dict:
    """Calculate remaining balance and format installment response."""
    enganche = Decimal(str(notes_data.get("enganche", 0)))
    remaining = total_amount - enganche
    per_cuota = remaining / cuotas if cuotas > 0 else Decimal("0")

    return {
        "order_id": str(order_id),
        "pagos_completados": pagados,
        "pagos_totales": cuotas,
        "monto_cuota": float(per_cuota),
        "completado": pagados >= cuotas,
        "status": status,
    }


@router.patch("/{order_id}/pay")
async def register_payment(
    order_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Register an installment payment (abono)."""
    stmt = select(Order).where(
        and_(Order.id == order_id, Order.consultant_id == user_id)
    )
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Venta no encontrada")

    if order.payment_method != "abonos":
        raise HTTPException(status_code=400, detail="Esta venta no es de abonos")

    notes_data = _parse_installment_data(order.notes)

    cuotas = int(notes_data.get("pagos", 1))
    pagados = int(notes_data.get("pagos_completados", 0))

    if pagados >= cuotas:
        raise HTTPException(status_code=400, detail="Todos los pagos ya fueron completados")

    # Increment completed payments
    pagados += 1
    notes_data["pagos_completados"] = pagados
    order.notes = json.dumps(notes_data)

    # If all paid, mark as paid
    if pagados >= cuotas:
        order.status = "paid"

    await db.commit()

    return _calculate_installment_response(
        order.id,
        order.status,
        order.total_amount,
        notes_data,
        cuotas,
        pagados,
    )


@router.patch("/{order_id}/notes")
async def update_order_notes(
    order_id: uuid.UUID,
    data: dict,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update order notes."""
    stmt = select(Order).where(
        and_(Order.id == order_id, Order.consultant_id == user_id)
    )
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Venta no encontrada")

    order.notes = data.get("notes", order.notes)
    await db.commit()

    return {"order_id": str(order.id), "notes": order.notes}


@router.patch("/{order_id}/deliver", response_model=OrderResponse)
async def deliver_order(
    order_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark an order as delivered."""
    stmt = (
        select(Order)
        .options(selectinload(Order.items).selectinload(OrderItem.product),
                 selectinload(Order.customer))
        .where(and_(Order.id == order_id, Order.consultant_id == user_id))
    )
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Venta no encontrada")

    if order.status == "cancelled":
        raise HTTPException(status_code=400, detail="No se puede entregar una venta cancelada")

    order.status = "delivered"
    await db.commit()
    await db.refresh(order)

    return _order_to_response(order)


def _order_to_response(order: Order) -> OrderResponse:
    """Convert an Order ORM object to an OrderResponse."""
    items = []
    for item in order.items:
        subtotal = item.unit_price * item.quantity
        items.append(OrderItemResponse(
            id=item.id,
            product_id=item.product_id,
            product_name=item.product.name if item.product else "?",
            quantity=item.quantity,
            unit_price=item.unit_price,
            subtotal=subtotal,
        ))

    return OrderResponse(
        id=order.id,
        consultant_id=order.consultant_id,
        customer_id=order.customer_id,
        customer_name=order.customer.full_name if order.customer else "Cliente",
        status=order.status,
        total_amount=order.total_amount,
        payment_method=order.payment_method,
        notes=order.notes,
        items=items,
        created_at=order.created_at,
    )
