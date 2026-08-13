import React from 'react';
import { Star, ChevronDown, ShoppingCart } from 'lucide-react';

export default function AmazonPreview({ data }) {
  if (!data) return null;

  return (
    <div style={{ background: '#fff', color: '#0f1111', fontFamily: 'Arial, sans-serif', padding: '20px', borderRadius: '8px', border: '1px solid #e7e7e7', display: 'flex', gap: '30px' }}>
      {/* Left Column: Image */}
      <div style={{ flex: '0 0 300px' }}>
        <div style={{ width: '100%', height: '300px', backgroundColor: '#f7f7f7', border: '1px solid #e7e7e7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
          Product Image Placeholder
        </div>
      </div>

      {/* Right Column: Details */}
      <div style={{ flex: 1 }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: '400', margin: '0 0 8px 0', lineHeight: '1.3' }}>
          {data.amazonTitle || 'Amazon Title Placeholder'}
        </h1>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', borderBottom: '1px solid #e7e7e7', paddingBottom: '12px', marginBottom: '12px' }}>
          <div style={{ color: '#007185', fontSize: '0.9rem', cursor: 'pointer' }}>Visit the Store</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#de7921' }}>
            <Star size={16} fill="currentColor" />
            <Star size={16} fill="currentColor" />
            <Star size={16} fill="currentColor" />
            <Star size={16} fill="currentColor" />
            <Star size={16} fill="currentColor" />
            <span style={{ color: '#007185', marginLeft: '4px' }}><ChevronDown size={14}/> 4,128 ratings</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '16px' }}>
          <span style={{ fontSize: '0.8rem', position: 'relative', top: '-0.5em' }}>$</span>
          <span style={{ fontSize: '1.8rem', fontWeight: '500' }}>24</span>
          <span style={{ fontSize: '0.8rem', position: 'relative', top: '-0.5em' }}>99</span>
        </div>

        <div style={{ background: '#f6f6f6', padding: '12px', borderRadius: '4px', marginBottom: '16px' }}>
          <span style={{ fontWeight: 'bold' }}>Prime</span> <span style={{ color: '#007185' }}>FREE delivery</span> Tomorrow
        </div>

        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '8px' }}>About this item</h3>
          <ul style={{ paddingLeft: '18px', margin: '0', fontSize: '0.95rem', lineHeight: '1.5' }}>
            {(data.amazonBullets || []).map((bullet, idx) => (
              <li key={idx} style={{ marginBottom: '6px' }}>{bullet}</li>
            ))}
            {(!data.amazonBullets || data.amazonBullets.length === 0) && (
              <li>Bullet points will appear here.</li>
            )}
          </ul>
        </div>
      </div>
      
      {/* Buy Box Column */}
      <div style={{ flex: '0 0 200px', border: '1px solid #d5d9d9', borderRadius: '8px', padding: '16px', height: 'fit-content' }}>
        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '12px' }}>$24.99</div>
        <div style={{ color: '#007185', fontSize: '0.9rem', marginBottom: '12px' }}>FREE Returns</div>
        <div style={{ color: '#007600', fontSize: '1.1rem', marginBottom: '16px' }}>In Stock</div>
        <button style={{ width: '100%', background: '#ffd814', border: '1px solid #fcd200', borderRadius: '100px', padding: '8px', cursor: 'pointer', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          Add to Cart
        </button>
        <button style={{ width: '100%', background: '#ffa41c', border: '1px solid #ff8f00', borderRadius: '100px', padding: '8px', cursor: 'pointer' }}>
          Buy Now
        </button>
      </div>
    </div>
  );
}
