/**
 * 🔍 Natura Flow — Buscador de códigos EAN/Barcode
 * 
 * Busca códigos EAN en bases de datos públicas para productos Natura/Avon
 * y genera un JSON con los resultados para cruzar con el catálogo.
 * 
 * Fuentes:
 *   1. Open Beauty Facts (openbeautyfacts.org) — DB abierta de cosméticos
 *   2. UPCitemdb (upcitemdb.com) — DB de códigos de barras (100 req/día gratis)
 *   3. Bluesoft Cosmos (cosmos.bluesoft.com.br) — DB brasileña (Natura es BR)
 * 
 * Uso: node scripts/fetch-ean-codes.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DELAY_MS = 1200; // respetar rate limits

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════════════
// FUENTE 1: Open Beauty Facts (cosmetics database)
// ═══════════════════════════════════════════════
async function fetchOpenBeautyFacts(brand, pages = 10) {
  console.log(`\n🧴 Buscando en Open Beauty Facts — marca: "${brand}"...\n`);
  const results = [];
  
  for (let page = 1; page <= pages; page++) {
    try {
      const url = `https://world.openbeautyfacts.org/brand/${encodeURIComponent(brand)}.json?page=${page}&page_size=100`;
      const res = await fetch(url, { 
        headers: { 'User-Agent': 'NaturaFlow/1.0 - research script' } 
      });
      
      if (!res.ok) {
        console.log(`   ⚠️  Página ${page}: HTTP ${res.status}`);
        break;
      }
      
      const data = await res.json();
      const products = data.products || [];
      
      if (products.length === 0) {
        console.log(`   📄 Página ${page}: sin más resultados`);
        break;
      }
      
      for (const p of products) {
        if (p.code && p.product_name) {
          results.push({
            ean: p.code,
            name: p.product_name,
            brand: p.brands || brand,
            categories: p.categories || '',
            quantity: p.quantity || '',
            source: 'openbeautyfacts'
          });
        }
      }
      
      process.stdout.write(`   📄 Página ${page}/${data.page_count || '?'}: ${results.length} productos con EAN\r`);
      await sleep(DELAY_MS);
    } catch(e) {
      console.log(`   ❌ Error página ${page}: ${e.message}`);
      break;
    }
  }
  
  console.log(`   ✅ Open Beauty Facts "${brand}": ${results.length} productos encontrados      `);
  return results;
}

// ═══════════════════════════════════════════════
// FUENTE 2: Open Food Facts (some cosmetics too)
// ═══════════════════════════════════════════════
async function fetchOpenFoodFacts(brand, pages = 10) {
  console.log(`\n🍃 Buscando en Open Food Facts — marca: "${brand}"...\n`);
  const results = [];
  
  for (let page = 1; page <= pages; page++) {
    try {
      const url = `https://world.openfoodfacts.org/brand/${encodeURIComponent(brand)}.json?page=${page}&page_size=100`;
      const res = await fetch(url, { 
        headers: { 'User-Agent': 'NaturaFlow/1.0 - research script' } 
      });
      
      if (!res.ok) break;
      const data = await res.json();
      const products = data.products || [];
      
      if (products.length === 0) break;
      
      for (const p of products) {
        if (p.code && p.product_name) {
          results.push({
            ean: p.code,
            name: p.product_name,
            brand: p.brands || brand,
            categories: p.categories || '',
            quantity: p.quantity || '',
            source: 'openfoodfacts'
          });
        }
      }
      
      process.stdout.write(`   📄 Página ${page}: ${results.length} productos con EAN\r`);
      await sleep(DELAY_MS);
    } catch(e) { break; }
  }
  
  console.log(`   ✅ Open Food Facts "${brand}": ${results.length} productos encontrados       `);
  return results;
}

// ═══════════════════════════════════════════════
// FUENTE 3: UPCitemdb (trial search by name)
// 100 req/día gratis — usamos solo para muestras
// ═══════════════════════════════════════════════
async function fetchUPCitemdb(searchTerms) {
  console.log(`\n🏷️  Buscando en UPCitemdb...`);
  const results = [];
  
  for (const term of searchTerms) {
    try {
      const url = `https://api.upcitemdb.com/prod/trial/search?s=${encodeURIComponent(term)}&type=product`;
      const res = await fetch(url, { 
        headers: { 'User-Agent': 'NaturaFlow/1.0' } 
      });
      
      if (!res.ok) {
        if (res.status === 429) {
          console.log(`   ⚠️  Rate limit alcanzado (100/día). Parando UPCitemdb.`);
          break;
        }
        continue;
      }
      
      const data = await res.json();
      
      for (const item of (data.items || [])) {
        if (item.ean && item.title) {
          results.push({
            ean: item.ean,
            name: item.title,
            brand: item.brand || 'Natura',
            categories: item.category || '',
            quantity: '',
            source: 'upcitemdb'
          });
        }
      }
      
      process.stdout.write(`   🔍 "${term}": ${data.items?.length || 0} resultados, total: ${results.length}\r`);
      await sleep(2000); // UPCitemdb es más estricto
    } catch(e) {
      console.log(`   ⚠️  ${term}: ${e.message}`);
    }
  }
  
  console.log(`\n   ✅ UPCitemdb: ${results.length} productos encontrados`);
  return results;
}

// ═══════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════
async function main() {
  console.log('\n🔍 NATURA FLOW — Buscador de códigos EAN/Barcode');
  console.log('═══════════════════════════════════════════════════\n');
  
  const allResults = [];
  
  // ── Fuente 1: Open Beauty Facts ──
  const naturaOBF = await fetchOpenBeautyFacts('natura');
  allResults.push(...naturaOBF);
  
  const avonOBF = await fetchOpenBeautyFacts('avon');
  allResults.push(...avonOBF);

  // Variaciones de marca
  const naturaCosmOBF = await fetchOpenBeautyFacts('natura cosméticos');
  allResults.push(...naturaCosmOBF);

  const naturaBrOBF = await fetchOpenBeautyFacts('natura brasil');
  allResults.push(...naturaBrOBF);

  // ── Fuente 2: Open Food Facts ──
  const naturaOFF = await fetchOpenFoodFacts('natura');
  allResults.push(...naturaOFF);

  // ── Fuente 3: UPCitemdb (limited, sample terms) ──
  const sampleTerms = [
    'natura ekos', 'natura kaiak', 'natura luna',
    'natura homem', 'natura essencial', 'natura tododia',
    'natura humor', 'avon far away', 'avon little black dress',
    'natura mamae bebe', 'natura plant'
  ];
  const upcResults = await fetchUPCitemdb(sampleTerms);
  allResults.push(...upcResults);

  // ── Dedup by EAN ──
  const seenEan = new Map();
  for (const r of allResults) {
    const ean = String(r.ean).trim();
    if (!ean || ean.length < 8) continue; // skip invalid
    if (!seenEan.has(ean)) {
      seenEan.set(ean, r);
    }
  }
  
  const dedupResults = [...seenEan.values()];

  // ── Save ──
  const outputPath = path.join(__dirname, '..', 'natura-ean-database.json');
  fs.writeFileSync(outputPath, JSON.stringify(dedupResults, null, 2), 'utf-8');

  // ── Stats ──
  const sourceCounts = {};
  for (const r of dedupResults) {
    sourceCounts[r.source] = (sourceCounts[r.source] || 0) + 1;
  }
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`🎉 ${dedupResults.length} productos únicos con EAN encontrados`);
  console.log('═══════════════════════════════════════════════════');
  console.log('\n📊 Por fuente:');
  for (const [src, count] of Object.entries(sourceCounts)) {
    console.log(`   ${src}: ${count}`);
  }
  
  // Show first 10 as preview
  console.log('\n📦 Primeros 10 productos:');
  for (const r of dedupResults.slice(0, 10)) {
    console.log(`   EAN: ${r.ean} | ${r.name.slice(0, 50)} | ${r.brand}`);
  }
  
  console.log(`\n💾 Guardado en: ${outputPath}`);
  console.log('═══════════════════════════════════════════════════\n');
  
  // ── Cross-reference with existing catalog ──
  const catalogPath = path.join(__dirname, '..', 'natura-ciclo-202605.json');
  if (fs.existsSync(catalogPath)) {
    console.log('🔗 Cruzando con catálogo existente...\n');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
    
    let matched = 0;
    const matchResults = [];
    
    for (const product of catalog) {
      // Normalize product name for comparison
      const pName = product.name.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '').trim();
      
      // Try to find a matching EAN entry
      let bestMatch = null;
      let bestScore = 0;
      
      for (const eanEntry of dedupResults) {
        const eName = eanEntry.name.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s]/g, '').trim();
        
        // Calculate word overlap score
        const pWords = new Set(pName.split(/\s+/).filter(w => w.length > 2));
        const eWords = new Set(eName.split(/\s+/).filter(w => w.length > 2));
        
        let commonWords = 0;
        for (const w of pWords) {
          if (eWords.has(w)) commonWords++;
        }
        
        const score = pWords.size > 0 ? commonWords / Math.max(pWords.size, eWords.size) : 0;
        
        if (score > bestScore && score >= 0.4) {
          bestScore = score;
          bestMatch = eanEntry;
        }
      }
      
      if (bestMatch) {
        matched++;
        matchResults.push({
          code: product.code,
          name: product.name,
          ean: bestMatch.ean,
          ean_name: bestMatch.name,
          match_score: Math.round(bestScore * 100),
          source: bestMatch.source
        });
      }
    }
    
    console.log(`   📊 Catálogo: ${catalog.length} productos`);
    console.log(`   📊 EAN DB:   ${dedupResults.length} códigos`);
    console.log(`   ✅ Matches:  ${matched} productos cruzados (${Math.round(matched/catalog.length*100)}%)\n`);
    
    if (matchResults.length > 0) {
      // Save matches
      const matchPath = path.join(__dirname, '..', 'natura-ean-matches.json');
      fs.writeFileSync(matchPath, JSON.stringify(matchResults, null, 2), 'utf-8');
      console.log(`   💾 Matches guardados: ${matchPath}`);
      
      // Show top 10 matches
      console.log('\n   Top 10 matches:');
      const top = matchResults.sort((a, b) => b.match_score - a.match_score).slice(0, 10);
      for (const m of top) {
        console.log(`   [${m.match_score}%] ${m.code} "${m.name.slice(0,35)}" → EAN: ${m.ean}`);
      }
    }
  } else {
    console.log('ℹ️  No se encontró natura-ciclo-202605.json para cruzar.');
  }
  
  console.log('\n✅ Proceso completo\n');
  process.exit(0);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
