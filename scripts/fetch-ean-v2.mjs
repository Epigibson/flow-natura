/**
 * 🔍 Natura Flow — Buscador de códigos EAN v2
 * 
 * Busca en TODAS las fuentes disponibles:
 *   1. Bluesoft Cosmos (cosmos.bluesoft.com.br) — DB brasileña
 *   2. Open Beauty Facts — por múltiples variaciones de marca
 *   3. Open Food Facts — mismo approach
 *   4. Open Products Facts — productos no-alimentarios
 *   5. UPCitemdb — con más términos de búsqueda
 *   6. Barcode Spider — búsqueda por nombre
 * 
 * Uso: node scripts/fetch-ean-v2.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DELAY_MS = 1500;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════ Helper: fetch pages from Open*Facts ═══════════
async function fetchOpenFacts(baseUrl, brand, label, maxPages = 20) {
  console.log(`\n🔍 ${label} — marca: "${brand}"...`);
  const results = [];
  
  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `${baseUrl}/brand/${encodeURIComponent(brand)}.json?page=${page}&page_size=100`;
      const res = await fetch(url, { 
        headers: { 'User-Agent': 'NaturaFlow/1.0 - barcode research' },
        signal: AbortSignal.timeout(10000)
      });
      
      if (!res.ok) break;
      const data = await res.json();
      const products = data.products || [];
      if (products.length === 0) break;
      
      for (const p of products) {
        if (p.code && p.code.length >= 8) {
          results.push({
            ean: String(p.code),
            name: p.product_name || p.product_name_es || p.product_name_pt || p.product_name_en || '',
            brand: p.brands || brand,
            categories: p.categories || '',
            quantity: p.quantity || '',
            source: label.toLowerCase().replace(/\s+/g, '_')
          });
        }
      }
      
      process.stdout.write(`   📄 Pág ${page}/${data.page_count || '?'}: ${results.length} EAN      \r`);
      await sleep(DELAY_MS);
    } catch(e) { 
      if (e.name === 'TimeoutError') console.log(`   ⏱️  Timeout en pág ${page}`);
      break; 
    }
  }
  
  console.log(`   ✅ ${label} "${brand}": ${results.length} EAN      `);
  return results;
}

// ═══════════ Bluesoft Cosmos (scrape search page) ═══════════
async function fetchBluesoftCosmos(searchTerms) {
  console.log('\n🇧🇷 Bluesoft Cosmos — DB brasileña...');
  const results = [];
  
  for (const term of searchTerms) {
    try {
      // Cosmos has a public search page we can fetch
      const url = `https://cosmos.bluesoft.com.br/api/products?query=${encodeURIComponent(term)}`;
      const res = await fetch(url, {
        headers: { 
          'User-Agent': 'NaturaFlow/1.0',
          'Accept': 'application/json',
          'X-Cosmos-Token': '' // Public access, may or may not require token
        },
        signal: AbortSignal.timeout(10000)
      });
      
      if (res.status === 401 || res.status === 403) {
        console.log('   ⚠️  Cosmos API requiere token (intentando scrape HTML)...');
        // Try HTML scrape instead
        await fetchBluesoftHTML(term, results);
        continue;
      }
      
      if (!res.ok) continue;
      
      const data = await res.json();
      const items = Array.isArray(data) ? data : (data.products || []);
      
      for (const item of items) {
        if (item.gtin || item.barcode || item.ean) {
          results.push({
            ean: String(item.gtin || item.barcode || item.ean),
            name: item.description || item.name || '',
            brand: item.brand?.name || 'Natura',
            categories: item.ncm?.description || '',
            quantity: item.net_content || '',
            source: 'bluesoft_cosmos'
          });
        }
      }
      
      process.stdout.write(`   🔍 "${term}": ${items.length} resultados      \r`);
      await sleep(2000);
    } catch(e) {
      if (e.name !== 'TimeoutError') {
        // console.log(`   ⚠️  ${term}: ${e.message.slice(0, 60)}`);
      }
    }
  }
  
  console.log(`   ✅ Bluesoft Cosmos: ${results.length} EAN      `);
  return results;
}

// Fallback: scrape HTML search results from Cosmos
async function fetchBluesoftHTML(term, results) {
  try {
    const url = `https://cosmos.bluesoft.com.br/pesquisa?utf8=%E2%9C%93&q=${encodeURIComponent(term)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return;
    
    const html = await res.text();
    
    // Extract GTINs from the HTML (they appear in product links like /gtins/7899846...)
    const gtinRegex = /\/gtins\/(\d{13,14})/g;
    const nameRegex = /<div class="description"[^>]*>([^<]+)<\/div>/g;
    
    let match;
    const gtins = [];
    while ((match = gtinRegex.exec(html)) !== null) {
      gtins.push(match[1]);
    }
    
    for (const gtin of gtins) {
      if (!results.find(r => r.ean === gtin)) {
        results.push({
          ean: gtin,
          name: `Cosmos product (${term})`,
          brand: 'Natura',
          categories: '',
          quantity: '',
          source: 'bluesoft_cosmos_html'
        });
      }
    }
    
    if (gtins.length > 0) {
      process.stdout.write(`   📄 Cosmos HTML "${term}": +${gtins.length} GTINs      \r`);
    }
    
    await sleep(2000);
  } catch(e) { /* ignore */ }
}

