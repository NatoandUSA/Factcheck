/**
 * Single-Source-Of-Truth CommonJS Bridge for Node.js test scripts.
 * Dynamically loads and binds directly to src/utils/xrayUploadOutcome.js
 * to eliminate code drift between Vite ESM dev mode and Node test runners.
 */

const fs = require('fs');
const path = require('path');

const esmPath = path.join(__dirname, 'xrayUploadOutcome.js');
const esmContent = fs.readFileSync(esmPath, 'utf8');

const cjsCode = esmContent.replace(/^export\s+/gm, '');
const deriveXrayUploadOutcome = new Function(`${cjsCode}\nreturn deriveXrayUploadOutcome;`)();

module.exports = { deriveXrayUploadOutcome };
