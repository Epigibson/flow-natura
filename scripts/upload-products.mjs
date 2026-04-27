/**
 * 🌿 Flow Natura — Subir productos del JSON a Supabase
 *
 * Lee el archivo JSON del ciclo y sube/actualiza todos los productos
 * usando la función RPC `upsert_product_with_variants`.
 *
 * Uso:
 *   node scripts/upload-products.mjs [archivo.json]
 *
 * Si no se pasa archivo, busca natura-ciclo-*.json en la raíz.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Load .env
dotenv.config({ path: path.join(rootDir, '.env') });

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Faltan variables de entorno: PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ───── Helpers ─────

function findJsonFile(explicit) {
  if (explicit) {
    const abs = path.isAbsolute(explicit) ? explicit : path.join(rootDir, explicit);
    if (!fs.existsSync(abs)) { console.error(`❌ Archivo no encontrado: ${abs}`); process.exit(1); }
    return abs;
  }
  // Auto-detect latest natura-ciclo-*.json
  const files = fs.readdirSync(rootDir)
    .filter(f => /^natura-ciclo-\d+\.json$/i.test(f))
    .sort()
    .reverse();
  if (!files.length) { console.error('❌ No se encontró ningún archivo natura-ciclo-*.json'); process.exit(1); }
  return path.join(rootDir, files[0]);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function upsertProduct(product, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const { data, error } = await supabase.rpc('upsert_product_with_variants', {
      p_code: String(product.code),
      p_name: product.name,
      p_price: product.price || 0,
      p_cost: product.cost || 0,
      p_points: product.points || 0,
      p_category: product.category || null,
      p_brand: product.brand || 'Natura',
      p_image_url: product.image || null,
      p_description: null,
      p_variants: []  // All products in this JSON are SIMPLE (no variants)
    });

    if (!error) return { success: true, data };

    if (attempt < retries) {
      console.warn(`   ⚠️  Retry ${attempt}/${retries} para ${product.code}: ${error.message}`);
      await sleep(500 * attempt);
    } else {
      return { success: false, error: error.message, code: product.code };
    }
  }
}

// ───── Main ─────

async function main() {
  console.log('\n🌿 FLOW NATURA — Subir Productos a Supabase\n');

  const jsonPath = findJsonFile(process.argv[2]);
  console.log(`📄 Archivo: ${path.basename(jsonPath)}`);

  const products = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`📦 Productos a procesar: ${products.length}`);

  // Stats
  const brands = [...new Set(products.map(p => p.brand))];
  const categories = [...new Set(products.map(p => p.category))];
  console.log(`🏷️  Marcas: ${brands.join(', ')}`);
  console.log(`📂 Categorías: ${categories.length}`);
  console.log('');

  const BATCH_SIZE = 50;
  const startTime = Date.now();
  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(products.length / BATCH_SIZE);

    // Process batch concurrently
    const results = await Promise.all(batch.map(p => upsertProduct(p)));

    for (const result of results) {
      if (result.success) {
        successCount++;
      } else {
        errorCount++;
        errors.push(result);
      }
    }

    const pct = ((i + batch.length) / products.length * 100).toFixed(0);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(`   📤 Lote ${batchNum}/${totalBatches} | ${successCount}/${products.length} (${pct}%) | ${elapsed}s | Errores: ${errorCount}     \r`);

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < products.length) await sleep(100);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n');
  console.log('═══════════════════════════════════════════');
  console.log(`🎉 Completado en ${totalTime}s`);
  console.log(`   ✅ Éxito: ${successCount}`);
  console.log(`   ❌ Errores: ${errorCount}`);

  if (errors.length > 0) {
    console.log('\n   Productos con error:');
    for (const e of errors) {
      console.log(`   - ${e.code}: ${e.error}`);
    }
  }

  console.log('═══════════════════════════════════════════\n');
  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
