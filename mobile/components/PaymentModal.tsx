import { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import api from '../../src/lib/api';
import { parseAmount, errorMessage, formatMoney } from '../../src/lib/orders';
import { useThemeColors } from '../hooks/use-theme-colors';
import { haptic } from '../lib/haptics';

interface Props {
  visible: boolean;
  orderId: string;
  customerName: string;
  balance: number;
  suggested: number;
  onClose: () => void;
  onSaved: () => void;
}

/** One "Cobrar" modal for every screen (sales list, detail, dashboard). */
export function PaymentModal({ visible, orderId, customerName, balance, suggested, onClose, onSaved }: Props) {
  const t = useThemeColors();
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setAmount(suggested.toFixed(2));
  }, [visible, suggested]);

  const submit = async () => {
    if (saving) return;
    const value = parseAmount(amount);
    if (isNaN(value) || value <= 0) return Alert.alert('Monto inválido', 'Ingresa un monto mayor a 0.');
    if (value > balance + 0.005) return Alert.alert('Monto excedido', `El monto no puede ser mayor al saldo (${formatMoney(balance)}).`);

    setSaving(true);
    try {
      await api.orders.addPayment(orderId, value);
      haptic.success();
      onSaved();
      onClose();
    } catch (e) {
      haptic.error();
      Alert.alert('No se pudo registrar el abono', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 justify-center items-center px-4">
        <View className="bg-surface-container-lowest rounded-3xl w-full p-6 border border-outline-variant shadow-2xl">
          <View className="w-16 h-16 bg-primary-container rounded-full items-center justify-center self-center mb-4">
            <MaterialIcons name="payments" size={32} color={t.onPrimaryContainer} />
          </View>
          <Text className="text-xl font-bold text-center text-on-surface mb-1">Registrar abono</Text>
          <Text className="text-sm text-center text-on-surface-variant mb-6">{customerName} · saldo {formatMoney(balance)}</Text>

          <View className="bg-surface-container p-4 rounded-2xl mb-6">
            <Text className="text-xs text-on-surface-variant font-bold uppercase tracking-widest mb-2">Monto a cobrar (MXN)</Text>
            <View className="flex-row items-center border-b-2 border-primary pb-2">
              <Text className="text-2xl font-black text-primary mr-1">$</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={t.onSurfaceVariant + '80'}
                selectTextOnFocus
                className="flex-1 text-2xl font-black text-primary p-0 m-0"
              />
            </View>
          </View>

          <TouchableOpacity className="bg-primary py-4 rounded-xl items-center shadow-sm mb-3" onPress={submit} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-white font-bold text-base">Confirmar cobro</Text>}
          </TouchableOpacity>
          <TouchableOpacity className="bg-surface-container py-4 rounded-xl items-center" onPress={onClose}>
            <Text className="text-on-surface font-bold">Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
