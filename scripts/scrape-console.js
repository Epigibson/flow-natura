// 🌿 NATURA FLOW — Extractor de Tokens v3
//
// En el Showcase (F12 → Console → pega todo el código → Enter)
// Se descarga "natura-tokens.json" con tu Bearer token.
//
// Luego: node scripts/scrape-natura.mjs

(function() {
  const auth = JSON.parse(sessionStorage.getItem('gsp-auth') || '{}');
  const bearer = auth.authorization || '';
  if (!bearer) { 
    console.error('❌ No hay sesión. Inicia sesión primero.');
    console.log('→ Abre: https://natura-auth.prd.naturacloud.com/?company=natura&client_id=3ec6rhfe52b2k78h32kv7ml6ti&redirect_uri=https://gsp.natura.com/showcase/natura&country=MX&language=es');
    return; 
  }
  
  const data = JSON.stringify({ b: bearer }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'natura-tokens.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  
  console.log('✅ Bearer token capturado!');
  console.log('📥 Archivo "natura-tokens.json" descargado');
  console.log('');
  console.log('Ahora en tu terminal:');
  console.log('   copy %USERPROFILE%\\Downloads\\natura-tokens.json C:\\desarrollos\\flow-natura\\');
  console.log('   node scripts/scrape-natura.mjs');
})();