// ═══════════ Bluesoft product detail (get full info for a GTIN) ═══════════
async function fetchBluesoftDetail(gtin) {
  try {
    const url = `https://cosmos.bluesoft.com.br/gtins/${gtin}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    
    const html = await res.text();
    
    // Extract product description from the page
    const descMatch = html.match(/<span class="description">([^<]+)<\/span>/);
    const brandMatch = html.match(/<span class="brand">([^<]+)<\/span>/);
    
    return {
      name: descMatch?.[1] || '',
      brand: brandMatch?.[1] || ''
    };
  } catch(e) { return null; }
}

// ═══════════ UPCitemdb enhanced ═══════════
async function fetchUPCitemdb(searchTerms) {
  console.log('\n🏷️  UPCitemdb (búsqueda ampliada)...');
  const results = [];
  let rateLimited = false;
  
  for (const term of searchTerms) {
    if (rateLimited) break;
    
    try {
      const url = `https://api.upcitemdb.com/prod/trial/search?s=${encodeURIComponent(term)}&type=product`;
      const res = await fetch(url, { 
        headers: { 'User-Agent': 'NaturaFlow/1.0' },
        signal: AbortSignal.timeout(10000)
      });
      
      if (res.status === 429) {
        console.log('   ⚠️  Rate limit (100/día). Parando.');
        rateLimited = true;
        break;
      }
      if (!res.ok) continue;
      
      const data = await res.json();
      
      for (const item of (data.items || [])) {
        if (item.ean) {
          results.push({
            ean: item.ean,
            name: item.title || '',
            brand: item.brand || '',
            categories: item.category || '',
            quantity: '',
            source: 'upcitemdb'
          });
        }
      }
      
      process.stdout.write(`   🔍 "${term}": ${data.items?.length || 0} items      \r`);
      await sleep(2500); // More conservative
    } catch(e) { /* ignore */ }
  }
  
  console.log(`   ✅ UPCitemdb: ${results.length} EAN      `);
  return results;
}

// ═══════════ Barcode Spider (free API) ═══════════
async function fetchBarcodeSpider(searchTerms) {
  console.log('\n🕷️  Barcode Spider...');
  const results = [];
  
  for (const term of searchTerms) {
    try {
      const url = `https://api.barcodespider.com/v1/lookup?upc=${encodeURIComponent(term)}`;
      const res = await fetch(url, {
        headers: { 'token': '' }, // requires free API key
        signal: AbortSignal.timeout(5000)
      });
      
      if (res.status === 401 || res.status === 403) {
        console.log('   ⚠️  Barcode Spider requiere API key (skipping)');
        break;
      }
      if (!res.ok) continue;
      
      const data = await res.json();
      if (data.item_attributes) {
        results.push({
          ean: data.item_attributes.upc || '',
          name: data.item_attributes.title || '',
          brand: data.item_attributes.brand || '',
          categories: data.item_attributes.category || '',
          quantity: '',
          source: 'barcode_spider'
        });
      }
      await sleep(2000);
    } catch(e) { break; }
  }
  
  console.log(`   ✅ Barcode Spider: ${results.length} EAN      `);
  return results;
}

