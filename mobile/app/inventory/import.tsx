import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, Linking } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import api from '../../../src/lib/api';
import SecondaryLayout from '../../components/SecondaryLayout';
import { useThemeColors } from '../../hooks/use-theme-colors';

const SHOWCASE_URL = 'https://natura-auth.prd.naturacloud.com/?company=natura&client_id=3ec6rhfe52b2k78h32kv7ml6ti&redirect_uri=https://gsp.natura.com/showcase/natura&country=MX&language=es';
const BATCH_SIZE = 100;

const JSON_EXAMPLE = `[
  {
    "code": "12345678",
    "name": "Producto Natura",
    "brand": "Natura",
    "category": "Perfumería",
    "price": 450,
    "cost": 320,
    "points": 12,
    "image_url": "https://..."
  }
]`;

interface ParsedRow {
  code: string;
  name: string;
  brand: string;
  category: string | null;
  price: number;
  cost: number;
  points: number;
  image_url: string | null;
  invalid: boolean;
  error: string | null;
}

export default function ImportScreen() {
  const t = useThemeColors();

  const [jsonText, setJsonText] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ message: string; isError: boolean } | null>(null);

  // ── Parse & preview (same row mapping the web uses before calling importProducts) ──
  const handleValidate = () => {
    setResult(null);
    try {
      const data = JSON.parse(jsonText);
      if (!Array.isArray(data) || data.length === 0) {
        setRows([]);
        setLoadError('El JSON no contiene un array de productos.');
        return;
      }
      const parsed: ParsedRow[] = data.map((p: any) => {
        const code = p?.code != null ? String(p.code) : '';
        const name = p?.name || '';
        const invalid = !code || !name;
        return {
          code,
          name,
          brand: p?.brand || 'Natura',
          category: p?.category || null,
          price: p?.price || 0,
          cost: p?.cost || 0,
          points: p?.points || 0,
          // The scraper emits "image"; the documented format uses "image_url" — accept both
          image_url: p?.image_url || p?.image || null,
          invalid,
          error: invalid ? 'Falta código o nombre' : null,
        };
      });
      setRows(parsed);
      setLoadError(null);
    } catch (err: any) {
      setRows([]);
      setLoadError('Error leyendo JSON: ' + (err?.message || 'formato inválido'));
    }
  };

  // ── Preview stats ──
  const stats = {
    total: rows.length,
    brands: new Set(rows.map(r => r.brand).filter(Boolean)).size,
    categories: new Set(rows.map(r => r.category).filter(Boolean)).size,
    errors: rows.filter(r => r.invalid).length,
  };

  // ── Import in batches of 100 (same contract and messages as web importar.astro) ──
  const handleImport = async () => {
    if (!rows.length || importing) return;

    const userId = await api.getCurrentUserId();
    if (!userId) {
      Alert.alert('Atención', 'Necesitas iniciar sesión en Natura Manager primero.');
      return;
    }

    setImporting(true);
    setResult(null);
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
    let totalImported = 0;
    let totalErrors = 0;

    try {
      for (let batch = 0; batch < totalBatches; batch++) {
        setProgress({ done: batch + 1, total: totalBatches });
        const chunk = rows.slice(batch * BATCH_SIZE, (batch + 1) * BATCH_SIZE);
        try {
          const res = await api.inventory.importProducts(chunk.map(r => ({
            code: r.code,
            name: r.name,
            brand: r.brand,
            category: r.category,
            price: r.price,
            cost: r.cost,
            points: r.points,
            image_url: r.image_url,
          })));
          totalImported += res.imported || 0;
          totalErrors += res.errors || 0;
        } catch {
          totalErrors += chunk.length;
        }
      }
      const message = `✅ ${totalImported} productos importados${totalErrors > 0 ? ` (${totalErrors} errores)` : ''}. ¡Ve a Inventario > Alta de Stock para registrar cantidades!`;
      setResult({ message, isError: totalErrors > 0 });
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SecondaryLayout title="Importar Productos 🌿">

      {/* ── Step 1: how to get the JSON (summary of the web instructions) ── */}
      <View className="rounded-2xl p-5 mb-6 border border-outline-variant/20" style={{ backgroundColor: t.primary + '0D' }}>
        <View className="flex-row items-center gap-2 mb-3">
          <View className="w-6 h-6 rounded-full items-center justify-center" style={{ backgroundColor: t.primary }}>
            <Text className="text-white font-bold text-xs">1</Text>
          </View>
          <Text className="font-bold text-on-surface">Extraer productos del Showcase</Text>
        </View>
        <Text className="text-xs text-on-surface-variant leading-5 mb-2">
          1. Abre{' '}
          <Text className="text-primary font-bold underline" onPress={() => Linking.openURL(SHOWCASE_URL)}>
            Showcase MX
          </Text>
          {' '}e inicia sesión.{'\n'}
          2. Presiona F12 → Console → pega el contenido de <Text className="font-mono">scripts/scrape-console.js</Text>.{'\n'}
          3. Se descarga <Text className="font-mono">natura-tokens.json</Text> — cópialo a la carpeta del proyecto.{'\n'}
          4. En tu terminal: <Text className="font-mono">node scripts/scrape-natura.mjs</Text>.{'\n'}
          5. Se genera <Text className="font-mono">natura-ciclo-XXXXXX.json</Text> con todos los productos.
        </Text>
        <Text className="text-[10px] text-on-surface-variant opacity-70">
          Extrae ~2000+ productos de Natura, Avon y Casa&Estilo con precios, puntos, categoría e imagen.
        </Text>
      </View>

      {/* ── Step 2: paste JSON ── */}
      <View className="rounded-2xl p-5 mb-6 border border-outline-variant/20" style={{ backgroundColor: t.secondary + '0D' }}>
        <View className="flex-row items-center gap-2 mb-3">
          <View className="w-6 h-6 rounded-full items-center justify-center" style={{ backgroundColor: t.secondary }}>
            <Text className="text-white font-bold text-xs">2</Text>
          </View>
          <Text className="font-bold text-on-surface">Pegar el JSON generado</Text>
        </View>
        <Text className="text-xs text-on-surface-variant mb-3">
          Pega el contenido del archivo JSON (array de productos con code, name, brand, category, price, cost, points, image_url).
        </Text>
        <TextInput
          className="bg-surface-container-highest rounded-xl p-4 text-xs font-mono text-on-surface mb-3"
          style={{ minHeight: 160 }}
          value={jsonText}
          onChangeText={setJsonText}
          placeholder={JSON_EXAMPLE}
          placeholderTextColor={t.muted}
          multiline
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          onPress={handleValidate}
          disabled={!jsonText.trim()}
          className="py-3 rounded-xl flex-row items-center justify-center gap-2"
          style={{ backgroundColor: !jsonText.trim() ? t.muted : t.secondary }}
        >
          <MaterialIcons name="fact-check" size={16} color="#fff" />
          <Text className="text-white font-bold text-sm">Validar y Previsualizar</Text>
        </TouchableOpacity>
      </View>

      {/* ── Parse error ── */}
      {!!loadError && (
        <View className="py-3 px-4 rounded-xl mb-6" style={{ backgroundColor: t.errorContainer + '33' }}>
          <Text className="text-sm font-bold" style={{ color: t.error }}>{loadError}</Text>
        </View>
      )}

      {/* ── Step 3: preview + import ── */}
      {rows.length > 0 && (
        <View className="rounded-2xl p-5 mb-6 border border-outline-variant/20 bg-surface-container-lowest">
          <View className="flex-row items-center gap-2 mb-4">
            <View className="w-6 h-6 rounded-full items-center justify-center" style={{ backgroundColor: t.primary }}>
              <Text className="text-white font-bold text-xs">3</Text>
            </View>
            <Text className="font-bold text-on-surface">Previsualización e Importación</Text>
          </View>

          {/* Stats */}
          <View className="flex-row gap-3 mb-4">
            {[
              { label: 'Productos', value: String(stats.total), color: t.primary },
              { label: 'Marcas', value: String(stats.brands), color: t.secondary },
              { label: 'Categorías', value: String(stats.categories), color: t.accent },
              { label: 'Errores', value: String(stats.errors), color: stats.errors > 0 ? t.error : t.secondary },
            ].map(s => (
              <View key={s.label} className="flex-1 rounded-xl p-3 items-center" style={{ backgroundColor: s.color + '0D' }}>
                <Text className="text-lg font-bold" style={{ color: s.color }}>{s.value}</Text>
                <Text className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider">{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Preview rows */}
          <View className="rounded-xl border border-outline-variant/20 overflow-hidden mb-4">
            {rows.slice(0, 15).map((r, idx) => (
              <View
                key={idx}
                className="flex-row items-center px-3 py-2.5"
                style={{
                  backgroundColor: r.invalid ? t.error + '0D' : idx % 2 === 0 ? 'transparent' : t.surfaceContainerLow,
                }}
              >
                <View className="flex-1">
                  <Text className="text-xs font-bold text-on-surface" numberOfLines={1}>
                    {r.name || 'Sin nombre'}
                  </Text>
                  <Text className="text-[10px] text-on-surface-variant font-mono">
                    #{r.code || '—'} · {r.category || '—'} · ${Number(r.cost || 0).toFixed(2)} / ${Number(r.price || 0).toFixed(2)}
                  </Text>
                </View>
                {r.invalid ? (
                  <View className="px-2 py-0.5 rounded-full ml-2" style={{ backgroundColor: t.error + '1A' }}>
                    <Text className="text-[9px] font-bold" style={{ color: t.error }}>{r.error}</Text>
                  </View>
                ) : (
                  <MaterialIcons name="check-circle" size={14} color={t.secondary} style={{ marginLeft: 8 }} />
                )}
              </View>
            ))}
            {rows.length > 15 && (
              <Text className="text-[10px] text-on-surface-variant text-center py-2">
                …y {rows.length - 15} filas más
              </Text>
            )}
          </View>

          {/* Import button + progress */}
          <TouchableOpacity
            onPress={handleImport}
            disabled={importing}
            className="py-4 rounded-xl flex-row items-center justify-center gap-2"
            style={{ backgroundColor: importing ? t.muted : t.primary }}
          >
            {importing ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <Text className="text-white font-bold text-sm">Importando…</Text>
              </>
            ) : (
              <>
                <MaterialIcons name="storage" size={16} color="#fff" />
                <Text className="text-white font-bold text-sm">Importar a mi BD</Text>
              </>
            )}
          </TouchableOpacity>

          {!!progress && (
            <View className="mt-4">
              <View className="w-full rounded-full overflow-hidden mb-2" style={{ backgroundColor: t.surfaceContainerHighest, height: 10 }}>
                <View
                  style={{
                    width: `${(progress.done / progress.total) * 100}%`,
                    height: 10,
                    backgroundColor: t.primary,
                    borderRadius: 5,
                  }}
                />
              </View>
              <Text className="text-xs text-on-surface-variant">
                Lote {progress.done}/{progress.total} (de {rows.length} productos)
              </Text>
            </View>
          )}

          {!!result && (
            <View className="mt-4 py-3 px-4 rounded-xl" style={{ backgroundColor: result.isError ? t.errorContainer + '33' : t.secondary + '1A' }}>
              <Text className="text-sm font-bold" style={{ color: result.isError ? t.error : t.secondary }}>
                {result.message}
              </Text>
            </View>
          )}
        </View>
      )}

      <View className="h-6" />
      </SecondaryLayout>
    </>
  );
}
