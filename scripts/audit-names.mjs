/**
 * 🔍 Auditoría completa de nombres — compara DB vs JSON limpio
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sb = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchAll() {
  const all = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb
      .from('products')
      .select('id, code, name')
      .is('deleted_at', null)
      .range(from, from + PAGE - 1)
      .order('code');
    if (error) throw error;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function main() {
  console.log('\n🔍 Auditoría completa: DB vs JSON limpio\n');

  // Load clean JSON
  const jsonFiles = fs.readdirSync(path.join(__dirname, '..')).filter(f => /^natura-ciclo-\d+\.json$/.test(f)).sort().reverse();
  const jsonPath = path.join(__dirname, '..', jsonFiles[0]);
  const jsonProducts = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const jsonMap = new Map(jsonProducts.map(p => [String(p.code), p]));
  console.log(`📄 JSON limpio: ${jsonPath.split(path.sep).pop()} (${jsonProducts.length} productos)`);

  // Fetch all from DB
  const dbProducts = await fetchAll();
  console.log(`🗄️  Base de datos: ${dbProducts.length} productos activos\n`);

  // Compare
  const badNames = [];
  const notInJson = [];
  let matchCount = 0;
  let alreadyClean = 0;

  for (const dbP of dbProducts) {
    const jsonP = jsonMap.get(String(dbP.code));
    if (!jsonP) {
      // Product in DB but not in current cycle JSON
      // Check if name looks bad
      const name = dbP.name || '';
      if (/^[A-Z]\s+\d+\s+\d+/i.test(name) || name.length > 120 || /\d{2,}g[A-Z]/.test(name) || /ml[A-Z]/.test(name)) {
        notInJson.push({ code: dbP.code, id: dbP.id, dbName: name, problem: 'NO EN JSON + NOMBRE SUCIO' });
      }
      continue;
    }

    matchCount++;
    const dbName = (dbP.name || '').trim();
    const jsonName = (jsonP.name || '').trim();

    if (dbName === jsonName) {
      alreadyClean++;
    } else {
      badNames.push({
        code: dbP.code,
        id: dbP.id,
        dbName,
        jsonName,
      });
    }
  }

  console.log(`✅ Coinciden exacto con JSON: ${alreadyClean}`);
  console.log(`⚠️  Nombre diferente al JSON: ${badNames.length}`);
  console.log(`📍 No están en JSON + nombre sucio: ${notInJson.length}`);
  console.log('');

  if (badNames.length > 0) {
    console.log('═══ NOMBRE DIFERENTE AL JSON (primeros 60) ═══\n');
    for (const b of badNames.slice(0, 60)) {
      console.log(`  [${b.code}]`);
      console.log(`    DB:   "${b.dbName.substring(0, 100)}"`);
      console.log(`    JSON: "${b.jsonName.substring(0, 100)}"`);
      console.log('');
    }
  }

  if (notInJson.length > 0) {
    console.log('═══ NO EN JSON + NOMBRE SUCIO ═══\n');
    for (const n of notInJson.slice(0, 20)) {
      console.log(`  [${n.code}] "${n.dbName.substring(0, 100)}"`);
    }
  }

  console.log(`\n📊 Total que necesitan fix: ${badNames.length + notInJson.length}`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
