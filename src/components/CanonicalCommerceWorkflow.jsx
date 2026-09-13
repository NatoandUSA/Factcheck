import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const CORE_FACT_FIELDS = [
  ['productName', 'Tên sản phẩm', true], ['productType', 'Loại sản phẩm', true],
  ['category', 'Danh mục'], ['materials', 'Chất liệu'], ['gemstones', 'Đá / hạt / thành phần'],
  ['colors', 'Màu sắc'], ['sizes', 'Kích thước'],
  ['personalization', 'Cá nhân hóa'], ['process', 'Cách sản xuất / cá nhân hóa'],
  ['includedItems', 'Vật phẩm đi kèm'], ['packaging', 'Đóng gói'], ['care', 'Bảo quản'],
  ['recipient', 'Người nhận'], ['occasion', 'Dịp'], ['audience', 'Đối tượng'],
];
const DIGITAL_FACT_FIELDS = [
  ['digital', 'Sản phẩm số'], ['digitalDetails', 'Chi tiết sản phẩm số'],
  ['fileFormat', 'Định dạng file'], ['license', 'Giấy phép'], ['usageRights', 'Quyền sử dụng'],
  ['playerCount', 'Số người chơi'], ['minimumAge', 'Tuổi tối thiểu'], ['duration', 'Thời lượng'],
  ['language', 'Ngôn ngữ sản phẩm']
];
const FACT_FIELDS = [...CORE_FACT_FIELDS, ...DIGITAL_FACT_FIELDS];
const AMAZON_SURFACE_LIMITS = Object.freeze({ title: 75, itemHighlights: 125, backendBytes: 249 });
const POLICY_CHOICES = Object.freeze([
  ['CUSTOM_NECKLACE', 'Custom Jewelry / Necklace'], ['CUSTOM_EMBROIDERY', 'Custom Embroidery'],
  ['CUSTOM_ACRYLIC', 'Custom Acrylic'], ['CUSTOM_BLANKET', 'Custom Blanket'],
  ['CUSTOM_SWEATSHIRT', 'Custom Sweatshirt'], ['CUSTOM_SHIRT', 'Custom Shirt'],
  ['CUSTOM_HOODIE', 'Custom Hoodie'], ['CUSTOM_MUG', 'Custom Mug']
]);

