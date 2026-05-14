import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { supabase } from '../lib/supabase.js';

const navByRole = {
  facility_manager: ['/dashboard', '/daily-update', '/available'],
  finance:          ['/dashboard', '/finance', '/available'],
  leadership:       ['/dashboard', '/daily-update', '/finance', '/available'],
  staff:            ['/available'],
};

const labels = {
  '/dashboard':     'Dashboard',
  '/daily-update':  'Daily Update',
  '/finance':       'Finance',
  '/available':     "What's Available",
};

export default function Layout() {
  const { profile } = useAuth();
  const links = profile ? navByRole[profile.role] || [] : [];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-brand text-white grid place-items-center font-bold">
              A
            </div>
            <span className="font-semibold text-slate-900">Applyways Pantry</span>
          </div>
          <nav className="hidden sm:flex items-center gap-1">
            {links.map((to) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm font-medium ${
                    isActive
                      ? 'bg-brand text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                {labels[to]}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <div className="text-right text-xs text-slate-500 hidden sm:block">
              <div className="font-medium text-slate-700">{profile?.full_name || '…'}</div>
              <div className="capitalize">{profile?.role?.replace('_', ' ')}</div>
            </div>
            <button
              className="btn-secondary"
              onClick={() => supabase.auth.signOut()}
            >
              Sign out
            </button>
          </div>
        </div>
        {/* mobile nav */}
        <nav className="sm:hidden flex overflow-x-auto gap-1 px-4 pb-3">
          {links.map((to) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-medium ${
                  isActive ? 'bg-brand text-white' : 'text-slate-600 bg-slate-100'
                }`
              }
            >
              {labels[to]}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-6">
        <Outlet />
      </main>
      <footer className="text-center text-xs text-slate-400 py-4">
        Applyways Office Pantry · Phase 1 MVP
      </footer>
    </div>
  );
}
