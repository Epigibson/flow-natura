export type ConsultantLevel = 'Bronce' | 'Plata' | 'Oro' | 'Zafiro' | 'Diamante';

export interface LevelInfo {
  level: ConsultantLevel;
  minSales: number;
  maxSales: number | null;
  profitPercentage: number;   // e.g. 25 for 25%
  netProfitMsg: string;       // e.g. 'A 21.55%'
  priceFactor: number;        // e.g. 0.7845
}

// Configuración oficial del Camino de Crecimiento Natura
export const CAMINO_CRECIMIENTO: Record<ConsultantLevel, LevelInfo> = {
  Bronce: {
    level: 'Bronce',
    minSales: 0,
    maxSales: 699,
    profitPercentage: 25,
    netProfitMsg: 'A 21.55%',
    priceFactor: 0.7845,
  },
  Plata: {
    level: 'Plata',
    minSales: 700,
    maxSales: 1799,
    profitPercentage: 30,
    netProfitMsg: 'A 25.86%',
    priceFactor: 0.7414,
  },
  Oro: {
    level: 'Oro',
    minSales: 1800,
    maxSales: 4499,
    profitPercentage: 35,
    netProfitMsg: 'A 30.17%',
    priceFactor: 0.6983,
  },
  Zafiro: {
    level: 'Zafiro',
    minSales: 4500,
    maxSales: 12999,
    profitPercentage: 37,
    netProfitMsg: 'A 31.89%',
    priceFactor: 0.6811,
  },
  Diamante: {
    level: 'Diamante',
    minSales: 13000,
    maxSales: null,
    profitPercentage: 40,
    netProfitMsg: 'A 34.48%',
    priceFactor: 0.6552,
  },
};

/**
 * Obtiene la información del nivel dado un monto de facturación personal acumulada.
 */
export function getLevelBySales(accumulatedSales: number): LevelInfo {
  if (accumulatedSales >= CAMINO_CRECIMIENTO.Diamante.minSales) {
    return CAMINO_CRECIMIENTO.Diamante;
  }
  if (accumulatedSales >= CAMINO_CRECIMIENTO.Zafiro.minSales) {
    return CAMINO_CRECIMIENTO.Zafiro;
  }
  if (accumulatedSales >= CAMINO_CRECIMIENTO.Oro.minSales) {
    return CAMINO_CRECIMIENTO.Oro;
  }
  if (accumulatedSales >= CAMINO_CRECIMIENTO.Plata.minSales) {
    return CAMINO_CRECIMIENTO.Plata;
  }
  return CAMINO_CRECIMIENTO.Bronce;
}

/**
 * Determina si el producto pertenece a la categoría/marca "Casa y Estilo".
 */
export function isCasaYEstilo(brand: string = '', category: string = ''): boolean {
  const b = brand.toLowerCase();
  const c = category.toLowerCase();
  return b.includes('casa') || b.includes('estilo') || c.includes('casa') || c.includes('estilo');
}

/**
 * Obtiene el porcentaje de ganancia real dependiendo del nivel, la marca y la categoría.
 */
export function getProfitPercentage(level: ConsultantLevel, brand: string = '', category: string = ''): number {
  if (isCasaYEstilo(brand, category)) {
    // Reglas de Casa y Estilo: 15% para Bronce/Plata/Oro, 18% para Zafiro/Diamante
    if (level === 'Zafiro' || level === 'Diamante') {
      return 18;
    }
    return 15;
  }
  
  // Por defecto Belleza (Natura / Avon)
  return CAMINO_CRECIMIENTO[level].profitPercentage;
}

/**
 * Obtiene el factor de multiplicación de precio dependiendo del nivel, marca y categoría.
 */
export function getPriceFactor(level: ConsultantLevel, brand: string = '', category: string = ''): number {
  if (isCasaYEstilo(brand, category)) {
    const percentage = getProfitPercentage(level, brand, category);
    // Fórmula del factor considerando IVA (16%)
    return 1 - ((percentage / 100) / 1.16);
  }
  return CAMINO_CRECIMIENTO[level].priceFactor;
}

/**
 * Calcula el Precio Consultor de un producto usando el factor de multiplicación del nivel.
 * Fórmula: Precio Consultor = Precio Revista * Factor
 */
export function calculateConsultantPrice(magazinePrice: number, level: ConsultantLevel, brand: string = '', category: string = ''): number {
  const factor = getPriceFactor(level, brand, category);
  // Redondeamos a 2 decimales
  return Math.round((magazinePrice * factor) * 100) / 100;
}

/**
 * Progreso en porcentaje hacia el siguiente nivel.
 */
export function getProgressToNextLevel(accumulatedSales: number): {
  percentage: number;
  missingAmount: number | null;
  nextLevel: ConsultantLevel | null;
} {
  const currentLevelInfo = getLevelBySales(accumulatedSales);
  
  // Si ya es diamante, no hay siguiente nivel
  if (currentLevelInfo.level === 'Diamante') {
    return { percentage: 100, missingAmount: null, nextLevel: null };
  }
  
  // Encontrar el siguiente nivel basándose en su maxSales
  const max = currentLevelInfo.maxSales!;
  const nextMin = max + 1;
  const nextLevelInfo = getLevelBySales(nextMin);
  
  const min = currentLevelInfo.minSales;
  const range = max - min;
  const currentProgress = accumulatedSales - min;
  
  // Clamping by 0-100%
  const percentage = Math.min(100, Math.max(0, (currentProgress / range) * 100));
  const missingAmount = max - accumulatedSales;
  
  return {
    percentage: Math.round(percentage),
    missingAmount: missingAmount > 0 ? missingAmount : 0,
    nextLevel: nextLevelInfo.level
  };
}
