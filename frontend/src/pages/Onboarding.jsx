import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../hooks/useAuth.js';
import { Check, ChevronLeft } from 'lucide-react';

/* ── Static data ─────────────────────────────────────────────────── */
const DRINK_OPTS = [
  { id: 'CCD Coffee',   emoji: '☕', label: 'CCD Coffee' },
  { id: 'Regular Tea',  emoji: '🍵', label: 'Regular Tea' },
  { id: 'Lemon Tea',    emoji: '🍋', label: 'Lemon Tea' },
  { id: 'Water',        emoji: '💧', label: 'Water Person' },
  { id: 'Snacks',       emoji: '🍪', label: 'Snacks Person' },
  { id: 'Lunch',        emoji: '🍱', label: 'Lunch Reminder' },
];

const SNACK_OPTS = [
  { id: 'Bread',         emoji: '🍞', label: 'Bread' },
  { id: 'Jam',           emoji: '🍓', label: 'Jam' },
  { id: 'Peanut Butter', emoji: '🥜', label: 'Peanut Butter' },
  { id: 'Biscuits',      emoji: '🍪', label: 'Biscuits' },
  { id: 'Fruits',        emoji: '🍎', label: 'Fruits' },
  { id: 'none',          emoji: '🚫', label: 'No Snacks' },
];

const COFFEE_TASTE  = ['Strong Coffee','Light Coffee','Less Sugar','No Sugar','With Milk','Without Milk'];
const TEA_TASTE     = ['Strong Tea','Light Tea','Less Sugar','No Sugar'];
const LEMON_TASTE   = ['Normal','Less Sugar','Strong Lemon','Mild Lemon'];

const LOCATION_OPTS = ['My Cabin','My Desk','Meeting Room','Pantry Pickup','Ask Every Time'];

const TONE_OPTS = [
  { id:'Professional', emoji:'👔', label:'Professional', example:'"Your coffee reminder is ready."' },
  { id:'Friendly',     emoji:'😊', label:'Friendly',     example:'"Coffee time? Should we send your usual?"' },
  { id:'Funny',        emoji:'😄', label:'Funny',        example:'"Coffee is calling. Should we answer?"' },
  { id:'Mom Mode',     emoji:'💝', label:'Mom Mode',     example:'"Two days no coffee? Are you okay? 😄"' },
  { id:'Minimal',      emoji:'⚡', label:'Minimal',      example:'"Coffee?"' },
];

const CATEGORIES = [
  { emoji:'🍵', label:'Tea' },    { emoji:'☕', label:'Coffee' },
  { emoji:'🍋', label:'Lemon Tea' }, { emoji:'💧', label:'Water' },
  { emoji:'🍪', label:'Snacks' }, { emoji:'🍱', label:'Lunch' },
  { emoji:'✏️', label:'Stationery' }, { emoji:'🧹', label:'Cleaning' },
  { emoji:'🔧', label:'Maintenance' }, { emoji:'🏢', label:'Meeting Room' },
];

const TIMELINE = ['📋 Placed','✅ Accepted','☕ Preparing','🛵 On the Way','🎉 Delivered'];

/* ── Reusable chip components ────────────────────────────────────── */
function MultiChip({ emoji, label, selected, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-2 px-4 py-3 rounded-2xl border-2 font-medium text-sm transition-all ${
        selected
          ? 'border-brand bg-brand text-white shadow-md shadow-brand/20'
          : 'border-slate-200 bg-white text-slate-700 hover:border-brand/40'
      }`}
    >
      <span className="text-lg">{emoji}</span>
      {label}
      {selected && <Check size={13} className="ml-1 shrink-0" />}
    </button>
  );
}

function SingleChip({ emoji, label, example, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex items-start gap-3 p-4 rounded-2xl border-2 w-full text-left transition-all ${
        selected ? 'border-brand bg-brand/5' : 'border-slate-200 hover:border-brand/30'
      }`}
    >
      {emoji && <span className="text-2xl shrink-0 mt-0.5">{emoji}</span>}
      <div className="min-w-0">
        <div className={`font-semibold text-sm ${selected ? 'text-brand' : 'text-slate-800'}`}>{label}</div>
        {example && <div className="text-xs text-slate-400 mt-0.5 italic">{example}</div>}
      </div>
      {selected && <Check size={16} className="ml-auto shrink-0 text-brand mt-0.5" />}
    </button>
  );
}

