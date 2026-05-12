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
    primary: isDark ? '#FFB890' : '#964900',
    primaryContainer: isDark ? '#5A2C0E' : '#f48120',
    onPrimaryContainer: isDark ? '#FFE0C7' : '#5a2900',
    secondary: isDark ? '#A8D08D' : '#3c6a00',
    secondaryContainer: isDark ? '#2C421B' : '#b8f47a',
    error: isDark ? '#E57373' : '#ba1a1a',
    errorContainer: isDark ? '#4A1919' : '#ffdad6',
    surface: isDark ? '#000000' : '#fef7ff',
    surfaceContainer: isDark ? '#262626' : '#f9f1fd',
    surfaceContainerHighest: isDark ? '#333333' : '#e7e0eb',
    surfaceContainerLowest: isDark ? '#1A1A1A' : '#ffffff',
    onSurface: isDark ? '#FFFFFF' : '#1d1a22',
    onSurfaceVariant: isDark ? '#B3B3B3' : '#564336',
    outlineVariant: isDark ? '#404040' : '#ddc1b0',
    muted: isDark ? '#52525B' : '#cccccc',
  };
}
