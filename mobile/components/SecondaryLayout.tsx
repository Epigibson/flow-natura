import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSidebar } from './SidebarContext';
import { useColorScheme } from 'nativewind';

interface SecondaryLayoutProps {
  title: string;
  children: React.ReactNode;
  scrollable?: boolean;
}

export default function SecondaryLayout({ title, children, scrollable = true }: SecondaryLayoutProps) {
  const { openSidebar } = useSidebar();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const content = scrollable ? (
    <ScrollView className="flex-1 px-6 pt-4" showsVerticalScrollIndicator={false}>
      {children}
      <View className="h-10" />
    </ScrollView>
  ) : (
    <View className="flex-1 px-6 pt-4">
      {children}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Header */}
      <View className="px-4 py-3 flex-row items-center justify-between border-b border-surface-container/50">
        <View className="flex-row items-center">
          <TouchableOpacity 
            onPress={() => router.back()} 
            className="w-10 h-10 rounded-full items-center justify-center bg-surface-container active:bg-surface-container-high"
          >
            <MaterialIcons name="arrow-back-ios-new" size={20} color={isDark ? '#d3c4bc' : '#564336'} />
          </TouchableOpacity>
          <Text className="text-xl font-serif font-bold text-on-surface ml-3">{title}</Text>
        </View>

        <TouchableOpacity 
          onPress={openSidebar} 
          className="w-10 h-10 rounded-xl bg-surface-container-lowest shadow-sm border border-outline-variant/30 items-center justify-center"
        >
          <Text className="text-on-surface text-xl">≡</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      {content}
    </SafeAreaView>
  );
}
