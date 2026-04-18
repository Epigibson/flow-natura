"""
Flow Natura Backend - Products Router
CRUD for products with consultant-level pricing.
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import Product, Inventory
from app.dependencies import get_current_user
from app.models.schemas import (
    ProductCreate, ProductUpdate, ProductResponse,
)
from app.services.pricing import calculate_consultant_price

router = APIRouter(prefix="/products", tags=["Products"])


def _product_response(product: Product, stock: int = 0) -> ProductResponse:
    """Helper to build a ProductResponse from ORM model."""
    return ProductResponse(
        id=product.id,
        consultant_id=None,
        code=product.code,
        name=product.name,
        category=product.category,
        brand=product.brand,
        description=product.description,
        price=product.price,
        cost=product.cost,
        points=product.points,
        image_url=product.image_url,
        is_active=product.is_active,
        created_at=product.created_at,
        stock=stock,
    )


@router.get("", response_model=list[ProductResponse])
async def list_products(
    search: str | None = Query(None, description="Search by name/code/brand"),
    category: str | None = Query(None),
    brand: str | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List products with optional filters."""
    stmt = (
        select(
            Product,
            func.coalesce(Inventory.quantity, 0).label("stock"),
        )
        .outerjoin(
            Inventory,
            and_(
                Inventory.product_id == Product.id,
                Inventory.consultant_id == user_id,
            ),
        )
        .where(Product.deleted_at == None)
        .order_by(Product.name)
        .offset(offset)
        .limit(limit)
    )

    if search:
        q = f"%{search}%"
        stmt = stmt.where(
            or_(
                Product.name.ilike(q),
                Product.code.ilike(q),
                Product.brand.ilike(q),
            )
        )
    if category:
        stmt = stmt.where(Product.category == category)
    if brand:
        stmt = stmt.where(Product.brand == brand)

    result = await db.execute(stmt)
    return [_product_response(row.Product, row.stock) for row in result.all()]


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single product by ID."""
    stmt = (
        select(Product, func.coalesce(Inventory.quantity, 0).label("stock"))
        .outerjoin(Inventory, and_(
            Inventory.product_id == Product.id, Inventory.consultant_id == user_id,
        ))
        .where(Product.id == product_id)
    )
    result = await db.execute(stmt)
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return _product_response(row.Product, row.stock)


@router.post("", response_model=ProductResponse, status_code=201)
async def create_product(
    data: ProductCreate,
    level: str = Query("Bronce", description="Consultant level for pricing"),
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new product with auto-calculated cost by level."""
    cost = data.cost
    if cost <= 0 and data.price > 0:
        cost = calculate_consultant_price(float(data.price), level)

    product = Product(
        code=data.code, name=data.name, category=data.category,
        brand=data.brand, description=data.description,
        price=data.price, cost=cost, points=data.points, image_url=data.image_url,
    )
    db.add(product)
    await db.flush()

    if data.stock > 0:
        db.add(Inventory(consultant_id=user_id, product_id=product.id, quantity=data.stock))

    await db.commit()
    await db.refresh(product)
    return _product_response(product, data.stock)


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: uuid.UUID,
    data: ProductUpdate,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a product."""
    stmt = select(Product).where(Product.id == product_id)
    result = await db.execute(stmt)
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(product, key, value)

    await db.commit()
    await db.refresh(product)

    inv_stmt = select(Inventory.quantity).where(
        and_(Inventory.product_id == product_id, Inventory.consultant_id == user_id)
    )
    stock = (await db.execute(inv_stmt)).scalar() or 0
    return _product_response(product, stock)


@router.delete("/{product_id}", status_code=204)
async def delete_product(
    product_id: uuid.UUID,
    user_id: uuid.UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a product (sets deleted_at)."""
    stmt = select(Product).where(Product.id == product_id)
    result = await db.execute(stmt)
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    product.deleted_at = datetime.now(timezone.utc)
    await db.commit()
