import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';

const ROLE_OPTIONS = [
  { value: 'leadership', label: 'Leadership (Admin)' },
  { value: 'facility_manager', label: 'Facility Manager' },
  { value: 'office_boy', label: 'Office Boy' },
  { value: 'finance', label: 'Finance' },
  { value: 'staff', label: 'Team Member' },
];
const ROLE_LABEL = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label]));

function RolePill({ role }) {
  const cls = {
    leadership: 'bg-violet-100 text-violet-800',
    facility_manager: 'bg-emerald-100 text-emerald-800',
    office_boy: 'bg-amber-100 text-amber-800',
    finance: 'bg-blue-100 text-blue-800',
    staff: 'bg-slate-100 text-slate-700',
  }[role] || 'bg-slate-100 text-slate-700';
  return <span className={`pill ${cls}`}>{ROLE_LABEL[role] || role}</span>;
}

export default function Admin() {
  const { profile } = useAuth();
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('staff');
  const [inviteName, setInviteName] = useState('');

  async function load() {
    setErr('');
    try {
      setUsers(await api.listUsers());
    } catch (e) {
      setErr(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function onChangeRole(userId, role) {
    setBusy(true);
    setErr('');
    setOkMsg('');
    try {
      await api.setUserRole(userId, role);
      setOkMsg('Role updated.');
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onInvite(e) {
    e.preventDefault();
    if (!inviteName.trim()) {
      setErr('Full name is required.');
      return;
    }

    setBusy(true);
    setErr('');
    setOkMsg('');
    try {
      await api.createUser({
        email: inviteEmail.trim(),
        role: inviteRole,
        full_name: inviteName.trim(),
      });
      setOkMsg(`${inviteName} added. They can use the password setup link from login to create their password.`);
      setInviteEmail('');
      setInviteName('');
      setInviteRole('staff');
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (err && !users) return <div className="text-rose-600">{err}</div>;
  if (!users) return <div className="text-slate-500">Loading users...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin - Users</h1>
        <p className="text-sm text-slate-500">Invite colleagues and assign their access. Leadership only.</p>
      </div>

      {okMsg && <div className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-md">{okMsg}</div>}
      {err && <div className="text-sm text-rose-700 bg-rose-50 p-3 rounded-md">{err}</div>}

      <div className="card">
        <h2 className="font-semibold mb-1">Add a team member</h2>
        <p className="text-xs text-slate-500 mb-4">
          Creates their account instantly. They can create a password from the login page setup link.
        </p>
        <form onSubmit={onInvite} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <input
            type="text"
            required
            placeholder="Full name"
            className="input sm:col-span-3"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
          />
          <input
            type="email"
            required
            placeholder="their@email.com"
            className="input sm:col-span-4"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <select
            className="input sm:col-span-3"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <button className="btn-primary sm:col-span-2" disabled={busy}>
            {busy ? 'Adding...' : '+ Add'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Existing users ({users.length})</h2>
        <div className="overflow-x-auto -mx-2 sm:mx-0">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Change to</th>
                <th className="py-2 pr-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = u.id === profile?.id;
                return (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium text-slate-900">
                      {u.full_name || '-'}
                      {isMe && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                    </td>
                    <td className="py-2 pr-3 text-slate-700">{u.email || '-'}</td>
                    <td className="py-2 pr-3"><RolePill role={u.role} /></td>
                    <td className="py-2 pr-3">
                      <select
                        className="input py-1 text-xs"
                        value={u.role}
                        disabled={busy || (isMe && u.role === 'leadership')}
                        onChange={(e) => onChangeRole(u.id, e.target.value)}
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3 text-slate-500 text-xs">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
