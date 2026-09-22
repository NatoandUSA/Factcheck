import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

function uuid() {
  if (!globalThis.crypto?.randomUUID) throw new Error('SECURE_UUID_UNAVAILABLE');
  return globalThis.crypto.randomUUID();
}

async function readJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || body.error || `HTTP_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

const DISPOSITION_LABELS = Object.freeze({
  PROMOTE: 'Đủ điều kiện tạo Project',
  WATCH: 'Theo dõi thêm',
  NEEDS_EVIDENCE: 'Cần thêm dữ liệu',
  KILL: 'Không tiếp tục ở thời điểm này'
});

const REASON_LABELS = Object.freeze({
  COMMERCIAL_SIGNALS_NOT_PRESENT: 'Chưa có tín hiệu thương mại từ marketplace',
  POSITIVE_DEMAND_OR_SALES_SIGNAL_NOT_PRESENT: 'Chưa có tín hiệu nhu cầu/doanh số dương',
  SOCIAL_RESEARCH_CANNOT_REPLACE_MARKETPLACE_EVIDENCE: 'Tín hiệu social chỉ hỗ trợ nghiên cứu, chưa thay thế bằng chứng marketplace',
  COMMERCIAL_PROOF_ESTABLISHED: 'Đã có bằng chứng thương mại đủ điều kiện',
  COMPETITION_CONTEXT_PRESENT: 'Đã có dữ liệu bối cảnh cạnh tranh',
  OBSERVED_PUBLIC_SIGNAL_PRESENT: 'Đã có tín hiệu marketplace công khai được quan sát',
  CROSS_SOURCE_CORROBORATION_PRESENT: 'Có nhiều nguồn cùng xác nhận tín hiệu',
  PROMOTE_FOR_PROJECT_RESEARCH_NOT_AS_COMMERCIAL_PROOF: 'Được phép tạo Project để nghiên cứu tiếp, chưa coi là bằng chứng bán hàng hoàn chỉnh',
  POSITIVE_MARKET_SIGNAL_PRESENT: 'Có tín hiệu thị trường tích cực',
  COMPETITION_CONTEXT_REQUIRED_FOR_PROMOTE: 'Cần thêm dữ liệu cạnh tranh trước khi tạo Project',
  MORE_SOURCE_CORROBORATION_REQUIRED_FOR_PROMOTE: 'Cần thêm nguồn độc lập xác nhận',
  OBSERVED_PUBLIC_MARKETPLACE_EVIDENCE_REQUIRED_FOR_PROMOTE: 'Cần ít nhất một bằng chứng marketplace công khai',
  POSITIVE_OBSERVED_PUBLIC_MARKET_SIGNAL_REQUIRED_FOR_PROMOTE: 'Cần tín hiệu marketplace công khai có giá trị dương',
  COMMERCIAL_PROOF_NOT_PRESENT: 'Chưa có bằng chứng thương mại',
  COMMERCIAL_PROOF_NOT_ESTABLISHED: 'Bằng chứng thương mại chưa đủ chắc',
  COMPETITION_CONTEXT_NOT_PRESENT: 'Chưa có dữ liệu cạnh tranh',
  CROSS_SOURCE_CORROBORATION_NOT_PRESENT: 'Chưa có nhiều nguồn xác nhận',
  WHY_NOW_NOT_ESTABLISHED: 'Chưa có bằng chứng rõ vì sao cơ hội đáng làm ngay lúc này',
  OBSERVED_PUBLIC_MARKETPLACE_EVIDENCE_NOT_PRESENT: 'Chưa có bằng chứng marketplace công khai'
});

function reasonLabel(code) {
  return REASON_LABELS[code] || code;
}

export default function GlobalCandidatePanel({ marketplace, onPromoted, onRequireLogin, onShowToast }) {
  const { user, invalidateSession } = useAuth();
  const [state, setState] = useState({ loading: false, error: '', candidates: [] });
  const [projectNames, setProjectNames] = useState({});
  const [promotingId, setPromotingId] = useState(null);
  const [pullingIntel, setPullingIntel] = useState(false);
  const [researchFile, setResearchFile] = useState(null);
  const [researchPreview, setResearchPreview] = useState(null);
  const [researchBusy, setResearchBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user?.workspaceId) return setState({ loading: false, error: '', candidates: [] });
    setState(previous => ({ ...previous, loading: true, error: '' }));
    try {
      const body = await readJson(await fetch('/api/global-candidates/evaluations?limit=30', {
        credentials: 'include', cache: 'no-store'
      }));
      setState({ loading: false, error: '', candidates: body.candidates || [] });
    } catch (error) {
      if (error.status === 401) {
        invalidateSession();
        onRequireLogin?.();
      }
      setState({ loading: false, error: error.message, candidates: [] });
    }
  }, [user?.workspaceId, user?.marketplace, invalidateSession, onRequireLogin]);

  useEffect(() => { load(); }, [load]);

  const canPromote = ['OWNER', 'MANAGER'].includes(user?.role);
  const canPullIntel = user?.role === 'OWNER';

  const pullIntel = async () => {
    setPullingIntel(true);
    try {
      const pulled = await readJson(await fetch('/api/integrations/social-listening/handoffs/pull', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: uuid() })
      }));
      const handoffId = Number(pulled?.handoff?.id);
      if (!Number.isInteger(handoffId) || handoffId < 1) throw new Error('SOCIAL_HANDOFF_ID_MISSING');
      await readJson(await fetch(`/api/global-candidates/social-handoffs/${handoffId}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}'
      }));
      onShowToast?.(`Đã nhận tín hiệu Intel đã xác minh #${handoffId} vào danh sách cơ hội toàn cục.`, 'success');
      await load();
    } catch (error) {
      onShowToast?.(`Không thể nhận tín hiệu từ Intel: ${error.message}`, 'error');
      setState(previous => ({ ...previous, error: error.message }));
    } finally {
      setPullingIntel(false);
    }
  };

  const researchKind = marketplace === 'AMAZON' ? 'AMAZON_CEREBRO' : 'ETSY_SEARCH';
  const researchLabel = marketplace === 'AMAZON' ? 'Helium 10 Cerebro' : 'Etsy public search';

  const submitResearch = async confirm => {
    if (!researchFile) return onShowToast?.(`Hãy chọn 1 file ${researchLabel} trước.`, 'error');
    setResearchBusy(true);
    try {
      const form = new FormData(); form.append('kind', researchKind); form.append('researchFile', researchFile);
      const endpoint = `/api/global-candidates/research-imports${confirm ? '' : '/preview'}`;
      const result = await readJson(await fetch(endpoint, { method: 'POST', credentials: 'include', body: form }));
      if (!confirm) {
        setResearchPreview(result);
        onShowToast?.(`Xem trước thành công: ${result.candidateCount || 0} cụm từ cơ hội. Chưa ghi dữ liệu.`, 'success');
      } else {
        onShowToast?.(`Đã thêm dữ liệu thị trường vào danh sách cơ hội (${result.evidenceCreated || 0} dòng bằng chứng mới).`, 'success');
        setResearchPreview(null); setResearchFile(null); await load();
      }
    } catch (error) {
      onShowToast?.(`Không thể ${confirm ? 'xác nhận dữ liệu' : 'xem trước dữ liệu'}: ${error.message}`, 'error');
      setState(previous => ({ ...previous, error: error.message }));
    } finally {
      setResearchBusy(false);
    }
  };

  const promote = async candidate => {
    const projectName = String(projectNames[candidate.candidateId] || candidate.displayPhrase || '').trim();
    if (!projectName) return onShowToast?.('Hãy nhập tên Project trước khi tạo.', 'error');
    setPromotingId(candidate.candidateId);
    try {
      const result = await readJson(await fetch(`/api/global-candidates/${candidate.candidateId}/promote`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, idempotencyKey: uuid() })
      }));
      onShowToast?.(`Đã tạo Project #${result.projectId} từ cơ hội "${candidate.displayPhrase}".`, 'success');
      await onPromoted?.(result.projectId);
      await load();
    } catch (error) {
      onShowToast?.(`Chưa thể tạo Project: ${error.message}`, 'error');
      setState(previous => ({ ...previous, error: error.message }));
    } finally {
      setPromotingId(null);
    }
  };

  return <section data-testid="global-candidate-operator-path" className="studio-panel"
    style={{ padding: '16px 20px', borderLeft: '4px solid #7c3aed' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <h3 style={{ margin: 0, color: '#6d28d9' }}>Từ cơ hội thị trường → tạo Project</h3>
        <p style={{ margin: '5px 0 0', color: '#475569', fontSize: '.8rem' }}>
          Mục tiêu: chỉ tạo Project khi đã có dữ liệu thị trường đủ tin cậy. Hệ thống tự đánh giá lại trước khi tạo; chỉ OWNER/MANAGER được xác nhận tạo Project.
        </p>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '.72rem' }}>
          Thuật ngữ kỹ thuật: B2 = tập bằng chứng thị trường · B3 = bước đánh giá/khuyến nghị · Promote = chuyển cơ hội đạt điều kiện thành Project.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canPullIntel && <button type="button" data-testid="pull-verified-intel-handoff"
          onClick={pullIntel} disabled={pullingIntel || state.loading}>
          {pullingIntel ? 'Đang nhận tín hiệu từ Intel...' : 'Nhận cơ hội đã xác minh từ Intel'}
        </button>}
        <button type="button" onClick={load} disabled={state.loading}>
          {state.loading ? 'Đang tải...' : 'Làm mới danh sách cơ hội'}
        </button>
      </div>
    </div>

    {state.error && <div role="alert" style={{ marginTop: 10, color: '#991b1b' }}>{state.error}</div>}

    <div data-testid="global-candidate-marketplace-evidence" style={{ marginTop: 12, padding: 12, border: '1px solid #ddd6fe', borderRadius: 10, background: '#fff' }}>
      <strong>1. Thêm dữ liệu thị trường để hệ thống tìm cơ hội</strong>
      <div style={{ color: '#475569', fontSize: '.78rem', margin: '5px 0 8px', lineHeight: 1.55 }}>
        {marketplace === 'AMAZON'
          ? <>Dùng file <b>Helium 10 Cerebro</b>. Cách lấy: mở Helium 10 → Cerebro → nhập ASIN sản phẩm/đối thủ liên quan → chạy phân tích → Export CSV hoặc XLSX. File này cho biết người mua đang tìm từ khóa gì và mức độ nhu cầu/cạnh tranh.</>
          : <>Dùng file dữ liệu tìm kiếm công khai Etsy ở định dạng CSV/HTML mà OmniSeller hỗ trợ. Đây là dữ liệu nghiên cứu thị trường, không phải file listing đã đăng.</>}
      </div>
      <div style={{ background: '#f8fafc', borderRadius: 8, padding: 9, fontSize: '.75rem', color: '#475569', lineHeight: 1.55, marginBottom: 9 }}>
        <b>Tại sao cần bước này?</b> OmniSeller không nên tạo Project chỉ vì một ý tưởng nghe hay. Dữ liệu marketplace giúp hệ thống kiểm tra xem có tín hiệu tìm kiếm thật hay không, gom các cụm từ thành cơ hội và tránh tạo quá nhiều Project yếu.
        <br/><b>Xem trước</b> = chỉ kiểm tra file, chưa ghi dữ liệu. <b>Xác nhận</b> = thêm bằng chứng hợp lệ vào danh sách cơ hội để hệ thống đánh giá.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input data-testid="global-candidate-research-file" type="file"
          accept={marketplace === 'AMAZON' ? '.csv,.xlsx' : '.csv,.html,.htm,text/csv,text/html'}
          onChange={event => { setResearchFile(event.target.files?.[0] || null); setResearchPreview(null); }} />
        <button type="button" disabled={!researchFile || researchBusy} onClick={() => submitResearch(false)}>2. Xem trước file</button>
        <button type="button" disabled={!researchPreview?.zeroWrite || researchBusy} onClick={() => submitResearch(true)}>3. Xác nhận vào danh sách cơ hội</button>
      </div>
      {researchPreview && <div style={{ marginTop: 7, fontSize: '.75rem', color: '#475569' }}>
        Đã nhận diện {researchPreview.candidateCount || 0} cụm từ cơ hội · mã dữ liệu {String(researchPreview.rawHash || '').slice(0, 12)}... · trạng thái: chỉ xem trước, chưa ghi
      </div>}
    </div>

    {!state.loading && !state.error && state.candidates.length === 0 &&
      <div data-testid="global-candidate-empty"
        style={{ marginTop: 12, padding: 12, background: '#faf5ff', borderRadius: 8, color: '#581c87', lineHeight: 1.55 }}>
        <b>Chưa có cơ hội nào đủ bằng chứng trong {marketplace}.</b> Điều này chỉ có nghĩa là danh sách hiện chưa có dữ liệu đạt điều kiện, <b>không có nghĩa thị trường không có cơ hội</b>.
        <br/><br/>
        Bạn có 2 cách bắt đầu:
        <br/>• <b>Cách A — từ Intel:</b> OWNER bấm “Nhận cơ hội đã xác minh từ Intel” để đưa tín hiệu Social Listening đã ký/xác minh vào đây dưới dạng dữ liệu nghiên cứu.
        <br/>• <b>Cách B — từ marketplace:</b> nhập file {marketplace === 'AMAZON' ? 'Helium 10 Cerebro' : 'Etsy search CSV/HTML'} ở bước 1 phía trên.
        <br/><br/>
        Không nên tạo Project thủ công để bỏ qua bước đánh giá này; mục đích của bước này là ngăn ý tưởng yếu hoặc sai dữ liệu đi sâu vào workflow.
      </div>}

    {state.candidates.length > 0 && <div style={{ overflowX: 'auto', marginTop: 12 }}>
      <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', background: '#fff' }}>
        <thead><tr>
          <th style={{ textAlign: 'left', padding: 8 }}>Ưu tiên</th>
          <th style={{ textAlign: 'left' }}>Cơ hội</th>
          <th>Đánh giá</th>
          <th>Bằng chứng</th>
          <th style={{ textAlign: 'left' }}>Lý do / còn thiếu</th>
          <th>Thao tác</th>
        </tr></thead>
        <tbody>{state.candidates.map(candidate => {
          const disposition = candidate.advisoryDisposition?.value || 'NEEDS_EVIDENCE';
          const promotable = disposition === 'PROMOTE' && canPromote;
          const reasons = candidate.advisoryDisposition?.reasonCodes || [];
          const blockers = candidate.advisoryDisposition?.blockers || [];
          return <tr key={candidate.candidateId} style={{ borderTop: '1px solid #e2e8f0' }}>
            <td style={{ padding: 8 }}>{candidate.priorityRank}</td>
            <td>
              <strong>{candidate.displayPhrase}</strong>
              <div style={{ color: '#64748b', fontSize: '.72rem' }}>{candidate.marketplace}</div>
            </td>
            <td style={{ textAlign: 'center', fontWeight: 800 }}>
              {DISPOSITION_LABELS[disposition] || disposition}
              <div style={{ fontSize: '.65rem', color: '#94a3b8', fontWeight: 600 }}>{disposition}</div>
            </td>
            <td style={{ textAlign: 'center' }}>
              {candidate.evidenceSummary?.evidenceCount || 0} bằng chứng / {candidate.evidenceSummary?.sourceFamilyCount || 0} nguồn
            </td>
            <td style={{ fontSize: '.72rem', color: '#475569', maxWidth: 380 }}>
              {(reasons.length ? reasons : blockers).map(reasonLabel).join(' / ') || 'Chưa có lý do chi tiết'}
            </td>
            <td style={{ minWidth: 260, padding: 8 }}>
              {disposition === 'PROMOTE' ? <>
                <input aria-label={`Tên Project cho ${candidate.displayPhrase}`}
                  value={projectNames[candidate.candidateId] ?? `${candidate.displayPhrase} Pilot`}
                  onChange={event => setProjectNames(previous => ({ ...previous, [candidate.candidateId]: event.target.value }))}
                  style={{ width: '100%', marginBottom: 6 }} />
                <button type="button" disabled={!promotable || promotingId === candidate.candidateId}
                  onClick={() => promote(candidate)}>
                  {promotingId === candidate.candidateId ? 'Đang tạo Project...' : canPromote ? '4. Tạo Project từ cơ hội này' : 'Cần quyền Manager/Owner'}
                </button>
              </> : <span style={{ color: '#64748b' }}>Chưa đủ điều kiện tạo Project — bổ sung dữ liệu theo cột bên trái.</span>}
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
  </section>;
}
