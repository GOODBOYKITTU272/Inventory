import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { api } from '../lib/api.js';
import { motion } from 'framer-motion';
import { 
  Bell, 
  Coffee, 
  Clock, 
  Save,
  CheckCircle2,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';

export default function Preferences() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [prefs, setPrefs] = useState({
    tea_coffee_reminder_enabled: false,
    reminder_interval_hours: 2,
    preferred_drink: 'Tea',
    notification_enabled: true,
    notification_tone: 'Friendly'
  });

  useEffect(() => {
    loadPrefs();
  }, []);

  async function loadPrefs() {
    try {
      const { data, error } = await supabase
        .from('employee_preferences')
        .select('*')
        .eq('employee_id', profile.id)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      if (data) setPrefs(data);
    } catch (e) {
      console.error('Failed to load preferences', e);
    } finally {
      setLoading(false);
    }
  }

  async function savePrefs() {
    setSaving(true);
    setSuccess(false);
    try {
      const { error } = await supabase
        .from('employee_preferences')
        .upsert({
          employee_id: profile.id,
          ...prefs,
        });
      
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      alert('Error saving preferences: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Loading settings...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Your Preferences</h1>
        <p className="text-slate-500">Customize how you interact with the Office Boy and notifications.</p>
      </div>

      <div className="card space-y-8">
        {/* Reminder Settings */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Coffee size={20} className="text-brand" />
            Tea & Coffee Reminders
          </h2>
          
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div>
              <div className="font-medium text-slate-900">Enable Reminders</div>
              <div className="text-xs text-slate-500">Get a notification every few hours to stay refreshed</div>
            </div>
            <button 
              onClick={() => setPrefs(p => ({...p, tea_coffee_reminder_enabled: !p.tea_coffee_reminder_enabled}))}
              className={`w-12 h-6 rounded-full transition-colors relative ${prefs.tea_coffee_reminder_enabled ? 'bg-brand' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${prefs.tea_coffee_reminder_enabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          <div className={`space-y-4 transition-opacity ${prefs.tea_coffee_reminder_enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Interval</label>
                <select 
                  value={prefs.reminder_interval_hours}
                  onChange={(e) => setPrefs(p => ({...p, reminder_interval_hours: parseInt(e.target.value)}))}
                  className="input"
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
                  onChange={(e) => setPrefs(p => ({...p, preferred_drink: e.target.value}))}
                  className="input"
                >
                  <option value="Tea">Tea</option>
                  <option value="Coffee">Coffee</option>
                  <option value="Water">Water</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bell size={20} className="text-brand" />
            Notification Settings
          </h2>
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div>
              <div className="font-medium text-slate-900">Push Notifications</div>
              <div className="text-xs text-slate-500">Enable real-time updates for your requests</div>
            </div>
            <button 
              onClick={() => setPrefs(p => ({...p, notification_enabled: !p.notification_enabled}))}
              className={`w-12 h-6 rounded-full transition-colors relative ${prefs.notification_enabled ? 'bg-brand' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${prefs.notification_enabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          <div className="pt-4">
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-3">AI Personality (Tone)</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {['Professional', 'Friendly', 'Funny', 'Mom Mode', 'Minimal'].map(tone => (
                <button
                  key={tone}
                  onClick={() => setPrefs(p => ({...p, notification_tone: tone}))}
                  className={`
                    p-3 rounded-xl border text-sm font-medium transition-all text-center
                    ${prefs.notification_tone === tone 
                      ? 'bg-brand text-white border-brand shadow-lg shadow-brand/20' 
                      : 'bg-white text-slate-600 border-slate-200 hover:border-brand/40'}
                  `}
                >
                  {tone === 'Mom Mode' && '💝 '}
                  {tone}
                </button>
              ))}
            </div>
            {prefs.notification_tone === 'Mom Mode' && (
              <p className="mt-3 text-[10px] text-brand italic font-medium">
                * Mom Mode is caring, warm, and playful. Use this for the most "at-home" office experience.
              </p>
            )}
          </div>
        </div>

        <button 
          className="btn-primary w-full py-3 flex items-center justify-center gap-2"
          onClick={savePrefs}
          disabled={saving}
        >
          {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>

        <AnimatePresence>
          {success && (
            <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0}} className="text-center text-emerald-600 flex items-center justify-center gap-1 text-sm font-medium">
              <CheckCircle2 size={16} />
              Preferences saved successfully!
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 flex gap-3 text-amber-800">
        <ShieldCheck size={24} className="shrink-0" />
        <div className="text-xs leading-relaxed">
          <strong>Privacy Note:</strong> Your preferences are only visible to you and the system administrator. The Office Boy only sees your requests when they are generated.
        </div>
      </div>
    </div>
  );
}

function Loader2(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
