"""
Flow Natura Backend - Pydantic Schemas
Request/Response models for API endpoints.
"""
import uuid
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field


# ═══════════ PRODUCT ═══════════

class ProductBase(BaseModel):
    code: str
    name: str
    category: str | None = None
    brand: str | None = None
    description: str | None = None
    price: Decimal = Field(ge=0)
    cost: Decimal = Field(ge=0)
    points: int = 0
    image_url: str | None = None


class ProductCreate(ProductBase):
    stock: int = Field(default=1, ge=0)


class ProductUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    category: str | None = None
    brand: str | None = None
    description: str | None = None
    price: Decimal | None = Field(default=None, ge=0)
    cost: Decimal | None = Field(default=None, ge=0)
    points: int | None = None
    image_url: str | None = None


class ProductResponse(ProductBase):
    id: uuid.UUID
    consultant_id: uuid.UUID | None
    is_active: bool
    created_at: datetime
    stock: int = 0  # Populated from inventory join

    class Config:
        from_attributes = True


# ═══════════ CUSTOMER ═══════════

class CustomerBase(BaseModel):
    full_name: str
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    preferences: str | None = None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    preferences: str | None = None


class CustomerResponse(CustomerBase):
    id: uuid.UUID
    consultant_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


# ═══════════ ORDER ═══════════

class OrderItemCreate(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(ge=1)
    unit_price: Decimal = Field(ge=0)


class OrderCreate(BaseModel):
    customer_id: uuid.UUID
    items: list[OrderItemCreate]
    payment_method: str = "contado"
    notes: str | None = None


class OrderItemResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    product_name: str = ""
    quantity: int
    unit_price: Decimal
    subtotal: Decimal = Decimal("0")

    class Config:
        from_attributes = True


class OrderResponse(BaseModel):
    id: uuid.UUID
    consultant_id: uuid.UUID
    customer_id: uuid.UUID
    customer_name: str = ""
    status: str
    total_amount: Decimal
    payment_method: str | None
    notes: str | None
    items: list[OrderItemResponse] = []
    created_at: datetime

    class Config:
        from_attributes = True


# ═══════════ INVENTORY ═══════════

class InventoryAddRequest(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(ge=1)
    cost: Decimal | None = None


class InventoryAdjustRequest(BaseModel):
    product_id: uuid.UUID
    adjustment: int  # Can be negative
    reason: str = ""


class InventoryItemResponse(BaseModel):
    product_id: uuid.UUID
    product_name: str
    product_code: str
    category: str | None
    brand: str | None
    price: Decimal
    cost: Decimal
    quantity: int
    image_url: str | None = None
    description: str | None = None
    points: int | None = None

    class Config:
        from_attributes = True


# ═══════════ DASHBOARD ═══════════

class DashboardKPIs(BaseModel):
    total_revenue: Decimal = Decimal("0")
    total_orders: int = 0
    pending_debt: Decimal = Decimal("0")
    out_of_stock: int = 0


class RecentOrder(BaseModel):
    id: uuid.UUID
    customer_name: str
    items_summary: str
    total_amount: Decimal
    payment_method: str | None
    status: str
    created_at: datetime


class StockAlert(BaseModel):
    product_name: str
    category: str | None
    stock: int
    is_out: bool


class TopClient(BaseModel):
    customer_id: uuid.UUID
    name: str
    total: Decimal


class TopProduct(BaseModel):
    product_name: str
    units_sold: int
    revenue: Decimal


class DashboardResponse(BaseModel):
    kpis: DashboardKPIs
    recent_orders: list[RecentOrder] = []
    top_clients: list[TopClient] = []
    stock_alerts: list[StockAlert] = []
    top_products: list[TopProduct] = []
    upcoming_payments: list[RecentOrder] = []


# ═══════════ CONSULTANT ═══════════

class ConsultantProfileResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    natura_code: str | None
    level: str
    is_natura_connected: bool | None
    latest_growth_data: dict | None
    growth_sync_date: datetime | None

    class Config:
        from_attributes = True
