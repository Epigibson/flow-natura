import fs from 'fs';
let content = fs.readFileSync('scripts/scrape-nivel.mjs', 'utf8');

const typedef = `
/**
 * @typedef {Object} ConsultantLevel
 * @property {string} [description]
 */

/**
 * @typedef {Object} NextLevelProgress
 * @property {number} [currentValue]
 */

/**
 * @typedef {Object} GrowthData
 * @property {ConsultantLevel} [level]
 * @property {NextLevelProgress} [nextLevelProgress]
 */
`;

content = content.replace(
  "const LOGIN_URL = 'https://minegocio.natura-avon.com.mx/home';",
  typedef + "\nconst LOGIN_URL = 'https://minegocio.natura-avon.com.mx/home';"
);

fs.writeFileSync('scripts/scrape-nivel.mjs', content);
