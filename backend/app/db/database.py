"""
Flow Natura Backend - Database Engine (async SQLAlchemy + asyncpg)
Direct PostgreSQL connection to Supabase.
"""
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

settings = get_settings()

# Create async engine with connection pooling
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,  # Validate connections before use
)

# Session factory
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# Base class for SQLAlchemy models
class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """Dependency that yields a database session."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
