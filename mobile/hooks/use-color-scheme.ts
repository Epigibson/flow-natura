import { useColorScheme as useNativeWindColorScheme } from 'nativewind';

export function useColorScheme() {
  const { colorScheme } = useNativeWindColorScheme();
  return colorScheme;
}
