/**
 * 🌿 Natura Flow — Scraper de Productos v3
 * 
 * Realiza la cadena completa de autenticación automáticamente.
 * Solo necesita el Bearer token (authorization).
 *
 * Uso:
 *   1. En el Showcase (F12 → Console):
 *      copy(JSON.parse(sessionStorage.getItem('gsp-auth')).authorization)
 *   2. node scripts/scrape-natura.mjs
 *   3. Pega el Bearer token → Enter
 *
 *   O usa natura-tokens.json (descargado por scrape-console.js)
 */

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROFILE_URL = 'https://gsp-apigw-mfe.prd.naturacloud.com/graphql/frontend/graphql';
const SHOWCASE_URL = 'https://exp-compras-global-apigw.prd.naturacloud.com/showcase/graphql';
const CONTEXTS = ['NATURA', 'AVON'];
const PAGE_SIZE = 50;

// ───── Queries ─────
const Q_AUTH_PERSON = `
  query authPersonData($personID: String, $channelId: ID, $fullTokens: Boolean) {
    profileGetPersonData(personID: $personID, channelId: $channelId, fullTokens: $fullTokens) {
      payload { personId personCode countryCode showcaseAccess name firstName lastName
        businessRelationships { businessModelId cycle { cycleCode } }
        roles { businessModelId roleId functionId active showcaseAccess }
      }
      xAppToken
    }
  }
`;

const Q_COMMERCIAL_INFO = `
  fragment CommInfoFrag on Profile_CommercialInfoModel {
    countryCode companyId companyBrands
    orderProfile { currentCycle { cycleCode } kpiCycle { cycleCode } systemId }
    sessionIdentifier personId
  }
  fragment CommInfoPayload on Profile_ComercialInfoPayload { payload { ...CommInfoFrag } xAppToken }
  query authCommercialInfo($businessModelId: Int, $systemId: Int, $showcaseAccess: Boolean, $channelId: Int) {
    profileGetCommercialInfo(businessModelId: $businessModelId, systemId: $systemId, channelId: $channelId, showcaseAccess: $showcaseAccess) {
      ...CommInfoPayload
    }
  }
`;

const Q_CONSULTANT = `
  query consultantSection {
    consultantSection {
      code country
      actualCycle { number label startDate endDate year id status remainingDays }
      showcaseAccess
    }
  }
`;

const Q_SHOWCASE = `
  query getShowcase($context: String!, $cycle: Int!) {
    contextSelectorSection { contexts contextsInfo { context label } }
    categorySection(context: $context, cycle: $cycle) {
      categories { id label target filterData {
        productCategories { name id quantity }
      }}
    }
  }
`;

const Q_CARD_SECTION = `
  query cardSection(
    $context: String! $category: String! $cycle: Int! $code: Int
    $filterOptions: FilterOptions $page: Int = 1 $size: Int = 12
    $sortBy: String = "default" $lastProduct: Integer
  ) {
    cardSection(
      context: $context category: $category cycle: $cycle code: $code
      filterOptions: $filterOptions page: $page size: $size
      sortBy: $sortBy lastProduct: $lastProduct
    ) {
      cards {
        image name description brand discountTag categories code points
        promotionType type percentageDiscount
        products { code name image quantity brand discountTag points
          purchasePrice { from to } resalePrice { from to } stockStatus }
        purchasePrice { from to } resalePrice { from to }
      }
      totalItens totalPages
    }
  }
`;

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(q, a => { rl.close(); res(a.trim()); }));
}

