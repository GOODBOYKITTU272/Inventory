import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';

const CATEGORY_EMOJI = {
  beverage: '☕', food: '🥪', snack: '🍪',
  meal: '🍱', stationery: '📎', cleaning: '🧹', other: '📦',
};

export default function StaffView() {
  const { profile } = useAuth();
  const isStaff = ['office_boy', 'facility_manager', 'leadership'].includes(profile?.role);

  const [items,      setItems]      = useState(null);
  const [cafItems,   setCafItems]   = useState([]);
  const [err,        setErr]        = useState('');
  const [stockSaving, setStockSaving] = useState({});

  useEffect(() => {
    api.inventoryStatus().then(setItems).catch((e) => setErr(e.message));
    if (isStaff) {
      // Load ALL cafeteria items including unavailable ones for stock mgmt
      fetch('/api/cafeteria/items', {
        headers: { Authorization: `Bearer ${window.__supabaseSession?.access_token || ''}` }
      })
        .then(r => r.json())
        .then(setCafItems)
        .catch(() => {});
      // Use api method (already filters available=true, but that's fine for display)
      api.cafeteriaItems().then(setCafItems).catch(() => {});
    }
  }, [isStaff]);

  // Mark an item as out of stock (stock_today = 0) or restore (stock_today = null)
  async function toggleStock(item) {
    const isOut = item.stock_today !== null && item.stock_today !== undefined && item.stock_today <= 0;
    const newStock = isOut ? null : 0;

    setStockSaving(s => ({ ...s, [item.id]: true }));
    try {
      const updated = await api.updateCafeteriaItem(item.id, { stock_today: newStock });
      setCafItems(prev => prev.map(i => i.id === item.id ? { ...i, stock_today: updated.stock_today } : i));
    } catch (e) {
      alert('Failed: ' + e.message);
    } finally {
      setStockSaving(s => ({ ...s, [item.id]: false }));
    }
  }

  // Reset all items' stock to available
  async function resetAllStock() {
    if (!confirm('Mark all items as available again?')) return;
    const outItems = cafItems.filter(i => i.stock_today !== null && i.stock_today <= 0);
    for (const item of outItems) {
      await api.updateCafeteriaItem(item.id, { stock_today: null }).catch(() => {});
    }
    setCafItems(prev => prev.map(i => ({ ...i, stock_today: null })));
  }

  if (err) return <div className="text-rose-600">{err}</div>;
  if (!items) return (
    <div className="flex items-center justify-center py-16 text-slate-400">
      <div className="w-7 h-7 border-2 border-slate-200 border-t-brand rounded-full animate-spin mr-3" />
      Loading…
    </div>
  );

  const grouped = items.reduce((acc, r) => {
    const k = r.category || 'other';
    (acc[k] ??= []).push(r);
    return acc;
  }, {});

  // Group cafeteria items by category
  const cafGrouped = cafItems.reduce((acc, item) => {
    const cat = item.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});
  const cafCats = ['beverage', 'food', 'snack', 'other'].filter(c => cafGrouped[c]?.length);

  const outOfStockCount = cafItems.filter(i => i.stock_today !== null && i.stock_today !== undefined && i.stock_today <= 0).length;

  return (
    <div className="space-y-6">
      {/* ── Today's Cafeteria Stock (office boy controls) ── */}
      {isStaff && cafItems.length > 0 && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-bold text-slate-900">Today's Cafeteria Stock</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Toggle to mark items as out of stock — employees will see "😔 Out today" and can't order.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {outOfStockCount > 0 && (
                <span className="text-xs bg-rose-100 text-rose-600 font-bold px-2.5 py-1 rounded-full">
                  {outOfStockCount} out of stock
                </span>
              )}
              {outOfStockCount > 0 && (
                <button
                  onClick={resetAllStock}
                  className="text-xs text-brand font-bold hover:underline"
                >
                  Reset all →
                </button>
              )}
            </div>
          </div>

          {cafCats.map((cat) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">{CATEGORY_EMOJI[cat]}</span>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider capitalize">
                  {cat === 'beverage' ? 'Drinks' : cat === 'food' ? 'Food' : cat === 'snack' ? 'Snacks' : cat}
                </div>
                <div className="h-px flex-1 bg-slate-100" />
              </div>
              <div className="space-y-2">
                {cafGrouped[cat].map((item) => {
                  const isOut = item.stock_today !== null && item.stock_today !== undefined && item.stock_today <= 0;
                  const saving = stockSaving[item.id];
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        isOut ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={isOut ? 'grayscale' : ''}>{item.emoji || '☕'}</span>
                        <div>
                          <div className={`text-sm font-semibold ${isOut ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                            {item.item_name}
                          </div>
                          {isOut && <div className="text-xs text-rose-500 font-medium">Out of stock today</div>}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleStock(item)}
                        disabled={saving}
                        className={`relative w-11 rounded-full transition-colors shrink-0 ${
                          isOut ? 'bg-rose-400' : 'bg-emerald-400'
                        }`}
                        style={{ height: 24 }}
                        title={isOut ? 'Click to mark as available' : 'Click to mark as out of stock'}
                      >
                        {saving ? (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          </div>
                        ) : (
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${isOut ? 'left-1' : 'left-6'}`} />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pantry Inventory (existing) ── */}
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
