import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

export default function DailyUpdate() {
  const [items, setItems] = useState(null);
  const [edits, setEdits] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [okMsg, setOkMsg] = useState('');

  async function load() {
    setErr('');
    try {
      const data = await api.inventoryStatus();
      setItems(data);
      // initialize edits with current stock
      const init = {};
      for (const r of data) init[r.product_id] = String(r.current_stock ?? 0);
      setEdits(init);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    if (!items) return {};
    return items.reduce((acc, r) => {
      const k = r.category || 'other';
      (acc[k] ??= []).push(r);
      return acc;
    }, {});
  }, [items]);

  function setStock(id, v) {
    setEdits((e) => ({ ...e, [id]: v }));
  }

  async function submit() {
    setBusy(true); setErr(''); setOkMsg('');
    try {
      const updates = items
        .map((r) => {
          const next = Number(edits[r.product_id]);
          if (Number.isNaN(next)) return null;
          if (next === Number(r.current_stock)) return null;
          return { product_id: r.product_id, current_stock: next };
        })
        .filter(Boolean);

      if (!updates.length) {
        setOkMsg('Nothing changed — all counts already match.');
        return;
      }
      const result = await api.dailyUpdate(updates);
      setOkMsg(
        `Updated ${result.updated} items, logged ${result.transactions_logged} transactions.`,
      );
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (err && !items) return <div className="text-rose-600">{err}</div>;
  if (!items) return <div className="text-slate-500">Loading inventory…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Daily stock update</h1>
          <p className="text-sm text-slate-500">
            Walk the pantry, count what's there, type it in. Differences are auto-logged as
            add/remove transactions.
          </p>
        </div>
        <button className="btn-primary" disabled={busy} onClick={submit}>
          {busy ? 'Saving…' : 'Save all changes'}
        </button>
      </div>

      {err && <div className="text-rose-600 text-sm">{err}</div>}
      {okMsg && (
        <div className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-md">{okMsg}</div>
      )}

      {Object.entries(grouped).map(([cat, rows]) => (
        <div key={cat} className="card">
          <h2 className="font-semibold capitalize mb-3">{cat.replace('_', ' ')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rows.map((r) => {
              const changed = Number(edits[r.product_id]) !== Number(r.current_stock);
              return (
                <div
                  key={r.product_id}
                  className={`p-3 rounded-lg border ${
                    changed ? 'border-brand bg-brand/5' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-slate-900 text-sm">{r.product_name}</div>
                    <span className="text-xs text-slate-500">{r.unit}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn-secondary px-2.5 py-1 text-xs"
                      onClick={() => setStock(r.product_id, String(Math.max(0, Number(edits[r.product_id] || 0) - 1)))}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      className="input text-center"
                      value={edits[r.product_id] ?? ''}
                      onChange={(e) => setStock(r.product_id, e.target.value)}
                    />
                    <button
                      className="btn-secondary px-2.5 py-1 text-xs"
                      onClick={() => setStock(r.product_id, String(Number(edits[r.product_id] || 0) + 1))}
                    >
                      +
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                    <span>min: {r.min_threshold}</span>
                    {r.expiry_date && <span>exp: {r.expiry_date}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
