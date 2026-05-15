import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';

function StatCard({ label, value, tone = 'slate' }) {
  const tones = {
    slate:  'bg-slate-50 text-slate-700',
    green:  'bg-emerald-50 text-emerald-700',
    amber:  'bg-amber-50 text-amber-700',
    rose:   'bg-rose-50 text-rose-700',
    orange: 'bg-orange-50 text-orange-700',
  };
  return (
    <div className={`card ${tones[tone]}`}>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-xs uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    ok: 'pill-ok',
    low: 'pill-low',
    out_of_stock: 'pill-out',
    expired: 'pill-out',
    expiring_soon: 'pill-warn',
    fresh: 'pill-ok',
  };
  const label = status?.replaceAll('_', ' ') || '-';
  return <span className={map[status] || 'pill bg-slate-100 text-slate-700'}>{label}</span>;
}

function AISummaryCard() {
  const [data, setData]   = useState(null);
  const [err, setErr]     = useState('');
  const [busy, setBusy]   = useState(false);

  async function load(refresh = false) {
    setErr(''); setBusy(true);
    try {
      const r = await api.aiSummary(refresh);
      setData(r);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(false); }, []);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="font-semibold">This week, at a glance</h2>
          <div className="text-xs text-slate-400">
            {data?.period_start ? `${data.period_start} → ${data.period_end}` : 'AI summary'}
            {data?.from_cache && ' · cached'}
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={busy}
          className="btn-secondary text-xs px-3 py-1"
        >
          {busy ? 'Generating...' : 'Refresh'}
        </button>
      </div>
      {err && (
        <div className="text-xs text-rose-700 bg-rose-50 p-2 rounded">
          {err.includes('OPENAI_API_KEY')
            ? 'Add OPENAI_API_KEY to backend/.env to enable the AI summary.'
            : err}
        </div>
      )}
      {!err && !data && <div className="text-sm text-slate-500">Loading...</div>}
      {data && (
        <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap">
          {data.content}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr]   = useState('');

  useEffect(() => {
    api.dashboard().then(setData).catch((e) => setErr(e.message));
  }, []);

  const canSeeAI = profile && ['leadership', 'finance'].includes(profile.role);

  if (err) return <div className="text-rose-600">{err}</div>;
  if (!data) return <div className="text-slate-500">Loading dashboard...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Inventory snapshot</h1>
        <p className="text-sm text-slate-500">Live view of pantry stock and freshness.</p>
      </div>

      {canSeeAI && <AISummaryCard />}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatCard label="Products"      value={data.summary.total_products} />
        <StatCard label="In stock"      value={data.summary.in_stock} tone="green" />
        <StatCard label="Low"           value={data.summary.low} tone="amber" />
        <StatCard label="Out of stock"  value={data.summary.out_of_stock} tone="rose" />
        <StatCard label="Expiring soon" value={data.summary.expiring_soon} tone="orange" />
        <StatCard label="Expired"       value={data.summary.expired} tone="rose" />
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">All items</h2>
        <div className="overflow-x-auto -mx-2 sm:mx-0">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">Stock</th>
                <th className="py-2 pr-3">Min</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Expiry</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.product_id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium text-slate-900">{r.product_name}</td>
                  <td className="py-2 pr-3 capitalize text-slate-500">
                    {r.category?.replace('_', ' ')}
                  </td>
                  <td className="py-2 pr-3">{r.current_stock ?? 0} {r.unit}</td>
                  <td className="py-2 pr-3 text-slate-500">{r.min_threshold ?? 0}</td>
                  <td className="py-2 pr-3"><StatusPill status={r.stock_status} /></td>
                  <td className="py-2 pr-3 text-slate-500">
                    {r.expiry_date ? (
                      <span className="flex items-center gap-2">
                        {r.expiry_date}
                        {r.expiry_status && r.expiry_status !== 'fresh' && (
                          <StatusPill status={r.expiry_status} />
                        )}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
