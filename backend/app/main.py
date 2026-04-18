"""
Flow Natura Backend - FastAPI Application
Main entry point. Run with: uvicorn app.main:app --reload
"""
import traceback
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import get_settings
from app.routers import dashboard, products, customers, orders, inventory, consultant, community, mentorship

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="API backend para Flow Natura — Gestión de inventario, ventas y clientes para consultoras Natura.",
    docs_url="/docs",
    redoc_url="/redoc",
)


# ── Global exception handler (returns detailed errors instead of generic 500) ──
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "type": type(exc).__name__},
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
app.include_router(community.router, prefix="/api/v1")
app.include_router(mentorship.router, prefix="/api/v1")


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


@app.get("/debug/db", tags=["Debug"])
async def debug_db():
    """Test database connectivity."""
    from sqlalchemy import text
    from app.db.database import async_session
    try:
        async with async_session() as session:
            result = await session.execute(text("SELECT count(*) FROM public.products"))
            return {"db": "connected", "products_count": result.scalar()}
    except Exception as e:
        return {"db": "error", "detail": str(e), "type": type(e).__name__}