const emptyFacts = Object.fromEntries(FACT_FIELDS.map(([key]) => [key, '']));
const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`;

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || `HTTP_${response.status}`);
    error.code = payload.error;
    error.payload = payload;
    throw error;
  }
  return payload;
}

const jsonOptions = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const text = value => value == null ? '' : String(value);
const head = (state, name) => state?.heads?.[name] ?? null;
const safeErrorDetails = error => ({
  code: error?.code || error?.payload?.error || null,
  message: error?.message || null,
  details: error?.payload?.details || null,
  blocking: Array.isArray(error?.payload?.blocking) ? error.payload.blocking.slice(0, 20) : []
});
const resultSummary = result => !result || typeof result !== 'object' ? null : Object.fromEntries(Object.entries({
  id: result.id, researchImportId: result.researchImportId, researchSnapshotId: result.researchSnapshotId,
  intelligenceSnapshotId: result.intelligenceSnapshotId, listingId: result.listingId,
  revisionNumber: result.revisionNumber, artifactHash: result.artifactHash,
  previewHash: result.previewHash, accounting: result.accounting
}).filter(([, value]) => value !== undefined));

function Step({ number, title, children, accent, done }) {
  return <section style={{ border: `1px solid ${done ? '#86efac' : '#cbd5e1'}`, borderRadius: 12, padding: 16, background: done ? '#f0fdf4' : '#fff' }}>
    <h3 style={{ margin: '0 0 12px', fontSize: '1rem', color: done ? '#166534' : '#0f172a' }}>
      {done ? '✓' : number}. {title}
    </h3>
    {children}
  </section>;
}

function ActionButton({ children, onClick, disabled, accent = '#0369a1', type = 'button' }) {
  return <button type={type} onClick={onClick} disabled={disabled} style={{
    border: 0, borderRadius: 8, padding: '9px 14px', fontWeight: 800,
    color: '#fff', background: disabled ? '#94a3b8' : accent,
    cursor: disabled ? 'not-allowed' : 'pointer'
  }}>{children}</button>;
}

function Metric({ label, value }) {
  return <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px' }}>
    <div style={{ fontSize: '.68rem', color: '#64748b', fontWeight: 800 }}>{label}</div>
    <div style={{ fontSize: '.9rem', fontWeight: 800, overflowWrap: 'anywhere' }}>{value ?? '—'}</div>
  </div>;
}

const characterCount = value => Array.from(String(value || '')).length;
const utf8ByteCount = value => new TextEncoder().encode(String(value || '')).length;
function CapacityLabel({ label, used, limit, unit = 'ký tự', authority = '' }) {
  const utilization = Number.isFinite(limit) && limit > 0 ? Math.round((used / limit) * 100) : null;
  return <b>{label} ({used}/{Number.isFinite(limit) ? limit : 'PTD'} {unit}{utilization == null ? '' : ` · ${utilization}%`}){authority ? ` — ${authority}` : ''}</b>;
}

const fileIdentity = file => `${file.name}\u0000${file.size}\u0000${file.lastModified || 0}`;
const mergeSelectedFiles = (current, selected) => {
  const merged = new Map((current || []).map(file => [fileIdentity(file), file]));
  for (const file of Array.from(selected || [])) merged.set(fileIdentity(file), file);
  return [...merged.values()];
};

function SelectedFileQueue({ files, label, onRemove, onClear }) {
  if (!files.length) return null;
  return <div style={{ marginTop: 8, padding: 8, border: '1px solid #cbd5e1', borderRadius: 8, background: '#f8fafc' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
      <b style={{ fontSize: '.75rem' }}>{label}: {files.length} file</b>
      <button type="button" onClick={onClear}>Bỏ chọn tất cả</button>
    </div>
    <div style={{ display: 'grid', gap: 4, marginTop: 5 }}>
      {files.map(file => <div key={fileIdentity(file)} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '.72rem' }}>
        <span style={{ overflowWrap: 'anywhere' }}>{file.name} · {file.size} bytes</span>
        <button type="button" aria-label={`Bỏ file ${file.name}`} onClick={() => onRemove(file)}>Bỏ</button>
      </div>)}
    </div>
  </div>;
}

export default function CanonicalCommerceWorkflow({ activeProject, marketplace, onSelectListing, onShowToast }) {
  const { user } = useAuth();
  const accent = marketplace === 'AMAZON' ? '#0369a1' : '#c2410c';
  const projectId = activeProject?.id;
  const [state, setState] = useState(null);
  const [workflowState, setWorkflowState] = useState(null);
  const [truthRevisions, setTruthRevisions] = useState([]);
  const [facts, setFacts] = useState(emptyFacts);
  const [truthNotes, setTruthNotes] = useState('');
  const [truthBasis, setTruthBasis] = useState('OTHER');
  const [truthBasisNote, setTruthBasisNote] = useState('Nhân viên nhập từ supplier hoặc hồ sơ listing nội bộ');
  const [listingSource, setListingSource] = useState('');
  const [listingHtmlFile, setListingHtmlFile] = useState(null);
  const [sameSourceConfirmed, setSameSourceConfirmed] = useState(false);
  const [listingFactPreview, setListingFactPreview] = useState(null);
  const [files, setFiles] = useState([]);
  const [filePreviews, setFilePreviews] = useState([]);
  const [amazonXrayFiles, setAmazonXrayFiles] = useState([]);
  const [amazonXrayPreviews, setAmazonXrayPreviews] = useState([]);
  const [amazonCerebroFiles, setAmazonCerebroFiles] = useState([]);
  const [amazonCerebroPreviews, setAmazonCerebroPreviews] = useState([]);
  const [selectedImports, setSelectedImports] = useState([]);
  const [asinPlanPreview, setAsinPlanPreview] = useState(null);
  const [selectedAsinText, setSelectedAsinText] = useState('');
  const [masterPreview, setMasterPreview] = useState(null);
  const [keywordDecisions, setKeywordDecisions] = useState({});
  const [keywordQuery, setKeywordQuery] = useState('');
  const [etsyWinnerPreview, setEtsyWinnerPreview] = useState(null);
  const [selectedEtsyWinners, setSelectedEtsyWinners] = useState([]);
  const [etsyPatternPreview, setEtsyPatternPreview] = useState(null);
  const [language, setLanguage] = useState('AUTO');
  const [intelligencePreview, setIntelligencePreview] = useState(null);
  const [draft, setDraft] = useState(null);
  const [listingQueue, setListingQueue] = useState([]);
  const [reviewReason, setReviewReason] = useState('');
  const [reviewPackages, setReviewPackages] = useState({});
  const [submissionInputs, setSubmissionInputs] = useState({});
  const [exactExports, setExactExports] = useState({});
  const [policyContext, setPolicyContext] = useState(null);
  const [policyClassification, setPolicyClassification] = useState('CUSTOM_NECKLACE');
  const [policyLocale, setPolicyLocale] = useState('en-US');
  const [executionLog, setExecutionLog] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [claimBlockers, setClaimBlockers] = useState([]);

  const currentTruth = truthRevisions.find(item => Number(item.id) === Number(head(state, 'productTruthRevisionId'))) || truthRevisions[0];
  const isManager = ['OWNER', 'MANAGER'].includes(user?.role);
  const isOwner = user?.role === 'OWNER';
  const isSeller = user?.role === 'SELLER';
  const imports = state?.imports || [];
  const latestIntelligence = state?.intelligenceSnapshots?.[0];

  const appendExecutionLog = entry => setExecutionLog(previous => {
    const workflowHeads = Object.fromEntries(Object.entries(workflowState?.heads || {}).map(([name, value]) =>
      [name, { id: value.id, revisionNumber: value.revisionNumber, artifactHash: value.artifactHash }]));
    const next = [...previous, { timestamp: new Date().toISOString(), marketplace, projectId,
      workspaceId: user?.workspaceId || null, ...entry, commerceHeads: state?.heads || {}, workflowHeads }].slice(-250);
    try { sessionStorage.setItem(`omni-execution-log:${marketplace}:${projectId}`, JSON.stringify(next)); } catch (_) {}
    return next;
  });

  const notify = (message, type = 'success') => onShowToast?.(message, type);
  const reportError = errorValue => {
    const blocking = Array.isArray(errorValue?.payload?.blocking) ? errorValue.payload.blocking : [];
    setClaimBlockers(errorValue?.code === 'UNVERIFIED_OUTPUT_CLAIM' ? blocking : []);
    const claimSummary = [...new Set(blocking.map(item => `${item.field}: “${item.token}”`))].slice(0, 6).join('; ');
    const message = errorValue?.code === 'UNVERIFIED_OUTPUT_CLAIM' && claimSummary
      ? `Draft có claim chưa được Product Truth chứng thực — ${claimSummary}`
      : errorValue?.code === 'CEREBRO_KEYWORDS_REQUIRED'
        ? 'Cần import Cerebro để phân bổ keyword và tạo draft. Xray là bước upstream khuyến nghị để chọn các nhóm ASIN, nhưng Cerebro có sẵn được import độc lập.'
        : errorValue?.message || 'UNKNOWN_ERROR';
    setError(message);
    notify(`Không thể hoàn tất: ${message}`, 'error');
  };

  const refresh = async () => {
    if (!projectId) return;
    const [commerce, truth, listings, workflow] = await Promise.all([
      api(`/api/projects/${projectId}/commerce-state`),
      api(`/api/projects/${projectId}/product-truth/revisions`),
      api(`/api/projects/${projectId}/listings`),
      api(`/api/projects/${projectId}/marketplace-workflow`)
    ]);
    setState(commerce);
    setWorkflowState(workflow);
    setTruthRevisions(truth.revisions || []);
    setListingQueue(listings.listings || []);
    const refreshedImports = Array.isArray(commerce.imports) ? commerce.imports : [];
    setSelectedImports(previous => previous.length ? previous.filter(id => refreshedImports.some(item => item.id === id)) : refreshedImports.map(item => item.id));
    const revision = (truth.revisions || []).find(item => Number(item.id) === Number(commerce.heads?.productTruthRevisionId)) || truth.revisions?.[0];
    if (revision?.snapshot) {
      const hydrated = { ...emptyFacts };
      for (const [key, entry] of Object.entries(revision.snapshot.asserted || {})) hydrated[key] = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value);
      setFacts(hydrated);
      setTruthNotes(revision.snapshot.notes || '');
      const productWords = `${hydrated.productType} ${hydrated.productName} ${hydrated.category}`.toLowerCase();
      const suggested = productWords.includes('embroider') ? 'CUSTOM_EMBROIDERY'
        : productWords.includes('acrylic') ? 'CUSTOM_ACRYLIC'
          : productWords.includes('blanket') ? 'CUSTOM_BLANKET'
            : productWords.includes('hoodie') ? 'CUSTOM_HOODIE'
              : productWords.includes('shirt') ? 'CUSTOM_SHIRT'
                : productWords.includes('mug') ? 'CUSTOM_MUG' : 'CUSTOM_NECKLACE';
      setPolicyClassification(suggested);
    } else {
      setFacts(emptyFacts);
      setTruthNotes('');
    }
  };

  useEffect(() => {
    setFiles([]); setFilePreviews([]); setAmazonXrayFiles([]); setAmazonXrayPreviews([]);
    setAmazonCerebroFiles([]); setAmazonCerebroPreviews([]); setIntelligencePreview(null); setDraft(null); setError('');
    setAsinPlanPreview(null); setSelectedAsinText(''); setMasterPreview(null); setKeywordDecisions({}); setKeywordQuery('');
    setEtsyWinnerPreview(null); setSelectedEtsyWinners([]); setEtsyPatternPreview(null);
    setSubmissionInputs({}); setExactExports({});
    setListingSource(''); setListingHtmlFile(null); setSameSourceConfirmed(false); setListingFactPreview(null);
    setPolicyContext(activeProject ? {
      locale: activeProject.locale, media_class: activeProject.media_class,
      product_type_id: activeProject.product_type_id, category_id: activeProject.category_id,
      product_family_version: activeProject.product_family_version
    } : null);
    setPolicyLocale(activeProject?.locale || (/\b(para|hija|regalo|collar)\b/i.test(activeProject?.seed_phrase || '') ? 'es-US' : 'en-US'));
    try { setExecutionLog(JSON.parse(sessionStorage.getItem(`omni-execution-log:${marketplace}:${projectId}`) || '[]')); }
    catch (_) { setExecutionLog([]); }
    if (projectId) refresh().catch(reportError); else { setState(null); setWorkflowState(null); setTruthRevisions([]); setListingQueue([]); }
  }, [projectId, marketplace]);

  const run = async (label, operation) => {
    setBusy(label); setError('');
    appendExecutionLog({ action: label, status: 'STARTED' });
    try {
      const result = await operation();
      appendExecutionLog({ action: label, status: 'SUCCESS', result: resultSummary(result) });
      return result;
    } catch (caught) {
      appendExecutionLog({ action: label, status: 'FAILED', error: safeErrorDetails(caught) });
      reportError(caught); return null;
    } finally { setBusy(''); }
  };

  const chooseFiles = (selected, lane = 'ETSY_SEARCH') => {
    const chosen = Array.from(selected || []);
    if (lane === 'AMAZON_XRAY') { setAmazonXrayFiles(previous => mergeSelectedFiles(previous, chosen)); setAmazonXrayPreviews([]); }
    else if (lane === 'AMAZON_CEREBRO') { setAmazonCerebroFiles(previous => mergeSelectedFiles(previous, chosen)); setAmazonCerebroPreviews([]); }
    else { setFiles(previous => mergeSelectedFiles(previous, chosen)); setFilePreviews([]); }
    appendExecutionLog({ action: 'choose-files', status: 'SELECTED', researchKind: lane,
      files: chosen.map(file => ({ name: file.name, size: file.size, type: file.type })) });
  };

  const removeSelectedFile = (file, lane) => {
    const remove = previous => previous.filter(item => fileIdentity(item) !== fileIdentity(file));
    if (lane === 'AMAZON_XRAY') { setAmazonXrayFiles(remove); setAmazonXrayPreviews([]); }
    else if (lane === 'AMAZON_CEREBRO') { setAmazonCerebroFiles(remove); setAmazonCerebroPreviews([]); }
    else { setFiles(remove); setFilePreviews([]); }
  };

  const clearSelectedFiles = lane => {
    if (lane === 'AMAZON_XRAY') { setAmazonXrayFiles([]); setAmazonXrayPreviews([]); }
    else if (lane === 'AMAZON_CEREBRO') { setAmazonCerebroFiles([]); setAmazonCerebroPreviews([]); }
    else { setFiles([]); setFilePreviews([]); }
  };

  const upload = async (confirm, lane = 'ETSY_SEARCH') => {
    const laneFiles = lane === 'AMAZON_XRAY' ? amazonXrayFiles : lane === 'AMAZON_CEREBRO' ? amazonCerebroFiles : files;
    const lanePreviews = lane === 'AMAZON_XRAY' ? amazonXrayPreviews : lane === 'AMAZON_CEREBRO' ? amazonCerebroPreviews : filePreviews;
    const setLanePreviews = lane === 'AMAZON_XRAY' ? setAmazonXrayPreviews : lane === 'AMAZON_CEREBRO' ? setAmazonCerebroPreviews : setFilePreviews;
    return run(`${confirm ? 'import' : 'preview'}-${lane.toLowerCase()}`, async () => {
    if (!laneFiles.length) throw new Error('Hãy chọn ít nhất một file trước.');
    const eligible = confirm ? lanePreviews.filter(item => item.result?.zeroWrite && !item.error) : laneFiles.map(file => ({ file }));
    if (confirm && !eligible.length) throw new Error('Không có file preview hợp lệ để xác nhận.');
    const results = [];
    const committedIds = [];
    for (const entry of eligible) {
      const selectedFile = entry.file;
      const form = new FormData(); form.append('kind', lane);
      if (confirm) form.append('idempotencyKey', uuid());
      form.append('researchFile', selectedFile);
      try {
        const result = await api(`/api/projects/${projectId}/research-imports${confirm ? '' : '/preview'}`,
          { method: 'POST', body: form });
        results.push({ file: selectedFile, result });
        if (confirm) committedIds.push(result.researchImportId);
      } catch (caught) {
        results.push({ file: selectedFile, error: caught.message || 'FILE_PROCESSING_FAILED', code: caught.code });
      }
    }
    setLanePreviews(results);
    for (const entry of results) appendExecutionLog({ action: confirm ? 'research-file-import' : 'research-file-preview',
      status: entry.error ? 'FAILED' : 'SUCCESS', file: { name: entry.file.name, size: entry.file.size },
      ...(entry.error ? { error: { code: entry.code || null, message: entry.error } }
        : { result: { rawHash: entry.result.rawHash, researchImportId: entry.result.researchImportId,
          accounting: entry.result.accounting } }) });
    if (confirm) {
      await refresh();
      setSelectedImports(previous => [...new Set([...previous, ...committedIds])]);
      notify(`Đã lưu ${committedIds.length}/${eligible.length} file hợp lệ; mỗi file có raw hash và accounting riêng.`,
        committedIds.length === eligible.length ? 'success' : 'error');
    } else {
      const valid = results.filter(item => item.result?.zeroWrite).length;
      notify(`Preview zero-write: ${valid}/${laneFiles.length} file hợp lệ.`, valid === laneFiles.length ? 'success' : 'error');
    }
    return results;
  });
  };

  const createResearchSnapshot = () => run('snapshot', async () => {
    if (!selectedImports.length) throw new Error('Chọn ít nhất một file nguồn.');
    const result = await api(`/api/projects/${projectId}/research-snapshots`, jsonOptions({
      expectedHeadResearchSnapshotId: head(state, 'researchSnapshotId'), importIds: selectedImports,
      idempotencyKey: uuid(), changeReason: 'STAFF_SELECTED_RESEARCH_INPUTS'
    }));
    notify(`Đã khóa Research Snapshot #${result.researchSnapshotId}.`); await refresh();
  });

  const xrayImportIds = () => selectedImports.filter(id => imports.find(item => item.id === id)?.kind === 'AMAZON_XRAY');
  const previewAsinPlan = () => run('asin-plan-preview', async () => {
    const ids = xrayImportIds();
    if (!ids.length) throw new Error('Chọn ít nhất một file Xray đã lưu.');
    const result = await api(`/api/projects/${projectId}/amazon/asin-plan/preview`, jsonOptions({ xrayImportIds: ids }));
    setAsinPlanPreview(result);
    const suggested = result.payload?.cohorts?.[0]?.asins || [];
    setSelectedAsinText(suggested.join(', '));
    notify(`Đã tạo ${result.payload?.cohorts?.length || 0} nhóm ASIN gợi ý; staff có thể sửa tự do.`);
  });

  const saveAsinPlan = () => run('asin-plan-save', async () => {
    const ids = xrayImportIds();
    const selectedAsins = [...new Set(selectedAsinText.split(/[\s,;]+/).map(value => value.trim().toUpperCase()).filter(Boolean))];
    if (!ids.length || !selectedAsins.length) throw new Error('Cần file Xray và ít nhất một ASIN đã chọn.');
    const current = workflowState?.heads?.AMAZON_ASIN_BATCH_PLAN;
    const result = await api(`/api/projects/${projectId}/amazon/asin-plan`, jsonOptions({
      xrayImportIds: ids, selectedAsins, expectedHeadArtifactId: current?.id || null,
      idempotencyKey: uuid(), changeReason: 'STAFF_EDITED_ASIN_RUN_SET'
    }));
    notify(`Đã lưu kế hoạch ASIN #${result.id}; đây là convenience artifact, không khóa Cerebro.`); await refresh();
  });

  const previewMasterKeywords = () => run('master-preview', async () => {
    const researchSnapshotId = head(state, 'researchSnapshotId');
    if (!researchSnapshotId) throw new Error('Hãy khóa Research Snapshot có Cerebro trước.');
    const decisions = Object.entries(keywordDecisions).map(([phrase, value]) => ({ phrase, ...value }));
    const result = await api(`/api/projects/${projectId}/amazon/master-keywords/preview`, jsonOptions({
      researchSnapshotId, decisions,
      ...(workflowState?.heads?.AMAZON_ASIN_BATCH_PLAN ? { asinPlanArtifactId: workflowState.heads.AMAZON_ASIN_BATCH_PLAN.id } : {})
    }));
    setMasterPreview(result); notify(`Master KW preview: ${result.accounting?.masterKeywordCount || 0} keyword, không drop.`);
  });

  const setKeywordTier = (phrase, tier) => {
    setKeywordDecisions(previous => ({ ...previous, [phrase]: { ...(previous[phrase] || {}), tier } }));
    setMasterPreview(previous => previous ? { ...previous, payload: { ...previous.payload,
      keywords: previous.payload.keywords.map(item => item.phrase === phrase ? { ...item, tier,
        disposition: tier === 'EXCLUDED' ? 'STAFF_EXCLUDED' : 'AVAILABLE_FOR_TRUTH_GATED_ALLOCATION' } : item) } } : previous);
  };

  const saveMasterKeywords = () => run('master-save', async () => {
    const researchSnapshotId = head(state, 'researchSnapshotId');
    if (!researchSnapshotId || !masterPreview) throw new Error('Hãy preview Master KW trước.');
    const current = workflowState?.heads?.AMAZON_MASTER_KEYWORDS;
    const decisions = Object.entries(keywordDecisions).map(([phrase, value]) => ({ phrase, ...value }));
    const result = await api(`/api/projects/${projectId}/amazon/master-keywords`, jsonOptions({
      researchSnapshotId, decisions, expectedHeadArtifactId: current?.id || null,
      ...(workflowState?.heads?.AMAZON_ASIN_BATCH_PLAN ? { asinPlanArtifactId: workflowState.heads.AMAZON_ASIN_BATCH_PLAN.id } : {}),
      idempotencyKey: uuid(), changeReason: 'STAFF_FREEZE_AMAZON_MASTER_KEYWORDS'
    }));
    notify(`Đã lưu Master KW v${result.revisionNumber} — artifact ${result.artifactHash.slice(0, 12)}…`);
    setMasterPreview(null); setKeywordDecisions({}); await refresh();
  });

  const previewEtsyWinners = () => run('etsy-winners-preview', async () => {
    const researchSnapshotId = head(state, 'researchSnapshotId');
    if (!researchSnapshotId) throw new Error('Hãy khóa Research Snapshot từ các file Etsy trước.');
    const result = await api(`/api/projects/${projectId}/etsy/winners/preview`, jsonOptions({ researchSnapshotId,
      ...(selectedEtsyWinners.length ? { selectedEntityIds: selectedEtsyWinners } : {}) }));
    setEtsyWinnerPreview(result); setSelectedEtsyWinners(result.payload?.selectedEntityIds || []);
    notify(`Đã chuẩn hóa ${result.accounting?.sourceObservationCount} observation thành ${result.accounting?.normalizedEntityCount} listing; chọn ${result.accounting?.selectedWinnerCount} winner.`);
    return result;
  });

  const saveEtsyWinners = () => run('etsy-winners-save', async () => {
    if (!etsyWinnerPreview || !selectedEtsyWinners.length) throw new Error('Hãy preview và chọn winner trước.');
    const current = workflowState?.heads?.ETSY_WINNER_SET;
    const result = await api(`/api/projects/${projectId}/etsy/winners`, jsonOptions({
      researchSnapshotId: head(state, 'researchSnapshotId'), selectedEntityIds: selectedEtsyWinners,
      expectedHeadArtifactId: current?.id || null, idempotencyKey: uuid(), changeReason: 'STAFF_EDITED_ETSY_WINNERS'
    }));
    notify(`Đã lưu Winner Set v${result.revisionNumber} với ${result.accounting?.selectedWinnerCount} listing.`);
    setEtsyWinnerPreview(null); setEtsyPatternPreview(null); await refresh(); return result;
  });

  const toggleEtsyWinner = entityId => setSelectedEtsyWinners(previous => previous.includes(entityId)
    ? previous.filter(id => id !== entityId) : previous.length >= 60 ? previous : [...previous, entityId]);

  const previewEtsyPatterns = () => run('etsy-pattern-preview', async () => {
    const winnerArtifactId = workflowState?.heads?.ETSY_WINNER_SET?.id;
    if (!winnerArtifactId) throw new Error('Hãy lưu Winner Set trước.');
    const result = await api(`/api/projects/${projectId}/etsy/patterns/preview`, jsonOptions({ winnerArtifactId }));
    setEtsyPatternPreview(result);
    notify(`Pattern Miner đã đọc ${result.accounting?.selectedWinnerCount} winner và tìm ${result.accounting?.repeatedPhraseCount} phrase lặp.`);
    return result;
  });

  const saveEtsyPatterns = () => run('etsy-pattern-save', async () => {
    if (!etsyPatternPreview) throw new Error('Hãy preview Pattern Miner trước.');
    const winnerArtifactId = workflowState?.heads?.ETSY_WINNER_SET?.id;
    const current = workflowState?.heads?.ETSY_PATTERN_SNAPSHOT;
    const result = await api(`/api/projects/${projectId}/etsy/patterns`, jsonOptions({ winnerArtifactId,
      expectedHeadArtifactId: current?.id || null, idempotencyKey: uuid(), changeReason: 'FREEZE_ETSY_PATTERN_SNAPSHOT' }));
    notify(`Đã lưu Pattern Snapshot v${result.revisionNumber}.`);
    setEtsyPatternPreview(null); setMasterPreview(null); await refresh(); return result;
  });

  const supplementEtsyPatterns = () => run('etsy-ytrends-supplement', async () => {
    const pattern = workflowState?.heads?.ETSY_PATTERN_SNAPSHOT;
    if (!pattern) throw new Error('Hãy lưu Pattern Snapshot trước.');
    const result = await api(`/api/projects/${projectId}/etsy/patterns/ytrends`, jsonOptions({
      patternArtifactId: pattern.id, idempotencyKey: uuid(), changeReason: 'ADD_OPTIONAL_YTRENDS_SUPPLEMENT'
    }));
    notify(`Đã thêm ${result.accounting?.ytrendsSupplementPhraseCount} phrase YTrends E3. File live/HeyEtsy vẫn là nguồn chính.`);
    setMasterPreview(null); await refresh(); return result;
  });

  const previewEtsyMasterKeywords = () => run('etsy-master-preview', async () => {
    const patternArtifactId = workflowState?.heads?.ETSY_PATTERN_SNAPSHOT?.id;
    if (!patternArtifactId) throw new Error('Hãy lưu Pattern Snapshot trước.');
    const decisions = Object.entries(keywordDecisions).map(([phrase, value]) => ({ phrase, ...value }));
    const result = await api(`/api/projects/${projectId}/etsy/master-keywords/preview`, jsonOptions({ patternArtifactId, decisions }));
    setMasterPreview(result);
    notify(`Etsy Master KW preview: ${result.accounting?.masterKeywordCount} phrase, không drop.`); return result;
  });

  const saveEtsyMasterKeywords = () => run('etsy-master-save', async () => {
    if (!masterPreview) throw new Error('Hãy preview Etsy Master KW trước.');
    const patternArtifactId = workflowState?.heads?.ETSY_PATTERN_SNAPSHOT?.id;
    const current = workflowState?.heads?.ETSY_MASTER_KEYWORDS;
    const decisions = Object.entries(keywordDecisions).map(([phrase, value]) => ({ phrase, ...value }));
    const result = await api(`/api/projects/${projectId}/etsy/master-keywords`, jsonOptions({ patternArtifactId, decisions,
      expectedHeadArtifactId: current?.id || null, idempotencyKey: uuid(), changeReason: 'FREEZE_ETSY_MASTER_KEYWORDS' }));
    notify(`Đã lưu Etsy Master KW v${result.revisionNumber} — ${result.accounting?.masterKeywordCount} phrase.`);
    setMasterPreview(null); setKeywordDecisions({}); await refresh(); return result;
  });

  const previewReferenceListing = htmlFile => run('listing-preview', async () => {
    if (!sameSourceConfirmed) throw new Error('Hãy xác nhận listing cùng supplier/cùng nguồn hàng.');
    if (!htmlFile && !listingSource.trim()) throw new Error('Nhập ASIN, Etsy listing ID, URL hoặc chọn file HTML.');
    const form = new FormData();
    form.append('confirmSameSource', 'true');
    if (listingSource.trim()) form.append('source', listingSource.trim());
    if (htmlFile) form.append('file', htmlFile);
    let result;
    try {
      result = await api(`/api/projects/${projectId}/product-truth-listing/preview`, { method: 'POST', body: form });
    } catch (caught) {
      if (['LISTING_FETCH_FAILED_USE_HTML', 'LISTING_CONTENT_NOT_EXTRACTED'].includes(caught.code)) {
        throw new Error('Amazon/Etsy chặn quét link. Hãy Save Page as HTML rồi upload ngay tại đây.');
      }
      throw caught;
    }
    setFacts(previous => {
      const merged = { ...previous };
      for (const [key, fact] of Object.entries(result.facts || {})) {
        if (key in merged && fact?.disposition === 'ASSERTED') merged[key] = text(fact.value);
      }
      return merged;
    });
    setTruthBasis('REFERENCE_LISTING_SAME_SOURCE');
    setTruthBasisNote(`Listing cùng nguồn: ${result.sourceReference || listingSource.trim() || htmlFile?.name}`);
    setListingFactPreview(result);
    notify(`Đã điền ${result.accounting?.extractedFactCount || 0} trường từ listing; hãy sửa khác biệt của biến thể trước khi lưu.`);
  });

  const saveTruth = () => run('truth', async () => {
    const entries = Object.entries(facts).filter(([, value]) => text(value).trim());
    if (!entries.length) throw new Error('Product Truth cần ít nhất một dữ kiện.');
    const truthFacts = Object.fromEntries(FACT_FIELDS.map(([key]) => {
      const value = text(facts[key]).trim();
      return [key, value ? { disposition: 'ASSERTED', value, basis: truthBasis,
        basisNote: truthBasisNote.trim() || 'Seller đã nhập và kiểm tra trong workflow canonical' }
        : { disposition: 'UNKNOWN', reason: 'Not provided at this Product Truth revision' }];
    }));
    const result = await api(`/api/projects/${projectId}/product-truth/revisions`, jsonOptions({
      expectedHeadRevisionId: head(state, 'productTruthRevisionId'), idempotencyKey: uuid(),
      changeReason: 'STAFF_PRODUCT_TRUTH_UPDATE', facts: truthFacts, notes: truthNotes
    }));
    notify(`Đã lưu Product Truth v${result.revisionNumber}; chưa tự coi là Manager duyệt.`); await refresh();
  });

  const confirmTruth = () => run('confirm-truth', async () => {
    if (!currentTruth) throw new Error('Chưa có Product Truth để xác nhận.');
    await api(`/api/projects/${projectId}/product-truth/revisions/${currentTruth.id}/confirm`, jsonOptions({
      idempotencyKey: uuid(), reason: 'MANAGER_REVIEWED_PRODUCT_TRUTH'
    }));
    notify(`Manager đã xác nhận Product Truth #${currentTruth.id}.`); await refresh();
  });

  const analyze = confirm => run(confirm ? 'intelligence' : 'preview-intelligence', async () => {
    const researchSnapshotId = head(state, 'researchSnapshotId');
    const productTruthRevisionId = head(state, 'productTruthRevisionId');
    if (!researchSnapshotId || !productTruthRevisionId) throw new Error('Cần Research Snapshot và Product Truth trước.');
    const masterKeywordArtifactId = workflowState?.heads?.[marketplace === 'AMAZON' ? 'AMAZON_MASTER_KEYWORDS' : 'ETSY_MASTER_KEYWORDS']?.id;
    if (!masterKeywordArtifactId) {
      throw new Error('Hãy lưu Master Keyword List trước khi phân bổ keyword vào listing.');
    }
    const body = { researchSnapshotId, productTruthRevisionId, listingLanguage: language,
      ...(masterKeywordArtifactId ? { masterKeywordArtifactId } : {}) };
    if (confirm) Object.assign(body, { expectedHeadIntelligenceSnapshotId: head(state, 'intelligenceSnapshotId'), idempotencyKey: uuid(), changeReason: 'STAFF_COMMERCE_ANALYSIS' });
    const result = await api(`/api/projects/${projectId}/intelligence-snapshots${confirm ? '' : '/preview'}`, jsonOptions(body));
    setClaimBlockers([]);
    setIntelligencePreview(result);
    if (confirm) { notify(`Đã lưu Intelligence Snapshot #${result.intelligenceSnapshotId}.`); await refresh(); }
  });

  const previewDraft = () => run('draft-preview', async () => {
    const intelligenceSnapshotId = head(state, 'intelligenceSnapshotId');
    if (!intelligenceSnapshotId) throw new Error('Hãy lưu Intelligence Snapshot trước.');
    const result = await api(`/api/projects/${projectId}/listings/commerce-preview`, jsonOptions({ intelligenceSnapshotId }));
    setDraft(result); notify('Đã tạo draft zero-write; hãy đọc và sửa trước khi lưu.');
  });

  const savePolicyContext = () => run('policy-context', async () => {
    const result = await api(`/api/projects/${projectId}/policy-context`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classificationKey: policyClassification, locale: policyLocale })
    });
    setPolicyContext(result.policyContext);
    notify('Đã liên kết phân loại/policy cho project cũ; giữ nguyên toàn bộ Product Truth và research.');
  });

  const updateDraft = (key, value) => setDraft(previous => ({ ...previous, content: { ...previous.content, [key]: value } }));
  const updateEtsyTags = value => setDraft(previous => {
    const etsyTags = value.split('\n').map(item => item.trim()).filter(Boolean).slice(0, 13);
    const generated = new Map((previous.content.etsyTagExplanations || []).map(item => [String(item.value || '').toLowerCase(), item]));
    const etsyTagExplanations = etsyTags.map(tag => generated.get(tag.toLowerCase()) || {
      value: tag, intent: 'STAFF_EDIT', semanticCluster: null, sources: [{ sourceType: 'STAFF_MANUAL_EDIT' }],
      reason: 'STAFF_MANUAL_EDIT_REQUIRES_MANAGER_QA'
    });
    const missingCount = Math.max(0, 13 - etsyTags.length);
    return { ...previous, content: { ...previous.content, etsyTags, etsyTagExplanations,
      etsyTagStatus: missingCount ? { code: 'TAG_SHORTAGE', missingCount } : { code: 'COMPLETE', missingCount: 0 } } };
  });
  const saveDraft = () => run('save-draft', async () => {
    if (!draft?.content) throw new Error('Chưa có draft để lưu.');
    const result = await api(`/api/projects/${projectId}/listings`, jsonOptions({
      idempotencyKey: uuid(), changeReason: 'STAFF_REVIEWED_COMMERCE_DRAFT',
      productTruthRevisionId: draft.productTruthRevisionId,
      intelligenceSnapshotId: draft.intelligenceSnapshotId, content: draft.content
    }));
    notify(`Đã lưu listing #${result.listingId} ở trạng thái ${result.status}; chưa submit lên sàn.`);
    onSelectListing?.({ id: result.listingId, project_id: projectId, status: result.status, ...result.content });
    await refresh();
  });

  const reviewListing = (listingId, decision) => run('review-listing', async () => {
    if (!reviewReason.trim()) throw new Error('Manager cần ghi lý do review.');
    const reviewPackage = reviewPackages[listingId];
    if (!reviewPackage) throw new Error('Manager phải mở exact review package trước.');
    const result = await api(`/api/listings/${listingId}/canonical-review`, jsonOptions({
      decision, reason: reviewReason.trim(), expectedListingRevisionId: reviewPackage.listingRevisionId,
      expectedContentHash: reviewPackage.contentHash, expectedDependencyHash: reviewPackage.dependencyHash,
      idempotencyKey: uuid()
    }));
    notify(decision === 'APPROVED' ? `Đã duyệt listing #${listingId}.` : `Đã yêu cầu sửa listing #${listingId}.`);
    setReviewReason(''); await refresh(); return result;
  });

  const loadReviewPackage = listingId => run('review-package', async () => {
    const result = await api(`/api/listings/${listingId}/review-package`);
    setReviewPackages(previous => ({ ...previous, [listingId]: result }));
    notify(`Đã tải exact review package của listing #${listingId}.`); return result;
  });

  const submissionInput = listingId => submissionInputs[listingId] || {};
  const setSubmissionInput = (listingId, key, value) => setSubmissionInputs(previous => ({ ...previous,
    [listingId]: { ...(previous[listingId] || {}), [key]: value } }));

  const requestSubmission = item => run('request-submission-authorization', async () => {
    const notes = String(submissionInput(item.id).requestNotes || '').trim();
    if (!notes) throw new Error('Seller cần ghi chú phạm vi submission trước khi gửi Owner.');
    const result = await api(`/api/listings/${item.id}/submission-requests`, jsonOptions({ notes, idempotencyKey: uuid() }));
    notify(`Đã gửi yêu cầu cho exact package ${result.packageHash}.`); await refresh(); return result;
  });

  const authorizeSubmission = item => run('authorize-exact-submission-package', async () => {
    const notes = String(submissionInput(item.id).authorizationNotes || '').trim();
    if (!notes) throw new Error('Owner cần ghi lý do authorization.');
    const result = await api(`/api/listings/${item.id}/submission-authorizations`, jsonOptions({
      submissionRequestId: Number(item.submissionRequestId), notes, idempotencyKey: uuid()
    }));
    notify(`Owner đã authorize exact package ${result.packageHash}; chưa đăng sàn.`); await refresh(); return result;
  });

  const exportExactPackage = item => run('export-exact-submission-package', async () => {
    const result = await api(`/api/listings/${item.id}/submission-exports`, jsonOptions({
      submissionAuthorizationId: Number(item.submissionAuthorizationId), idempotencyKey: uuid()
    }));
    setExactExports(previous => ({ ...previous, [item.id]: result }));
    const blob = new Blob([result.exportJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `omniseller-${marketplace.toLowerCase()}-listing-${item.id}-${result.exportHash.slice(0, 12)}.json`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    notify(`Đã tải exact export ${result.exportHash}; hãy submit thủ công ngoài OmniSeller.`); await refresh(); return result;
  });

  const reportOperatorSubmission = item => run('report-manual-submission', async () => {
    const input = submissionInput(item.id); const notes = String(input.operatorNotes || '').trim();
    const externalReference = String(input.externalReference || '').trim();
    if (!input.manualSubmissionConfirmed) throw new Error('Seller/operator phải xác nhận đã submit thủ công ngoài OmniSeller.');
    if (!externalReference || !notes) throw new Error('Cần external reference và ghi chú thao tác thủ công.');
    const result = await api(`/api/listings/${item.id}/operator-submission-reports`, jsonOptions({
      submissionAuthorizationId: Number(item.submissionAuthorizationId),
      submissionExportId: Number(item.submissionExportId || exactExports[item.id]?.submissionExportId),
      manualSubmissionConfirmed: true, externalReference, notes, idempotencyKey: uuid()
    }));
    notify('Đã ghi OPERATOR_REPORTED_SUBMITTED; đây không phải xác nhận marketplace accept/live.'); await refresh(); return result;
  });

  const copyExecutionLog = async () => {
    const packet = { schemaVersion: 1, generatedAt: new Date().toISOString(), marketplace, projectId,
      projectName: activeProject?.name || null, entries: executionLog };
    await navigator.clipboard.writeText(JSON.stringify(packet, null, 2));
    notify(`Đã copy ${executionLog.length} dòng nhật ký; không bao gồm cookie hoặc nội dung file.`);
  };

  const clearExecutionLog = () => {
    setExecutionLog([]);
    try { sessionStorage.removeItem(`omni-execution-log:${marketplace}:${projectId}`); } catch (_) {}
    notify('Đã xóa nhật ký thực thi của project trong tab này.');
  };

  const previewOutput = intelligencePreview?.output;
  const listing = draft?.content;
  const prompts = listing?.imagePrompts?.prompts || listing?.imagePrompts || [];
  const requiredKinds = marketplace === 'AMAZON' ? ['AMAZON_CEREBRO'] : ['ETSY_SEARCH'];
  const importedKinds = new Set(imports.map(item => item.kind));
  const importCoverageReady = requiredKinds.every(required => importedKinds.has(required));
  const researchReady = Boolean(head(state, 'researchSnapshotId'));
  const masterKeywordHead = workflowState?.heads?.[marketplace === 'AMAZON' ? 'AMAZON_MASTER_KEYWORDS' : 'ETSY_MASTER_KEYWORDS'];
  const displayedMaster = masterPreview || masterKeywordHead;
  const displayedEtsyPattern = etsyPatternPreview || workflowState?.heads?.ETSY_PATTERN_SNAPSHOT;
  const visibleMasterKeywords = (displayedMaster?.payload?.keywords || []).filter(item => !keywordQuery.trim()
    || item.phrase.toLowerCase().includes(keywordQuery.trim().toLowerCase())).slice(0, 200);
  const truthReady = Boolean(head(state, 'productTruthRevisionId'));
  const intelligenceReady = Boolean(head(state, 'intelligenceSnapshotId'));
  const policyReady = ['locale', 'media_class', 'product_type_id', 'category_id', 'product_family_version']
    .every(field => String(policyContext?.[field] || '').trim());
  const latestListing = listingQueue[0];
  const nextAction = !policyReady
    ? 'Bước 0B: xác nhận loại sản phẩm và ngôn ngữ cho project cũ'
    : !importCoverageReady
    ? `Bước 1A: chọn và preview ${marketplace === 'AMAZON' ? 'Xray hoặc Cerebro đang có' : 'CSV/HTML Etsy'}`
    : !researchReady
      ? 'Bước 1C: chọn nguồn đã import và khóa Research Snapshot'
      : marketplace === 'AMAZON' && !masterKeywordHead
        ? (masterPreview ? 'Bước 1E: kiểm tra/chỉnh tier rồi lưu Master Keyword List' : 'Bước 1D: tạo Master Keyword List từ Cerebro')
      : marketplace === 'ETSY' && !workflowState?.heads?.ETSY_WINNER_SET
        ? (etsyWinnerPreview ? 'Bước 1D: kiểm tra/chọn winner rồi lưu Winner Set' : 'Bước 1D: tạo các view winner từ dữ liệu Etsy')
      : marketplace === 'ETSY' && !workflowState?.heads?.ETSY_PATTERN_SNAPSHOT
        ? (etsyPatternPreview ? 'Bước 1E: xem pattern rồi lưu snapshot' : 'Bước 1E: chạy Pattern Miner trên Winner Set')
      : marketplace === 'ETSY' && !masterKeywordHead
        ? (masterPreview ? 'Bước 1F: kiểm tra/chỉnh tier rồi lưu Etsy Master KW' : 'Bước 1F: tạo Etsy Master KW từ pattern')
      : !truthReady
        ? 'Bước 2: nhập tối thiểu tên/loại sản phẩm rồi lưu Product Truth'
      : !intelligenceReady
          ? (intelligencePreview?.zeroWrite ? 'Bước 3B: khóa Intelligence Snapshot' : 'Bước 3A: chạy preview phân bổ keyword')
          : latestListing?.status === 'OPERATOR_REPORTED_SUBMITTED'
            ? 'Đã ghi nhận operator submit thủ công; theo dõi marketplace live ở phase sau'
          : latestListing?.status === 'MANAGER_APPROVED' && latestListing.submissionExportId
            ? (isSeller ? 'Bước 5D: submit thủ công ngoài OmniSeller rồi ghi OPERATOR_REPORTED_SUBMITTED' : 'Chờ Seller/operator submit thủ công exact export')
          : latestListing?.status === 'MANAGER_APPROVED' && latestListing.submissionAuthorizationId
            ? (isSeller ? 'Bước 5C: tải exact export' : 'Chờ Seller tải exact export')
          : latestListing?.status === 'MANAGER_APPROVED' && latestListing.submissionRequestId
            ? (isOwner ? 'Bước 5B: Owner authorize exact package' : 'Chờ Owner authorize exact package')
          : latestListing?.status === 'MANAGER_APPROVED'
            ? (isSeller ? 'Bước 5A: Seller yêu cầu authorization' : 'Chờ Seller yêu cầu authorization')
          : latestListing?.status === 'NEEDS_QA'
            ? (isManager ? 'Bước 5: mở exact review package và Manager QA' : 'Chờ Manager QA exact package')
          : !draft?.content
            ? 'Bước 4A: tạo draft zero-write'
            : 'Bước 4B: đọc/sửa draft rồi lưu ở NEEDS_QA';

  const previewGrid = (entries, testId) => entries.length > 0 && <div data-testid={testId} style={{ display: 'grid', gap: 8, marginTop: 10 }}>
    {entries.map((entry, index) => entry.error
      ? <div key={`${entry.file.name}-${index}`} role="alert" style={{ border: '1px solid #fca5a5', background: '#fef2f2', color: '#991b1b', borderRadius: 8, padding: 9 }}>
          <b>{entry.file.name}</b> — {entry.code ? `${entry.code}: ` : ''}{entry.error}
        </div>
      : <div key={`${entry.file.name}-${entry.result.rawHash || 'committed'}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
          <Metric label="FILE" value={entry.result.fileName} /><Metric label="RAW SHA-256" value={entry.result.rawHash} />
          <Metric label="ROWS" value={entry.result.accounting?.sourceRowCount ?? entry.result.accounting?.inputRowCount ?? entry.result.accounting?.inputRows} />
          <Metric label="UNCONSUMED" value={entry.result.accounting?.unconsumedRowCount ?? 0} />
        </div>)}
  </div>;

  if (!activeProject) return null;

  return <div data-testid={`canonical-commerce-${marketplace.toLowerCase()}`} style={{ border: `2px solid ${accent}`, borderRadius: 16, padding: 18, background: '#f8fafc', display: 'grid', gap: 14 }}>
    <div>
      <h2 style={{ margin: 0, color: accent }}>Luồng Staff Canonical — {marketplace} US</h2>
      <p style={{ margin: '6px 0 0', color: '#475569' }}>Research/Master KW và Product Truth chạy song song → safe compose → QA → exact export. OmniSeller không tự đăng và chỉ ghi nhận thao tác submit thủ công.</p>
      <div data-testid="canonical-next-action" style={{ marginTop: 10, padding: '10px 12px', borderRadius: 9, background: '#ecfeff', border: '1px solid #67e8f9', color: '#164e63', fontWeight: 800 }}>
        Việc cần làm tiếp: {nextAction}
        <div style={{ marginTop: 4, fontSize: '.72rem', fontWeight: 600 }}>
          Research #{head(state, 'researchSnapshotId') || 'chưa có'} · Product Truth #{head(state, 'productTruthRevisionId') || 'chưa có'} · Intelligence #{head(state, 'intelligenceSnapshotId') || 'chưa có'}
        </div>
      </div>
      {activeProject?.state === 'EVIDENCE_INTAKE' && <div style={{ marginTop: 8, padding: 9, borderRadius: 8, background: '#dcfce7', color: '#166534', fontSize: '.8rem', fontWeight: 800 }}>
        Project đang mang trạng thái legacy EVIDENCE_INTAKE, nhưng trạng thái này không chặn luồng R3 bên dưới. Staff có thể nhập Product Truth và import research ngay trong project hiện tại.
      </div>}
      <details data-testid="canonical-execution-log" style={{ marginTop: 9, border: '1px solid #94a3b8', borderRadius: 9, padding: 9, background: '#fff' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 800 }}>Nhật ký thực thi để gửi Codex ({executionLog.length})</summary>
        <p style={{ margin: '7px 0', fontSize: '.75rem', color: '#475569' }}>Ghi thao tác, mã lỗi, project và artifact heads. Không ghi cookie, mật khẩu hoặc nội dung file.</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 7 }}>
          <button type="button" disabled={!executionLog.length} onClick={() => copyExecutionLog().catch(errorValue => notify(errorValue.message, 'error'))}>Copy log JSON</button>
          <button type="button" disabled={!executionLog.length} onClick={clearExecutionLog}>Xóa log tab này</button>
        </div>
        <textarea aria-label="Nhật ký thực thi" readOnly rows={8} value={executionLog.map(entry =>
          `${entry.timestamp} | ${entry.status} | ${entry.action}${entry.error?.code ? ` | ${entry.error.code}` : ''}${entry.error?.message ? ` | ${entry.error.message}` : ''}`).join('\n')} style={{ width: '100%', fontFamily: 'monospace', fontSize: '.7rem' }} />
      </details>
    </div>
    {error && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: 10, borderRadius: 8 }}>{error}</div>}

    {!policyReady && <section data-testid="legacy-policy-context-recovery" style={{ border: '2px solid #f59e0b', borderRadius: 12, padding: 14, background: '#fffbeb' }}>
      <b>0B. Xác nhận phân loại cho project cũ — chỉ làm một lần</b>
      <p style={{ margin: '6px 0 10px', color: '#78350f', fontSize: '.8rem' }}>
        Project được tạo trước R3 nên thiếu mã policy. Chọn loại sản phẩm và ngôn ngữ; thao tác này không xóa hay tạo lại Product Truth, research hoặc intelligence.
      </p>
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>Loại sản phẩm {' '}<select aria-label="Phân loại project cũ" value={policyClassification} onChange={event => setPolicyClassification(event.target.value)}>
          {POLICY_CHOICES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Ngôn ngữ listing {' '}<select aria-label="Ngôn ngữ policy project" value={policyLocale} onChange={event => setPolicyLocale(event.target.value)}>
          <option value="en-US">English (US)</option><option value="es-US">Español (US)</option>
        </select></label>
        <ActionButton accent="#b45309" disabled={busy} onClick={savePolicyContext}>Lưu và tiếp tục workflow</ActionButton>
      </div>
    </section>}

    <Step number="1" title="Nạp keyword và dữ liệu thị trường (độc lập Product Truth)" accent={accent} done={importCoverageReady}>
      {marketplace === 'AMAZON' && <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: '#eff6ff', color: '#1e3a8a', fontSize: '.8rem' }}>
        <b>Luồng chuẩn:</b> Seed → Xray → các nhóm ASIN gợi ý (tối đa 10 ASIN/nhóm, được sửa tự do) → Helium 10 Cerebro → Master KW.
        Nếu staff đã có file Cerebro hợp lệ thì được import trực tiếp, không cần chứng minh file thuộc batch nào. Product Truth chạy song song và chỉ bắt buộc tại ranh giới tạo copy.
      </div>}
      {marketplace === 'ETSY' && <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: '#fff7ed', color: '#7c2d12', fontSize: '.8rem' }}>
        <b>Luồng chuẩn:</b> Seed → Etsy live/HeyEtsy → import đồng thời 1..N CSV/HTML → winner views → Pattern Miner → Master KW.
        YTrends là nguồn E3 bổ sung và không được chặn file staff. Product Truth chạy song song; dữ liệu đối thủ không tự trở thành fact sản phẩm.
      </div>}
      {marketplace === 'AMAZON' ? <div data-testid="amazon-xray-upload-lane" style={{ border: '1px solid #93c5fd', borderRadius: 10, padding: 11, background: '#fff' }}>
        <b>1. Upload Xray từ seed</b>
        <p style={{ margin: '4px 0 9px', color: '#475569', fontSize: '.77rem' }}>Chọn một hoặc nhiều Xray. Preview không ghi database; xác nhận import mới lưu từng file với hash/accounting riêng.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <input aria-label="Upload Xray" type="file" multiple accept=".xlsx,.csv" onChange={event => { chooseFiles(event.target.files, 'AMAZON_XRAY'); event.target.value = ''; }} />
          <ActionButton accent={accent} disabled={!amazonXrayFiles.length || busy} onClick={() => upload(false, 'AMAZON_XRAY')}>Preview {amazonXrayFiles.length || ''} Xray zero-write</ActionButton>
          <ActionButton accent={accent} disabled={!amazonXrayPreviews.some(item => item.result?.zeroWrite) || busy} onClick={() => upload(true, 'AMAZON_XRAY')}>Xác nhận import Xray</ActionButton>
        </div>
        <SelectedFileQueue files={amazonXrayFiles} label="Xray đang chờ" onRemove={file => removeSelectedFile(file, 'AMAZON_XRAY')} onClear={() => clearSelectedFiles('AMAZON_XRAY')} />
        {previewGrid(amazonXrayPreviews, 'amazon-xray-preview-results')}
      </div> : <>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <input aria-label="File research" type="file" multiple accept=".csv,.html,.htm,text/csv,text/html" onChange={event => { chooseFiles(event.target.files, 'ETSY_SEARCH'); event.target.value = ''; }} />
          <ActionButton accent={accent} disabled={!files.length || busy} onClick={() => upload(false, 'ETSY_SEARCH')}>1A. Preview {files.length || ''} file zero-write</ActionButton>
          <ActionButton accent={accent} disabled={!filePreviews.some(item => item.result?.zeroWrite) || busy} onClick={() => upload(true, 'ETSY_SEARCH')}>1B. Xác nhận {filePreviews.filter(item => item.result?.zeroWrite).length || ''} file hợp lệ</ActionButton>
        </div>
        <SelectedFileQueue files={files} label="Etsy CSV/HTML đang chờ" onRemove={file => removeSelectedFile(file, 'ETSY_SEARCH')} onClear={() => clearSelectedFiles('ETSY_SEARCH')} />
        {previewGrid(filePreviews, 'multi-file-preview-results')}
      </>}
      {marketplace === 'AMAZON' && <div data-testid="amazon-xray-cohort-planner" style={{ marginTop: 14, border: '1px solid #93c5fd', borderRadius: 10, padding: 11, background: '#eff6ff' }}>
        <b>2. Quyết định ASIN batches</b>
        <p style={{ margin: '4px 0 9px', color: '#475569', fontSize: '.77rem' }}>Tool nhóm theo sales, revenue, BSR, review velocity, độ trẻ seller/listing và opportunity. Mỗi nhóm tối đa 10; có thể sửa danh sách trước khi copy sang Cerebro.</p>
        <ActionButton accent={accent} disabled={!xrayImportIds().length || busy} onClick={previewAsinPlan}>Phân tích Xray đã import và tạo nhóm</ActionButton>
        {!xrayImportIds().length && <small style={{ display: 'block', marginTop: 5 }}>Hãy hoàn tất bước 1 để mở phân tích batch. Kế hoạch batch là convenience artifact, không phải gate của file Cerebro.</small>}
        {asinPlanPreview && <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 8 }}>
            {(asinPlanPreview.payload?.cohorts || []).map(group => <button type="button" key={group.id} onClick={() => setSelectedAsinText(group.asins.join(', '))} style={{ textAlign: 'left', border: '1px solid #93c5fd', borderRadius: 8, background: '#fff', padding: 9, cursor: 'pointer' }}>
              <b>{group.label}</b><div style={{ fontSize: '.72rem', color: '#475569' }}>{group.size} ASIN · bấm để dùng nhóm này</div>
            </button>)}
          </div>
          <label style={{ display: 'grid', gap: 4, fontWeight: 800, fontSize: '.78rem' }}>ASIN staff chọn — sửa tự do, tối đa 30
            <textarea aria-label="ASIN staff chọn" rows={3} value={selectedAsinText} onChange={event => setSelectedAsinText(event.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => navigator.clipboard?.writeText(selectedAsinText)}>Copy ASIN chạy Cerebro</button>
            <ActionButton accent="#334155" disabled={!selectedAsinText.trim() || busy} onClick={saveAsinPlan}>Lưu kế hoạch ASIN tùy chọn</ActionButton>
          </div>
        </div>}
      </div>}
      {marketplace === 'AMAZON' && <div data-testid="amazon-cerebro-upload-lane" style={{ marginTop: 14, border: '1px solid #93c5fd', borderRadius: 10, padding: 11, background: '#fff' }}>
        <b>3. Upload Cerebro sau khi đã chạy các ASIN batch trên Helium 10</b>
        <p style={{ margin: '4px 0 9px', color: '#475569', fontSize: '.77rem' }}>Cho phép một hoặc nhiều file. Staff có thể thay đổi batch hoặc import file Cerebro hợp lệ đã có; OmniSeller không khóa batch và không yêu cầu chứng minh file thuộc batch nào.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <input aria-label="Upload Cerebro" type="file" multiple accept=".xlsx,.csv" onChange={event => { chooseFiles(event.target.files, 'AMAZON_CEREBRO'); event.target.value = ''; }} />
          <ActionButton accent={accent} disabled={!amazonCerebroFiles.length || busy} onClick={() => upload(false, 'AMAZON_CEREBRO')}>Preview {amazonCerebroFiles.length || ''} Cerebro zero-write</ActionButton>
          <ActionButton accent={accent} disabled={!amazonCerebroPreviews.some(item => item.result?.zeroWrite) || busy} onClick={() => upload(true, 'AMAZON_CEREBRO')}>Xác nhận import Cerebro</ActionButton>
        </div>
        <SelectedFileQueue files={amazonCerebroFiles} label="Cerebro đang chờ" onRemove={file => removeSelectedFile(file, 'AMAZON_CEREBRO')} onClear={() => clearSelectedFiles('AMAZON_CEREBRO')} />
        {previewGrid(amazonCerebroPreviews, 'amazon-cerebro-preview-results')}
      </div>}
      {imports.length > 0 && <div data-testid="research-snapshot-lane" style={{ marginTop: 14, border: `1px solid ${marketplace === 'AMAZON' ? '#93c5fd' : '#fed7aa'}`, borderRadius: 10, padding: 11, background: '#fff' }}>
        <b>{marketplace === 'AMAZON' ? '4. Chọn file Cerebro để tạo Research Snapshot' : '1C. Chọn file nguồn để tạo Research Snapshot'}</b>
        <p style={{ margin: '4px 0 7px', color: '#475569', fontSize: '.77rem' }}>{marketplace === 'AMAZON'
          ? 'Cerebro là nguồn bắt buộc cho Master KW; Xray có thể giữ kèm làm provenance. Không có đối chiếu ancestry hoặc khóa batch.'
          : 'Mỗi file vẫn giữ hash và accounting riêng trong snapshot.'}</p>
        {imports.map(item => <label key={item.id} style={{ display: 'block', marginTop: 6 }}>
          <input type="checkbox" checked={selectedImports.includes(item.id)} onChange={() => setSelectedImports(previous => previous.includes(item.id) ? previous.filter(id => id !== item.id) : [...previous, item.id])} />
          {' '}#{item.id} {item.kind} · {item.file_name} · {item.byte_length} bytes · {item.raw_hash.slice(0, 12)}…
        </label>)}
        <div style={{ marginTop: 10 }}><ActionButton accent={accent} disabled={!selectedImports.length || busy
          || (marketplace === 'AMAZON' && !selectedImports.some(id => imports.find(item => item.id === id)?.kind === 'AMAZON_CEREBRO'))} onClick={createResearchSnapshot}>
          {marketplace === 'AMAZON' ? 'Tạo Research Snapshot từ Cerebro đã chọn' : 'Khóa Research Snapshot'}
        </ActionButton></div>
      </div>}
      {marketplace === 'AMAZON' && researchReady && <div data-testid="amazon-master-keyword-workspace" style={{ marginTop: 14, borderTop: '1px solid #bfdbfe', paddingTop: 12 }}>
        <b>5. Cerebro → Master Keyword List</b>
        <p style={{ margin: '4px 0 9px', color: '#475569', fontSize: '.77rem' }}>Nhận trực tiếp một hoặc nhiều Cerebro hợp lệ; không yêu cầu chứng minh ancestry. Điểm ưu tiên tách rõ nhu cầu (SV/Keyword Sales), độ phủ niche (Ranking Competitors), và cơ hội cạnh tranh (ít Competing Products + Title Density thấp). Outlier/residue được giữ để review, không âm thầm xóa.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <ActionButton accent={accent} disabled={busy} onClick={previewMasterKeywords}>Preview / làm mới Master KW</ActionButton>
          {masterPreview && <ActionButton accent="#166534" disabled={busy} onClick={saveMasterKeywords}>Lưu immutable Master KW</ActionButton>}
          {masterKeywordHead && <span style={{ color: '#166534', fontWeight: 800 }}>Đã lưu v{masterKeywordHead.revisionNumber} · {masterKeywordHead.accounting?.masterKeywordCount} KW</span>}
        </div>
        {displayedMaster && <div style={{ marginTop: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 7 }}>
            <Metric label="MASTER KW" value={displayedMaster.accounting?.masterKeywordCount} />
            <Metric label="OUTLIER" value={displayedMaster.accounting?.outlierCount} />
            <Metric label="RESIDUE" value={displayedMaster.accounting?.residueCount} />
            <Metric label="DROPPED" value={displayedMaster.accounting?.droppedKeywordCount} />
          </div>
          <input aria-label="Tìm trong Master Keyword" value={keywordQuery} onChange={event => setKeywordQuery(event.target.value)} placeholder="Tìm keyword…" style={{ width: '100%', marginTop: 8, padding: 8 }} />
          <div style={{ maxHeight: 430, overflow: 'auto', marginTop: 8, border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.73rem' }}><thead><tr>
              <th style={{ textAlign: 'left', padding: 7 }}>#</th><th style={{ textAlign: 'left' }}>Keyword</th><th>SV</th><th>Sales</th><th>Niche</th><th>Opportunity</th><th>Score</th><th>Tier</th><th>Nguồn</th>
            </tr></thead><tbody>{visibleMasterKeywords.map(item => <tr key={item.keywordId} style={{ borderTop: '1px solid #e2e8f0' }}>
              <td style={{ padding: 7 }}>{item.priorityRank}</td><td>{item.phrase}</td><td style={{ textAlign: 'center' }}>{item.metrics.searchVolume ?? '—'}</td>
              <td style={{ textAlign: 'center' }}>{item.metrics.keywordSales ?? '—'}</td><td style={{ textAlign: 'center' }}>{item.competitorCoverageRatio ?? '—'}</td>
              <td style={{ textAlign: 'center' }}>{item.opportunityScore ?? '—'}</td>
              <td style={{ textAlign: 'center' }}>{item.score}</td><td style={{ textAlign: 'center' }}><select aria-label={`Tier ${item.phrase}`} value={item.tier} disabled={!masterPreview} onChange={event => setKeywordTier(item.phrase, event.target.value)}>
                {['PRIMARY','SECONDARY','LONG_TAIL','OUTLIER_REVIEW','RESIDUE','EXCLUDED'].map(tier => <option key={tier}>{tier}</option>)}
              </select></td><td style={{ textAlign: 'center' }}>{item.provenance?.length || 0}</td>
            </tr>)}</tbody></table>
          </div>
          {(displayedMaster.payload?.keywords || []).length > 200 && !keywordQuery && <small>Hiển thị 200 keyword đầu; dùng ô tìm kiếm để xem keyword khác. Artifact vẫn giữ toàn bộ.</small>}
        </div>}
      </div>}
      {marketplace === 'ETSY' && researchReady && <div data-testid="etsy-master-keyword-workspace" style={{ marginTop: 14, borderTop: '1px solid #fed7aa', paddingTop: 12 }}>
        <b>1D. Dữ liệu live → Winner Set có thể sửa tự do</b>
        <p style={{ margin: '4px 0 9px', color: '#475569', fontSize: '.77rem' }}>Relevance được xét trước metrics. Listing lặp giữa các file vẫn giữ đủ observation rồi mới hợp nhất entity. Sales/views/revenue của HeyEtsy luôn ghi E2 estimate.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <ActionButton accent={accent} disabled={busy} onClick={previewEtsyWinners}>Phân tích / làm mới winner views</ActionButton>
          {etsyWinnerPreview && <ActionButton accent="#166534" disabled={!selectedEtsyWinners.length || busy} onClick={saveEtsyWinners}>Lưu {selectedEtsyWinners.length} winner</ActionButton>}
          {workflowState?.heads?.ETSY_WINNER_SET && <span style={{ alignSelf: 'center', color: '#166534', fontWeight: 800 }}>Winner Set v{workflowState.heads.ETSY_WINNER_SET.revisionNumber} · {workflowState.heads.ETSY_WINNER_SET.accounting?.selectedWinnerCount} listing</span>}
        </div>
        {etsyWinnerPreview && <div style={{ marginTop: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 7 }}>
            <Metric label="OBSERVATIONS" value={etsyWinnerPreview.accounting?.sourceObservationCount} /><Metric label="ENTITIES" value={etsyWinnerPreview.accounting?.normalizedEntityCount} />
            <Metric label="REPEATS" value={etsyWinnerPreview.accounting?.duplicateObservationCount} /><Metric label="RELEVANT" value={etsyWinnerPreview.accounting?.relevantEntityCount} />
            <Metric label="IRRELEVANT" value={etsyWinnerPreview.accounting?.irrelevantEntityCount} /><Metric label="DROPPED" value={etsyWinnerPreview.accounting?.droppedObservationCount} />
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
            {(etsyWinnerPreview.payload?.cohorts || []).map(cohort => {
              const selectedCount = cohort.members.filter(id => selectedEtsyWinners.includes(id)).length;
              return <button key={cohort.name} type="button" aria-pressed={selectedCount === cohort.members.length}
                onClick={() => setSelectedEtsyWinners(previous => {
                  const current = new Set(previous); const fullySelected = cohort.members.every(id => current.has(id));
                  for (const id of cohort.members) fullySelected ? current.delete(id) : current.add(id);
                  return [...current].slice(0, 60);
                })}>{selectedCount === cohort.members.length ? '✓ ' : ''}{cohort.name} ({selectedCount}/{cohort.members.length})</button>;
            })}
            <button type="button" onClick={() => setSelectedEtsyWinners([...new Set((etsyWinnerPreview.payload?.cohorts || []).flatMap(cohort => cohort.members))].slice(0, 60))}>Chọn hợp nhất mọi cohort</button>
            <button type="button" onClick={() => setSelectedEtsyWinners([])}>Bỏ chọn tất cả</button>
          </div>
          <div style={{ marginTop: 6, color: '#7c2d12', fontSize: '.74rem' }}>Có thể bật đồng thời nhiều cohort rồi sửa từng listing. Nhiều winner chỉ tốt hơn khi vẫn đúng niche, đã dedupe và không bị một shop chi phối; listing lệch niche sẽ làm loãng pattern.</div>
          <div style={{ maxHeight: 420, overflow: 'auto', marginTop: 8, background: '#fff', border: '1px solid #fed7aa', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.72rem' }}><thead><tr><th>Chọn</th><th style={{ textAlign: 'left' }}>Listing</th><th>Shop</th><th>Rank</th><th>Sold</th><th>Views</th><th>Age</th><th>Score</th><th>Obs</th></tr></thead><tbody>
              {(etsyWinnerPreview.payload?.entities || []).filter(item => item.relevance?.relevant).sort((a, b) => (b.winnerScore ?? -1) - (a.winnerScore ?? -1)).slice(0, 100).map(item => <tr key={item.entityId} style={{ borderTop: '1px solid #ffedd5' }}>
                <td style={{ textAlign: 'center' }}><input aria-label={`Winner ${item.listingId || item.entityId}`} type="checkbox" checked={selectedEtsyWinners.includes(item.entityId)} onChange={() => toggleEtsyWinner(item.entityId)} /></td>
                <td style={{ padding: 6 }}>{item.title}</td><td>{item.shopName || '—'}</td><td style={{ textAlign: 'center' }}>{item.bestObservedRank ?? '—'}</td>
                <td style={{ textAlign: 'center' }}>{item.totalSold ?? '—'}</td><td style={{ textAlign: 'center' }}>{item.totalViews ?? '—'}</td><td style={{ textAlign: 'center' }}>{item.ageDays ?? '—'}</td>
                <td style={{ textAlign: 'center' }}>{item.winnerScore ?? 'UNSCORED'}</td><td style={{ textAlign: 'center' }}>{item.observationCount}</td>
              </tr>)}</tbody></table>
          </div>
        </div>}

        {workflowState?.heads?.ETSY_WINNER_SET && <div style={{ marginTop: 14, borderTop: '1px solid #fed7aa', paddingTop: 12 }}>
          <b>1E. Pattern Miner</b>
          <p style={{ margin: '4px 0 9px', color: '#475569', fontSize: '.77rem' }}>Học title head, 40 ký tự đầu, phrase lặp, tag thực, personalization/gift và shop concentration. Pattern không phải Product Truth.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><ActionButton accent={accent} disabled={busy} onClick={previewEtsyPatterns}>Chạy Pattern Miner</ActionButton>
            {etsyPatternPreview && <ActionButton accent="#166534" disabled={busy} onClick={saveEtsyPatterns}>Lưu Pattern Snapshot</ActionButton>}
            {workflowState?.heads?.ETSY_PATTERN_SNAPSHOT && <ActionButton accent="#475569" disabled={busy} onClick={supplementEtsyPatterns}>Bổ sung YTrends E3 (tùy chọn)</ActionButton>}
            {workflowState?.heads?.ETSY_PATTERN_SNAPSHOT && <span style={{ alignSelf: 'center', color: '#166534', fontWeight: 800 }}>Pattern v{workflowState.heads.ETSY_PATTERN_SNAPSHOT.revisionNumber}</span>}
          </div>
          {displayedEtsyPattern && <div style={{ marginTop: 9 }}>
            <div style={{ overflowX: 'auto', maxHeight: 430, border: '1px solid #fed7aa', borderRadius: 8, background: '#fff' }}><table data-testid="etsy-pattern-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.73rem' }}>
              <thead><tr><th style={{ textAlign: 'left', padding: 7 }}>Pattern / phrase</th><th>Loại</th><th>Listing</th><th>Độ phủ</th><th>Shop</th><th>Evidence</th></tr></thead>
              <tbody>{[
                ...(displayedEtsyPattern.payload?.leadingWords || []).map(item => ({ ...item, type: 'TITLE_HEAD', listings: item.count })),
                ...(displayedEtsyPattern.payload?.repeatedPhrases || []).map(item => ({ ...item, type: 'REPEATED_PHRASE', listings: item.count })),
                ...(displayedEtsyPattern.payload?.observedTags || []).map(item => ({ ...item, type: 'OBSERVED_TAG', listings: item.listingSpread, share: item.listingSpread / Math.max(1, displayedEtsyPattern.payload?.sampleSize || 1), shops: item.shopSpread }))
              ].sort((a, b) => (b.share || 0) - (a.share || 0) || (b.listings || 0) - (a.listings || 0)).slice(0, 100).map((item, index) => <tr key={`${item.type}-${item.phrase}-${index}`} style={{ borderTop: '1px solid #ffedd5' }}>
                <td style={{ padding: 6 }}>{item.phrase}</td><td style={{ textAlign: 'center' }}>{item.type}</td><td style={{ textAlign: 'center' }}>{item.listings ?? '—'}</td><td style={{ textAlign: 'center' }}>{item.share == null ? '—' : `${Math.round(item.share * 100)}%`}</td><td style={{ textAlign: 'center' }}>{item.shops ?? '—'}</td><td style={{ textAlign: 'center' }}>{item.evidenceTier || 'E1_OBSERVED_PUBLIC'}</td>
              </tr>)}</tbody>
            </table></div>
            <div style={{ marginTop: 7, fontSize: '.74rem' }}><b>Structure:</b> Personalization {displayedEtsyPattern.payload?.structure?.personalizationRate}% · Gift {displayedEtsyPattern.payload?.structure?.giftRate}% · {displayedEtsyPattern.payload?.structure?.averageWords} words/title · {displayedEtsyPattern.payload?.marketContext?.uniqueShopCount} shop.</div>
            {displayedEtsyPattern.accounting?.unparseableTagCellCount > 0 && <div style={{ marginTop: 5, color: '#9a3412', fontSize: '.72rem' }}>Đã cách ly {displayedEtsyPattern.accounting.unparseableTagCellCount} ô HeyEtsy bị nối chuỗi; raw data vẫn còn trong import, không đưa rác vào Master KW.</div>}
          </div>}
        </div>}

        {workflowState?.heads?.ETSY_PATTERN_SNAPSHOT && <div style={{ marginTop: 14, borderTop: '1px solid #fed7aa', paddingTop: 12 }}>
          <b>1F. Pattern → Etsy Master Keyword List</b>
          <p style={{ margin: '4px 0 9px', color: '#475569', fontSize: '.77rem' }}>Mỗi phrase giữ provenance, intent, semantic cluster và lý do loại. Etsy CSV không có keyword search volume chính thức, nên Demand/Competition dưới đây là proxy minh bạch từ winner spread; không giả mạo thành SV. Không tạo tag giả để đủ 13.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><ActionButton accent={accent} disabled={busy} onClick={previewEtsyMasterKeywords}>Preview / làm mới Etsy Master KW</ActionButton>
            {masterPreview && <ActionButton accent="#166534" disabled={busy} onClick={saveEtsyMasterKeywords}>Lưu immutable Etsy Master KW</ActionButton>}
            {masterKeywordHead && <span style={{ alignSelf: 'center', color: '#166534', fontWeight: 800 }}>Master v{masterKeywordHead.revisionNumber} · {masterKeywordHead.accounting?.masterKeywordCount} phrase</span>}
          </div>
          {displayedMaster && <div style={{ marginTop: 9 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 7 }}><Metric label="MASTER KW" value={displayedMaster.accounting?.masterKeywordCount} /><Metric label="PRIMARY" value={displayedMaster.accounting?.primaryCount} /><Metric label="REVIEW" value={displayedMaster.accounting?.reviewCount} /><Metric label="SEMANTIC CLUSTERS" value={displayedMaster.accounting?.semanticClusterCount} /><Metric label="IP BLOCKED" value={displayedMaster.accounting?.ipBlockedCount} /><Metric label="DROPPED" value={displayedMaster.accounting?.droppedKeywordCount} /></div>
            <input aria-label="Tìm trong Etsy Master Keyword" value={keywordQuery} onChange={event => setKeywordQuery(event.target.value)} placeholder="Tìm phrase…" style={{ width: '100%', marginTop: 8, padding: 8 }} />
            <div style={{ maxHeight: 420, overflow: 'auto', marginTop: 8, background: '#fff', border: '1px solid #fed7aa', borderRadius: 8 }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.72rem' }}><thead><tr><th>#</th><th style={{ textAlign: 'left' }}>Phrase</th><th>Intent</th><th>Demand proxy</th><th>Competition proxy</th><th>Opportunity</th><th>Score</th><th>Tier</th><th>Nguồn</th></tr></thead><tbody>
              {visibleMasterKeywords.map(item => <tr key={item.keywordId} style={{ borderTop: '1px solid #ffedd5' }}><td style={{ padding: 6 }}>{item.priorityRank}</td><td>{item.phrase}</td><td>{item.intent}</td><td style={{ textAlign: 'center' }}>{item.demandProxy ?? '—'}</td><td style={{ textAlign: 'center' }}>{item.competitionProxy ?? '—'}</td><td style={{ textAlign: 'center' }}>{item.opportunityScore ?? '—'}</td><td style={{ textAlign: 'center' }}>{item.score}</td><td><select aria-label={`Etsy tier ${item.phrase}`} value={item.tier} disabled={!masterPreview} onChange={event => setKeywordTier(item.phrase, event.target.value)}>{['PRIMARY','SECONDARY','LONG_TAIL','PATTERN_ONLY','REVIEW','EXCLUDED'].map(tier => <option key={tier}>{tier}</option>)}</select></td><td>{(item.sourceTypes || []).join(', ')}</td></tr>)}
            </tbody></table></div>
          </div>}
        </div>}
      </div>}
    </Step>

    <Step number="2" title="Product Truth do Seller nhập và kiểm" accent={accent} done={Boolean(head(state, 'productTruthRevisionId'))}>
      <div style={{ border: '1px solid #bfdbfe', borderRadius: 10, padding: 12, background: '#eff6ff', marginBottom: 12 }}>
        <b>Điền nhanh từ một listing cùng supplier / nguồn hàng</b>
        <p style={{ margin: '5px 0 9px', fontSize: '.78rem', color: '#475569' }}>Dùng ngay tài khoản, workspace và project đang mở. Preview chỉ điền biểu mẫu; chưa ghi database.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px,1fr) auto', gap: 8, alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 3, fontSize: '.75rem', fontWeight: 800 }}>ASIN, Etsy listing ID hoặc URL
            <input aria-label="ASIN, Etsy listing ID hoặc URL" value={listingSource} onChange={event => setListingSource(event.target.value)} placeholder={marketplace === 'AMAZON' ? 'B0D5XS64LH hoặc URL Amazon' : '4533292901 hoặc URL Etsy'} />
          </label>
          <ActionButton accent={accent} disabled={!sameSourceConfirmed || !listingSource.trim() || busy} onClick={() => previewReferenceListing(null)}>Quét link và điền</ActionButton>
        </div>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center', marginTop: 9 }}>
          <input aria-label="Upload HTML listing" type="file" accept=".html,.htm,text/html" onChange={event => { setListingHtmlFile(event.target.files?.[0] || null); setListingFactPreview(null); }} />
          <ActionButton accent="#475569" disabled={!sameSourceConfirmed || !listingHtmlFile || busy} onClick={() => previewReferenceListing(listingHtmlFile)}>Upload HTML và điền</ActionButton>
        </div>
        <label style={{ display: 'block', marginTop: 9, fontSize: '.78rem', fontWeight: 700 }}><input type="checkbox" checked={sameSourceConfirmed} onChange={event => setSameSourceConfirmed(event.target.checked)} /> Tôi xác nhận đây là sản phẩm cùng supplier/cùng nguồn hàng và sẽ sửa mọi khác biệt của biến thể.</label>
        {listingFactPreview && <div style={{ marginTop: 10, padding: 9, borderRadius: 8, background: '#fff', border: '1px solid #bfdbfe' }}>
          <div><b>{listingFactPreview.observations?.title}</b></div>
          <div style={{ fontSize: '.75rem', color: '#475569', marginTop: 4 }}>{listingFactPreview.accounting?.extractedFactCount} trường · {listingFactPreview.accounting?.observedBulletCount || 0} bullet · SHA-256 {listingFactPreview.rawHash?.slice(0, 12)}…</div>
          {(listingFactPreview.observations?.bullets || []).length > 0 && <details style={{ marginTop: 5 }}><summary>Thông tin listing đã đọc</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: '.72rem' }}>{listingFactPreview.observations.bullets.join('\n')}</pre></details>}
        </div>}
      </div>
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <a href="/templates/OMNISELLER_PRODUCT_TRUTH_STAFF_TEMPLATE_VI.xlsx" download style={{
          display: 'inline-block', padding: '9px 14px', borderRadius: 8, background: '#e8eef7', color: '#22314d',
          fontWeight: 800, textDecoration: 'none'
        }}>Tải mẫu Excel Product Truth</a>
        <span style={{ fontSize: '.78rem', color: '#475569' }}>Hoặc nhập tay các trường chính bên dưới; thiếu gì ghi chú để bổ sung ở revision sau.</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 9 }}>
        {CORE_FACT_FIELDS.map(([key, label, required]) => <label key={key} style={{ display: 'grid', gap: 3, fontSize: '.75rem', fontWeight: 800 }}>
          {label}{required ? ' *' : ''}<input value={facts[key]} onChange={event => setFacts(previous => ({ ...previous, [key]: event.target.value }))} style={{ padding: 8, border: '1px solid #cbd5e1', borderRadius: 7 }} />
        </label>)}
      </div>
      <details style={{ marginTop: 10 }}><summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: '.82rem' }}>Thông tin digital / printable nếu áp dụng</summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 9, marginTop: 9 }}>
          {DIGITAL_FACT_FIELDS.map(([key, label]) => <label key={key} style={{ display: 'grid', gap: 3, fontSize: '.75rem', fontWeight: 800 }}>
            {label}<input value={facts[key]} onChange={event => setFacts(previous => ({ ...previous, [key]: event.target.value }))} style={{ padding: 8, border: '1px solid #cbd5e1', borderRadius: 7 }} />
          </label>)}
        </div>
      </details>
      <label style={{ display: 'grid', gap: 3, marginTop: 9, fontSize: '.75rem', fontWeight: 800 }}>Ghi chú / dữ liệu còn thiếu
        <textarea value={truthNotes} onChange={event => setTruthNotes(event.target.value)} rows={3} style={{ padding: 8, border: '1px solid #cbd5e1', borderRadius: 7 }} placeholder="Thiếu gì thì ghi rõ; hệ thống vẫn sinh draft nhưng không được bịa." />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,.35fr) 1fr', gap: 9, marginTop: 9 }}>
        <label style={{ display: 'grid', gap: 3, fontSize: '.75rem', fontWeight: 800 }}>Nguồn xác minh
          <select value={truthBasis} onChange={event => setTruthBasis(event.target.value)}>
            <option value="SUPPLIER_SPEC">Thông tin supplier</option><option value="OWN_LISTING_RECORD">Listing đã đăng của công ty</option><option value="REFERENCE_LISTING_SAME_SOURCE">Listing cùng supplier / nguồn hàng</option><option value="PHYSICAL_INSPECTION">Kiểm tra sản phẩm thật</option>
            <option value="PRODUCTION_WORKFLOW">Production workflow</option><option value="RIGHTS_RECORD">Rights record</option><option value="OTHER">Other / staff verified</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 3, fontSize: '.75rem', fontWeight: 800 }}>Ghi chú nguồn
          <input value={truthBasisNote} onChange={event => setTruthBasisNote(event.target.value)} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 9, marginTop: 10, flexWrap: 'wrap' }}>
        <ActionButton accent={accent} disabled={busy} onClick={saveTruth}>2A. Lưu revision Product Truth</ActionButton>
        {isManager && <ActionButton accent="#166534" disabled={!currentTruth || currentTruth.confirmationState === 'MANAGER_CONFIRMED' || busy} onClick={confirmTruth}>2B. Manager xác nhận</ActionButton>}
        <span style={{ alignSelf: 'center', fontSize: '.8rem' }}>Hiện tại: {currentTruth ? `v${currentTruth.revision_number} · ${currentTruth.confirmationState}` : 'chưa có'}</span>
      </div>
    </Step>

    <Step number="3" title="Phân tích và phân bổ keyword" accent={accent} done={Boolean(head(state, 'intelligenceSnapshotId'))}>
      {intelligenceReady && <div data-testid="intelligence-complete" style={{ marginBottom: 9, padding: 9, borderRadius: 8, background: '#dcfce7', color: '#166534', fontSize: '.78rem', fontWeight: 800 }}>
        Đã lưu Intelligence Snapshot #{head(state, 'intelligenceSnapshotId')} — Bước 3 hoàn tất. Đi tiếp Bước 4; chỉ dùng 3A/3B khi muốn phân tích lại.
      </div>}
      {(() => {
        const missing = [
          !head(state, 'researchSnapshotId') && 'Research Snapshot chưa lưu',
          !masterKeywordHead && 'Master Keyword List mới chỉ preview hoặc chưa lưu',
          !head(state, 'productTruthRevisionId') && 'Product Truth chưa lưu'
        ].filter(Boolean);
        return missing.length > 0 && <div data-testid="intelligence-missing-dependencies" style={{ marginBottom: 9, padding: 9, borderRadius: 8, background: '#fff7ed', color: '#9a3412', fontSize: '.78rem' }}>
          <b>Chưa thể phân bổ:</b> {missing.join(' · ')}. Product Truth chỉ chặn claim không được xác nhận; nó không yêu cầu điền đủ mọi trường.
        </div>;
      })()}
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: '.8rem', fontWeight: 800 }}>Ngôn ngữ listing {' '}<select value={language} onChange={event => setLanguage(event.target.value)}><option value="AUTO">Theo keyword đầu vào</option><option value="EN">English</option><option value="ES">Español</option></select></label>
        <ActionButton accent={accent} disabled={!head(state, 'researchSnapshotId') || !head(state, 'productTruthRevisionId')
          || !masterKeywordHead || busy} onClick={() => analyze(false)}>{intelligenceReady ? '3A. Preview phân tích lại' : '3A. Preview zero-write'}</ActionButton>
        <ActionButton accent={accent} disabled={!intelligencePreview?.zeroWrite || busy} onClick={() => analyze(true)}>{intelligenceReady ? '3B. Lưu revision Intelligence mới' : '3B. Khóa Intelligence Snapshot'}</ActionButton>
      </div>
      {claimBlockers.length > 0 && <div data-testid="truth-claim-remediation" style={{ marginTop: 9, padding: 10, border: '1px solid #f97316', borderRadius: 8, background: '#fff7ed', color: '#7c2d12' }}>
        <b>Không phải lỗi Master KW. Composer đã dừng vì Product Truth hiện tại không xác nhận claim sau:</b>
        <ul style={{ margin: '6px 0' }}>{claimBlockers.slice(0, 12).map((item, index) => <li key={`${item.field}-${item.token}-${index}`}>{item.field}: “{item.token}”</li>)}</ul>
        <span style={{ fontSize: '.76rem' }}>Nếu sản phẩm thật có thuộc tính này, bổ sung vào Product Truth và lưu revision mới. Nếu không có, giữ nguyên Product Truth: Omni sẽ không được phép đưa claim của đối thủ vào listing.</span>
      </div>}
      {previewOutput && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, marginTop: 10 }}>
        <Metric label="LANGUAGE" value={previewOutput.language || language} />
        <Metric label="COPY-SAFE" value={intelligencePreview.accounting?.copySafeKeywordCount ?? intelligencePreview.accounting?.titleAndTagCandidateCount} />
        <Metric label={marketplace === 'AMAZON' ? 'CLAIM BLOCKED / PPC' : 'CLAIM BLOCKED'} value={intelligencePreview.accounting?.claimTargetingCount ?? intelligencePreview.accounting?.claimBlockedCount} />
        <Metric label={marketplace === 'AMAZON' ? 'OTHER LANGUAGE / PPC' : 'OTHER LANGUAGE'} value={intelligencePreview.accounting?.languageTargetingCount ?? 0} />
        <Metric label="BRAND / SHOP BLOCKED" value={intelligencePreview.accounting?.competitorBrandBlockedCount
          ?? intelligencePreview.accounting?.competitorShopBlockedCount ?? 0} />
        <Metric label="LEXICAL REVIEW" value={intelligencePreview.accounting?.lexicalReviewCount ?? 0} />
        <Metric label="IP BLOCKED" value={intelligencePreview.accounting?.ipBlockedKeywordCount} />
        <Metric label="UNALLOCATED" value={intelligencePreview.accounting?.unallocatedCount ?? 0} />
        <Metric label="FACT CẦN XEM LẠI" value={intelligencePreview.accounting?.factClaimReviewCount ?? 0} />
      </div>}
    </Step>

    <Step number="4" title="Draft hoàn chỉnh và bộ prompt ảnh" accent={accent} done={Boolean(listing)}>
      <ActionButton accent={accent} disabled={!latestIntelligence || !policyReady || busy} onClick={previewDraft}>4A. Tạo / làm mới draft zero-write</ActionButton>
      {(!latestIntelligence || !policyReady) && <div style={{ marginTop: 7, color: '#9a3412', fontSize: '.76rem' }}>Chưa mở Bước 4: {!latestIntelligence ? 'chưa có Intelligence Snapshot đã lưu' : 'project chưa liên kết policy context'}. Không cần chạy lại Bước 3 nếu banner xanh phía trên đã xác nhận hoàn tất.</div>}
      {listing && <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
        {marketplace === 'AMAZON' ? <>
          <div style={{ padding: 9, borderRadius: 8, background: '#eff6ff', color: '#1e3a8a', fontSize: '.76rem' }}><b>Amazon Modular Titles 2026:</b> Title và Item Highlights đều là search inputs. Engine lấp đầy bằng keyword liên quan/truth-safe đến khi không còn phrase phù hợp; không padding, không lặp vô ích.</div>
          <label><CapacityLabel label="Amazon Title" used={characterCount(listing.amazonTitle)} limit={AMAZON_SURFACE_LIMITS.title} /><textarea value={listing.amazonTitle || ''} onChange={event => updateDraft('amazonTitle', event.target.value)} rows={2} style={{ width: '100%' }} /></label>
          <label><CapacityLabel label="Item Highlights" used={characterCount(listing.itemHighlights)} limit={AMAZON_SURFACE_LIMITS.itemHighlights} /><textarea value={listing.itemHighlights || ''} onChange={event => updateDraft('itemHighlights', event.target.value)} rows={3} style={{ width: '100%' }} /></label>
          <div><CapacityLabel label="5 Bullet Points" used={(listing.amazonBullets || []).length} limit={5} unit="mục" authority="giới hạn ký tự lấy theo Product Type Definition" />
            {(listing.amazonBullets || []).map((bullet, index) => <label key={index} style={{ display: 'grid', gap: 3, marginTop: 6 }}><span>Bullet {index + 1} ({characterCount(bullet)}/PTD ký tự)</span><textarea value={bullet} onChange={event => { const next = [...(listing.amazonBullets || [])]; next[index] = event.target.value; updateDraft('amazonBullets', next); }} rows={3} /></label>)}
          </div>
          <label><CapacityLabel label="Backend Search Terms" used={utf8ByteCount(listing.amazonSearchTerms)} limit={AMAZON_SURFACE_LIMITS.backendBytes} unit="bytes" /><textarea value={listing.amazonSearchTerms || ''} onChange={event => updateDraft('amazonSearchTerms', event.target.value)} rows={3} style={{ width: '100%' }} /></label>
          <label><CapacityLabel label="Description" used={characterCount(listing.amazonDescription)} limit={null} authority="max theo Product Type Definition" /><textarea value={listing.amazonDescription || ''} onChange={event => updateDraft('amazonDescription', event.target.value)} rows={7} style={{ width: '100%' }} /></label>
          <label><b>Category</b><input value={listing.categoryName || ''} onChange={event => updateDraft('categoryName', event.target.value)} style={{ width: '100%' }} /></label>
          <label><b>Amazon A+ source points — giới hạn cuối được đếm riêng theo từng module/headline/body/alt-text</b><textarea value={(listing.amazonAPlusPoints || []).join('\n')} onChange={event => updateDraft('amazonAPlusPoints', event.target.value.split('\n').map(item => item.trim()).filter(Boolean))} rows={5} style={{ width: '100%' }} />
            <small>{(listing.amazonAPlusPoints || []).map((point, index) => `Point ${index + 1}: ${characterCount(point)} ký tự`).join(' · ') || 'Chưa có point'}</small></label>
          <label><b>PPC targeting — có thể chứa keyword claim chưa xác minh, không phải copy hiển thị</b><textarea value={(listing.ppcKeywords || []).map(item => typeof item === 'string' ? item : item.phrase || '').join('\n')} onChange={event => updateDraft('ppcKeywords', event.target.value.split('\n').map(phrase => phrase.trim()).filter(Boolean))} rows={6} style={{ width: '100%' }} /></label>
        </> : <>
          <label><b>Etsy Title ({Array.from(listing.etsyTitle || '').length}/140)</b><textarea value={listing.etsyTitle || ''} onChange={event => updateDraft('etsyTitle', event.target.value)} rows={2} style={{ width: '100%' }} /></label>
          <label><b>Tối đa 13 Tags an toàn — mỗi dòng một tag</b><textarea value={(listing.etsyTags || []).join('\n')} onChange={event => updateEtsyTags(event.target.value)} rows={7} style={{ width: '100%' }} /></label>
          <div style={{ border: '1px solid #fed7aa', borderRadius: 8, padding: 9, background: '#fff7ed' }}>
            <b>Phân bổ tag do engine tạo: {listing.etsyTagStatus?.code === 'TAG_SHORTAGE'
              ? `TAG_SHORTAGE — còn thiếu ${listing.etsyTagStatus.missingCount} tag an toàn`
              : 'COMPLETE'}</b>
            <div style={{ fontSize: '.76rem', color: '#7c2d12', marginTop: 3 }}>Không thêm tag giả chỉ để đủ 13. Tag staff sửa được đánh dấu STAFF_MANUAL_EDIT và phải qua Manager QA cùng exact draft đã lưu.</div>
            {Array.isArray(listing.etsyTagExplanations) && listing.etsyTagExplanations.length > 0
              ? <div style={{ overflowX: 'auto', marginTop: 7 }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.75rem' }}><thead><tr><th style={{ textAlign: 'left' }}>Tag</th><th style={{ textAlign: 'left' }}>Intent</th><th style={{ textAlign: 'left' }}>Lý do / nguồn</th></tr></thead><tbody>
                {listing.etsyTagExplanations.map((item, index) => <tr key={`${item.value}-${index}`}><td>{item.value}</td><td>{item.intent}</td><td>{item.reason} · {(item.sources || []).map(source => source.sourceType).filter(Boolean).join(', ') || 'n/a'}</td></tr>)}
              </tbody></table></div> : <div style={{ fontSize: '.76rem', marginTop: 5 }}>Chưa có tag an toàn từ Master KW/Product Truth.</div>}
          </div>
          <label><b>Description</b><textarea value={listing.etsyDescription || ''} onChange={event => updateDraft('etsyDescription', event.target.value)} rows={7} style={{ width: '100%' }} /></label>
          <label><b>Item Highlights</b><textarea value={listing.itemHighlights || ''} onChange={event => updateDraft('itemHighlights', event.target.value)} rows={3} style={{ width: '100%' }} /></label>
          <label><b>Category</b><input value={listing.categoryName || ''} onChange={event => updateDraft('categoryName', event.target.value)} style={{ width: '100%' }} /></label>
        </>}
        <div><b>Bộ prompt ảnh bên ngoài ({Array.isArray(prompts) ? prompts.length : 0})</b>
          {Array.isArray(prompts) && prompts.map((prompt, index) => <div key={prompt.id || prompt.slot || index} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 9, marginTop: 7, background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{prompt.purpose || prompt.id || `Ảnh ${index + 1}`}</b><button type="button" disabled={!prompt.prompt} onClick={() => navigator.clipboard?.writeText(prompt.prompt)}>Copy prompt</button></div>
            {prompt.prompt ? <textarea readOnly value={prompt.prompt} rows={4} style={{ width: '100%', marginTop: 5 }} /> : <div style={{ color: '#b45309' }}>Chưa sẵn sàng: {(prompt.missingInputs || []).join(', ')}</div>}
          </div>)}
        </div>
        <ActionButton accent="#166534" disabled={busy} onClick={saveDraft}>4B. Seller lưu NEEDS_QA</ActionButton>
        <small>Manager/Owner kiểm lại ở bước duyệt hiện hữu. Không có lệnh submit marketplace trong luồng này.</small>
      </div>}
    </Step>

    <Step number="5" title="Manager QA → Owner authorization → exact export → báo cáo submit thủ công" accent={accent} done={listingQueue.some(item => item.status === 'OPERATOR_REPORTED_SUBMITTED')}>
      <p style={{ marginTop: 0, color: '#475569' }}>Manager phải mở và đọc exact package trước khi duyệt. Chuỗi bắt buộc: Seller yêu cầu → Owner authorize exact package → Seller tải exact export → Seller/operator submit thủ công ngoài OmniSeller → <b>OPERATOR_REPORTED_SUBMITTED</b>. Trạng thái cuối không có nghĩa marketplace đã accept/live.</p>
      {isManager && <label style={{ display: 'grid', gap: 4, marginBottom: 10, fontWeight: 800, fontSize: '.78rem' }}>Lý do review
        <textarea rows={2} value={reviewReason} onChange={event => setReviewReason(event.target.value)} placeholder="Đã kiểm Product Truth, claim, IP, policy và chất lượng copy..." />
      </label>}
      {listingQueue.length === 0 ? <div>Chưa có listing canonical đã lưu.</div> : listingQueue.map(item => <div key={item.id} style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 9, padding: 10, marginTop: 8 }}>
        <div><b>#{item.id} · {item.amazonTitle || item.etsyTitle || 'Untitled'}</b></div>
        <div style={{ fontSize: '.8rem', color: '#475569' }}>Status: <b>{item.status}</b> · Revision #{item.head_revision_id} · Review: {item.latestReviewDecision || 'chưa có'}</div>
        {item.latestReviewReason && <div style={{ fontSize: '.78rem' }}>Ghi chú Manager: {item.latestReviewReason}</div>}
        <div style={{ marginTop: 7 }}><ActionButton accent="#334155" disabled={busy} onClick={() => loadReviewPackage(item.id)}>Mở exact review package</ActionButton></div>
        {reviewPackages[item.id] && <div style={{ marginTop: 8, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, padding: 9 }}>
          <div><b>Revision #{reviewPackages[item.id].listingRevisionId}</b> · content {reviewPackages[item.id].contentHash} · dependencies {reviewPackages[item.id].dependencyHash}</div>
          <div style={{ color: reviewPackages[item.id].approvalReadiness?.ready ? '#166534' : '#b91c1c', fontWeight: 800 }}>
            Approval policy: {reviewPackages[item.id].approvalReadiness?.ready ? 'READY' : `BLOCKED — ${reviewPackages[item.id].approvalReadiness?.error}`}
          </div>
          <details><summary>Toàn bộ listing content</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(reviewPackages[item.id].content, null, 2)}</pre></details>
          <details><summary>Dependency manifest + validation accounting</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify({ dependencies: reviewPackages[item.id].dependencies, validationAccounting: reviewPackages[item.id].validationAccounting }, null, 2)}</pre></details>
        </div>}
        {isManager && item.status !== 'MANAGER_APPROVED' && <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <ActionButton accent="#166534" disabled={!reviewReason.trim() || busy || !reviewPackages[item.id]?.approvalReadiness?.ready} onClick={() => reviewListing(item.id, 'APPROVED')}>Manager duyệt exact package</ActionButton>
          <ActionButton accent="#b45309" disabled={!reviewReason.trim() || busy || !reviewPackages[item.id]} onClick={() => reviewListing(item.id, 'CHANGES_REQUESTED')}>Yêu cầu sửa exact package</ActionButton>
        </div>}
        {item.status === 'MANAGER_APPROVED' && isSeller && !item.submissionRequestId && <div style={{ marginTop: 9, display: 'grid', gap: 6 }}>
          <label><b>Ghi chú gửi Owner</b><textarea rows={2} value={submissionInput(item.id).requestNotes || ''} onChange={event => setSubmissionInput(item.id, 'requestNotes', event.target.value)} /></label>
          <ActionButton accent="#7c3aed" disabled={busy || !String(submissionInput(item.id).requestNotes || '').trim()} onClick={() => requestSubmission(item)}>Seller yêu cầu authorization</ActionButton>
        </div>}
        {item.status === 'MANAGER_APPROVED' && item.submissionRequestId && !item.submissionAuthorizationId && <div style={{ marginTop: 9, display: 'grid', gap: 6 }}>
          <div><b>SUBMISSION_REQUESTED</b> · package {item.submissionPackageHash}</div>
          {isOwner ? <><label><b>Lý do Owner authorize</b><textarea rows={2} value={submissionInput(item.id).authorizationNotes || ''} onChange={event => setSubmissionInput(item.id, 'authorizationNotes', event.target.value)} /></label>
            <ActionButton accent="#7c3aed" disabled={busy || !String(submissionInput(item.id).authorizationNotes || '').trim()} onClick={() => authorizeSubmission(item)}>Owner authorize exact package</ActionButton></>
            : <small>Đang chờ Owner authorize exact package. Không được submit trước bước này.</small>}
        </div>}
        {item.status === 'MANAGER_APPROVED' && item.submissionAuthorizationId && !item.submissionExportId && <div style={{ marginTop: 9, display: 'grid', gap: 6 }}>
          <div><b>SUBMISSION_AUTHORIZED</b> · authorization #{item.submissionAuthorizationId}</div>
          {isSeller ? <ActionButton accent="#0369a1" disabled={busy} onClick={() => exportExactPackage(item)}>Tải exact JSON để submit thủ công</ActionButton>
            : <small>Owner đã authorize. Seller đăng nhập để tải exact export.</small>}
        </div>}
        {item.status === 'MANAGER_APPROVED' && item.submissionExportId && <div style={{ marginTop: 9, display: 'grid', gap: 6 }}>
          <div><b>EXACT_EXPORT_READY</b> · export #{item.submissionExportId} · hash {item.submissionExportHash}</div>
          {isSeller ? <><label><b>External reference / mã thao tác trên sàn</b><input value={submissionInput(item.id).externalReference || ''} onChange={event => setSubmissionInput(item.id, 'externalReference', event.target.value)} /></label>
            <label><b>Ghi chú thao tác</b><textarea rows={2} value={submissionInput(item.id).operatorNotes || ''} onChange={event => setSubmissionInput(item.id, 'operatorNotes', event.target.value)} /></label>
            <label><input type="checkbox" checked={Boolean(submissionInput(item.id).manualSubmissionConfirmed)} onChange={event => setSubmissionInput(item.id, 'manualSubmissionConfirmed', event.target.checked)} /> Tôi xác nhận đã submit thủ công exact package ngoài OmniSeller.</label>
            <ActionButton accent="#166534" disabled={busy || !submissionInput(item.id).manualSubmissionConfirmed || !String(submissionInput(item.id).externalReference || '').trim() || !String(submissionInput(item.id).operatorNotes || '').trim()} onClick={() => reportOperatorSubmission(item)}>Ghi OPERATOR_REPORTED_SUBMITTED</ActionButton></>
            : <small>Seller/operator thực hiện submit thủ công và ghi nhận kết quả.</small>}
        </div>}
        {item.status === 'OPERATOR_REPORTED_SUBMITTED' && <div style={{ marginTop: 9, padding: 8, background: '#dcfce7', color: '#166534', borderRadius: 8 }}>
          <b>OPERATOR_REPORTED_SUBMITTED</b> · {item.operatorExternalReference} · {item.operatorReportedAt}<br />Chỉ là báo cáo của operator; chưa xác nhận listing đã accept/live.
        </div>}
      </div>)}
    </Step>
  </div>;
}
