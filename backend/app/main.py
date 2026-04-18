"""
Flow Natura Backend - FastAPI Application
Main entry point. Run with: uvicorn app.main:app --reload
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.routers import dashboard, products, customers, orders, inventory, consultant

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="API backend para Flow Natura — Gestión de inventario, ventas y clientes para consultoras Natura.",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(products.router, prefix="/api/v1")
app.include_router(customers.router, prefix="/api/v1")
app.include_router(orders.router, prefix="/api/v1")
app.include_router(inventory.router, prefix="/api/v1")
app.include_router(consultant.router, prefix="/api/v1")


@app.get("/", tags=["Health"])
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok"}
