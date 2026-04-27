/**
 * Inventory Helpers — Shared types and utility functions
 * for the inventory module pages.
 */

/** Product type matching the Supabase schema */
export interface Product {
  id: string;
  name: string;
  code: string;
  brand: string;
  category: string;
  cost: number;
  price: number;
  points: number;
  image_url: string | null;
  description: string | null;
  quantity: number;
  consultant_id: string;
  created_at: string;
  deleted_at: string | null;
}

/** Fields needed for the inventory list view (lightweight) */
export const INVENTORY_LIST_FIELDS = 'id,name,code,brand,category,cost,price,points,image_url,quantity' as const;

/** Fields needed for the product detail view */
export const INVENTORY_DETAIL_FIELDS = 'id,name,code,brand,category,cost,price,points,image_url,quantity,description' as const;

/**
 * Calculate the margin percentage between cost and price.
 */
export function calcMargin(cost: number, price: number): number {
  if (!price || price <= 0) return 0;
  return Math.round(((price - cost) / price) * 100);
}

/**
 * Calculate profit per unit.
 */
export function calcProfit(cost: number, price: number): number {
  return Math.max(0, price - cost);
}

/**
 * Format a number as Mexican Pesos.
 */
export function formatMXN(amount: number): string {
  return `$${amount.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Get the CSS class for a margin value.
 */
export function marginColorClass(margin: number): { bg: string; text: string } {
  if (margin >= 30) return { bg: 'bg-green-500/10 border-green-200/30', text: 'text-green-600' };
  if (margin >= 15) return { bg: 'bg-amber-500/10 border-amber-200/30', text: 'text-amber-600' };
  return { bg: 'bg-red-500/10 border-red-200/30', text: 'text-red-600' };
}

/**
 * Debounce utility — delays execution until the user stops typing.
 */
export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}
