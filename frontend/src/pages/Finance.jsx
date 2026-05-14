import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { api } from '../lib/api.js';

const fmt = (n) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(n || 0);

export default function Finance() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.spending().then(setData).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="text-rose-600">{err}</div>;
  if (!data) return <div className="text-slate-500">Loading spending…</div>;

  // Pivot rows by month for the bar chart
  const months = [...new Set(data.rows.map((r) => r.month))].sort();
  const chartData = months.map((m) => {
    const row = { month: m };
    for (const r of data.rows.filter((x) => x.month === m)) {
      row[r.category] = Number(r.total_spent);
    }
    return row;
  });

  const categories = Object.keys(data.by_category);
  const palette = {
    consumables:      '#0f766e',
    coffee_materials: '#92400e',
    washroom:         '#1d4ed8',
    beverages:        '#be185d',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Spending</h1>
        <p className="text-sm text-slate-500">
          Total restocking spend recorded from facility manager updates.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <div className="card">
          <div className="text-xs uppercase text-slate-500">Grand total</div>
          <div className="text-2xl font-bold text-slate-900">{fmt(data.grand_total)}</div>
        </div>
        {categories.map((c) => (
          <div key={c} className="card">
            <div className="text-xs uppercase text-slate-500 capitalize">
              {c.replace('_', ' ')}
            </div>
            <div className="text-xl font-semibold text-slate-900">
              {fmt(data.by_category[c])}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Spending by month & category</h2>
        {chartData.length === 0 ? (
          <div className="text-slate-500 text-sm">
            No transactions yet — once the facility manager submits daily updates,
            spending will appear here.
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => fmt(v)} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Legend />
                {categories.map((c) => (
                  <Bar key={c} dataKey={c} stackId="a" fill={palette[c] || '#64748b'} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
