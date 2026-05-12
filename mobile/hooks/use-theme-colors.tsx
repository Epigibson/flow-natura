import { useColorScheme } from 'nativewind';

/**
 * Hook centralizado para colores del tema.
 * Usar SIEMPRE este hook en lugar de hex hardcodeados en inline styles.
 */
export function useThemeColors() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  return {
    isDark,
    primary: isDark ? '#ffb783' : '#964900',
    primaryContainer: isDark ? '#753800' : '#f48120',
    onPrimaryContainer: isDark ? '#ffdbcb' : '#5a2900',
    secondary: isDark ? '#a3d961' : '#3c6a00',
    secondaryContainer: isDark ? '#2b4f00' : '#b8f47a',
    error: isDark ? '#ffb4ab' : '#ba1a1a',
    errorContainer: isDark ? '#93000a' : '#ffdad6',
    surface: isDark ? '#151210' : '#fef7ff',
    surfaceContainer: isDark ? '#221e1a' : '#f9f1fd',
    surfaceContainerHighest: isDark ? '#38322e' : '#e7e0eb',
    surfaceContainerLowest: isDark ? '#1c1917' : '#ffffff',
    onSurface: isDark ? '#e9e1dd' : '#1d1a22',
    onSurfaceVariant: isDark ? '#d3c4bc' : '#564336',
    outlineVariant: isDark ? '#4f453e' : '#ddc1b0',
    muted: isDark ? '#5a534e' : '#cccccc',
  };
}