function NavBar({ step, total, onBack, onNext, nextLabel = 'Next', nextDisabled = false }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-6 py-4 flex gap-3 max-w-lg mx-auto">
      {step > 0 && (
        <button type="button" onClick={onBack} className="btn-secondary flex items-center gap-1 px-4">
          <ChevronLeft size={16} /> Back
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="btn-primary flex-1 py-3 text-base font-semibold disabled:opacity-40"
      >
        {nextLabel}
      </button>
    </div>
  );
}

/* ── Individual steps ────────────────────────────────────────────── */
function StepWelcome({ onNext }) {
  return (
    <div className="text-center py-12 space-y-6">
      <motion.div animate={{ rotate: [0, -10, 10, -5, 5, 0] }} transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 3 }} className="text-8xl">
        🍽️
      </motion.div>
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Welcome to<br />Office Café</h1>
        <p className="text-slate-500 mt-3 text-base leading-relaxed">
          Order tea, coffee, snacks, water, lunch, stationery, and office help — in a few taps.
        </p>
      </div>
      <button onClick={onNext} className="btn-primary w-full py-4 text-lg font-bold">
        Get Started →
      </button>
    </div>
  );
}

function StepCategories({ onNext, onBack }) {
  return (
    <div className="space-y-6 pb-24">
      <div className="text-center pt-4">
        <div className="text-5xl mb-3">🛒</div>
        <h2 className="text-2xl font-bold text-slate-900">What You Can Order</h2>
        <p className="text-slate-500 mt-2 text-sm">We'll send it to your desk, cabin, or meeting room.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {CATEGORIES.map(({ emoji, label }) => (
          <div key={label} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-2xl">{emoji}</span>
            <span className="text-sm font-medium text-slate-700">{label}</span>
          </div>
        ))}
      </div>
      <NavBar step={1} total={10} onBack={onBack} onNext={onNext} />
    </div>
  );
}