async function gql(url, headers, operationName, query, variables) {
  const res = await fetch(url, {
    method: 'POST', headers,
    body: JSON.stringify({ operationName, query, variables })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  if (json?.errors) {
    const e = json.errors[0];
    throw new Error(e?.extensions?.errorMessage || e?.message || JSON.stringify(e).slice(0, 200));
  }
  return json.data;
}

// ───── Main ─────
async function main() {
  console.log('\n🌿 NATURA FLOW — Scraper de Productos v3\n');

  // ── Get Bearer token ──
  let bearerToken;
  const tokenFile = path.join(__dirname, '..', 'natura-tokens.json');

  if (fs.existsSync(tokenFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(tokenFile, 'utf-8'));
      bearerToken = parsed.b;
      if (bearerToken) console.log('   📄 Bearer leído de natura-tokens.json');
    } catch(e) { /* ignore */ }
  }

  if (!bearerToken) {
    console.log('   Obtén tu Bearer token:');
    console.log('   → En el Showcase (F12 → Console):');
    console.log('     copy(JSON.parse(sessionStorage.getItem("gsp-auth")).authorization)\n');
    bearerToken = await ask('   📋 Pega el Bearer token → ');
    if (!bearerToken) { console.log('❌ Bearer token vacío.'); process.exit(1); }
  }

  if (!bearerToken.startsWith('Bearer ')) bearerToken = 'Bearer ' + bearerToken;

  // ── Step 1: authPersonData ──
  console.log('\n   🔐 Paso 1/4: Autenticando persona...');
  const profileHeaders = { 'Content-Type': 'application/json', 'authorization': bearerToken };
  
  let personData;
  try {
    const pd = await gql(PROFILE_URL, profileHeaders, 'authPersonData', Q_AUTH_PERSON, {
      personID: null, channelId: 1, fullTokens: false
    });
    personData = pd.profileGetPersonData;
  } catch(e) {
    console.log(`   ❌ Auth falló: ${e.message}`);
    console.log('   ℹ️  El Bearer token puede haber expirado. Copia uno nuevo del Showcase.');
    process.exit(1);
  }

  const person = personData.payload;
  const personXat = personData.xAppToken;
  const country = person.countryCode;
  const cycle = parseInt(person.businessRelationships?.[0]?.cycle?.cycleCode || '202605');
  const role = person.roles?.find(r => r.active && r.showcaseAccess) || person.roles?.[0] || {};
  
  console.log(`   ✅ ${person.firstName} ${person.lastName} | ${country} | Ciclo ${cycle}`);

  if (country !== 'MX') {
    console.log(`   ⚠️  País detectado: ${country}. Se necesita sesión de MX.`);
    console.log('   → Abre esta URL para forzar MX:');
    console.log('     https://natura-auth.prd.naturacloud.com/?company=natura&client_id=3ec6rhfe52b2k78h32kv7ml6ti&redirect_uri=https://gsp.natura.com/showcase/natura&country=MX&language=es');
    process.exit(1);
  }

  // ── Step 2: authCommercialInfo → get Showcase x-app-token ──
  console.log('   🔐 Paso 2/4: Obteniendo token comercial...');
  const commHeaders = { ...profileHeaders, 'x-app-token': personXat };
  
  let commercialXat;
  try {
    const ci = await gql(PROFILE_URL, commHeaders, 'authCommercialInfo', Q_COMMERCIAL_INFO, {
      channelId: 1, showcaseAccess: true,
      businessModelId: role.businessModelId || 1,
      systemId: 1
    });
    commercialXat = ci.profileGetCommercialInfo.xAppToken;
    const commPayload = ci.profileGetCommercialInfo.payload;
    console.log(`   ✅ Token comercial obtenido | Sesión: ${commPayload.sessionIdentifier}`);
  } catch(e) {
    console.log(`   ❌ CommercialInfo falló: ${e.message}`);
    process.exit(1);
  }

  // ── Step 3: consultantSection (validates showcase access) ──
  console.log('   🔐 Paso 3/4: Validando acceso al Showcase...');
  const showcaseHeaders = {
    'Content-Type': 'application/json',
    'authorization': bearerToken,
    'x-app-token': commercialXat,
    'country': country,
    'application': 'WEB',
    'http_username': person.personCode || ''
  };

  try {
    const cs = await gql(SHOWCASE_URL, showcaseHeaders, 'consultantSection', Q_CONSULTANT, {});
    const consultant = cs.consultantSection;
    console.log(`   ✅ Showcase OK | Ciclo: ${consultant.actualCycle.label} | ${consultant.actualCycle.remainingDays} días restantes`);
  } catch(e) {
    console.log(`   ⚠️  consultantSection: ${e.message}`);
    console.log('   ℹ️  Continuando de todos modos...');
  }

  // ── Step 4: getShowcase → categories ──
  console.log('   🔐 Paso 4/4: Cargando catálogo...\n');

  const allProducts = [];
  const seenCodes = new Set();
  const startTime = Date.now();

  for (const context of CONTEXTS) {
    console.log(`\n🏷️  ${context}`);

    let tabCategories = [];
    try {
      const sc = await gql(SHOWCASE_URL, showcaseHeaders, 'getShowcase', Q_SHOWCASE, { context, cycle });
      tabCategories = sc.categorySection?.categories?.filter(c => c.target === 'TAB_CARDS') || [];
      console.log(`   📂 Tabs: ${tabCategories.map(c => `${c.label} (${c.id})`).join(', ')}`);
    } catch(e) {
      console.log(`   ⚠️  getShowcase: ${e.message}`);
      tabCategories = [{ id: 'productos_de_ciclo', label: 'Productos de ciclo', filterData: null }];
    }

    for (const tab of tabCategories) {
      console.log(`\n   📦 ${tab.label}`);

      const subCats = tab.filterData?.productCategories?.filter(c => c.quantity > 0) || [];

      if (subCats.length > 0) {
        // Query by each sub-category for full coverage
        for (const subCat of subCats) {
          let pg = 1, lastProduct = null, catCount = 0, lastCodes = '', noNew = 0;

          while (pg <= 500 && noNew < 3) {
            try {
              const variables = {
                context, cycle, category: tab.id,
                page: pg, size: PAGE_SIZE,
                filterOptions: { productCategories: [subCat.id] },
                ...(lastProduct != null ? { lastProduct } : {})
              };

              const data = await gql(SHOWCASE_URL, showcaseHeaders, 'cardSection', Q_CARD_SECTION, variables);
              const section = data.cardSection;
              if (!section?.cards?.length) break;

              const codes = section.cards.map(c => c.code).join(',');
              if (codes === lastCodes) { noNew++; pg++; continue; }
              lastCodes = codes; noNew = 0;

              const lastCard = section.cards[section.cards.length - 1];
              lastProduct = parseInt(lastCard.code) || null;

              let pageNew = 0;
              for (const card of section.cards) {
                const code = String(card.code);
                if (!seenCodes.has(code)) {
                  seenCodes.add(code);
                  const costFrom = card.purchasePrice?.from || 0;
                  const costTo = card.purchasePrice?.to;
                  const priceFrom = card.resalePrice?.from || 0;
                  const priceTo = card.resalePrice?.to;

                  allProducts.push({
                    code, name: card.name || '',
                    brand: card.brand || (context === 'AVON' ? 'Avon' : 'Natura'),
                    cost: costTo || costFrom,
                    costOriginal: costTo ? costFrom : null,
                    price: priceTo || priceFrom,
                    priceOriginal: priceTo ? priceFrom : null,
                    discount: card.discountTag?.[0] || null,
                    points: card.points || 0,
                    category: subCat.name,
                    type: card.type || 'SIMPLE',
                    image: card.image || ''
                  });
                  catCount++; pageNew++;
                }
              }

              if (pageNew === 0) noNew++;
              process.stdout.write(`      ${subCat.name}: pág ${pg}/${section.totalPages || '?'} → ${allProducts.length} total          \r`);
              pg++;
            } catch (err) {
              if (pg === 1) console.log(`      ⚠️  ${subCat.name}: ${err.message}`);
              break;
            }
          }
          if (catCount > 0) console.log(`      ✅ ${subCat.name}: +${catCount}                                    `);
        }
      }

      // Also query without filter for extras
      let pg = 1, lastProduct = null, catCount = 0, lastCodes = '', noNew = 0;
      while (pg <= 500 && noNew < 3) {
        try {
          const variables = {
            context, cycle, category: tab.id,
            page: pg, size: PAGE_SIZE,
            filterOptions: {},
            ...(lastProduct != null ? { lastProduct } : {})
          };
          const data = await gql(SHOWCASE_URL, showcaseHeaders, 'cardSection', Q_CARD_SECTION, variables);
          const section = data.cardSection;
          if (!section?.cards?.length) break;

          const codes = section.cards.map(c => c.code).join(',');
          if (codes === lastCodes) { noNew++; pg++; continue; }
          lastCodes = codes; noNew = 0;

          const lastCard = section.cards[section.cards.length - 1];
          lastProduct = parseInt(lastCard.code) || null;

          let pageNew = 0;
          for (const card of section.cards) {
            const code = String(card.code);
            if (!seenCodes.has(code)) {
              seenCodes.add(code);
              const costFrom = card.purchasePrice?.from || 0;
              const costTo = card.purchasePrice?.to;
              const priceFrom = card.resalePrice?.from || 0;
              const priceTo = card.resalePrice?.to;
              allProducts.push({
                code, name: card.name || '',
                brand: card.brand || (context === 'AVON' ? 'Avon' : 'Natura'),
                cost: costTo || costFrom, costOriginal: costTo ? costFrom : null,
                price: priceTo || priceFrom, priceOriginal: priceTo ? priceFrom : null,
                discount: card.discountTag?.[0] || null,
                points: card.points || 0,
                category: tab.label, type: card.type || 'SIMPLE', image: card.image || ''
              });
              catCount++; pageNew++;
            }
          }
          if (pageNew === 0) noNew++;
          process.stdout.write(`      ${tab.label} (sin filtro): pág ${pg}/${section.totalPages || '?'} → ${allProducts.length}          \r`);
          pg++;
        } catch (err) { break; }
      }
      if (catCount > 0) console.log(`      ✅ ${tab.label} (extras): +${catCount}                              `);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

  if (!allProducts.length) { console.log('\n❌ 0 productos.\n'); process.exit(1); }

  // Save
  const outputPath = path.join(__dirname, '..', `natura-ciclo-${cycle}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(allProducts, null, 2), 'utf-8');

  const brands = [...new Set(allProducts.map(p => p.brand))];
  const cats = [...new Set(allProducts.map(p => p.category))];
  const withDiscount = allProducts.filter(p => p.discount).length;

  console.log('\n═══════════════════════════════════════════');
  console.log(`🎉 ${allProducts.length} productos extraídos en ${elapsed}s`);
  console.log(`🏷️  Marcas: ${brands.join(', ')}`);
  console.log(`📂 Categorías (${cats.length}): ${cats.join(', ')}`);
  console.log(`🏷️  Con descuento: ${withDiscount}`);
  console.log(`💾 ${outputPath}`);
  console.log('═══════════════════════════════════════════');
  console.log('\n✨ Sube el JSON en /inventario/importar\n');
  process.exit(0);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
