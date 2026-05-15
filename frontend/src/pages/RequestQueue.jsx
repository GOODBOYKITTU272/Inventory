import { useEffect, useMemo, useState } from 'react';
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
