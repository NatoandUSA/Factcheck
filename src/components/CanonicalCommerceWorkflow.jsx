import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const CORE_FACT_FIELDS = [
  ['productName', 'Tên sản phẩm', true], ['productType', 'Loại sản phẩm', true],
  ['category', 'Danh mục'], ['materials', 'Chất liệu'], ['colors', 'Màu sắc'], ['sizes', 'Kích thước'],
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
  const [kind, setKind] = useState(marketplace === 'AMAZON' ? 'AMAZON_XRAY' : 'ETSY_SEARCH');
  const [filePreviews, setFilePreviews] = useState([]);
  const [selectedImports, setSelectedImports] = useState([]);
  const [language, setLanguage] = useState('AUTO');
  const [intelligencePreview, setIntelligencePreview] = useState(null);
  const [decisionPreview, setDecisionPreview] = useState(null);
  const [batchNumber, setBatchNumber] = useState(1);
  const [cerebroImportId, setCerebroImportId] = useState('');
  const [maxBatches, setMaxBatches] = useState(2);
  const [selectedAsins, setSelectedAsins] = useState([]);
  const [selectedEtsyEntities, setSelectedEtsyEntities] = useState([]);
  const [draft, setDraft] = useState(null);
  const [listingQueue, setListingQueue] = useState([]);
  const [reviewReason, setReviewReason] = useState('');
  const [reviewPackages, setReviewPackages] = useState({});
  const [submissionRequestNotes, setSubmissionRequestNotes] = useState('');
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [externalReference, setExternalReference] = useState('');
  const [submissionConfirmed, setSubmissionConfirmed] = useState(false);
  const [policyContext, setPolicyContext] = useState(null);
  const [policyClassification, setPolicyClassification] = useState('CUSTOM_NECKLACE');
  const [policyLocale, setPolicyLocale] = useState('en-US');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const currentTruth = truthRevisions.find(item => Number(item.id) === Number(head(state, 'productTruthRevisionId'))) || truthRevisions[0];
  const isManager = ['OWNER', 'MANAGER'].includes(user?.role);
  const isOwner = user?.role === 'OWNER';
  const isSeller = user?.role === 'SELLER';
  const imports = state?.imports || [];
  const latestIntelligence = state?.intelligenceSnapshots?.[0];

  const notify = (message, type = 'success') => onShowToast?.(message, type);
  const reportError = errorValue => {
    const blocking = Array.isArray(errorValue?.payload?.blocking) ? errorValue.payload.blocking : [];
    const claimSummary = [...new Set(blocking.map(item => `${item.field}: “${item.token}”`))].slice(0, 6).join('; ');
    const message = errorValue?.code === 'UNVERIFIED_OUTPUT_CLAIM' && claimSummary
      ? `Draft có claim chưa được Product Truth chứng thực — ${claimSummary}`
      : errorValue?.code === 'CEREBRO_KEYWORDS_REQUIRED'
        ? 'Cần hoàn tất Xray → ASIN batches → import và gắn Cerebro cho từng batch trước khi phân bổ keyword.'
        : errorValue?.message || 'UNKNOWN_ERROR';
    setError(message);
    notify(`Không thể hoàn tất: ${message}`, 'error');
  };

  const refresh = async () => {
    if (!projectId) return;
    const [commerce, workflow, truth, listings] = await Promise.all([
      api(`/api/projects/${projectId}/commerce-state`),
      api(`/api/projects/${projectId}/marketplace-workflow`),
      api(`/api/projects/${projectId}/product-truth/revisions`),
      api(`/api/projects/${projectId}/listings`)
    ]);
    setState(commerce);
    setWorkflowState(workflow);
    if (marketplace === 'AMAZON') setSelectedAsins(previous => previous.length ? previous
      : (workflow.heads?.AMAZON_ASIN_BATCH_PLAN?.payload?.batches || []).flatMap(batch => batch.asins));
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
    setFiles([]); setFilePreviews([]); setIntelligencePreview(null); setDraft(null); setError('');
    setListingSource(''); setListingHtmlFile(null); setSameSourceConfirmed(false); setListingFactPreview(null);
    setKind(marketplace === 'AMAZON' ? 'AMAZON_XRAY' : 'ETSY_SEARCH');
    setDecisionPreview(null); setBatchNumber(1); setCerebroImportId(''); setMaxBatches(2); setSelectedAsins([]); setSelectedEtsyEntities([]);
    setPolicyContext(activeProject ? {
      locale: activeProject.locale, media_class: activeProject.media_class,
      product_type_id: activeProject.product_type_id, category_id: activeProject.category_id,
      product_family_version: activeProject.product_family_version
    } : null);
    setPolicyLocale(activeProject?.locale || (/\b(para|hija|regalo|collar)\b/i.test(activeProject?.seed_phrase || '') ? 'es-US' : 'en-US'));
    if (projectId) refresh().catch(reportError); else { setState(null); setWorkflowState(null); setTruthRevisions([]); setListingQueue([]); }
  }, [projectId, marketplace]);

  const run = async (label, operation) => {
    setBusy(label); setError('');
    try { return await operation(); } catch (caught) { reportError(caught); return null; } finally { setBusy(''); }
  };

  const chooseFiles = (nextKind, fileList) => {
    setKind(nextKind);
    setFiles(Array.from(fileList || []));
    setFilePreviews([]);
  };

  const upload = async confirm => run(confirm ? 'import' : 'preview-file', async () => {
    if (!files.length) throw new Error('Hãy chọn ít nhất một file trước.');
    const results = [];
    for (const researchFile of files) {
      const form = new FormData(); form.append('kind', kind);
      if (confirm) form.append('idempotencyKey', uuid());
      form.append('researchFile', researchFile);
      results.push(await api(`/api/projects/${projectId}/research-imports${confirm ? '' : '/preview'}`, { method: 'POST', body: form }));
    }
    setFilePreviews(results);
    if (confirm) {
      notify(`Đã lưu ${results.length} file nguồn trong một thao tác; từng file có raw hash riêng.`);
      await refresh();
      setSelectedImports(previous => [...new Set([...previous, ...results.map(result => result.researchImportId)])]);
    }
    return results;
  });

  const createResearchSnapshot = () => run('snapshot', async () => {
    if (!selectedImports.length) throw new Error('Chọn ít nhất một file nguồn.');
    const result = await api(`/api/projects/${projectId}/research-snapshots`, jsonOptions({
      expectedHeadResearchSnapshotId: head(state, 'researchSnapshotId'), importIds: selectedImports,
      idempotencyKey: uuid(), changeReason: 'STAFF_SELECTED_RESEARCH_INPUTS'
    }));
    notify(`Đã khóa Research Snapshot #${result.researchSnapshotId}.`); await refresh();
  });

  const buildAmazonBatches = confirm => run(confirm ? 'confirm-batches' : 'preview-batches', async () => {
    const xrays = imports.filter(item => item.kind === 'AMAZON_XRAY' && selectedImports.includes(item.id));
    if (!xrays.length) throw new Error('Hãy import và chọn ít nhất một file Xray trước để chọn ASIN cạnh tranh.');
    const body = { xrayImportIds: xrays.map(item => item.id), maxBatches, ...(selectedAsins.length ? { selectedAsins } : {}) };
    if (confirm) Object.assign(body, { expectedHeadArtifactId: workflowState?.heads?.AMAZON_ASIN_BATCH_PLAN?.id || null,
      idempotencyKey: uuid(), changeReason: 'STAFF_CONFIRMED_ASIN_BATCH_PLAN' });
    const result = await api(`/api/projects/${projectId}/amazon/asin-batches${confirm ? '' : '/preview'}`, jsonOptions(body));
    setDecisionPreview(result);
    if (!confirm && !selectedAsins.length) setSelectedAsins(result.payload?.batches?.flatMap(batch => batch.asins) || []);
    if (confirm) { notify(`Đã khóa kế hoạch ASIN batch #${result.id}.`); await refresh(); }
  });

  const bindCerebro = () => run('bind-cerebro', async () => {
    const plan = workflowState?.heads?.AMAZON_ASIN_BATCH_PLAN;
    const cerebro = imports.find(item => item.kind === 'AMAZON_CEREBRO' && Number(item.id) === Number(cerebroImportId));
    if (!plan || !cerebro) throw new Error('Cần kế hoạch ASIN batch đã khóa và file Cerebro đã import.');
    const result = await api(`/api/projects/${projectId}/amazon/cerebro-bindings`, jsonOptions({
      asinBatchArtifactId: plan.id, batchNumber: Number(batchNumber), cerebroImportId: cerebro.id,
      expectedHeadArtifactId: workflowState?.heads?.AMAZON_CEREBRO_BINDING?.id || null,
      idempotencyKey: uuid(), changeReason: `STAFF_BOUND_CEREBRO_BATCH_${batchNumber}`
    }));
    notify(`Đã chứng minh Cerebro #${cerebro.id} thuộc batch ${batchNumber}; khớp ${result.accounting.matchedAsinCount} ASIN.`);
    setCerebroImportId('');
    await refresh();
  });

  const buildAmazonMaster = () => run('amazon-master', async () => {
    const researchSnapshotId = head(state, 'researchSnapshotId');
    const plan = workflowState?.heads?.AMAZON_ASIN_BATCH_PLAN;
    const bindings = (workflowState?.artifacts || []).filter(item => item.kind === 'AMAZON_CEREBRO_BINDING'
      && item.dependencies?.asinBatchArtifactId === plan?.id);
    if (!researchSnapshotId || !plan || !bindings.length) throw new Error('Cần Research Snapshot, ASIN batch và ít nhất một Cerebro binding.');
    const result = await api(`/api/projects/${projectId}/amazon/master-keywords`, jsonOptions({
      researchSnapshotId, asinBatchArtifactId: plan.id, cerebroBindingArtifactIds: bindings.map(item => item.id),
      expectedHeadArtifactId: workflowState?.heads?.AMAZON_MASTER_KEYWORDS?.id || null,
      idempotencyKey: uuid(), changeReason: 'STAFF_LOCKED_AMAZON_MASTER_KEYWORDS'
    }));
    notify(`Đã khóa Amazon Master KW #${result.id}: ${result.accounting.masterKeywordCount} keyword, không mất dòng.`);
    await refresh();
  });

  const buildEtsyWinners = confirm => run(confirm ? 'confirm-winners' : 'preview-winners', async () => {
    const researchSnapshotId = head(state, 'researchSnapshotId');
    if (!researchSnapshotId) throw new Error('Hãy khóa Search Evidence Snapshot trước.');
    const body = { researchSnapshotId, winnerCount: 8,
      ...(selectedEtsyEntities.length ? { selectedEntityKeys: selectedEtsyEntities } : {}) };
    if (confirm) Object.assign(body, { expectedHeadArtifactId: workflowState?.heads?.ETSY_WINNER_SET?.id || null,
      idempotencyKey: uuid(), changeReason: 'STAFF_CONFIRMED_ETSY_WINNERS' });
    const result = await api(`/api/projects/${projectId}/etsy/winners${confirm ? '' : '/preview'}`, jsonOptions(body));
    setDecisionPreview(result);
    if (!confirm && !selectedEtsyEntities.length) setSelectedEtsyEntities(result.payload?.winners?.map(item => item.entityKey) || []);
    if (confirm) { notify(`Đã khóa ${result.accounting.winnerCount} Etsy winners ở artifact #${result.id}.`); await refresh(); }
  });

  const buildEtsyPatterns = () => run('etsy-patterns', async () => {
    const winners = workflowState?.heads?.ETSY_WINNER_SET;
    if (!winners) throw new Error('Hãy xác nhận Winner Set trước.');
    const result = await api(`/api/projects/${projectId}/etsy/patterns`, jsonOptions({ winnerSetArtifactId: winners.id,
      expectedHeadArtifactId: workflowState?.heads?.ETSY_PATTERN_SNAPSHOT?.id || null,
      idempotencyKey: uuid(), changeReason: 'STAFF_LOCKED_ETSY_PATTERNS' }));
    notify(`Đã khóa Pattern Snapshot #${result.id}.`); await refresh();
  });

  const buildEtsyMaster = () => run('etsy-master', async () => {
    const winners = workflowState?.heads?.ETSY_WINNER_SET; const patterns = workflowState?.heads?.ETSY_PATTERN_SNAPSHOT;
    const researchSnapshotId = head(state, 'researchSnapshotId');
    if (!researchSnapshotId || !winners || !patterns) throw new Error('Cần Search Evidence, Winner Set và Pattern Snapshot.');
    const result = await api(`/api/projects/${projectId}/etsy/master-keywords`, jsonOptions({ researchSnapshotId,
      winnerSetArtifactId: winners.id, patternArtifactId: patterns.id,
      expectedHeadArtifactId: workflowState?.heads?.ETSY_MASTER_KEYWORDS?.id || null,
      idempotencyKey: uuid(), changeReason: 'STAFF_LOCKED_ETSY_MASTER_KEYWORDS' }));
    notify(`Đã khóa Etsy Master KW #${result.id}: ${result.accounting.masterKeywordCount} cụm.`); await refresh();
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
    const master = marketplace === 'AMAZON' ? workflowState?.heads?.AMAZON_MASTER_KEYWORDS : workflowState?.heads?.ETSY_MASTER_KEYWORDS;
    if (!master) throw new Error('Cần khóa Master Keyword Snapshot trước khi phân bổ vào listing.');
    const body = { researchSnapshotId, productTruthRevisionId, masterKeywordArtifactId: master.id, listingLanguage: language };
    if (confirm) Object.assign(body, { expectedHeadIntelligenceSnapshotId: head(state, 'intelligenceSnapshotId'), idempotencyKey: uuid(), changeReason: 'STAFF_COMMERCE_ANALYSIS' });
    const result = await api(`/api/projects/${projectId}/intelligence-snapshots${confirm ? '' : '/preview'}`, jsonOptions(body));
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

  const requestSubmission = listingId => run('submission-request', async () => {
    if (!submissionRequestNotes.trim()) throw new Error('Seller cần ghi chú yêu cầu submit.');
    const result = await api(`/api/listings/${listingId}/submission-requests`, jsonOptions({
      notes: submissionRequestNotes.trim(), idempotencyKey: uuid()
    }));
    notify(`Đã tạo yêu cầu submit #${result.submissionRequestId}; Owner phải xác nhận exact package.`);
    setSubmissionRequestNotes(''); await refresh(); return result;
  });

  const recordSubmission = listingId => run('submission-handoff', async () => {
    if (!submissionConfirmed) throw new Error('Chỉ xác nhận sau khi Seller đã thực sự submit bên ngoài OmniSeller.');
    if (!submissionNotes.trim()) throw new Error('Cần ghi chú bàn giao submission.');
    const result = await api(`/api/listings/${listingId}/submission-handoffs`, jsonOptions({
      submissionRequestId: listingQueue.find(item => item.id === listingId)?.submissionRequestId,
      confirmedExternalSubmission: true, externalReference: externalReference.trim(),
      notes: submissionNotes.trim(), idempotencyKey: uuid()
    }));
    notify(`Đã ghi nhận listing #${listingId} là SUBMITTED; OmniSeller không tự đăng lên sàn.`);
    setSubmissionConfirmed(false); setSubmissionNotes(''); setExternalReference(''); await refresh(); return result;
  });

  const previewOutput = intelligencePreview?.output;
  const listing = draft?.content;
  const prompts = listing?.imagePrompts?.prompts || listing?.imagePrompts || [];
  const amazonBatchView = marketplace === 'AMAZON' && decisionPreview?.payload?.batches
    ? decisionPreview : workflowState?.heads?.AMAZON_ASIN_BATCH_PLAN;
  const etsyWinnerView = marketplace === 'ETSY' && decisionPreview?.payload?.winners
    ? decisionPreview : workflowState?.heads?.ETSY_WINNER_SET;
  const requiredKinds = marketplace === 'AMAZON' ? ['AMAZON_XRAY','AMAZON_CEREBRO'] : ['ETSY_SEARCH'];
  const importedKinds = new Set(imports.map(item => item.kind));
  const importCoverageReady = requiredKinds.every(required => importedKinds.has(required));
  const researchReady = Boolean(head(state, 'researchSnapshotId'));
  const amazonPlanReady = Boolean(workflowState?.heads?.AMAZON_ASIN_BATCH_PLAN);
  const amazonBindingReady = Boolean(workflowState?.heads?.AMAZON_CEREBRO_BINDING);
  const amazonPlan = workflowState?.heads?.AMAZON_ASIN_BATCH_PLAN;
  const amazonBindings = (workflowState?.artifacts || []).filter(item => item.kind === 'AMAZON_CEREBRO_BINDING'
    && item.dependencies?.asinBatchArtifactId === amazonPlan?.id);
  const boundAmazonBatches = new Set(amazonBindings.map(item => Number(item.payload?.batchNumber)));
  const amazonAllBindingsReady = Boolean(amazonPlan) && (amazonPlan.payload?.batches || []).every(batch => boundAmazonBatches.has(Number(batch.batchNumber)));
  const etsyWinnersReady = Boolean(workflowState?.heads?.ETSY_WINNER_SET);
  const etsyPatternsReady = Boolean(workflowState?.heads?.ETSY_PATTERN_SNAPSHOT);
  const masterKeyword = marketplace === 'AMAZON' ? workflowState?.heads?.AMAZON_MASTER_KEYWORDS : workflowState?.heads?.ETSY_MASTER_KEYWORDS;
  const masterReady = Boolean(masterKeyword);
  const truthReady = Boolean(head(state, 'productTruthRevisionId'));
  const intelligenceReady = Boolean(head(state, 'intelligenceSnapshotId'));
  const policyReady = ['locale', 'media_class', 'product_type_id', 'category_id', 'product_family_version']
    .every(field => String(policyContext?.[field] || '').trim());
  const nextAction = !policyReady
    ? 'Bước 0B: xác nhận loại sản phẩm và ngôn ngữ cho project cũ'
    : marketplace === 'AMAZON' && !importedKinds.has('AMAZON_XRAY')
      ? 'Amazon 1: import Xray từ seed'
      : marketplace === 'AMAZON' && !amazonPlanReady
        ? 'Amazon 2: preview và xác nhận các batch ASIN (tối đa 10 ASIN/batch)'
        : marketplace === 'AMAZON' && !importedKinds.has('AMAZON_CEREBRO')
          ? 'Amazon 3: chạy từng batch trên Helium 10 rồi import Cerebro'
          : marketplace === 'AMAZON' && !amazonAllBindingsReady
            ? 'Amazon 4: gắn một file Cerebro cho từng batch ASIN còn thiếu'
    : !importCoverageReady
    ? `Bước 1A: chọn và preview ${marketplace === 'AMAZON' ? 'Xray/Cerebro' : 'CSV Etsy Search Evidence'}`
    : !researchReady
      ? 'Bước 1C: chọn nguồn đã import và khóa Research Snapshot'
      : marketplace === 'ETSY' && !etsyWinnersReady
        ? 'Etsy 3: preview và xác nhận 5–10 winners'
        : marketplace === 'ETSY' && !etsyPatternsReady
          ? 'Etsy 4: chạy Pattern Miner và khóa pattern'
          : !masterReady
            ? `${marketplace} 5: khóa Master Keyword Snapshot (không mất keyword)`
      : !truthReady
        ? 'Bước 2: nhập tối thiểu tên/loại sản phẩm rồi lưu Product Truth'
        : !intelligenceReady
          ? (intelligencePreview?.zeroWrite ? 'Bước 3B: khóa Intelligence Snapshot' : 'Bước 3A: chạy preview phân bổ keyword')
          : !draft?.content
            ? 'Bước 4A: tạo draft zero-write'
            : 'Bước 4B: đọc/sửa draft rồi lưu ở NEEDS_QA';

  if (!activeProject) return null;

  return <div data-testid={`canonical-commerce-${marketplace.toLowerCase()}`} style={{ border: `2px solid ${accent}`, borderRadius: 16, padding: 18, background: '#f8fafc', display: 'grid', gap: 14 }}>
    <div>
      <h2 style={{ margin: 0, color: accent }}>Luồng Staff Canonical — {marketplace} US</h2>
      <p style={{ margin: '6px 0 0', color: '#475569' }}>{marketplace === 'AMAZON'
        ? 'Seed → Xray → ASIN batches → Cerebro → Master KW → Product Truth → Listing/A+/Prompts.'
        : 'Seed → Search Evidence → Winners → Pattern Miner → Master KW → Product Truth → Title/Description/13 explained tags.'} Luồng dừng ở <b>NEEDS_QA</b>, không tự đăng.</p>
      <div data-testid="canonical-next-action" style={{ marginTop: 10, padding: '10px 12px', borderRadius: 9, background: '#ecfeff', border: '1px solid #67e8f9', color: '#164e63', fontWeight: 800 }}>
        Việc cần làm tiếp: {nextAction}
        <div style={{ marginTop: 4, fontSize: '.72rem', fontWeight: 600 }}>
          Research #{head(state, 'researchSnapshotId') || 'chưa có'} · Master KW #{masterKeyword?.id || 'chưa có'} · Product Truth #{head(state, 'productTruthRevisionId') || 'chưa có'} · Intelligence #{head(state, 'intelligenceSnapshotId') || 'chưa có'}
        </div>
      </div>
      {activeProject?.state === 'EVIDENCE_INTAKE' && <div style={{ marginTop: 8, padding: 9, borderRadius: 8, background: '#dcfce7', color: '#166534', fontSize: '.8rem', fontWeight: 800 }}>
        Project đang mang trạng thái legacy EVIDENCE_INTAKE, nhưng trạng thái này không chặn luồng R3 bên dưới. Staff có thể nhập Product Truth và import research ngay trong project hiện tại.
      </div>}
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

    <Step number="1" title={marketplace === 'AMAZON' ? 'Seed → Xray → ASIN batches → Cerebro → Master KW' : 'Seed → Search Evidence → Winners → Pattern Miner → Master KW'} accent={accent} done={masterReady}>
      {marketplace === 'AMAZON' && <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: '#eff6ff', color: '#1e3a8a', fontSize: '.8rem' }}>
        <b>Luồng Amazon bắt buộc:</b> nhập seed → import Xray → xác nhận batch tối đa 10 ASIN → chạy batch trên Helium 10 → import và gắn Cerebro với batch → khóa Master KW.
        Product Truth là lane độc lập và chỉ gặp research khi tạo intelligence.
      </div>}
      {marketplace === 'ETSY' && <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: '#fff7ed', color: '#7c2d12', fontSize: '.8rem' }}>
        <b>Luồng Etsy:</b> có thể chọn nhiều CSV/HTML cho cùng seed trong một lần. Hệ thống hợp nhất listing theo listing ID, chấm winners, khai thác pattern rồi mới tạo Master KW. 13 tags chỉ được tạo sau Product Truth và mỗi tag phải có lý do.
      </div>}
      <div style={{ padding: 11, border: `1px solid ${marketplace === 'AMAZON' ? '#93c5fd' : '#fdba74'}`, borderRadius: 9, background: '#fff' }}>
        <b>{marketplace === 'AMAZON' ? '1. Upload Xray từ seed — trước khi tạo batch' : '1. Upload Search Evidence — CSV hoặc trang HTML đã lưu'}</b>
        <div style={{ margin: '5px 0 8px', fontSize: '.76rem', color: '#475569' }}>
          Chọn một hoặc nhiều file cùng lúc. Sau này vẫn có thể bổ sung thêm; mỗi file được lưu riêng với hash và accounting riêng.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <input aria-label={marketplace === 'AMAZON' ? 'File Xray' : 'File Etsy Search Evidence'} type="file" multiple
            accept={marketplace === 'AMAZON' ? '.xlsx,.csv' : '.csv,.html,.htm,text/csv,text/html'}
            onChange={event => chooseFiles(marketplace === 'AMAZON' ? 'AMAZON_XRAY' : 'ETSY_SEARCH', event.target.files)} />
          <ActionButton accent={accent} disabled={!files.length || kind !== (marketplace === 'AMAZON' ? 'AMAZON_XRAY' : 'ETSY_SEARCH') || busy} onClick={() => upload(false)}>Preview {files.length || ''} file zero-write</ActionButton>
          <ActionButton accent={accent} disabled={!filePreviews.length || filePreviews.length !== files.length || kind !== (marketplace === 'AMAZON' ? 'AMAZON_XRAY' : 'ETSY_SEARCH') || busy} onClick={() => upload(true)}>Xác nhận import cả nhóm</ActionButton>
        </div>
      </div>
      {marketplace === 'AMAZON' && amazonPlanReady && <div style={{ marginTop: 10, padding: 11, border: '1px solid #60a5fa', borderRadius: 9, background: '#eff6ff' }}>
        <b>3. Upload Cerebro sau khi đã chạy từng ASIN batch trên Helium 10</b>
        <div style={{ margin: '5px 0 8px', fontSize: '.76rem', color: '#1e3a8a' }}>Chọn nhiều file Cerebro cùng lúc nếu đã chạy nhiều batch. Bước 4 bên dưới sẽ buộc chọn đúng file cho từng batch; Xray và Cerebro không còn nằm chung một ô.</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <input aria-label="File Cerebro" type="file" multiple accept=".xlsx,.csv" onChange={event => chooseFiles('AMAZON_CEREBRO', event.target.files)} />
          <ActionButton accent={accent} disabled={!files.length || kind !== 'AMAZON_CEREBRO' || busy} onClick={() => upload(false)}>Preview {files.length || ''} Cerebro</ActionButton>
          <ActionButton accent={accent} disabled={!filePreviews.length || filePreviews.length !== files.length || kind !== 'AMAZON_CEREBRO' || busy} onClick={() => upload(true)}>Import cả nhóm Cerebro</ActionButton>
        </div>
      </div>}
      {filePreviews.length > 0 && <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        {filePreviews.map(filePreview => <div key={`${filePreview.fileName}-${filePreview.rawHash}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
          <Metric label="FILE" value={filePreview.fileName} /><Metric label="RAW SHA-256" value={filePreview.rawHash} />
          <Metric label="ROWS" value={filePreview.accounting?.sourceRowCount ?? filePreview.accounting?.inputRowCount} />
          <Metric label="UNCONSUMED" value={filePreview.accounting?.unconsumedRowCount ?? 0} />
        </div>)}
      </div>}
      {marketplace === 'AMAZON' && filePreviews.some(item => item.asinSelection?.batches?.length > 0) && <div style={{ marginTop: 12, border: '1px solid #93c5fd', borderRadius: 9, padding: 10, background: '#fff' }}>
        <b>Preview Xray — chưa phải quyết định đã lưu</b>
        <div style={{ fontSize: '.76rem', color: '#475569', marginTop: 3 }}>Preview nhanh theo từng file; quyết định batch chính thức sẽ hợp nhất và khử trùng ASIN từ mọi Xray đã chọn.</div>
        {filePreviews.flatMap((preview, fileIndex) => (preview.asinSelection?.batches || []).map(batch => <div key={`${fileIndex}-${batch.batchNumber}`} style={{ marginTop: 8, padding: 8, borderRadius: 7, background: '#f8fafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>Batch {batch.batchNumber} ({batch.size})</b>
            <button type="button" onClick={() => navigator.clipboard?.writeText(batch.cerebroInput)}>Copy ASIN</button></div>
          <code style={{ display: 'block', marginTop: 4, overflowWrap: 'anywhere' }}>{batch.cerebroInput}</code>
        </div>))}
      </div>}
      {imports.length > 0 && <div style={{ marginTop: 12 }}><b>File đã lưu — chọn nguồn cho snapshot:</b>
        {imports.map(item => <label key={item.id} style={{ display: 'block', marginTop: 6 }}>
          <input type="checkbox" checked={selectedImports.includes(item.id)} onChange={() => setSelectedImports(previous => previous.includes(item.id) ? previous.filter(id => id !== item.id) : [...previous, item.id])} />
          {' '}#{item.id} {item.kind} · {item.file_name} · {item.byte_length} bytes · {item.raw_hash.slice(0, 12)}…
        </label>)}
        <div style={{ marginTop: 10 }}><ActionButton accent={accent} disabled={!selectedImports.length || !importCoverageReady || (marketplace === 'AMAZON' && !amazonAllBindingsReady) || busy} onClick={createResearchSnapshot}>
          {marketplace === 'AMAZON' ? '4B. Khóa Xray + Cerebro Research Snapshot' : '2. Khóa Search Evidence Snapshot'}
        </ActionButton></div>
      </div>}
      {marketplace === 'AMAZON' && importedKinds.has('AMAZON_XRAY') && <div style={{ marginTop: 12, padding: 11, border: '1px solid #93c5fd', borderRadius: 9, background: '#eff6ff' }}>
        <b>2. Quyết định ASIN batches</b>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <label>Số batch {' '}<select aria-label="Số ASIN batch" value={maxBatches} onChange={event => { setMaxBatches(Number(event.target.value)); setDecisionPreview(null); }}>
            <option value={1}>1 (10 ASIN)</option><option value={2}>2 (20 ASIN)</option><option value={3}>3 (30 ASIN)</option>
          </select></label>
          <ActionButton accent={accent} disabled={busy} onClick={() => buildAmazonBatches(false)}>2A. Preview batch</ActionButton>
          <ActionButton accent="#166534" disabled={!decisionPreview?.zeroWrite || !decisionPreview?.payload?.batches || busy} onClick={() => buildAmazonBatches(true)}>2B. Xác nhận batch</ActionButton>
          <span style={{ alignSelf: 'center' }}>Staff chọn {selectedAsins.length}/{maxBatches * 10} ASIN</span>
        </div>
        {(amazonBatchView?.payload?.candidatePool || []).length > 0 && <details style={{ marginTop: 8 }} open={!amazonPlanReady}>
          <summary><b>Chọn ASIN từ toàn bộ Xray ({amazonBatchView.payload.candidatePool.length})</b></summary>
          <div style={{ maxHeight: 280, overflowY: 'auto', marginTop: 6 }}>
            {amazonBatchView.payload.candidatePool.map(item => <label key={item.asin} style={{ display: 'grid', gridTemplateColumns: '22px 105px 1fr', gap: 6, padding: '5px 0', borderBottom: '1px solid #dbeafe' }}>
              <input type="checkbox" checked={selectedAsins.includes(item.asin)} disabled={!selectedAsins.includes(item.asin) && selectedAsins.length >= maxBatches * 10}
                onChange={() => { setSelectedAsins(previous => previous.includes(item.asin) ? previous.filter(asin => asin !== item.asin) : [...previous, item.asin]); setDecisionPreview(null); }} />
              <code>{item.asin}</code><span>{item.title} · {item.brand || 'unknown brand'} · sales {item.asinSales ?? 'unknown'}</span>
            </label>)}
          </div>
          <small>Thay đổi lựa chọn rồi bấm Preview batch lần nữa. Chỉ ASIN có trong file Xray mới được chấp nhận.</small>
        </details>}
        {amazonBatchView?.payload?.batches?.map(batch => <div key={batch.batchNumber} style={{ marginTop: 8, padding: 8, background: '#fff', borderRadius: 7 }}>
          <b>Batch {batch.batchNumber} · {batch.size} ASIN {amazonBatchView.id ? `· artifact #${amazonBatchView.id}` : '· preview'}</b>
          <button type="button" style={{ marginLeft: 8 }} onClick={() => navigator.clipboard?.writeText(batch.cerebroInput)}>Copy ASIN</button>
          <code style={{ display: 'block', marginTop: 4, overflowWrap: 'anywhere' }}>{batch.cerebroInput}</code>
        </div>)}
      </div>}
      {marketplace === 'AMAZON' && amazonPlanReady && importedKinds.has('AMAZON_CEREBRO') && <div style={{ marginTop: 12, padding: 11, border: '1px solid #93c5fd', borderRadius: 9, background: '#fff' }}>
        <b>4. Chứng minh file Cerebro thuộc batch nào</b>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          <label>Batch {' '}<select value={batchNumber} onChange={event => setBatchNumber(Number(event.target.value))}>
            {(workflowState?.heads?.AMAZON_ASIN_BATCH_PLAN?.payload?.batches || []).map(batch => <option key={batch.batchNumber} value={batch.batchNumber}>{batch.batchNumber} ({batch.size} ASIN)</option>)}
          </select></label>
          <label>File Cerebro {' '}<select aria-label="Chọn file Cerebro cho batch" value={cerebroImportId} onChange={event => setCerebroImportId(event.target.value)}>
            <option value="">— chọn đúng file đã chạy từ batch này —</option>
            {imports.filter(item => item.kind === 'AMAZON_CEREBRO').map(item => <option key={item.id} value={item.id}>#{item.id} · {item.file_name}</option>)}
          </select></label>
          <ActionButton accent={accent} disabled={!cerebroImportId || busy} onClick={bindCerebro}>4A. Kiểm ASIN và gắn file với batch</ActionButton>
        </div>
        {amazonBindingReady && <div style={{ marginTop: 6, color: amazonAllBindingsReady ? '#166534' : '#b45309' }}>Đã gắn {boundAmazonBatches.size}/{amazonPlan.payload.batches.length} batch. Binding mới nhất #{workflowState.heads.AMAZON_CEREBRO_BINDING.id}: khớp {workflowState.heads.AMAZON_CEREBRO_BINDING.accounting.matchedAsinCount} ASIN.</div>}
      </div>}
      {marketplace === 'AMAZON' && researchReady && amazonAllBindingsReady && <div style={{ marginTop: 12 }}>
        <ActionButton accent="#166534" disabled={busy} onClick={buildAmazonMaster}>5. Khóa Amazon Master KW</ActionButton>
        {workflowState?.heads?.AMAZON_MASTER_KEYWORDS && <span style={{ marginLeft: 9 }}>#{workflowState.heads.AMAZON_MASTER_KEYWORDS.id} · {workflowState.heads.AMAZON_MASTER_KEYWORDS.accounting.masterKeywordCount} keyword · dropped 0</span>}
      </div>}
      {marketplace === 'ETSY' && researchReady && <div style={{ marginTop: 12, padding: 11, border: '1px solid #fdba74', borderRadius: 9, background: '#fff7ed' }}>
        <b>3. Winner Set (5–10 listing)</b>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <ActionButton accent={accent} disabled={busy} onClick={() => buildEtsyWinners(false)}>3A. Preview winners</ActionButton>
          <ActionButton accent="#166534" disabled={!decisionPreview?.zeroWrite || !decisionPreview?.payload?.winners || busy} onClick={() => buildEtsyWinners(true)}>3B. Xác nhận winners</ActionButton>
        </div>
        {etsyWinnerView?.payload?.winners?.length > 0 && <div style={{ marginTop: 8 }}>
          <div><b>Staff chọn {selectedEtsyEntities.length}/5–10 winners từ toàn bộ Search Evidence</b></div>
          {[...(etsyWinnerView.payload.winners || []), ...(etsyWinnerView.payload.nonWinners || [])].map((winner, index) => <label key={winner.entityKey} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: 6, padding: '5px 0', borderTop: index ? '1px solid #fed7aa' : 0 }}>
            <input type="checkbox" checked={selectedEtsyEntities.includes(winner.entityKey)}
              disabled={!selectedEtsyEntities.includes(winner.entityKey) && selectedEtsyEntities.length >= 10}
              onChange={() => { setSelectedEtsyEntities(previous => previous.includes(winner.entityKey)
                ? previous.filter(key => key !== winner.entityKey) : [...previous, winner.entityKey]); setDecisionPreview(null); }} />
            <span><b>{winner.title}</b> · {winner.shopName || 'unknown shop'} · score {winner.score?.toFixed?.(2) ?? winner.score}</span>
          </label>)}
          <small>Thay đổi lựa chọn rồi bấm Preview winners lần nữa; chỉ listing có trong Search Evidence mới được chấp nhận.</small>
        </div>}
      </div>}
      {marketplace === 'ETSY' && etsyWinnersReady && <div style={{ marginTop: 12, display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
        <ActionButton accent={accent} disabled={busy} onClick={buildEtsyPatterns}>4. Chạy và khóa Pattern Miner</ActionButton>
        {etsyPatternsReady && <span>Pattern #{workflowState.heads.ETSY_PATTERN_SNAPSHOT.id} · {workflowState.heads.ETSY_PATTERN_SNAPSHOT.accounting.titleTokenCount} title token</span>}
        {etsyPatternsReady && <ActionButton accent="#166534" disabled={busy} onClick={buildEtsyMaster}>5. Khóa Etsy Master KW</ActionButton>}
        {workflowState?.heads?.ETSY_MASTER_KEYWORDS && <span>Master #{workflowState.heads.ETSY_MASTER_KEYWORDS.id} · {workflowState.heads.ETSY_MASTER_KEYWORDS.accounting.masterKeywordCount} cụm · dropped 0</span>}
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
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: '.8rem', fontWeight: 800 }}>Ngôn ngữ listing {' '}<select value={language} onChange={event => setLanguage(event.target.value)}><option value="AUTO">Theo keyword đầu vào</option><option value="EN">English</option><option value="ES">Español</option></select></label>
        <ActionButton accent={accent} disabled={!head(state, 'researchSnapshotId') || !masterReady || !head(state, 'productTruthRevisionId') || busy} onClick={() => analyze(false)}>3A. Preview zero-write</ActionButton>
        <ActionButton accent={accent} disabled={!intelligencePreview?.zeroWrite || busy} onClick={() => analyze(true)}>3B. Khóa Intelligence Snapshot</ActionButton>
      </div>
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
      {listing && <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
        {marketplace === 'AMAZON' ? <>
          <label><b>Amazon Title ({Array.from(listing.amazonTitle || '').length}/{previewOutput?.commerce?.title?.limit || 75} ký tự theo policy engine hiện tại)</b><textarea value={listing.amazonTitle || ''} onChange={event => updateDraft('amazonTitle', event.target.value)} rows={2} style={{ width: '100%' }} /></label>
          <label><b>5 Bullet Points — {(listing.amazonBullets || []).map((item, index) => `B${index + 1}: ${Array.from(item).length}/${previewOutput?.commerce?.bullets?.limit || 230}`).join(' · ')}</b><textarea value={(listing.amazonBullets || []).join('\n')} onChange={event => updateDraft('amazonBullets', event.target.value.split('\n').filter(Boolean))} rows={7} style={{ width: '100%' }} /></label>
          <label><b>Backend Search Terms ({new TextEncoder().encode(listing.amazonSearchTerms || '').length}/249 bytes)</b><textarea value={listing.amazonSearchTerms || ''} onChange={event => updateDraft('amazonSearchTerms', event.target.value)} rows={3} style={{ width: '100%' }} /></label>
          <small>Không lặp token đã có trong Title/Bullets/Description chỉ để lấp đủ 249 bytes. Mục tiêu là phủ tối đa keyword an toàn, độc nhất; keyword chưa đặt vẫn phải nằm trong PPC/blocked/accounting, không được biến mất.</small>
          <label><b>Description ({Array.from(listing.amazonDescription || '').length} ký tự)</b><textarea value={listing.amazonDescription || ''} onChange={event => updateDraft('amazonDescription', event.target.value)} rows={7} style={{ width: '100%' }} /></label>
          <label><b>Item Highlights ({Array.from(listing.itemHighlights || '').length}/{previewOutput?.commerce?.itemHighlights?.limit || 125})</b><textarea value={listing.itemHighlights || ''} onChange={event => updateDraft('itemHighlights', event.target.value)} rows={3} style={{ width: '100%' }} /></label>
          <label><b>Category</b><input value={listing.categoryName || ''} onChange={event => updateDraft('categoryName', event.target.value)} style={{ width: '100%' }} /></label>
          <label><b>Amazon A+ copy points — {(listing.amazonAPlusPoints || []).length} điểm / {(listing.amazonAPlusPoints || []).reduce((sum, item) => sum + Array.from(item).length, 0)} ký tự</b><textarea value={(listing.amazonAPlusPoints || []).join('\n')} onChange={event => updateDraft('amazonAPlusPoints', event.target.value.split('\n').map(item => item.trim()).filter(Boolean))} rows={5} style={{ width: '100%' }} /></label>
          <label><b>PPC targeting — có thể chứa keyword claim chưa xác minh, không phải copy hiển thị</b><textarea value={(listing.ppcKeywords || []).map(item => typeof item === 'string' ? item : item.phrase || '').join('\n')} onChange={event => updateDraft('ppcKeywords', event.target.value.split('\n').map(phrase => phrase.trim()).filter(Boolean))} rows={6} style={{ width: '100%' }} /></label>
          {previewOutput?.commerce && <details><summary><b>Keyword accounting của draft</b></summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: '.72rem' }}>{JSON.stringify({
            inputCorpus: previewOutput.commerce.keywordsUsed?.corpus,
            titlePhrases: previewOutput.commerce.keywordsUsed?.title,
            highlightPhrases: previewOutput.commerce.keywordsUsed?.highlights,
            backendUniqueTokens: previewOutput.commerce.keywordsUsed?.searchTermTokens,
            blocked: previewOutput.commerce.keywordsUsed?.blocked,
            review: previewOutput.commerce.keywordsUsed?.review,
            coverage: previewOutput.commerce.coverage
          }, null, 2)}</pre></details>}
        </> : <>
          <label><b>Etsy Title ({Array.from(listing.etsyTitle || '').length}/140)</b><textarea value={listing.etsyTitle || ''} onChange={event => updateDraft('etsyTitle', event.target.value)} rows={2} style={{ width: '100%' }} /></label>
          <label><b>13 Tags — mỗi dòng một tag</b><textarea value={(listing.etsyTags || []).join('\n')} onChange={event => updateDraft('etsyTags', event.target.value.split('\n').map(item => item.trim()).filter(Boolean).slice(0, 13))} rows={7} style={{ width: '100%' }} /></label>
          {(listing.etsyTagExplanations || []).length > 0 && <details><summary><b>Giải thích 13 tags</b></summary>
            {(listing.etsyTagExplanations || []).map(item => <div key={item.tag} style={{ padding: '6px 0', borderBottom: '1px solid #e2e8f0' }}><b>{item.tag}</b> — {item.reason}<br /><small>Nguồn: {item.sourcePhrase}</small></div>)}
          </details>}
          <label><b>Description ({Array.from(listing.etsyDescription || '').length} ký tự)</b><textarea value={listing.etsyDescription || ''} onChange={event => updateDraft('etsyDescription', event.target.value)} rows={7} style={{ width: '100%' }} /></label>
          <label><b>Item Highlights ({Array.from(listing.itemHighlights || '').length} ký tự)</b><textarea value={listing.itemHighlights || ''} onChange={event => updateDraft('itemHighlights', event.target.value)} rows={3} style={{ width: '100%' }} /></label>
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

    <Step number="5" title="Manager QA và bàn giao submission thủ công" accent={accent} done={listingQueue.some(item => item.status === 'SUBMITTED')}>
      <p style={{ marginTop: 0, color: '#475569' }}>Manager phải mở và đọc exact package trước khi duyệt. Seller chỉ tạo yêu cầu submit; Owner đối chiếu package, thực hiện/kiểm tra submission bên ngoài rồi mới ghi nhận <b>SUBMITTED</b>. OmniSeller không gọi API đăng sàn ở phase này.</p>
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
        {item.submittedAt && <div style={{ fontSize: '.78rem', color: '#166534' }}>Submitted: {item.submittedAt}{item.externalReference ? ` · Ref: ${item.externalReference}` : ''}</div>}
        {isManager && item.status !== 'SUBMITTED' && <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <ActionButton accent="#166534" disabled={!reviewReason.trim() || busy || !reviewPackages[item.id]?.approvalReadiness?.ready} onClick={() => reviewListing(item.id, 'APPROVED')}>Manager duyệt exact package</ActionButton>
          <ActionButton accent="#b45309" disabled={!reviewReason.trim() || busy || !reviewPackages[item.id]} onClick={() => reviewListing(item.id, 'CHANGES_REQUESTED')}>Yêu cầu sửa exact package</ActionButton>
        </div>}
        {item.status === 'MANAGER_APPROVED' && !item.submissionRequestId && isSeller && <div style={{ display: 'grid', gap: 7, marginTop: 10, borderTop: '1px solid #e2e8f0', paddingTop: 9 }}>
          <textarea rows={2} value={submissionRequestNotes} onChange={event => setSubmissionRequestNotes(event.target.value)} placeholder="Seller ghi chú yêu cầu Owner submit exact package này..." />
          <ActionButton accent="#0369a1" disabled={!submissionRequestNotes.trim() || busy} onClick={() => requestSubmission(item.id)}>Seller yêu cầu submit</ActionButton>
        </div>}
        {item.status === 'MANAGER_APPROVED' && !item.submissionRequestId && !isSeller && <div style={{ marginTop: 9, color: '#475569' }}>Đang chờ Seller quyết định và tạo yêu cầu submit exact package.</div>}
        {item.status === 'MANAGER_APPROVED' && item.submissionRequestId && <div style={{ display: 'grid', gap: 7, marginTop: 10, borderTop: '1px solid #e2e8f0', paddingTop: 9 }}>
          <div><b>Submission request #{item.submissionRequestId}</b> · package {item.submissionPackageHash}</div>
          {item.submissionRequestNotes && <div>{item.submissionRequestNotes}</div>}
          {isOwner && <>
          <input value={externalReference} onChange={event => setExternalReference(event.target.value)} placeholder="Marketplace reference / URL (nếu có)" />
          <textarea rows={2} value={submissionNotes} onChange={event => setSubmissionNotes(event.target.value)} placeholder="Ghi chú: đã submit ở đâu, lúc nào..." />
          <label><input type="checkbox" checked={submissionConfirmed} onChange={event => setSubmissionConfirmed(event.target.checked)} /> Tôi xác nhận đã thực sự submit listing này bên ngoài OmniSeller.</label>
          <ActionButton accent="#7c3aed" disabled={!submissionConfirmed || !submissionNotes.trim() || !externalReference.trim() || busy} onClick={() => recordSubmission(item.id)}>Owner ghi nhận SUBMITTED</ActionButton>
          </>}
          {!isOwner && <div style={{ color: '#7c3aed' }}>Đang chờ Owner đối chiếu exact package và bằng chứng marketplace.</div>}
        </div>}
      </div>)}
    </Step>
  </div>;
}
