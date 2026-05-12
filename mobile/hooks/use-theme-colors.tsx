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
    primary: isDark ? '#FF985E' : '#964900',
    primaryContainer: isDark ? '#5C2D0C' : '#f48120',
    onPrimaryContainer: isDark ? '#FFDDB8' : '#5a2900',
    secondary: isDark ? '#96C97A' : '#3c6a00',
    secondaryContainer: isDark ? '#2D4518' : '#b8f47a',
    error: isDark ? '#F87171' : '#ba1a1a',
    errorContainer: isDark ? '#450A0A' : '#ffdad6',
    surface: isDark ? '#09090B' : '#fef7ff',
    surfaceContainer: isDark ? '#27272A' : '#f9f1fd',
    surfaceContainerHighest: isDark ? '#3F3F46' : '#e7e0eb',
    surfaceContainerLowest: isDark ? '#18181B' : '#ffffff',
    onSurface: isDark ? '#F4F4F5' : '#1d1a22',
    onSurfaceVariant: isDark ? '#A1A1AA' : '#564336',
    outlineVariant: isDark ? '#3F3F46' : '#ddc1b0',
    muted: isDark ? '#52525B' : '#cccccc',
  };
}
