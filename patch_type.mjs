import fs from 'fs';
let content = fs.readFileSync('scripts/scrape-nivel.mjs', 'utf8');

content = content.replace(
  '  let extractedGrowthData = null;',
  '  /** @type {GrowthData | null} */\n  let extractedGrowthData = null;'
);

fs.writeFileSync('scripts/scrape-nivel.mjs', content);
