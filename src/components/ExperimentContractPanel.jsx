import React, { useEffect, useRef, useState } from 'react';
import { FlaskConical, LockKeyhole, RefreshCw } from 'lucide-react';
import { parseJsonResponse } from '../utils/apiResponse';

const METRICS = ['ORDERS','CVR','AOV','CAC','MARGIN','CONTRIBUTION_PROFIT'];
const metricLabel = { ORDERS:'Orders', CVR:'CVR %', AOV:'AOV', CAC:'CAC', MARGIN:'Margin %', CONTRIBUTION_PROFIT:'Contribution Profit' };

export default function ExperimentContractPanel({ activeProject, onShowToast, accent = '#ea580c' }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ hypothesis:'', offer:'', priceAmount:'', priceCurrency:'USD', variant:'',
    trafficSource:'', startAt:'', endAt:'', stopConditions:'', targets:{} });
  const [outcomes, setOutcomes] = useState({});
  const contractRequestRef = useRef(null);
  const outcomeRequestRefs = useRef({});

  const projectId = activeProject?.id || null;
  const canCreate = projectId && items.length < 3;
  const reload = async () => {
    if (!projectId) { setItems([]); return; }
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/experiments`, { credentials:'include' });
    const data = await parseJsonResponse(res);
    if (!res.ok) throw new Error(data.error || 'EXPERIMENT_LOAD_FAILED');
    setItems(data.experiments || []);
  };

  useEffect(() => { reload().catch(e => onShowToast?.(`Không tải được Experiment Contract: ${e.message}`, 'error')); }, [projectId]);
  const create = async () => {
    const successMetrics = METRICS.flatMap(metric => {
      const row = form.targets?.[metric] || {};
      const defaultOperator = metric === 'CAC' ? 'LTE' : 'GTE';
      return row.target === '' || row.target == null ? [] : [{ metric, operator: row.operator || defaultOperator, target: Number(row.target) }];
    });
    const stopConditions = form.stopConditions.split('\n').map(x => x.trim()).filter(Boolean);
    setBusy(true);
    try {
      const payload = {
        hypothesis: form.hypothesis, offer: form.offer, priceAmount: Number(form.priceAmount),
        priceCurrency: form.priceCurrency, variant: form.variant, trafficSource: form.trafficSource,
        startAt: new Date(form.startAt).toISOString(), endAt: new Date(form.endAt).toISOString(),
        successMetrics, stopConditions
      };
      const signature = JSON.stringify(payload);
      if (contractRequestRef.current?.signature !== signature) {
        contractRequestRef.current = { signature, idempotencyKey: `experiment-${projectId}-${Date.now()}` };
      }
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/experiments`, {
        method:'POST', credentials:'include', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ ...payload, idempotencyKey: contractRequestRef.current.idempotencyKey })
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'EXPERIMENT_CREATE_FAILED');
      onShowToast?.('Đã khóa Experiment Contract. Nội dung này là bất biến.');
      await reload();
    } catch (e) { onShowToast?.(`Không thể khóa contract: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };

  const saveOutcome = async experiment => {
    const draft = outcomes[experiment.id] || {};
    const metrics = Object.fromEntries(METRICS.flatMap(metric =>
      draft[metric] === '' || draft[metric] == null ? [] : [[metric, Number(draft[metric])]]));
    setBusy(true);
    try {
      const outcomeSignature = JSON.stringify({ metrics, notes: draft.notes || '' });
      let request = outcomeRequestRefs.current[experiment.id];
      if (request?.signature !== outcomeSignature) {
        request = { signature: outcomeSignature, capturedAt: new Date().toISOString(),
          idempotencyKey: `outcome-${projectId}-${experiment.id}-${Date.now()}` };
        outcomeRequestRefs.current[experiment.id] = request;
      }
      const res = await fetch(`/api/projects/${projectId}/experiments/${experiment.id}/outcome`, {
        method:'POST', credentials:'include', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ metrics, notes: draft.notes || '', capturedAt: request.capturedAt,
          idempotencyKey: request.idempotencyKey })
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'EXPERIMENT_OUTCOME_FAILED');
      onShowToast?.(`Learning Receipt: ${data.learningReceipt?.classification || 'RECORDED'}`);
      await reload();
    } catch (e) { onShowToast?.(`Không thể ghi outcome: ${e.message}`, 'error'); }
    finally { setBusy(false); }
  };
  if (!activeProject) return null;
  return <section data-testid="experiment-contract-panel" style={{ border:`1px solid ${accent}55`, borderRadius:12, padding:16, background:'#fff' }}>
    <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' }}>
      <div>
        <strong style={{ display:'flex', alignItems:'center', gap:7 }}><FlaskConical size={17} color={accent}/> Experiment Contract</strong>
        <div style={{ fontSize:'.76rem', color:'#64748b', marginTop:3 }}>
          Khóa giả thuyết trước khi test → nhập kết quả thật → nhận Learning Receipt. Không tự publish, retrain, SCALE hay KILL.
        </div>
      </div>
      <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => reload()}><RefreshCw size={14}/> Tải lại</button>
    </div>

    {items.map(exp => <div key={exp.id} style={{ marginTop:12, padding:12, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
        <b>Experiment #{exp.id}</b><span><LockKeyhole size={13}/> immutable · {exp.snapshotHash?.slice(0,12)}…</span>
      </div>
      <div style={{ marginTop:6, fontSize:'.8rem' }}><b>Hypothesis:</b> {exp.hypothesis}</div>
      <div style={{ fontSize:'.8rem' }}><b>Offer / price:</b> {exp.offer} · {exp.priceCurrency} {exp.priceAmount}</div>
      <div style={{ fontSize:'.8rem' }}><b>Variant:</b> {exp.variant}</div>
      <div style={{ fontSize:'.8rem' }}><b>Traffic:</b> {exp.trafficSource}</div>
      <div style={{ fontSize:'.76rem', color:'#64748b' }}>{exp.startAt} → {exp.endAt}</div>
      <div style={{ fontSize:'.78rem', marginTop:5 }}>
        {(exp.successMetrics || []).map((m,i)=><span key={i} style={{ marginRight:10 }}>{metricLabel[m.metric]} {m.operator} {m.target}</span>)}
      </div>
      <div style={{ fontSize:'.76rem', marginTop:5, color:'#7c2d12' }}>
        <b>Stop conditions:</b> {(exp.stopConditions || []).join(' · ')}
      </div>
      {exp.learningReceipt ? <div style={{ marginTop:8, fontWeight:900, color: exp.learningReceipt.classification === 'SUPPORTED' ? '#166534' : exp.learningReceipt.classification === 'CONTRADICTED' ? '#991b1b' : '#92400e' }}>
        Learning Receipt: {exp.learningReceipt.classification}
      </div> : <div style={{ marginTop:10 }}>
        <div style={{ fontSize:'.78rem', fontWeight:800, marginBottom:2 }}>Nhập outcome thật khi test kết thúc</div>
        <div style={{ fontSize:'.72rem', color:'#64748b', marginBottom:5 }}>Chỉ khóa outcome khi hết test window hoặc một stop condition đã xảy ra.</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:6 }}>
          {METRICS.map(metric => <input key={metric} className="form-input" type="number" step="any"
            placeholder={metricLabel[metric]} value={outcomes[exp.id]?.[metric] ?? ''}
            onChange={e=>setOutcomes(x=>({ ...x, [exp.id]:{ ...(x[exp.id]||{}), [metric]:e.target.value } }))}/>)}
        </div>
        <textarea className="form-input" rows={2} style={{ marginTop:6 }} placeholder="Ghi chú outcome / nguồn số liệu"
          value={outcomes[exp.id]?.notes || ''} onChange={e=>setOutcomes(x=>({ ...x, [exp.id]:{ ...(x[exp.id]||{}), notes:e.target.value } }))}/>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={()=>saveOutcome(exp)} style={{ marginTop:6, background:accent }}>Khóa outcome & tạo Learning Receipt</button>
      </div>}
    </div>)}

    {canCreate && <details style={{ marginTop:12 }} open={items.length===0}>
      <summary style={{ cursor:'pointer', fontWeight:800 }}>+ Preregister experiment {items.length + 1}/3</summary>
      <div style={{ display:'grid', gap:7, marginTop:9 }}>
        <textarea className="form-input" rows={2} placeholder="Hypothesis — điều gì phải đúng?" value={form.hypothesis} onChange={e=>setForm(x=>({...x,hypothesis:e.target.value}))}/>
        <textarea className="form-input" rows={2} placeholder="Offer — khách nhận gì?" value={form.offer} onChange={e=>setForm(x=>({...x,offer:e.target.value}))}/>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:7 }}>
          <input className="form-input" type="number" step="any" placeholder="Price" value={form.priceAmount} onChange={e=>setForm(x=>({...x,priceAmount:e.target.value}))}/>
          <input className="form-input" placeholder="Currency" value={form.priceCurrency} onChange={e=>setForm(x=>({...x,priceCurrency:e.target.value.toUpperCase()}))}/>
        </div>
        <textarea className="form-input" rows={2} placeholder="Listing / creative variant" value={form.variant} onChange={e=>setForm(x=>({...x,variant:e.target.value}))}/>
        <input className="form-input" placeholder="Traffic / source" value={form.trafficSource} onChange={e=>setForm(x=>({...x,trafficSource:e.target.value}))}/>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
          <input className="form-input" type="datetime-local" value={form.startAt} onChange={e=>setForm(x=>({...x,startAt:e.target.value}))}/>
          <input className="form-input" type="datetime-local" value={form.endAt} onChange={e=>setForm(x=>({...x,endAt:e.target.value}))}/>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:6 }}>
          {METRICS.map(metric => <div key={metric} style={{ display:'grid', gridTemplateColumns:'1fr 68px', gap:4 }}>
            <input className="form-input" type="number" step="any" placeholder={`${metricLabel[metric]} target`}
              value={form.targets?.[metric]?.target ?? ''} onChange={e=>setForm(x=>({...x,targets:{...x.targets,[metric]:{...(x.targets?.[metric]||{}),target:e.target.value}}}))}/>
            <select className="form-input" value={form.targets?.[metric]?.operator || (metric==='CAC'?'LTE':'GTE')}
              onChange={e=>setForm(x=>({...x,targets:{...x.targets,[metric]:{...(x.targets?.[metric]||{}),operator:e.target.value}}}))}>
              <option value="GTE">≥</option><option value="LTE">≤</option>
            </select>
          </div>)}
        </div>
        <textarea className="form-input" rows={3} placeholder={'Stop conditions — mỗi dòng một điều kiện\nVí dụ: dừng nếu inventory hoặc policy không còn hợp lệ'} value={form.stopConditions} onChange={e=>setForm(x=>({...x,stopConditions:e.target.value}))}/>
        <button className="btn btn-primary" disabled={busy} onClick={create} style={{ background:accent }}>
          <LockKeyhole size={15}/> Khóa Experiment Contract
        </button>
      </div>
    </details>}
  </section>;
}
