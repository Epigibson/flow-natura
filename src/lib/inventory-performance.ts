/**
 * Shared inventory performance (web /inventario/rendimiento and mobile):
 *  - sales: what moved (non-cancelled orders), by product and category, plus stock that never sold
 *  - stock: valuation of what you hold now
 */
import { supabase } from './supabase';

export interface ProductPerf { id: string; name: string; category: string; qtySold: number; revenue: number }
export interface CategoryPerf { name: string; qtySold: number; revenue: number; pct: number }

export interface InventoryPerformance {
  sales: {
    totalSold: number;
    totalRevenue: number;
    products: ProductPerf[];
    categories: CategoryPerf[];
    /** In stock, never sold */
    unsold: { productId: string; name: string; category: string; stock: number }[];
  };
  stock: {
    products: number;
    units: number;
    retailValue: number;
    costValue: number;
    potentialProfit: number;
    outOfStock: { productId: string; name: string }[];
    lowStock: { productId: string; name: string; quantity: number }[];
  };
}

export async function loadInventoryPerformance(): Promise<InventoryPerformance> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error('No user');

  const [ordersRes, invRes] = await Promise.all([
    supabase
      .from('orders')
      .select('order_items(product_id, quantity, unit_price, products(name, category))')
      .eq('consultant_id', userId)
      .neq('status', 'cancelled'),
    supabase.from('inventory').select('product_id, quantity, price, cost, products(name, category, price, cost)').eq('consultant_id', userId),
  ]);
  if (ordersRes.error) throw ordersRes.error;
  if (invRes.error) throw invRes.error;

  const productMap = new Map<string, ProductPerf>();
  const categoryMap = new Map<string, { qtySold: number; revenue: number }>();
  (ordersRes.data || []).forEach((o: any) => (o.order_items || []).forEach((item: any) => {
    const category = item.products?.category || 'General';
    const revenue = item.quantity * Number(item.unit_price);
    const p = productMap.get(item.product_id) || { id: item.product_id, name: item.products?.name || 'Producto', category, qtySold: 0, revenue: 0 };
    p.qtySold += item.quantity;
    p.revenue += revenue;
    productMap.set(item.product_id, p);
    const c = categoryMap.get(category) || { qtySold: 0, revenue: 0 };
    c.qtySold += item.quantity;
    c.revenue += revenue;
    categoryMap.set(category, c);
  }));

  const products = [...productMap.values()].sort((a, b) => b.revenue - a.revenue);
  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);
  const catTotal = [...categoryMap.values()].reduce((s, c) => s + c.revenue, 0);
  const categories = [...categoryMap.entries()]
    .map(([name, c]) => ({ name, ...c, pct: catTotal > 0 ? (c.revenue / catTotal) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  // Merge duplicate inventory rows per product
  const stockMap = new Map<string, { name: string; category: string; price: number; cost: number; quantity: number }>();
  (invRes.data || []).forEach((i: any) => {
    const cur = stockMap.get(i.product_id) || {
      name: i.products?.name || 'Producto', category: i.products?.category || 'General',
      price: Number(i.price ?? i.products?.price ?? 0), cost: Number(i.cost ?? i.products?.cost ?? 0), quantity: 0,
    };
    cur.quantity += i.quantity;
    stockMap.set(i.product_id, cur);
  });
  const stock = [...stockMap.entries()].map(([productId, s]) => ({ productId, ...s }));

  const retailValue = stock.reduce((s, i) => s + i.price * i.quantity, 0);
  const costValue = stock.reduce((s, i) => s + i.cost * i.quantity, 0);

  return {
    sales: {
      totalSold: products.reduce((s, p) => s + p.qtySold, 0),
      totalRevenue,
      products,
      categories,
      unsold: stock.filter(i => i.quantity > 0 && !productMap.has(i.productId))
        .map(i => ({ productId: i.productId, name: i.name, category: i.category, stock: i.quantity })),
    },
    stock: {
      products: stock.length,
      units: stock.reduce((s, i) => s + i.quantity, 0),
      retailValue,
      costValue,
      potentialProfit: retailValue - costValue,
      outOfStock: stock.filter(i => i.quantity <= 0).map(i => ({ productId: i.productId, name: i.name })),
      lowStock: stock.filter(i => i.quantity > 0 && i.quantity <= 2).map(i => ({ productId: i.productId, name: i.name, quantity: i.quantity })),
    },
  };
}
