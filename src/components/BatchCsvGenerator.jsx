import React, { useState } from 'react';
import Papa from 'papaparse';
import { Upload, Download, Play, CheckCircle, AlertCircle, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { CATEGORIES, OCCASIONS, TONES } from '../data/categoryPresets';
import { generateListingAI } from '../services/geminiService';
import { generateVerifiedBatchRow, prepareVerifiedBatchRow } from '../utils/batchTruthBoundary';

export default function BatchCsvGenerator({ onShowToast, onSaveListing }) {
  const [rows, setRows] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState([]);

  // Download Sample Template CSV
  const downloadSampleTemplate = () => {
    const sampleData = [{ ProductId: '', ListingVersion: '', ProductTruthCard: '' }];

    const csv = Papa.unparse(sampleData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'OmniSeller_Batch_Template.csv';
    link.click();
    onShowToast('Sample batch template downloaded!');
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (result.data && result.data.length > 0) {
          setRows(result.data.map((item, idx) => ({ ...item, id: idx, status: 'pending' })));
          setResults([]);
          setProgress(0);
          onShowToast(`Loaded ${result.data.length} items for batch generation.`);
        }
      },
      error: (err) => {
        onShowToast(`CSV Error: ${err.message}`);
      }
    });
  };

  const runBatchProcessing = async () => {
    if (rows.length === 0 || processing) return;
    setProcessing(true);
    const generatedList = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const prepared = prepareVerifiedBatchRow(row);
      if (!prepared.eligible) {
        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error', errorMsg: prepared.code } : r));
        setProgress(Math.round(((i + 1) / rows.length) * 100));
        continue;
      }

      const categoryObj = CATEGORIES.find(c => c.id.toLowerCase() === prepared.aiInput.productType.toLowerCase()) || {
        id: 'verified-product',
        name: prepared.aiInput.productType
      };
      const toneObj = TONES[0];

      // Update row status to running
      setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'generating' } : r));

      try {
        const generated = await generateVerifiedBatchRow(row, generateListingAI, { category: categoryObj, tone: toneObj });
        const listing = generated.listing;

        const combined = {
          ...listing,
          batchSource: {
            productId: prepared.projection.context.productId,
            listingVersion: prepared.projection.context.listingVersion,
            evidenceCode: prepared.code
          },
          categoryName: categoryObj.name
        };

        generatedList.push(combined);
        onSaveListing(combined, false);

        // Update status to done
        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'completed' } : r));
      } catch (err) {
        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error', errorMsg: err.message } : r));
      }

      setProgress(Math.round(((i + 1) / rows.length) * 100));
    }

    setResults(generatedList);
    setProcessing(false);
    onShowToast('Batch processing complete!');
  };

  const exportAllResultsCsv = () => {
    if (results.length === 0) return;

    const exportRows = results.map(r => ({
      Category: r.categoryName,
      Amazon_Title: r.amazonTitle,
      Amazon_Bullet_1: r.amazonBullets?.[0] || '',
      Amazon_Bullet_2: r.amazonBullets?.[1] || '',
      Amazon_Bullet_3: r.amazonBullets?.[2] || '',
      Amazon_Bullet_4: r.amazonBullets?.[3] || '',
      Amazon_Bullet_5: r.amazonBullets?.[4] || '',
      Amazon_Search_Terms_249Bytes: r.amazonSearchTerms,
      Amazon_Description: r.amazonDescription,
      Etsy_Title: r.etsyTitle,
      Etsy_13_Tags: (r.etsyTags || []).join(', '),
      Etsy_Personalization_Box: r.etsyPersonalizationInstructions,
      Etsy_Description: r.etsyDescription
    }));

    const csv = Papa.unparse(exportRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `OmniSeller_Batch_Export_${Date.now()}.csv`;
    link.click();
    onShowToast('Exported all generated listings to CSV!');
  };

  return (
    <div className="studio-panel" style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <FileSpreadsheet size={22} style={{ color: 'var(--primary)' }} />
            <span>Batch CSV Listing Generator</span>
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Upload a spreadsheet with dozens of products to batch generate full Amazon FBM & Etsy listings automatically.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={downloadSampleTemplate}>
            <Download size={16} />
            <span>Download CSV Template</span>
          </button>
        </div>
      </div>

      {/* Upload Zone */}
      {rows.length === 0 ? (
        <div style={{ border: '2px dashed var(--border-strong)', borderRadius: 'var(--radius-lg)', padding: '40px 20px', textAlign: 'center', background: 'var(--bg-subtle)' }}>
          <input
            type="file"
            id="batch-csv-upload"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
          <label htmlFor="batch-csv-upload" style={{ cursor: 'pointer', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'var(--bg-surface)', padding: '14px', borderRadius: '50%', color: 'var(--primary)', boxShadow: 'var(--shadow-sm)' }}>
              <Upload size={28} />
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: '600' }}>Click to upload batch products CSV</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Requires ProductId, ListingVersion, and a canonical ProductTruthCard JSON value</div>
          </label>
        </div>
      ) : (
        <div>
          {/* Progress Bar & Actions */}
          <div style={{ background: 'var(--bg-subtle)', padding: '16px', borderRadius: 'var(--radius-lg)', marginBottom: '20px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: '600' }}>
                Batch Progress: {progress}% ({results.length} of {rows.length} Completed)
              </span>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={runBatchProcessing}
                  disabled={processing}
                >
                  {processing ? (
                    <>
                      <RefreshCw size={14} className="spin" />
                      <span>Processing Batch...</span>
                    </>
                  ) : (
                    <>
                      <Play size={14} />
                      <span>Start Batch Generation</span>
                    </>
                  )}
                </button>

                {results.length > 0 && (
                  <button className="btn btn-secondary btn-sm" onClick={exportAllResultsCsv}>
                    <Download size={14} />
                    <span>Download All Results ({results.length})</span>
                  </button>
                )}
              </div>
            </div>

            <div style={{ height: '8px', background: 'var(--border-subtle)', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  background: 'var(--primary)',
                  width: `${progress}%`,
                  transition: 'width 0.3s ease'
                }}
              />
            </div>
          </div>

          {/* Table of Rows */}
          <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px' }}>#</th>
                  <th style={{ padding: '10px 14px' }}>Category</th>
                  <th style={{ padding: '10px 14px' }}>Occasion</th>
                  <th style={{ padding: '10px 14px' }}>Brief / Details</th>
                  <th style={{ padding: '10px 14px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{idx + 1}</td>
                    <td style={{ padding: '10px 14px', fontWeight: '600' }}>{row.Category}</td>
                    <td style={{ padding: '10px 14px' }}>{row.Occasion}</td>
                    <td style={{ padding: '10px 14px', maxWidth: '380px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.ProductBrief}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {row.status === 'completed' && (
                        <span style={{ color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
                          <CheckCircle size={14} /> Ready
                        </span>
                      )}
                      {row.status === 'generating' && (
                        <span style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
                          <RefreshCw size={14} className="spin" /> Generating...
                        </span>
                      )}
                      {row.status === 'pending' && (
                        <span style={{ color: 'var(--text-muted)' }}>Pending</span>
                      )}
                      {row.status === 'error' && (
                        <span style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <AlertCircle size={14} /> Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setRows([]); setResults([]); }}
            >
              Clear Batch List
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
