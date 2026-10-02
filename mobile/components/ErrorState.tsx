import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeColors } from '../hooks/use-theme-colors';

/** Shown when a list fails to load, so an error is never mistaken for "no data". */
export function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  const t = useThemeColors();
  return (
    <View className="items-center justify-center py-16 px-8">
      <MaterialIcons name="cloud-off" size={64} color={t.surfaceContainerHighest} />
      <Text className="text-on-surface mt-4 font-bold text-lg">No pudimos cargar la información</Text>
      {!!message && <Text className="text-on-surface-variant mt-1 text-center text-sm">{message}</Text>}
      <TouchableOpacity onPress={onRetry} className="mt-6 px-6 py-3 rounded-xl bg-primary" accessibilityRole="button">
        <Text className="text-white font-bold">Reintentar</Text>
      </TouchableOpacity>
    </View>
  );
}
