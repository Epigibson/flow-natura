"""
Flow Natura Backend - Pricing Service
Port of lib/camino-crecimiento.ts to Python.
Calculates consultant prices based on their growth level.
"""
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP


@dataclass
class LevelInfo:
    level: str
    min_sales: float
    max_sales: float | None
    profit_percentage: int
    net_profit_msg: str
    price_factor: float


# Configuración oficial del Camino de Crecimiento Natura
CAMINO_CRECIMIENTO: dict[str, LevelInfo] = {
    "Bronce": LevelInfo(
        level="Bronce",
        min_sales=0,
        max_sales=4800,
        profit_percentage=25,
        net_profit_msg="A 21.55%",
        price_factor=0.7845,
    ),
    "Plata": LevelInfo(
        level="Plata",
        min_sales=4801,
        max_sales=16000,
        profit_percentage=30,
        net_profit_msg="A 25.86%",
        price_factor=0.7414,
    ),
    "Oro": LevelInfo(
        level="Oro",
        min_sales=16001,
        max_sales=80000,
        profit_percentage=35,
        net_profit_msg="A 30.17%",
        price_factor=0.6983,
    ),
    "Zafiro": LevelInfo(
        level="Zafiro",
        min_sales=80001,
        max_sales=350000,
        profit_percentage=37,
        net_profit_msg="A 31.89%",
        price_factor=0.6811,
    ),
    "Diamante": LevelInfo(
        level="Diamante",
        min_sales=350001,
        max_sales=None,
        profit_percentage=40,
        net_profit_msg="A 34.48%",
        price_factor=0.6552,
    ),
}


def calculate_consultant_price(magazine_price: float, level: str) -> Decimal:
    """
    Calculate the consultant's cost for a product.
    Formula: Precio Consultor = Precio Revista × Factor

    Args:
        magazine_price: The public retail price (precio revista)
        level: Consultant level (Bronce, Plata, Oro, Zafiro, Diamante)

    Returns:
        Consultant cost rounded to 2 decimal places
    """
    info = CAMINO_CRECIMIENTO.get(level, CAMINO_CRECIMIENTO["Bronce"])
    result = Decimal(str(magazine_price)) * Decimal(str(info.price_factor))
    return result.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def get_level_by_sales(accumulated_sales: float) -> LevelInfo:
    """Get level info based on accumulated personal sales."""
    if accumulated_sales >= CAMINO_CRECIMIENTO["Diamante"].min_sales:
        return CAMINO_CRECIMIENTO["Diamante"]
    if accumulated_sales >= CAMINO_CRECIMIENTO["Zafiro"].min_sales:
        return CAMINO_CRECIMIENTO["Zafiro"]
    if accumulated_sales >= CAMINO_CRECIMIENTO["Oro"].min_sales:
        return CAMINO_CRECIMIENTO["Oro"]
    if accumulated_sales >= CAMINO_CRECIMIENTO["Plata"].min_sales:
        return CAMINO_CRECIMIENTO["Plata"]
    return CAMINO_CRECIMIENTO["Bronce"]


def get_all_level_prices(magazine_price: float) -> dict[str, dict]:
    """
    Given a retail price, return the consultant cost for ALL levels.
    Useful for the frontend level selector.
    """
    return {
        level: {
            "cost": float(calculate_consultant_price(magazine_price, level)),
            "profit": round(magazine_price - float(calculate_consultant_price(magazine_price, level)), 2),
            "factor": info.price_factor,
            "profit_percentage": info.profit_percentage,
            "net_profit_msg": info.net_profit_msg,
        }
        for level, info in CAMINO_CRECIMIENTO.items()
    }
