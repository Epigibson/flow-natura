/**
 * 🧹 Tercera pasada — correcciones quirúrgicas
 * Arregla: "300 KM/H" → restaurar nombre, "KIT KIT" → deduplicar, cantidades
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function fix(name) {
  let n = name;
  
  // Fix "KIT KIT " → "KIT "
  n = n.replace(/^KIT\s+KIT\s+/i, 'KIT ');
  
  // Fix truncated " IDAD" (from "Variedad" or similar)
  n = n.replace(/\s+IDAD\s*$/, '');
  n = n.replace(/\s+IDAD\s+/, ' ');
  
  // Fix truncated "SHAMPO" → better to keep as is (it's a known truncation)
  
  // Remove trailing colons
  n = n.replace(/:\s*$/, '');
  
  // Remove trailing "CON DE" (garbled text)
  n = n.replace(/\s+CON\s+DE\s*$/i, '');
  
  // Clean up extra spaces
  n = n.replace(/\s{2,}/g, ' ').trim();
  
  return n;
}

// Products where "300" was wrongly stripped — restore the original
const restore300 = {
  '191420': '300 KM/H BOOST HBW 90 ML',
  '191421': '300 KM/H PULSE HBW 90 ML',
  '191423': '300 KM PULSE DESODORANTE ROLL ON 50 ML',
  '195394': '300 KM/H QUANTUM HBW 90ML',
  '195395': '300 KM/H SURFER HBW 90ML',
  '195396': '300 KM/H MAX TURBO HBW 90ML',
  '195397': '300 KM/H NITROGEN EDT 100ML',
  '195398': '300 KM/H ELECTRIC EDT 100ML',
  '195400': '300 KM/H SURFER EDT 100ML',
  '195401': '300 KM QUANTUM DESODORANTE ROLL ON 50ML',
  '195402': '300 KM/H MAX TURBO DES ROLLON 50ML',
  '201766': '300 KM/H BOOST EDT 100ML',
  '201767': '300 KM/H CLASICA EDT 100ML',
  '201768': '300 KM/H MAX TURBO EDT 100 ML',
  '201770': '300 KM CLASICO DESODORANTE ROLL ON 50ML',
  '248756': '300 KM/H PULSE EDT 100ML',
  '248759': '300 KM/H SURFER EDT 100ML',
  '248760': '300 KM/H ELECTRIC EDT 100ML',
  '248776': '300 KM/H TURBO EDT 100ML',
  '248781': '300 KM/H QUANTUM EDT 100ML',
  '248841': '300 KM/H NITROGEN EDT 100ML',
};

// Products where leading quantity was wrongly stripped — restore
const restoreQty = {
  '192436': '2 CEREALEROS CON VASOS AMARILLO',
  '192749': '2 TAZONES DE VIDRIO COLORS',
  '203211': '2 MOLDES ESTRELLAS NAVIDEÑAS',
  '203234': '4 BOTES GUARDATODO LIMONES',
  '204013': '4 RECIPIENTES RECTANGULARES LIMONES',
  '204060': '5 CONTENEDORES REDONDOS LIMONES',
  '204061': '5 CONTENEDORES CUADRADOS LIMONES',
  '204077': '3 RECIPIENTES CUADRADOS ALTOS LIMONES',
  '209448': '4 RECIPIENTES FOODKEPERS INNOVA',
  '209451': '3 FRIGOTAZONES INNOVA',
  '209523': '2 CONTEDORES CIRCULARES BLUEY',
  '242192': '6 COPAS CITRICOS',
};

async function main() {
  console.log('\n🧹 Tercera pasada — correcciones quirúrgicas\n');

  // Fetch all
  const all = [];
  let from = 0;
  while (true) {
    const { data } = await sb.from('products').select('id, code, name')
      .is('deleted_at', null).range(from, from + 999).order('code');
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  const updates = [];

  for (const p of all) {
    const code = String(p.code);
    let newName = null;

    // Check if it needs 300 KM/H restore
    if (restore300[code]) {
      newName = restore300[code];
    }
    // Check if needs quantity restore
    else if (restoreQty[code]) {
      newName = restoreQty[code];
    }
    // Check if needs KIT KIT fix or other cleanup
    else {
      const fixed = fix(p.name);
      if (fixed !== p.name) {
        newName = fixed;
      }
    }

    if (newName && newName !== p.name) {
      updates.push({ id: p.id, code, oldName: p.name, newName });
    }
  }

  console.log(`📌 Correcciones a aplicar: ${updates.length}\n`);

  for (const u of updates) {
    console.log(`  [${u.code}]`);
    console.log(`    ANTES:   "${u.oldName}"`);
    console.log(`    DESPUÉS: "${u.newName}"`);
    console.log('');
  }

  if (updates.length === 0) {
    console.log('✅ ¡Todo limpio!\n');
    process.exit(0);
  }

  console.log(`\n📤 Aplicando ${updates.length} actualizaciones...\n`);

  let ok = 0, fail = 0;
  for (const u of updates) {
    const { error } = await sb.from('products')
      .update({ name: u.newName, updated_at: new Date().toISOString() })
      .eq('id', u.id);
    if (error) { console.log(`  ❌ [${u.code}]: ${error.message}`); fail++; }
    else ok++;
  }

  console.log(`\n🎉 Listo: ${ok} actualizados, ${fail} errores\n`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
