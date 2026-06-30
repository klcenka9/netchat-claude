// Post-build: tsc only emits .js, so copy non-TS runtime assets (schema.sql)
// into dist/ so `node dist/index.js` can find them. Cross-platform (Windows too).
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'src', 'db', 'schema.sql');
const destDir = path.join(__dirname, 'dist', 'db');
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, path.join(destDir, 'schema.sql'));
console.log('copied schema.sql -> dist/db/schema.sql');
