import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function StaffView() {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.inventoryStatus().then(setItems).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="text-rose-600">{err}</div>;
  if (!items) return <div className="text-slate-500">Loading…</div>;

  const grouped = items.reduce((acc, r) => {
    const k = r.category || 'other';
    (acc[k] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">What's in the pantry</h1>
        <p className="text-sm text-slate-500">Updated daily by the facility manager.</p>
      </div>
      {Object.entries(grouped).map(([cat, rows]) => (
        <div key={cat} className="card">
          <h2 className="font-semibold capitalize mb-3">{cat.replace('_', ' ')}</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {rows.map((r) => {
              const isOut = r.stock_status === 'out_of_stock';
              const isLow = r.stock_status === 'low';
              return (
                <li
                  key={r.product_id}
                  className={`p-3 rounded-lg border flex items-center justify-between ${
                    isOut
                      ? 'border-rose-200 bg-rose-50 text-rose-900'
                      : isLow
                        ? 'border-amber-200 bg-amber-50 text-amber-900'
                        : 'border-slate-200'
                  }`}
                >
                  <span className="font-medium">{r.product_name}</span>
                  <span className="text-sm">
                    {isOut ? 'out' : `${r.current_stock} ${r.unit}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
