import { View, Text } from 'react-native';
import { orderStatusChips, type OrderLike, type StatusTone } from '../../src/lib/orders';
import { useThemeColors } from '../hooks/use-theme-colors';

/** Same two chips (delivery + payment) the web shows for every order. */
export function OrderStatusChips({ order, align = 'flex-start' }: { order: OrderLike; align?: 'flex-start' | 'flex-end' }) {
  const t = useThemeColors();
  const chips = orderStatusChips(order);
  const color = (tone: StatusTone) =>
    tone === 'success' ? t.secondary : tone === 'danger' ? t.error : tone === 'warning' ? t.primary : t.onSurfaceVariant;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: align }}>
      {[chips.delivery, chips.payment].filter(Boolean).map((chip) => (
        <View key={chip!.label} style={{ backgroundColor: color(chip!.tone) + '1A', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
          <Text style={{ color: color(chip!.tone), fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 }}>{chip!.label}</Text>
        </View>
      ))}
    </View>
  );
}
