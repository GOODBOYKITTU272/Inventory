import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { api } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import WakingUp from '../components/WakingUp.jsx';

const fmt = (n) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(n || 0);

const EXPENSE_CATEGORIES = ['rental', 'electricity', 'internet', 'maintenance', 'other'];

const palette = {
  consumables:      '#0f766e',
  coffee_materials: '#92400e',
  washroom:         '#1d4ed8',
  beverages:        '#be185d',
  rental:           '#7c3aed',
  electricity:      '#d97706',
  internet:         '#0891b2',
  maintenance:      '#059669',
  other:            '#64748b',
};

const CURRENT_MONTH = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

export default function Finance() {
  const { profile } = useAuth();
  const isLeadership = profile?.role === 'leadership';

  const [data, setData]         = useState(null);
  const [err, setErr]           = useState('');
  const [expenses, setExpenses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState({
    label: '', amount: '', category: 'rental', month: CURRENT_MONTH, notes: '',
  });

  useEffect(() => {
    api.spending().then(setData).catch((e) => setErr(e.message));
    api.listMonthlyExpenses().then(setExpenses).catch(() => {});
  }, []);

  async function addExpense(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await api.addMonthlyExpense(form);
      setExpenses((prev) => [created, ...prev]);
      setForm({ label: '', amount: '', category: 'rental', month: CURRENT_MONTH, notes: '' });
      setShowForm(false);
    } catch (ex) {
      alert(ex.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense(id) {
    if (!confirm('Remove this expense?')) return;
    try {
      await api.deleteMonthlyExpense(id);
      setExpenses((prev) => prev.filter((x) => x.id !== id));
    } catch (ex) {
      alert(ex.message);
    }
  }

  if (err) return <div className="text-rose-600 p-4">{err}</div>;
  if (!data) return (
    <>
      <WakingUp loading={!data} />
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-brand rounded-full animate-spin" />
        <span className="text-sm">Loading spending…</span>
      </div>
    </>
  );

  const months = [...new Set(data.rows.map((r) => r.month))].sort();
  const chartData = months.map((m) => {
    const row = { month: m };
    for (const r of data.rows.filter((x) => x.month === m)) {
      row[r.category] = Number(r.total_spent);
    }
    return row;
  });

  const categories = Object.keys(data.by_category);
  const expensesTotal = expenses.reduce((s, x) => s + Number(x.amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Spending</h1>
        <p className="text-sm text-slate-500">
          Total restocking spend recorded from facility manager updates.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <div className="card">
          <div className="text-xs uppercase text-slate-500">Grand total</div>
          <div className="text-2xl font-bold text-slate-900">{fmt(data.grand_total)}</div>
        </div>
        {categories.map((c) => (
          <div key={c} className="card">
            <div className="text-xs uppercase text-slate-500 capitalize">
              {c.replace(/_/g, ' ')}
            </div>
            <div className="text-xl font-semibold text-slate-900">
              {fmt(data.by_category[c])}
            </div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div className="card">
        <h2 className="font-semibold mb-3">Spending by month &amp; category</h2>
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

      {/* Monthly Fixed Expenses */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold">Monthly Fixed Expenses</h2>
            <p className="text-xs text-slate-400">Rent, electricity, internet, and other recurring costs.</p>
          </div>
          {isLeadership && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="btn-secondary text-sm whitespace-nowrap"
            >
              {showForm ? 'Cancel' : '+ Add Expense'}
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={addExpense} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Label</label>
              <input
                className="input w-full"
                placeholder="e.g. Office Rent May"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Amount (₹)</label>
              <input
                className="input w-full"
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 45000"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Category</label>
              <select
                className="input w-full"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Month</label>
              <input
                className="input w-full"
                type="month"
                value={form.month}
                onChange={(e) => setForm({ ...form, month: e.target.value })}
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Notes (optional)</label>
              <input
                className="input w-full"
                placeholder="e.g. Paid by HDFC transfer"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn-primary w-full" disabled={saving}>
                {saving ? 'Saving...' : 'Add Expense'}
              </button>
            </div>
          </form>
        )}

        {expenses.length === 0 ? (
          <div className="text-slate-400 text-sm text-center py-8">
            No fixed expenses recorded yet.{isLeadership ? ' Click "+ Add Expense" to log rent or other monthly charges.' : ''}
          </div>
        ) : (
          <div className="space-y-2">
            {expenses.map((exp) => (
              <div key={exp.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-lg">
                <div className="min-w-0">
                  <div className="font-medium text-sm text-slate-800 truncate">{exp.label}</div>
                  <div className="text-xs text-slate-400 capitalize">
                    {exp.month} · {exp.category}
                    {exp.notes && ` · ${exp.notes}`}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className="text-sm font-semibold"
                    style={{ color: palette[exp.category] || '#64748b' }}
                  >
                    {fmt(exp.amount)}
                  </span>
                  {isLeadership && (
                    <button
                      onClick={() => deleteExpense(exp.id)}
                      className="text-slate-300 hover:text-rose-500 text-xl leading-none transition-colors"
                      title="Remove"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div className="flex justify-between items-center pt-3 border-t border-slate-200 font-semibold text-sm">
              <span className="text-slate-700">Total Fixed Expenses</span>
              <span className="text-slate-900">{fmt(expensesTotal)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
