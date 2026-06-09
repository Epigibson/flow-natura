import { useColorScheme } from 'nativewind';

/**
 * Hook centralizado para colores del tema — Luxury Botanical Palette.
 * Usar SIEMPRE este hook en lugar de hex hardcodeados en inline styles.
 */
export function useThemeColors() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  return {
    isDark,
    // ── Primary ──
    primary: isDark ? '#E8B88A' : '#8B5E3C',
    primaryContainer: isDark ? '#5C3A1E' : '#D4A574',
    onPrimaryContainer: isDark ? '#FDDCB5' : '#5C3A1E',
    // ── Secondary ──
    secondary: isDark ? '#81C784' : '#4A7C59',
    secondaryContainer: isDark ? '#2E4A32' : '#C8E6C9',
    // ── Accent (gold) ──
    accent: isDark ? '#D4B896' : '#C9A96E',
    // ── Error ──
    error: isDark ? '#EF5350' : '#C62828',
    errorContainer: isDark ? '#3E1212' : '#FFDAD6',
    // ── Surfaces ──
    surface: isDark ? '#121210' : '#FAF8F5',
    surfaceContainerLow: isDark ? '#1A1918' : '#F5F2ED',
    surfaceContainer: isDark ? '#1E1D1B' : '#F3F0EB',
    surfaceContainerHighest: isDark ? '#2E2C28' : '#E8E3DC',
    surfaceContainerLowest: isDark ? '#171614' : '#FFFFFF',
    // ── On Surface ──
    onSurface: isDark ? '#F5F0E8' : '#2C2417',
    onSurfaceVariant: isDark ? '#A89F94' : '#7A6E62',
    // ── Borders ──
    outlineVariant: isDark ? '#3A3632' : '#D6CFC6',
    muted: isDark ? '#4A4640' : '#C4BDB5',
  };
}
