const fs = require('fs');
const path = require('path');

const workspacePath = path.resolve(__dirname, '../src/components/EtsyWorkspace.jsx');
let source = fs.readFileSync(workspacePath, 'utf8');

function replaceExact(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`PATCH_EXACT_NOT_FOUND:${label}`);
  source = source.replace(before, after);
}

replaceExact(
  "const etsyTrends = (trendsData || []).filter(t => t.marketplace === 'ETSY');",
  "const etsyTrends = (trendsData || []).filter(t => t.marketplace === 'ETSY' && t.keywords_detailed);",
  'workspace-filter-evidence-trends'
);

const oldMcpSuccess = "      setMcpResult(data);\n      if (onShowToast) onShowToast(`✓ Đã bóc tách ${data.keywords.length} Etsy Tags cho \"${data.seed}\"!`);";
const newMcpSuccess = "      if (data.source !== 'ETSY_MCP_LIVE' || data.evidenceState !== 'OBSERVED' || !Array.isArray(data.keywords) || data.keywords.length === 0) {\n        throw new Error('INSUFFICIENT_EVIDENCE: MCP response is not verified live evidence.');\n      }\n      setMcpResult(data);\n      if (onShowToast) onShowToast(`✓ Đã nạp ${data.keywords.length} observed Etsy tags cho \"${data.seed}\" (không padding).`);";
replaceExact(oldMcpSuccess, newMcpSuccess, 'workspace-mcp-evidence-gate');

source = source.replaceAll('⚡ Auto-Pull 13 Tags', '⚡ Auto-Pull Live Tags');
source = source.replaceAll('Bộ 13 Tags Độc Lập Cho', 'Observed Etsy MCP Tags Cho');
source = source.replaceAll('bộ 13 tags chuẩn ngách', 'tag evidence trực tiếp từ MCP');

fs.writeFileSync(workspacePath, source, 'utf8');
console.log('P0.5-B EtsyWorkspace patch applied successfully.');
