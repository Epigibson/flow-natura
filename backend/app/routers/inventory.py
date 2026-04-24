"""
Flow Natura Backend - Inventory Router
Stock management: add, adjust, and performance analytics.
"""
import uuid
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, update, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.db.models import (
    Inventory, Product, Order, OrderItem, InventoryAdjustment,
    ProductBarcode, ConsultantProfile,
)
from app.dependencies import get_current_user
from app.models.schemas import (
    InventoryAddRequest, InventoryAdjustRequest, InventoryItemResponse,
)

router = APIRouter(prefix="/inventory", tags=["Inventory"])


@router.get("", response_model=list[InventoryItemResponse])
async def list_inventory(
    search: str | None = Query(None),
    category: str | None = Query(None),
    min_stock: int | None = Query(None, description="Filter by minimum stock"),
    max_stock: int | None = Query(None, description="Filter by maximum stock"),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all inventory items for the consultant."""
    stmt = (
        select(Inventory, Product)
        .join(Product, Inventory.product_id == Product.id)
        .where(
            and_(
                Inventory.consultant_id == user_id,
                Product.deleted_at == None,
            )
        )
        .order_by(Product.name)
    )

    if search:
        q = f"%{search}%"
        stmt = stmt.where(Product.name.ilike(q) | Product.code.ilike(q))
    if category:
        stmt = stmt.where(Product.category == category)
    if min_stock is not None:
        stmt = stmt.where(Inventory.quantity >= min_stock)
    if max_stock is not None:
        stmt = stmt.where(Inventory.quantity <= max_stock)

    result = await db.execute(stmt)
    rows = result.all()

    return [
        InventoryItemResponse(
            product_id=row.Product.id,
            product_name=row.Product.name,
            product_code=row.Product.code,
            category=row.Product.category,
            brand=row.Product.brand,
            price=row.Product.price,
            cost=row.Product.cost,
            quantity=row.Inventory.quantity,
            image_url=row.Product.image_url,
            description=row.Product.description,
            points=row.Product.points,
        )
        for row in rows
    ]


@router.post("/add", status_code=201)
async def add_stock(
    items: list[InventoryAddRequest],
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Add stock for one or more products.
    If inventory entry doesn't exist, creates one. Otherwise increments quantity.
    """
    results = []

    for item in items:
        # Verify product exists
        prod_stmt = select(Product).where(Product.id == item.product_id)
        prod_result = await db.execute(prod_stmt)
        product = prod_result.scalar_one_or_none()
        if not product:
            raise HTTPException(
                status_code=404,
                detail=f"Producto {item.product_id} no encontrado",
            )

        # Update cost if provided
        if item.cost is not None and item.cost > 0:
            product.cost = item.cost

        # Check if inventory entry exists
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
        else:
            inv = Inventory(
                consultant_id=user_id,
                product_id=item.product_id,
                quantity=item.quantity,
            )
            db.add(inv)

        results.append({
            "product_id": str(item.product_id),
            "product_name": product.name,
            "quantity_added": item.quantity,
            "new_total": inv.quantity,
        })

    await db.commit()

    return {
        "message": f"{len(results)} producto(s) actualizados",
        "items": results,
    }


@router.post("/adjust")
async def adjust_stock(
    data: InventoryAdjustRequest,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Adjust inventory (positive or negative).
    Used for corrections, damages, gifts, etc.
    """
    inv_stmt = select(Inventory).where(
        and_(
            Inventory.product_id == data.product_id,
            Inventory.consultant_id == user_id,
        )
    )
    inv_result = await db.execute(inv_stmt)
    inv = inv_result.scalar_one_or_none()

    if not inv:
        raise HTTPException(status_code=404, detail="Producto no encontrado en inventario")

    new_qty = inv.quantity + data.adjustment
    if new_qty < 0:
        raise HTTPException(
            status_code=400,
            detail=f"Stock insuficiente. Actual: {inv.quantity}, Ajuste: {data.adjustment}",
        )

    inv.quantity = new_qty
    await db.commit()

    return {
        "product_id": str(data.product_id),
        "previous_quantity": inv.quantity - data.adjustment,
        "adjustment": data.adjustment,
        "new_quantity": new_qty,
        "reason": data.reason,
    }


@router.get("/performance")
async def inventory_performance(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Inventory performance analytics.
    - Total value (cost and retail)
    - Category breakdown
    - Slow movers
    - Stock health
    """
    # Get all inventory with products
    stmt = (
        select(Inventory, Product)
        .join(Product, Inventory.product_id == Product.id)
        .where(
            and_(
                Inventory.consultant_id == user_id,
                Product.deleted_at == None,
            )
        )
    )
    result = await db.execute(stmt)
    rows = result.all()

    if not rows:
        return {
            "total_products": 0,
            "total_units": 0,
            "total_cost_value": 0,
            "total_retail_value": 0,
            "potential_profit": 0,
            "out_of_stock": 0,
            "low_stock": 0,
            "categories": [],
            "slow_movers": [],
        }

    total_units = 0
    total_cost = Decimal("0")
    total_retail = Decimal("0")
    out_of_stock = 0
    low_stock = 0
    categories: dict[str, dict] = {}

    for row in rows:
        inv = row.Inventory
        prod = row.Product
        qty = inv.quantity

        total_units += qty
        total_cost += prod.cost * qty
        total_retail += prod.price * qty

        if qty <= 0:
            out_of_stock += 1
        elif qty <= 3:
            low_stock += 1

        cat = prod.category or "Sin Categoría"
        if cat not in categories:
            categories[cat] = {"products": 0, "units": 0, "value": Decimal("0")}
        categories[cat]["products"] += 1
        categories[cat]["units"] += qty
        categories[cat]["value"] += prod.price * qty

    # Get slow movers (products with stock but no sales in last 30 days)
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    sold_stmt = (
        select(OrderItem.product_id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            and_(
                Order.consultant_id == user_id,
                Order.created_at >= thirty_days_ago,
                Order.status != "cancelled",
            )
        )
        .distinct()
    )
    sold_result = await db.execute(sold_stmt)
    sold_ids = {r[0] for r in sold_result.all()}

    slow_movers = [
        {
            "product_name": row.Product.name,
            "stock": row.Inventory.quantity,
            "cost_value": float(row.Product.cost * row.Inventory.quantity),
        }
        for row in rows
        if row.Inventory.quantity > 0 and row.Product.id not in sold_ids
    ][:10]

    return {
        "total_products": len(rows),
        "total_units": total_units,
        "total_cost_value": float(total_cost),
        "total_retail_value": float(total_retail),
        "potential_profit": float(total_retail - total_cost),
        "out_of_stock": out_of_stock,
        "low_stock": low_stock,
        "categories": [
            {"name": k, **{kk: float(vv) if isinstance(vv, Decimal) else vv for kk, vv in v.items()}}
            for k, v in sorted(categories.items(), key=lambda x: x[1]["value"], reverse=True)
        ],
        "slow_movers": slow_movers,
    }


@router.get("/categories")
async def list_categories(
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all product categories with counts."""
    stmt = (
        select(
            Product.category,
            func.count(Inventory.id).label("count"),
            func.sum(Inventory.quantity).label("total_stock"),
        )
        .join(Inventory, Inventory.product_id == Product.id)
        .where(
            and_(
                Inventory.consultant_id == user_id,
                Product.deleted_at == None,
            )
        )
        .group_by(Product.category)
        .order_by(func.count(Inventory.id).desc())
    )
    result = await db.execute(stmt)

    return [
        {
            "category": row.category or "Sin Categoría",
            "product_count": row.count,
            "total_stock": int(row.total_stock or 0),
        }
        for row in result.all()
    ]


@router.get("/adjustments")
async def list_adjustments(
    limit: int = Query(50, le=200),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List inventory adjustment history."""
    stmt = (
        select(InventoryAdjustment)
        .options(selectinload(InventoryAdjustment.product))
        .where(InventoryAdjustment.consultant_id == user_id)
        .order_by(InventoryAdjustment.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()

    return [
        {
            "id": str(r.id),
            "product_id": str(r.product_id),
            "product_name": r.product.name if r.product else "?",
            "product_code": r.product.code if r.product else "",
            "product_brand": r.product.brand if r.product else "",
            "adjustment_type": r.adjustment_type,
            "quantity": r.quantity,
            "previous_quantity": r.previous_quantity,
            "reason": r.reason,
            "notes": r.notes,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.post("/apply-adjustment")
async def apply_adjustment(
    data: dict,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Apply inventory adjustment and record history (replaces RPC)."""
    product_id = uuid.UUID(data["product_id"])
    adjustment_type = data.get("adjustment_type", "correction")
    quantity = int(data["quantity"])
    previous_quantity = int(data.get("previous_quantity", 0))
    reason = data.get("reason", "")
    notes = data.get("notes")

    # Find inventory entry
    inv_stmt = select(Inventory).where(
        and_(Inventory.product_id == product_id, Inventory.consultant_id == user_id)
    )
    inv_result = await db.execute(inv_stmt)
    inv = inv_result.scalar_one_or_none()

    if not inv:
        # Create it
        inv = Inventory(consultant_id=user_id, product_id=product_id, quantity=0)
        db.add(inv)
        await db.flush()

    # Apply
    new_qty = max(0, inv.quantity + quantity)
    inv.quantity = new_qty

    # Record adjustment
    adj = InventoryAdjustment(
        consultant_id=user_id,
        product_id=product_id,
        adjustment_type=adjustment_type,
        quantity=quantity,
        previous_quantity=previous_quantity,
        reason=reason,
        notes=notes,
    )
    db.add(adj)
    await db.commit()

    return {
        "product_id": str(product_id),
        "new_quantity": new_qty,
        "adjustment_id": str(adj.id),
    }


@router.post("/barcode")
async def add_barcode(
    data: dict,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Register a barcode for a product."""
    barcode = ProductBarcode(
        product_id=uuid.UUID(data["product_id"]),
        barcode=data["barcode"],
        created_by=user_id,
    )
    db.add(barcode)
    await db.commit()
    return {"id": str(barcode.id), "barcode": barcode.barcode}



async def _ensure_consultant_profile(user_id: uuid.UUID, db: AsyncSession) -> None:
    """Ensure consultant profile exists."""
    profile_stmt = select(ConsultantProfile).where(ConsultantProfile.id == user_id)
    profile_result = await db.execute(profile_stmt)
    if not profile_result.scalar_one_or_none():
        profile = ConsultantProfile(id=user_id, full_name="Consultora")
        db.add(profile)
        await db.flush()


async def _process_imported_product(p: dict, user_id: uuid.UUID, db: AsyncSession) -> None:
    """Process a single imported product, creating or updating it and ensuring inventory exists."""
    code = str(p.get("code", ""))
    if not code:
        raise ValueError("Product code is missing")

    # Check if product exists by code
    existing_stmt = select(Product).where(Product.code == code)
    existing_result = await db.execute(existing_stmt)
    product = existing_result.scalar_one_or_none()

    if product:
        # Update existing
        product.name = p.get("name", product.name)
        product.brand = p.get("brand", product.brand)
        product.category = p.get("category", product.category)
        product.price = p.get("price", product.price)
        product.cost = p.get("cost", product.cost)
        product.points = p.get("points", product.points)
        product.image_url = p.get("image_url", product.image_url)
    else:
        # Create new
        product = Product(
            code=code,
            name=p.get("name", ""),
            brand=p.get("brand", "Natura"),
            category=p.get("category"),
            price=p.get("price", 0),
            cost=p.get("cost", 0),
            points=p.get("points", 0),
            image_url=p.get("image_url"),
        )
        db.add(product)
        await db.flush()

    # Create inventory entry if not exists
    inv_stmt = select(Inventory).where(
        and_(Inventory.product_id == product.id, Inventory.consultant_id == user_id)
    )
    inv_result = await db.execute(inv_stmt)
    if not inv_result.scalar_one_or_none():
        db.add(Inventory(consultant_id=user_id, product_id=product.id, quantity=0))


@router.post("/import-products")
async def import_products(
    data: dict,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Batch import products and create inventory entries. Replaces Supabase upsert logic."""
    products_data = data.get("products", [])
    if not products_data:
        raise HTTPException(status_code=400, detail="No products provided")

    await _ensure_consultant_profile(user_id, db)

    imported = 0
    errors = 0

    for p in products_data:
        try:
            await _process_imported_product(p, user_id, db)
            imported += 1
        except Exception:
            errors += 1

    await db.commit()
    return {"imported": imported, "errors": errors}
