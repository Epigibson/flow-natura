const fs = require('fs');
const lines = fs.readFileSync('scripts/scrape-nivel.mjs', 'utf8').split('\n');
console.log(lines.slice(50, 90).join('\n'));
