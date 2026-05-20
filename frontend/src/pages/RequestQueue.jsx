import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, AlertTriangle, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';

const STATUS_LABEL = {
  pending:     'Pending',
  in_progress: 'In progress',
  done:        'Done',
  cancelled:   'Cancelled',
};

const STATUS_TONE = {
  pending:     'bg-amber-100 text-amber-800',
  in_progress: 'bg-blue-100 text-blue-800',
  done:        'bg-emerald-100 text-emerald-800',
  cancelled:   'bg-slate-100 text-slate-600',
};

function timeAgo(ts) {
  const sec = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

// ── Stock Manager for Office Boy ──────────────────────────────────────────────
function StockManager() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState({});

  useEffect(() => {
    api.cafeteriaItems().then(setItems).catch(() => {});
  }, []);

  // Also load unavailable items
  useEffect(() => {
    if (!open) return;
    // Reload all items (including unavailable) when opened
    fetch('/api/cafeteria/items/all', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    }).catch(() => {});
  }, [open]);

  async function toggleStock(item) {
    setBusy(b => ({ ...b, [item.id]: true }));
    try {
      if (item.stock_today === 0) {
        // Restore — set to null (unlimited) or a default
        await api.updateCafeteriaItem(item.id, { stock_today: null });
      } else {
        // Mark no stock
        await api.updateCafeteriaItem(item.id, { stock_today: 0 });
      }
      // Refresh
      const updated = await api.cafeteriaItems();
      setItems(updated || []);
    } catch (e) {
      console.error('Stock toggle error:', e);
    } finally {
      setBusy(b => ({ ...b, [item.id]: false }));
    }
  }

  if (!items.length) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-amber-50 flex items-center justify-center">
            <Package size={18} className="text-amber-600" />
          </div>
          <div className="text-left">
            <div className="font-bold text-slate-800 text-sm">Quick Stock Control</div>
            <div className="text-xs text-slate-400">Water, dispensers & unlimited items</div>
          </div>
        </div>
        {open ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2">
              {items.filter(item =>
                // Only show unlimited items (like Water) — bill items have numeric stock managed automatically
                item.stock_today === null || item.stock_today === undefined || item.stock_today === 0
              ).map(item => {
                const isOut = item.stock_today !== null && item.stock_today !== undefined && item.stock_today <= 0;
                return (
                  <div key={item.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-slate-50">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{item.emoji || '📦'}</span>
                      <div>
                        <div className="text-sm font-semibold text-slate-700">{item.item_name}</div>
                        {item.stock_today !== null && item.stock_today !== undefined && item.stock_today > 0 && (
                          <div className="text-[10px] text-slate-400">{item.stock_today} in stock</div>
                        )}
                        {isOut && (
                          <div className="text-[10px] text-rose-500 font-bold">No stock</div>
                        )}
                        {(item.stock_today === null || item.stock_today === undefined) && (
                          <div className="text-[10px] text-emerald-500">Unlimited</div>
                        )}
                      </div>
                    </div>
                    <button
                      disabled={busy[item.id]}
                      onClick={() => toggleStock(item)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        isOut
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                      } ${busy[item.id] ? 'opacity-40' : ''}`}
                    >
                      {isOut ? '✅ Restore' : '❌ No Stock'}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function RequestQueue() {
  const { profile } = useAuth();
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState({});

  async function load() {
    setErr('');
    try {
      const data = await api.listRequests(filter === 'all' ? '' : filter);
      setRows(data);
    } catch (e) { setErr(e.message); }
  }

  useEffect(() => { load(); }, [filter]);

  async function setStatus(id, status, liveStatus) {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await api.setRequestStatus(id, status, liveStatus);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  }

  const isStaff = ['office_boy', 'facility_manager', 'leadership'].includes(profile?.role);

  const grouped = useMemo(() => {
    if (!rows) return null;
    return {
      pending:     rows.filter((r) => r.status === 'pending'),
      in_progress: rows.filter((r) => r.status === 'in_progress'),
      done:        rows.filter((r) => r.status === 'done'),
      cancelled:   rows.filter((r) => r.status === 'cancelled'),
    };
  }, [rows]);

  if (err && !rows) return <div className="text-rose-600">{err}</div>;
  if (!rows) return <div className="text-slate-500">Loading queue...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Request queue</h1>
          <p className="text-sm text-slate-500">
            {isStaff ? 'Work the pending requests top-down.' : 'Your requests.'}
          </p>
        </div>
        <div className="flex gap-1 text-sm">
          {['pending', 'in_progress', 'done', 'all'].map((f) => (
            <button
              key={f}
              className={`px-3 py-1.5 rounded-md ${
                filter === f ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700'
              }`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : STATUS_LABEL[f]}
              {grouped && f !== 'all' && (
                <span className="ml-1 opacity-70">{grouped[f].length}</span>
              )}
            </button>
          ))}
          <button className="btn-secondary text-xs px-3 py-1.5" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      {/* Stock Control for office boy / facility manager */}
      {isStaff && <StockManager />}

      {err && <div className="text-sm text-rose-700 bg-rose-50 p-3 rounded-md">{err}</div>}

      {rows.length === 0 ? (
        <div className="card text-slate-500">
          Nothing here. {isStaff && 'Have a sip of chai.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((r) => (
            <div key={r.id} className="card">
              <div className="flex items-center justify-between mb-2">
                <span className={`pill ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                <span className="text-xs text-slate-400">{timeAgo(r.created_at)}</span>
              </div>
              <div className="text-base font-semibold text-slate-900">
                {r.parsed_item || 'Request'}
                {r.parsed_location && <span className="text-slate-500 font-normal"> · {r.parsed_location}</span>}
              </div>
              <div className="text-sm text-slate-600 mt-1">{r.instruction}</div>
              <div className="text-xs text-slate-400 mt-2">
                From: <span className="text-slate-600">{r.submitter_name || r.parsed_employee_name || '—'}</span>
              </div>

              {isStaff && r.status !== 'done' && r.status !== 'cancelled' && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {r.status === 'pending' && (
                    <button
                      className="btn-primary text-xs px-3 py-1.5"
                      disabled={busy[r.id]}
                      onClick={() => setStatus(r.id, 'in_progress', 'accepted')}
                    >
                      Accept
                    </button>
                  )}
                  {r.status === 'in_progress' && r.live_status === 'accepted' && (
                    <button
                      className="btn-primary text-xs px-3 py-1.5 bg-amber-600 hover:bg-amber-700"
                      disabled={busy[r.id]}
                      onClick={() => setStatus(r.id, 'in_progress', 'preparing')}
                    >
                      Preparing
                    </button>
                  )}
                  {r.status === 'in_progress' && r.live_status === 'preparing' && (
                    <button
                      className="btn-primary text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700"
                      disabled={busy[r.id]}
                      onClick={() => setStatus(r.id, 'in_progress', 'on_the_way')}
                    >
                      On the Way
                    </button>
                  )}
                  {(r.status === 'in_progress') && (
                    <button
                      className="btn-primary text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700"
                      disabled={busy[r.id]}
                      onClick={() => setStatus(r.id, 'done', 'done')}
                    >
                      Mark Done
                    </button>
                  )}
                  <button
                    className="btn-secondary text-xs px-3 py-1.5"
                    disabled={busy[r.id]}
                    onClick={() => setStatus(r.id, 'cancelled', 'cancelled')}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
