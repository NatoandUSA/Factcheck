const fs = require('fs');
const path = require('path');

const scannerPath = path.resolve(__dirname, '../src/components/EtsyMultiSellerScanner.jsx');
let source = fs.readFileSync(scannerPath, 'utf8');

function replaceExact(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`PATCH_EXACT_NOT_FOUND:${label}`);
  source = source.replace(before, after);
}

replaceExact(
`import {
  Users, Sparkles, CheckSquare, Square, Zap, ExternalLink,
  RefreshCw, Plus, History, AlertTriangle, ShieldCheck
} from 'lucide-react';`,
`import {
  Users, Sparkles, CheckSquare, Square, Zap, ExternalLink,
  Plus, History, AlertTriangle, ShieldCheck
} from 'lucide-react';`,
  'remove-refresh-icon'
);

replaceExact(
`  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [learning, setLearning] = useState(false);`,
`  const [sellers, setSellers] = useState([]);
  const [learning, setLearning] = useState(false);`,
  'remove-loading-state'
);

const scanStart = source.indexOf('  const scanSellers = async () => {');
const scanEnd = source.indexOf('  const toggleSeller = (id) => {', scanStart);
if (scanStart >= 0 && scanEnd > scanStart) {
  source = source.slice(0, scanStart) + source.slice(scanEnd);
} else if (!source.includes('const toggleSeller = (id) => {')) {
  throw new Error('PATCH_SCAN_FUNCTION_BOUNDARY_NOT_FOUND');
}

replaceExact(
`        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={scanSellers} disabled={loading} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={14} className={loading ? 'spinner' : ''} />
            <span>{loading ? 'Đang kiểm tra...' : 'Kiểm Tra Seller Evidence'}</span>
          </button>
          <button onClick={() => setShowManualAdd(v => !v)} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={14} /> Thêm Seller Đã Kiểm Tra
          </button>
        </div>`,
`        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setShowManualAdd(v => !v)} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={14} /> Thêm Seller Đã Kiểm Tra
          </button>
        </div>`,
  'remove-source-less-scan-button'
);

replaceExact(
`    'Chưa có seller evidence. Chỉ dùng dữ liệu import có nguồn hoặc Staff nhập tay từ listing đã kiểm tra.'`,
`    'Chưa có seller evidence. Live seller connector chưa được chứng minh; hiện dùng Staff manual assertion hoặc raw source qua server API.'`,
  'initial-evidence-message'
);

replaceExact(
`          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Chỉ học từ evidence có nguồn hoặc Staff assertion. UNKNOWN không bị đổi thành 0 và hệ thống không tự tạo “Top Seller”.
          </p>`,
`          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Chỉ học từ evidence có nguồn hoặc Staff assertion. UNKNOWN không bị đổi thành 0. Auto seller scan chưa có nguồn live được chứng minh nên không hiển thị nút giả.
          </p>`,
  'scanner-description'
);

fs.writeFileSync(scannerPath, source, 'utf8');
console.log('P0.5-B scanner usability cleanup applied successfully.');