// ═══════════ MAIN ═══════════
async function main() {
  console.log('\n🔍 NATURA FLOW — Buscador EAN v2 (todas las fuentes)');
  console.log('════════════════════════════════════════════════════\n');
  
  const allResults = [];
  
  // Load existing results to avoid re-fetching
  const existingPath = path.join(__dirname, '..', 'natura-ean-database.json');
  if (fs.existsSync(existingPath)) {
    const existing = JSON.parse(fs.readFileSync(existingPath, 'utf-8'));
    allResults.push(...existing);
    console.log(`📂 Cargados ${existing.length} EAN existentes\n`);
  }
  
  // ── Marcas y variaciones para Open*Facts ──
  const brandVariations = [
    'natura', 'natura cosmeticos', 'natura brasil', 'natura ekos',
    'avon', 'natura chronos', 'natura homem', 'natura mamae e bebe',
    'natura plant', 'natura tododia', 'natura faces', 'natura una',
    'natura kaiak', 'natura humor', 'natura essencial',
    'natura lumina', 'natura biografia', 'natura aquarela',
    'avon care', 'avon far away', 'avon little black dress',
    'avon skin so soft', 'avon advance techniques', 'avon anew',
    'avon on duty', 'avon mark', 'avon clearskin', 'avon renew',
    'avon imari', 'avon wild country', 'avon surreal'
  ];

  // ── FUENTE 1: Open Beauty Facts (más variaciones) ──
  for (const brand of brandVariations.slice(0, 15)) { // First 15 = Natura brands
    const r = await fetchOpenFacts('https://world.openbeautyfacts.org', brand, 'OBF');
    allResults.push(...r);
  }

  // ── FUENTE 2: Open Products Facts ──
  for (const brand of ['natura', 'avon', 'natura ekos', 'natura homem']) {
    const r = await fetchOpenFacts('https://world.openproductsfacts.org', brand, 'OPF');
    allResults.push(...r);
  }

  // ── FUENTE 3: Open Food Facts (cosmetics sometimes listed here too) ──
  for (const brand of ['natura', 'avon', 'natura ekos']) {
    const r = await fetchOpenFacts('https://world.openfoodfacts.org', brand, 'OFF');
    allResults.push(...r);
  }

  // ── FUENTE 4: Open Beauty Facts con nombres en portugués/español ──
  for (const brand of brandVariations.slice(15)) { // Avon brands
    const r = await fetchOpenFacts('https://world.openbeautyfacts.org', brand, 'OBF_Avon');
    allResults.push(...r);
  }

  // ── FUENTE 5: Bluesoft Cosmos ──
  const cosmosTerms = [
    'natura ekos', 'natura kaiak', 'natura homem', 'natura luna',
    'natura essencial', 'natura humor', 'natura tododia', 'natura faces',
    'natura chronos', 'natura plant', 'natura mamae bebe', 'natura una',
    'avon far away', 'avon little black dress', 'avon care',
    'avon renew', 'avon advance techniques', 'avon mark', 'avon imari',
    'natura aquarela', 'natura biografia', 'natura lumina',
    'avon clearskin', 'avon anew', 'avon on duty',
    'natura perfume', 'natura desodorante', 'natura shampoo',
    'avon perfume', 'avon desodorante', 'avon shampoo'
  ];
  const cosmosResults = await fetchBluesoftCosmos(cosmosTerms);
  allResults.push(...cosmosResults);

  // ── FUENTE 6: UPCitemdb con más términos ──
  const upcTerms = [
    'natura ekos castanha', 'natura ekos maracuja', 'natura ekos pitanga',
    'natura kaiak masculino', 'natura kaiak feminino', 'natura kaiak urbe',
    'natura essencial masculino', 'natura essencial feminino',
    'natura homem perfume', 'natura humor perfume',
    'natura luna perfume', 'natura chronos creme',
    'natura tododia creme', 'natura faces maquillaje',
    'avon far away perfume', 'avon little black dress',
    'avon wild country', 'avon surreal', 'avon imari',
    'natura plant shampoo', 'natura lumina',
    'avon advance techniques shampoo', 'avon care cream',
    'natura mamae bebe', 'natura aquarela',
    'natura una maquillaje', 'avon renew cream',
    'avon clearskin gel', 'avon anew cream', 'avon on duty deo'
  ];
  const upcResults = await fetchUPCitemdb(upcTerms);
  allResults.push(...upcResults);

  // ── FUENTE 7: Barcode Spider ──
  const spiderResults = await fetchBarcodeSpider(['natura', 'avon']);
  allResults.push(...spiderResults);

  // ── Dedup ──
  const seenEan = new Map();
  for (const r of allResults) {
    const ean = String(r.ean).trim();
    if (!ean || ean.length < 8) continue;
    if (!seenEan.has(ean)) {
      seenEan.set(ean, r);
    } else {
      // Keep the one with better name
      const existing = seenEan.get(ean);
      if (r.name.length > existing.name.length) {
        seenEan.set(ean, r);
      }
    }
  }
  
  const dedupResults = [...seenEan.values()];

  // ── Save EAN DB ──
  const outputPath = path.join(__dirname, '..', 'natura-ean-database-v2.json');
  fs.writeFileSync(outputPath, JSON.stringify(dedupResults, null, 2), 'utf-8');

  // ── Stats ──
  const sourceCounts = {};
  for (const r of dedupResults) {
    sourceCounts[r.source] = (sourceCounts[r.source] || 0) + 1;
  }
  
  console.log('\n════════════════════════════════════════════════════');
  console.log(`🎉 ${dedupResults.length} EAN únicos encontrados`);
  console.log('════════════════════════════════════════════════════');
  console.log('\n📊 Por fuente:');
  for (const [src, count] of Object.entries(sourceCounts).sort((a,b) => b[1] - a[1])) {
    console.log(`   ${src.padEnd(25)}: ${count}`);
  }

  // ── Cross-reference with catalog ──
  const catalogPath = path.join(__dirname, '..', 'natura-ciclo-202605.json');
  if (fs.existsSync(catalogPath)) {
    console.log('\n🔗 Cruzando con catálogo...\n');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
    
    let matched = 0;
    const matchResults = [];
    
    for (const product of catalog) {
      const pName = product.name.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '').trim();
      
      let bestMatch = null;
      let bestScore = 0;
      
      for (const eanEntry of dedupResults) {
        const eName = (eanEntry.name || '').toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s]/g, '').trim();
        
        if (!eName) continue;
        
        const pWords = new Set(pName.split(/\s+/).filter(w => w.length > 2));
        const eWords = new Set(eName.split(/\s+/).filter(w => w.length > 2));
        
        let commonWords = 0;
        for (const w of pWords) {
          if (eWords.has(w)) commonWords++;
        }
        
        // Higher threshold — require more overlap
        const score = pWords.size > 0 ? commonWords / Math.max(pWords.size, eWords.size) : 0;
        
        if (score > bestScore && score >= 0.5) { // Raised from 0.4 to 0.5
          bestScore = score;
          bestMatch = eanEntry;
        }
      }
      
      if (bestMatch) {
        matched++;
        matchResults.push({
          code: product.code,
          catalog_name: product.name,
          ean: bestMatch.ean,
          ean_name: bestMatch.name,
          match_score: Math.round(bestScore * 100),
          source: bestMatch.source
        });
      }
    }
    
    // Sort by score descending
    matchResults.sort((a, b) => b.match_score - a.match_score);
    
    const matchPath = path.join(__dirname, '..', 'natura-ean-matches-v2.json');
    fs.writeFileSync(matchPath, JSON.stringify(matchResults, null, 2), 'utf-8');
    
    const highConf = matchResults.filter(m => m.match_score >= 60).length;
    const medConf = matchResults.filter(m => m.match_score >= 50 && m.match_score < 60).length;
    
    console.log(`   📊 Catálogo:        ${catalog.length} productos`);
    console.log(`   📊 EAN DB v2:       ${dedupResults.length} códigos`);
    console.log(`   ✅ Total matches:   ${matched}`);
    console.log(`   🟢 Alta confianza:  ${highConf} (≥60%)`);
    console.log(`   🟡 Media confianza: ${medConf} (50-59%)`);
    console.log(`\n   💾 ${matchPath}`);
    
    // Show top matches
    console.log('\n   🏆 Top matches:');
    for (const m of matchResults.slice(0, 15)) {
      console.log(`   [${m.match_score}%] ${m.code} "${m.catalog_name.slice(0,35)}" → EAN: ${m.ean}`);
    }
  }

  console.log('\n✅ Búsqueda completa\n');
  process.exit(0);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
