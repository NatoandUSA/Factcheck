const fs = require('fs');
const path = require('path');
const vm = require('vm');

const scriptPath = path.resolve(__dirname, 'apply_p0_5_b_server_patch_v2.cjs');
const source = fs.readFileSync(scriptPath, 'utf8');
const workspaceMarker = '\nlet workspace = fs.readFileSync(workspacePath, \'utf8\');';
const splitAt = source.indexOf(workspaceMarker);
if (splitAt < 0) throw new Error('SERVER_PATCH_PREFIX_NOT_FOUND');

const serverOnlySource = `${source.slice(0, splitAt)}\nconsole.log('P0.5-B server route patch applied successfully.');\n`;
vm.runInNewContext(serverOnlySource, {
  require,
  console,
  process,
  __dirname,
  __filename: scriptPath,
  Buffer,
  setTimeout,
  clearTimeout
}, { filename: 'p0-5-b-server-only-generated.cjs' });
