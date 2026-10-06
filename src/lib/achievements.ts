/**
 * Shared achievements: real lifetime stats + one badge list for web and mobile.
 * (The web used this month's orders as "total" and top-3 clients as client count.)
 */
import { supabase } from './supabase';

export interface AchievementStats {
  orders: number;
  revenue: number;
  customers: number;
  products: number;
  weekOrders: number;
  monthOrders: number;
  posts: number;
}

export interface Badge {
  id: string;
  icon: string;
  name: string;
  desc: string;
  group: 'ventas' | 'clientes' | 'inventario' | 'ingresos' | 'reto' | 'social';
  current: number;
  target: number;
  unlocked: boolean;
}

export async function loadAchievementStats(): Promise<AchievementStats> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error('No user');

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [orders, customers, inventory, posts] = await Promise.all([
    supabase.from('orders').select('total_amount, created_at').eq('consultant_id', userId).neq('status', 'cancelled'),
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('consultant_id', userId).neq('full_name', 'Cliente Mostrador'),
    supabase.from('inventory').select('id', { count: 'exact', head: true }).eq('consultant_id', userId),
    supabase.from('community_posts').select('id', { count: 'exact', head: true }).eq('author_id', userId),
  ]);
  for (const r of [orders, customers, inventory, posts]) if (r.error) throw r.error;

  const rows = orders.data || [];
  return {
    orders: rows.length,
    revenue: rows.reduce((s, o) => s + Number(o.total_amount), 0),
    customers: customers.count || 0,
    products: inventory.count || 0,
    weekOrders: rows.filter(o => o.created_at >= weekAgo).length,
    monthOrders: rows.filter(o => o.created_at >= monthStart).length,
    posts: posts.count || 0,
  };
}

export function buildBadges(s: AchievementStats): Badge[] {
  const b = (id: string, icon: string, name: string, desc: string, group: Badge['group'], value: number, target: number): Badge =>
    ({ id, icon, name, desc, group, current: Math.min(value, target), target, unlocked: value >= target });

  return [
    b('first_sale', '🛒', 'Primera Venta', 'Registra tu primera venta', 'ventas', s.orders, 1),
    b('five_sales', '🎯', '5 Ventas', 'Alcanza 5 ventas', 'ventas', s.orders, 5),
    b('ten_sales', '🔥', '10 Ventas', 'Alcanza 10 ventas', 'ventas', s.orders, 10),
    b('fifty_sales', '💎', '50 Ventas', 'Alcanza 50 ventas', 'ventas', s.orders, 50),
    b('hundred_sales', '👑', '100 Club', '100 ventas registradas', 'ventas', s.orders, 100),
    b('first_client', '🤗', 'Primer Cliente', 'Registra tu primer cliente', 'clientes', s.customers, 1),
    b('ten_clients', '👥', '10 Clientes', 'Alcanza 10 clientes', 'clientes', s.customers, 10),
    b('fifty_clients', '🌐', 'Red Sólida', '50 clientes registrados', 'clientes', s.customers, 50),
    b('first_product', '📦', 'Inventario Iniciado', 'Agrega tu primer producto', 'inventario', s.products, 1),
    b('rev_1k', '💰', '$1,000+', 'Genera $1,000 en ventas', 'ingresos', s.revenue, 1000),
    b('rev_5k', '💵', '$5,000+', 'Genera $5,000 en ventas', 'ingresos', s.revenue, 5000),
    b('rev_10k', '🪙', '$10,000+', 'Genera $10,000 en ventas', 'ingresos', s.revenue, 10000),
    b('rev_50k', '💸', '$50,000+', 'Genera $50,000 en ventas', 'ingresos', s.revenue, 50000),
    b('rev_100k', '🏆', 'Club 100K', 'Genera $100,000 en ventas', 'ingresos', s.revenue, 100000),
    b('week_5', '⚡', 'Semana 5+', '5 ventas en los últimos 7 días', 'reto', s.weekOrders, 5),
    b('month_20', '🚀', 'Mes Estelar', '20 ventas en el mes', 'reto', s.monthOrders, 20),
    b('community', '💬', 'Social', 'Publica en la comunidad', 'social', s.posts, 1),
  ];
}
