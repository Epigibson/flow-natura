/**
 * 🔍 Natura Flow — Dump de estructura JSON de productos
 * 
 * Trae 5 productos del Showcase y muestra el JSON completo
 * para analizar todos los campos disponibles.
 * 
 * Uso: node scripts/check-sku-fields.mjs
 */

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROFILE_URL = 'https://gsp-apigw-mfe.prd.naturacloud.com/graphql/frontend/graphql';
const SHOWCASE_URL = 'https://exp-compras-global-apigw.prd.naturacloud.com/showcase/graphql';

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

// ── Introspection: get ALL fields from Card and Product types ──
const Q_INTROSPECT = `{
  card: __type(name: "Card") {
    name
    fields { name type { name kind ofType { name kind } } }
  }
  product: __type(name: "Product") {
    name
    fields { name type { name kind ofType { name kind } } }
  }
}`;

// ── Fetch raw cards with ALL known fields ──
const Q_RAW_CARDS = `
  query cardSection(
    $context: String! $category: String! $cycle: Int!
    $page: Int = 1 $size: Int = 5
  ) {
    cardSection(
      context: $context category: $category cycle: $cycle
      page: $page size: $size
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
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return await res.json();
}

async function main() {
  console.log('\n🔍 NATURA FLOW — Dump de estructura de productos\n');

  let bearerToken;
  const tokenFile = path.join(__dirname, '..', 'natura-tokens.json');

  if (fs.existsSync(tokenFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(tokenFile, 'utf-8'));
      bearerToken = parsed.b;
      if (bearerToken) console.log('   📄 Bearer leído de natura-tokens.json');
    } catch (e) { /* ignore */ }
  }

  if (!bearerToken) {
    bearerToken = await ask('   📋 Pega el Bearer token → ');
    if (!bearerToken) { console.log('❌ Bearer token vacío.'); process.exit(1); }
  }
  if (!bearerToken.startsWith('Bearer ')) bearerToken = 'Bearer ' + bearerToken;

  // ── Auth ──
  console.log('   🔐 Autenticando...');
  const profileHeaders = { 'Content-Type': 'application/json', 'authorization': bearerToken };

  const pd = await gql(PROFILE_URL, profileHeaders, 'authPersonData', Q_AUTH_PERSON, {
    personID: null, channelId: 1, fullTokens: false
  });
  if (pd.errors) throw new Error(pd.errors[0]?.message);
  const personData = pd.data.profileGetPersonData;
  const person = personData.payload;
  const personXat = personData.xAppToken;
  const cycle = parseInt(person.businessRelationships?.[0]?.cycle?.cycleCode || '202605');
  const role = person.roles?.find(r => r.active && r.showcaseAccess) || person.roles?.[0] || {};

  console.log(`   ✅ ${person.firstName} ${person.lastName} | Ciclo ${cycle}`);

  const commHeaders = { ...profileHeaders, 'x-app-token': personXat };
  const ci = await gql(PROFILE_URL, commHeaders, 'authCommercialInfo', Q_COMMERCIAL_INFO, {
    channelId: 1, showcaseAccess: true, businessModelId: role.businessModelId || 1, systemId: 1
  });
  if (ci.errors) throw new Error(ci.errors[0]?.message);
  const commercialXat = ci.data.profileGetCommercialInfo.xAppToken;

  const showcaseHeaders = {
    'Content-Type': 'application/json',
    'authorization': bearerToken,
    'x-app-token': commercialXat,
    'country': person.countryCode,
    'application': 'WEB',
    'http_username': person.personCode || ''
  };

  console.log('   ✅ Auth completa\n');

  // ═══════ PASO 1: Introspección del schema ═══════
  console.log('═══════════════════════════════════════════════');
  console.log('📋 PASO 1: Campos disponibles en el schema GQL');
  console.log('═══════════════════════════════════════════════\n');

  try {
    const intro = await gql(SHOWCASE_URL, showcaseHeaders, null, Q_INTROSPECT, {});
    if (intro.data?.card) {
      const fields = intro.data.card.fields;
      console.log(`   Tipo "Card" — ${fields.length} campos:\n`);
      for (const f of fields) {
        const t = f.type.name || f.type.ofType?.name || f.type.kind;
        const mark = ['sku', 'ean', 'barcode', 'gtin', 'upc', 'ref', 'material', 'sku_id', 'external']
          .some(k => f.name.toLowerCase().includes(k)) ? ' 👈 POSIBLE SKU!' : '';
        console.log(`      ${f.name.padEnd(30)} → ${t}${mark}`);
      }
    }
    if (intro.data?.product) {
      const fields = intro.data.product.fields;
      console.log(`\n   Tipo "Product" — ${fields.length} campos:\n`);
      for (const f of fields) {
        const t = f.type.name || f.type.ofType?.name || f.type.kind;
        const mark = ['sku', 'ean', 'barcode', 'gtin', 'upc', 'ref', 'material', 'external']
          .some(k => f.name.toLowerCase().includes(k)) ? ' 👈 POSIBLE SKU!' : '';
        console.log(`      ${f.name.padEnd(30)} → ${t}${mark}`);
      }
    }
    if (intro.errors) {
      console.log('   ⚠️  Introspección bloqueada (normal en producción)');
      console.log(`   → ${intro.errors[0]?.message || 'Unknown error'}`);
    }
  } catch (e) {
    console.log(`   ⚠️  Introspección falló: ${e.message.slice(0, 100)}`);
  }

  // ═══════ PASO 2: Dump de 5 productos ═══════
  console.log('\n═══════════════════════════════════════════════');
  console.log('📦 PASO 2: JSON crudo de 5 productos');
  console.log('═══════════════════════════════════════════════\n');

  const testVars = { context: 'NATURA', category: 'productos_de_ciclo', cycle, page: 1, size: 5 };

  const raw = await gql(SHOWCASE_URL, showcaseHeaders, 'cardSection', Q_RAW_CARDS, testVars);

  if (raw.errors) {
    console.log('   ⚠️  Errores:', JSON.stringify(raw.errors, null, 2));
  }

  const cards = raw.data?.cardSection?.cards || [];
  console.log(`   Recibidos: ${cards.length} productos\n`);

  // Save raw to file for inspection
  const outputPath = path.join(__dirname, '..', 'natura-raw-sample.json');
  fs.writeFileSync(outputPath, JSON.stringify(cards, null, 2), 'utf-8');
  console.log(`   💾 Guardado en: ${outputPath}\n`);

  // Print each card
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    console.log(`   ── Producto ${i + 1}: ${c.name} ──`);
    console.log(`   ${JSON.stringify(c, null, 4).split('\n').join('\n   ')}`);
    console.log('');
  }

  // Summary of ALL keys found
  console.log('═══════════════════════════════════════════════');
  console.log('🔑 Resumen de claves encontradas');
  console.log('═══════════════════════════════════════════════\n');

  const allKeys = new Set();
  const subKeys = new Set();
  for (const c of cards) {
    Object.keys(c).forEach(k => allKeys.add(k));
    if (c.products) {
      for (const p of c.products) {
        Object.keys(p).forEach(k => subKeys.add(k));
      }
    }
  }
  console.log(`   Card keys:     ${[...allKeys].join(', ')}`);
  console.log(`   Product keys:  ${[...subKeys].join(', ')}`);

  const skuLike = [...allKeys, ...subKeys].filter(k =>
    ['sku', 'ean', 'barcode', 'gtin', 'upc', 'ref'].some(s => k.toLowerCase().includes(s))
  );
  console.log(`\n   Campos tipo SKU/EAN: ${skuLike.length > 0 ? skuLike.join(', ') : '❌ NINGUNO encontrado'}`);

  console.log('\n✅ Análisis completo\n');
  process.exit(0);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