function StepTracking({ onNext, onBack }) {
  return (
    <div className="space-y-6 pb-24">
      <div className="text-center pt-4">
        <div className="text-5xl mb-3">🛵</div>
        <h2 className="text-2xl font-bold text-slate-900">Live Order Tracking</h2>
        <p className="text-slate-500 mt-2 text-sm">Track your request just like a food delivery app.</p>
      </div>
      <div className="space-y-3">
        {TIMELINE.map((stage, i) => (
          <motion.div
            key={stage}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className={`flex items-center gap-4 p-4 rounded-2xl border ${
              i === 3 ? 'border-brand bg-brand/5 ring-1 ring-brand/20' : 'border-slate-200 bg-slate-50'
            }`}
          >
            <span className="text-2xl">{stage.split(' ')[0]}</span>
            <div>
              <div className={`font-semibold text-sm ${i === 3 ? 'text-brand' : 'text-slate-700'}`}>
                {stage.split(' ').slice(1).join(' ')}
              </div>
              {i === 3 && (
                <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}
                  className="text-xs text-brand mt-0.5">Live update ●</motion.div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
      <NavBar step={2} total={10} onBack={onBack} onNext={onNext} />
    </div>
  );
}

function StepDrinks({ prefs, toggle, onNext, onBack }) {
  return (
    <div className="space-y-6 pb-24">
      <div className="text-center pt-4">
        <div className="text-5xl mb-3">☕</div>
        <h2 className="text-2xl font-bold text-slate-900">What do you usually like?</h2>
        <p className="text-slate-500 mt-2 text-sm">Select all that apply.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {DRINK_OPTS.map(({ id, emoji, label }) => (
          <MultiChip
            key={id}
            emoji={emoji}
            label={label}
            selected={prefs.drinks.includes(id)}
            onToggle={() => toggle(id)}
          />
        ))}
      </div>
      <NavBar step={3} total={10} onBack={onBack} onNext={onNext} />
    </div>
  );
}

function StepSnacks({ prefs, toggle, onNext, onBack }) {
  return (
    <div className="space-y-6 pb-24">
      <div className="text-center pt-4">
        <div className="text-5xl mb-3">🍪</div>
        <h2 className="text-2xl font-bold text-slate-900">What snacks do you like?</h2>
        <p className="text-slate-500 mt-2 text-sm">Select all that apply.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {SNACK_OPTS.map(({ id, emoji, label }) => (
          <MultiChip
            key={id}
            emoji={emoji}
            label={label}
            selected={prefs.snacks.includes(id)}
            onToggle={() => toggle(id)}
          />
        ))}
      </div>
      <NavBar step={4} total={10} onBack={onBack} onNext={onNext} />
    </div>
  );
}

function StepTaste({ prefs, toggle, onNext, onBack }) {
  const hasCoffee = prefs.drinks.some(d => d.toLowerCase().includes('coffee'));
  const hasTea    = prefs.drinks.some(d => d === 'Regular Tea');
  const hasLemon  = prefs.drinks.includes('Lemon Tea');

  const groups = [];
  if (hasCoffee) groups.push({ label: '☕ Coffee Taste', opts: COFFEE_TASTE });
  if (hasTea)    groups.push({ label: '🍵 Tea Taste',    opts: TEA_TASTE });
  if (hasLemon)  groups.push({ label: '🍋 Lemon Tea',    opts: LEMON_TASTE });

  if (!groups.length) {
    return (
      <div className="space-y-6 pb-24">
        <div className="text-center pt-10 text-slate-400 space-y-3">
          <div className="text-5xl">🤷</div>
          <p>No drink selected — skipping taste preferences.</p>
        </div>
        <NavBar step={5} total={10} onBack={onBack} onNext={onNext} />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="text-center pt-4">
        <div className="text-5xl mb-3">🎨</div>
        <h2 className="text-2xl font-bold text-slate-900">Your Taste Preference</h2>
        <p className="text-slate-500 mt-2 text-sm">Select all that apply.</p>
      </div>
      {groups.map(({ label, opts }) => (
        <div key={label}>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</div>
          <div className="grid grid-cols-2 gap-2">
            {opts.map((opt) => (
              <MultiChip
                key={opt}
                emoji=""
                label={opt}
                selected={prefs.tastes.includes(opt)}
                onToggle={() => toggle(opt)}
              />
            ))}
          </div>
        </div>
      ))}
      <NavBar step={5} total={10} onBack={onBack} onNext={onNext} />
    </div>
  );
}

function StepLocation({ prefs, set, onNext, onBack }) {
  return (
    <div className="space-y-6 pb-24">
      <div className="text-center pt-4">
        <div className="text-5xl mb-3">📍</div>
        <h2 className="text-2xl font-bold text-slate-900">Where should we send your orders?</h2>
        <p className="text-slate-500 mt-2 text-sm">Default delivery location.</p>
      </div>
      <div className="space-y-2">
        {LOCATION_OPTS.map((loc) => (
          <SingleChip
            key={loc}
            label={loc}
            selected={prefs.location === loc}
            onSelect={() => set('location', loc)}
          />
        ))}
      </div>
      {prefs.location && prefs.location !== 'Ask Every Time' && prefs.location !== 'Pantry Pickup' && (
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Floor (optional)</label>
            <input className="input" placeholder="e.g. 2" value={prefs.floor} onChange={e => set('floor', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Cabin / Desk No.</label>
            <input className="input" placeholder="e.g. Cabin 2" value={prefs.desk} onChange={e => set('desk', e.target.value)} />
          </div>
        </div>
      )}
      <NavBar step={6} total={10} onBack={onBack} onNext={onNext} />
    </div>
  );
}

function StepReminders({ prefs, set, onNext, onBack }) {
  const items = [
    { key: 'morningReminder',   label: 'Morning Tea/Coffee', sub: 'Default: 10:45 AM', timeKey: 'morningTime',   defTime: '10:45' },
    { key: 'afternoonReminder', label: 'Afternoon Drink',    sub: 'Default: 2:45 PM',  timeKey: 'afternoonTime', defTime: '14:45' },
    { key: 'lunchReminder',     label: 'Lunch Reminder',     sub: 'Default: 12:45 PM', timeKey: 'lunchTime',     defTime: '12:45' },
    { key: 'waterReminder',     label: 'Water Reminder',     sub: 'Hydration nudges',  timeKey: null,            defTime: null },
  ];

  return (
    <div className="space-y-6 pb-24">
      <div className="text-center pt-4">
        <div className="text-5xl mb-3">🔔</div>
        <h2 className="text-2xl font-bold text-slate-900">When should we remind you?</h2>
        <p className="text-slate-500 mt-2 text-sm">You can change or turn off reminders anytime.</p>
      </div>
      <div className="space-y-3">
        {items.map(({ key, label, sub, timeKey, defTime }) => (
          <div key={key} className={`p-4 rounded-2xl border-2 transition-all ${prefs[key] ? 'border-brand bg-brand/5' : 'border-slate-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm text-slate-800">{label}</div>
                <div className="text-xs text-slate-500">{sub}</div>
              </div>
              <button
                type="button"
                onClick={() => set(key, !prefs[key])}
                className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${prefs[key] ? 'bg-brand' : 'bg-slate-300'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${prefs[key] ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
            {prefs[key] && timeKey && (
              <input
                type="time"
                className="input mt-3"
                defaultValue={defTime}
                onChange={e => set(timeKey, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
      <NavBar step={7} total={10} onBack={onBack} onNext={onNext} />
    </div>
  );
}

function StepTone({ prefs, set, onNext, onBack }) {
  return (
    <div className="space-y-6 pb-24">
      <div className="text-center pt-4">
        <div className="text-5xl mb-3">💬</div>
        <h2 className="text-2xl font-bold text-slate-900">How should we talk to you?</h2>
        <p className="text-slate-500 mt-2 text-sm">This controls notification style and AI personality.</p>
      </div>
      <div className="space-y-2">
        {TONE_OPTS.map(({ id, emoji, label, example }) => (
          <SingleChip
            key={id}
            emoji={emoji}
            label={label}
            example={example}
            selected={prefs.tone === id}
            onSelect={() => set(id)}
          />
        ))}
      </div>
      <NavBar step={8} total={10} onBack={onBack} onNext={onNext} nextLabel="Almost Done →" />
    </div>
  );
}

function StepDone({ onFinish, saving }) {
  return (
    <div className="text-center py-16 space-y-6">
      <motion.div
        animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
        transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
        className="text-8xl"
      >
        🎉
      </motion.div>
      <div>
        <h1 className="text-3xl font-bold text-slate-900">All Set!</h1>
        <p className="text-slate-500 mt-3 text-base">
          Your Office Café is personalized and ready.<br />
          Order anything. We'll send it to you.
        </p>
      </div>
      <button
        onClick={onFinish}
        disabled={saving}
        className="btn-primary w-full py-4 text-lg font-bold"
      >
        {saving ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Saving…
          </span>
        ) : (
          '☕ Start Ordering'
        )}
      </button>
    </div>
  );
}

/* ── Main Onboarding component ───────────────────────────────────── */
export default function Onboarding({ onComplete }) {
  const { session } = useAuth();
  const [step, setStep]   = useState(0);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs]  = useState({
    drinks: [],
    snacks: [],
    tastes: [],
    location: '',
    floor: '',
    desk: '',
    morningReminder:   true,
    morningTime:       '10:45',
    afternoonReminder: false,
    afternoonTime:     '14:45',
    lunchReminder:     false,
    lunchTime:         '12:45',
    waterReminder:     false,
    tone: 'Friendly',
  });

  const TOTAL = 10;

  function toggle(field, value) {
    setPrefs(p => ({
      ...p,
      [field]: p[field].includes(value)
        ? p[field].filter(x => x !== value)
        : [...p[field], value],
    }));
  }
  function set(field, value) {
    setPrefs(p => ({ ...p, [field]: value }));
  }

  async function finish() {
    setSaving(true);
    try {
      const drinks = prefs.drinks.filter(d => ['CCD Coffee','Regular Tea','Lemon Tea'].includes(d));
      const primary   = drinks[0] || prefs.drinks[0] || null;
      const secondary = drinks[1] || null;

      const { error } = await supabase
        .from('employee_cafeteria_preferences')
        .upsert({
          employee_id:               session.user.id,
          preferred_drink:           primary,
          secondary_drink:           secondary,
          preferred_snacks:          prefs.snacks.filter(s => s !== 'none'),
          sugar_preference:          prefs.tastes.find(t => t.toLowerCase().includes('sugar')) || null,
          strength_preference:       prefs.tastes.find(t => ['Strong Coffee','Light Coffee','Strong Tea','Light Tea','Normal','Strong Lemon','Mild Lemon'].includes(t)) || null,
          milk_preference:           prefs.tastes.find(t => t.toLowerCase().includes('milk')) || null,
          usual_location:            prefs.location || null,
          usual_floor:               prefs.floor || null,
          usual_desk:                prefs.desk || null,
          reminder_morning_enabled:  prefs.morningReminder,
          reminder_morning_time:     prefs.morningTime,
          reminder_afternoon_enabled:prefs.afternoonReminder,
          reminder_afternoon_time:   prefs.afternoonTime,
          lunch_reminder_enabled:    prefs.lunchReminder,
          lunch_reminder_time:       prefs.lunchTime,
          water_reminder_enabled:    prefs.waterReminder,
          notification_tone:         prefs.tone,
          personalization_enabled:   true,
          max_daily_reminders:       2,
          onboarding_completed:      true,
          onboarding_completed_at:   new Date().toISOString(),
        }, { onConflict: 'employee_id' });

      if (error) throw error;
      onComplete(prefs);
    } catch (e) {
      alert('Could not save preferences: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function skip() {
    setSaving(true);
    try {
      await supabase
        .from('employee_cafeteria_preferences')
        .upsert({
          employee_id:          session.user.id,
          notification_tone:    'Friendly',
          personalization_enabled: true,
          onboarding_completed: true,
          onboarding_completed_at: new Date().toISOString(),
        }, { onConflict: 'employee_id' });
      onComplete({});
    } catch (e) {
      onComplete({});
    } finally {
      setSaving(false);
    }
  }

  const next = () => setStep(s => Math.min(s + 1, TOTAL - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));

  const stepComponents = [
    <StepWelcome      key={0} onNext={next} />,
    <StepCategories   key={1} onNext={next} onBack={back} />,
    <StepTracking     key={2} onNext={next} onBack={back} />,
    <StepDrinks       key={3} prefs={prefs} toggle={v => toggle('drinks', v)} onNext={next} onBack={back} />,
    <StepSnacks       key={4} prefs={prefs} toggle={v => toggle('snacks', v)} onNext={next} onBack={back} />,
    <StepTaste        key={5} prefs={prefs} toggle={v => toggle('tastes', v)} onNext={next} onBack={back} />,
    <StepLocation     key={6} prefs={prefs} set={set} onNext={next} onBack={back} />,
    <StepReminders    key={7} prefs={prefs} set={set} onNext={next} onBack={back} />,
    <StepTone         key={8} prefs={prefs} set={v => set('tone', v)} onNext={next} onBack={back} />,
    <StepDone         key={9} onFinish={finish} saving={saving} />,
  ];

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col overflow-hidden">
      {/* Progress bar + skip */}
      <div className="px-6 pt-6 pb-2 flex items-center gap-3">
        <div className="flex gap-1 flex-1">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'flex-[2] bg-brand' : i < step ? 'flex-1 bg-brand/30' : 'flex-1 bg-slate-100'
              }`}
            />
          ))}
        </div>
        {step > 0 && step < 9 && (
          <button onClick={skip} className="text-xs text-slate-400 hover:text-slate-600 whitespace-nowrap">
            Skip setup
          </button>
        )}
      </div>

      {/* Step counter */}
      <div className="text-center text-xs text-slate-400 pb-1">
        {step + 1} of {TOTAL}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-6 py-2">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.2 }}
            >
              {stepComponents[step]}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
