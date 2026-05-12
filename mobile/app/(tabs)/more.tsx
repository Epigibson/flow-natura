import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MoreScreen() {
  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="px-6 py-4 flex-row justify-between items-center border-b border-surface-container">
        <Text className="text-2xl font-serif font-bold text-on-surface">Más Opciones</Text>
      </View>
      <View className="p-6 items-center">
        <Text className="text-on-surface-variant">Configuraciones y extras irán aquí.</Text>
      </View>
    </SafeAreaView>
  );
}
