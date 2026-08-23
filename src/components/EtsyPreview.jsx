import React from 'react';
import { ShieldCheck } from 'lucide-react';

export default function EtsyPreview({ data }) {
  if (!data) return null;

  return (
    <div style={{ background: '#fff', color: '#222', fontFamily: '"Graphik Webfont", -apple-system, BlinkMacSystemFont, "Roboto", "Droid Sans", "Segoe UI", "Helvetica", Arial, sans-serif', padding: '20px', borderRadius: '8px', border: '1px solid #e7e7e7', display: 'flex', gap: '40px' }}>
      
      {/* Left Column: Images */}
      <div style={{ flex: '0 0 500px' }}>
        <div style={{ width: '100%', height: '400px', backgroundColor: '#ebebeb', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', marginBottom: '16px' }}>
          Product Image Preview
        </div>
        
        {data.ratingCount ? (
          <div style={{ marginTop: '30px' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '12px' }}>Reviews for this item</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#222', marginBottom: '16px' }}>
              <span style={{ fontSize: '1.1rem' }}>({data.ratingCount} reviews)</span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Right Column: Listing Details */}
      <div style={{ flex: 1 }}>
        {data.isBestseller ? (
          <div style={{ color: '#c13c27', fontSize: '0.9rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontWeight: 'bold' }}>Bestseller</span>
          </div>
        ) : null}

        <h1 style={{ fontSize: '1.5rem', fontWeight: '300', margin: '0 0 8px 0', lineHeight: '1.4' }}>
          {data.etsyTitle || 'Draft Title'}
        </h1>
        
        <div style={{ fontSize: '0.9rem', color: '#595959', marginBottom: '16px' }}>
          {data.shop || data.shopName || 'Shop not specified'}
        </div>

        <div style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: '24px' }}>
          {data.price ? `$${data.price}` : 'Price: Pending'}
        </div>

        <button style={{ width: '100%', background: '#222', color: '#fff', border: 'none', borderRadius: '24px', padding: '12px', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer', marginBottom: '12px' }}>
          Add to cart
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#e1e3df', padding: '12px', borderRadius: '8px', marginBottom: '24px', fontSize: '0.9rem' }}>
          <ShieldCheck size={18} />
          <span><span style={{ fontWeight: 'bold' }}>Etsy Purchase Protection:</span> Shop confidently on Etsy knowing if something goes wrong with an order, we've got your back.</span>
        </div>

        {/* Description Section */}
        <div style={{ borderTop: '1px solid #e1e3df', paddingTop: '20px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '12px' }}>Item details</h3>
          <div style={{ fontSize: '0.95rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', color: '#222' }}>
            {data.etsyDescription || 'No description available.'}
          </div>
        </div>

        {/* Tags Section */}
        {Array.isArray(data.etsyTags) && data.etsyTags.length > 0 ? (
          <div style={{ borderTop: '1px solid #e1e3df', paddingTop: '20px' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '12px' }}>Tags ({data.etsyTags.length}/13)</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {data.etsyTags.map((tag, idx) => (
                <span key={idx} style={{ background: '#f5f5f5', padding: '6px 12px', borderRadius: '16px', fontSize: '0.85rem', color: '#222' }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ) : null}

      </div>
    </div>
  );
}
