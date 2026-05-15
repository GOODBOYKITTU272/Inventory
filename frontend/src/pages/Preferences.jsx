import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Coffee, Save, CheckCircle2, ShieldCheck, Loader2, User, LogOut } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';

const TONES = ['Professional', 'Friendly', 'Funny', 'Mom Mode', 'Minimal'];

export default function Preferences() {
  const { profile } = useAuth();
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [success, setSuccess]   = useState(false);
  const [tableErr, setTableErr] = useState(false);
  const [prefs, setPrefs] = useState({
    tea_coffee_reminder_enabled: false,
    reminder_interval_hours: 2,
    preferred_drink: 'Tea',
    notification_enabled: true,
    notification_tone: 'Friendly',
  });

  useEffect(() => {
    if (!profile?.id) return;
    loadPrefs();
  }, [profile?.id]);

  async function loadPrefs() {
    try {
      const { data, error } = await supabase
        .from('employee_preferences')
        .select('*')
        .eq('employee_id', profile.id)
        .single();
      if (error && error.code !== 'PGRST116') {
        if (error.message?.includes('does not exist') || error.code === '42P01') {
          setTableErr(true);
        } else {
          throw error;
        }
      }
      if (data) setPrefs(data);
    } catch (e) {
      console.error('Failed to load preferences', e);
    } finally {
      setLoading(false);
    }
  }

  async function savePrefs() {
    if (tableErr) return;
    setSaving(true);
    setSuccess(false);
    try {
      const { error } = await supabase
        .from('employee_preferences')
        .upsert({ employee_id: profile.id, ...prefs });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      alert('Error saving preferences: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="animate-spin mr-2" size={20} /> Loading settings...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 text-sm">Your account preferences and notification settings.</p>
      </div>

      {/* Profile info */}
      <div className="card flex items-center gap-4">
        <div className="h-12 w-12 rounded-full bg-brand text-white grid place-items-center font-bold text-lg shrink-0">
          {(profile?.full_name || 'U').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 truncate">{profile?.full_name || '—'}</div>
          <div className="text-xs text-slate-500 truncate">{profile?.email || '—'}</div>
          <div className="text-xs text-brand font-medium capitalize mt-0.5">
            {profile?.role?.replace('_', ' ') || '—'}
          </div>
        </div>
        <button
          className="ml-auto btn-secondary text-sm flex items-center gap-1 shrink-0"
          onClick={() => supabase.auth.signOut()}
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>

      {tableErr && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm">
          <strong>Note:</strong> The preferences table hasn't been set up yet. Your settings won't be saved until the admin creates the <code className="bg-amber-100 px-1 rounded">employee_preferences</code> table in Supabase.
        </div>
      )}

      <div className="card space-y-8">
        {/* Tea & Coffee Reminders */}
        <div className="space-y-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Coffee size={18} className="text-brand" /> Tea &amp; Coffee Reminders
          </h2>

          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div>
              <div className="font-medium text-slate-900 text-sm">Enable Reminders</div>
              <div className="text-xs text-slate-500">Get nudged every few hours to stay refreshed</div>
            </div>
            <button
              onClick={() => setPrefs((p) => ({ ...p, tea_coffee_reminder_enabled: !p.tea_coffee_reminder_enabled }))}
              className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${prefs.tea_coffee_reminder_enabled ? 'bg-brand' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${prefs.tea_coffee_reminder_enabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 transition-opacity ${prefs.tea_coffee_reminder_enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Interval</label>
              <select
                value={prefs.reminder_interval_hours}
                onChange={(e) => setPrefs((p) => ({ ...p, reminder_interval_hours: parseInt(e.target.value) }))}
                className="input w-full"
              >
                <option value={1}>Every 1 hour</option>
                <option value={2}>Every 2 hours</option>
                <option value={3}>Every 3 hours</option>
                <option value={4}>Every 4 hours</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Preferred Drink</label>
              <select
                value={prefs.preferred_drink}
                onChange={(e) => setPrefs((p) => ({ ...p, preferred_drink: e.target.value }))}
                className="input w-full"
              >
                <option>Tea</option>
                <option>Coffee</option>
                <option>Water</option>
              </select>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Bell size={18} className="text-brand" /> Notifications
          </h2>
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div>
              <div className="font-medium text-slate-900 text-sm">Push Notifications</div>
              <div className="text-xs text-slate-500">Real-time updates for your requests</div>
            </div>
            <button
              onClick={() => setPrefs((p) => ({ ...p, notification_enabled: !p.notification_enabled }))}
              className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${prefs.notification_enabled ? 'bg-brand' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${prefs.notification_enabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
        </div>

        {/* AI Tone */}
        <div className="space-y-3 pt-4 border-t border-slate-100">
          <h2 className="text-base font-semibold">AI Personality Tone</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {TONES.map((tone) => (
              <button
                key={tone}
                onClick={() => setPrefs((p) => ({ ...p, notification_tone: tone }))}
                className={`p-3 rounded-xl border text-sm font-medium transition-all text-center ${
                  prefs.notification_tone === tone
                    ? 'bg-brand text-white border-brand shadow-md'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-brand/40'
                }`}
              >
                {tone === 'Mom Mode' && '💝 '}{tone}
              </button>
            ))}
          </div>
          {prefs.notification_tone === 'Mom Mode' && (
            <p className="text-xs text-brand italic">Mom Mode is warm and caring — the most "at-home" office experience.</p>
          )}
        </div>

        <button
          className="btn-primary w-full py-3 flex items-center justify-center gap-2"
          onClick={savePrefs}
          disabled={saving || tableErr}
        >
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>

        <AnimatePresence>
          {success && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center text-emerald-600 flex items-center justify-center gap-1 text-sm font-medium"
            >
              <CheckCircle2 size={16} /> Preferences saved!
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex gap-3 text-slate-600">
        <ShieldCheck size={20} className="shrink-0 text-brand mt-0.5" />
        <p className="text-xs leading-relaxed">
          <strong>Privacy:</strong> Your preferences are visible only to you and the system admin. The Office Boy only sees requests when they are submitted.
        </p>
      </div>
    </div>
  );
}
