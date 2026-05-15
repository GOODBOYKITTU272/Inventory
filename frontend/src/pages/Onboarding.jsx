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
  { id: 'Water',        emoji: '💧', label: 'Water' },
  { id: 'Black Coffee', emoji: '🖤', label: 'Black Coffee' },
  { id: 'None',         emoji: '🚫', label: 'None for me' },
];

const SNACK_OPTS = [
  { id: 'Bread + Peanut Butter', emoji: '🥜', label: 'Bread + PB' },
  { id: 'Bread + Jam',           emoji: '🍓', label: 'Bread + Jam' },
  { id: 'Biscuits',              emoji: '🍪', label: 'Biscuits' },
  { id: 'none',                  emoji: '🚫', label: 'No Snacks' },
];

const COFFEE_TASTE  = ['Strong Coffee','Light Coffee','Less Sugar','No Sugar','With Milk','Without Milk'];
const TEA_TASTE     = ['Strong Tea','Light Tea','Less Sugar','No Sugar'];
const LEMON_TASTE   = ['Normal','Less Sugar','Strong Lemon','Mild Lemon'];

const LOCATION_OPTS = [
  { id: 'Balaji Cabin',     label: 'Balaji Cabin' },
  { id: 'RK Cabin',         label: 'RK Cabin' },
  { id: 'Manisha Cabin',    label: 'Manisha Cabin' },
  { id: 'Resume Cabin',     label: 'Resume Cabin' },
  { id: 'Tech Team',        label: 'Tech Team' },
  { id: 'Marketing Team',   label: 'Marketing Team' },
  { id: 'Conference Room',  label: 'Conference Room' },
  { id: 'Ask Every Time',   label: 'Ask me every time' },
];

const TONE_OPTS = [
  { id: 'gen_z',        emoji: '🔥', label: 'Gen-Z Vibes',    example: '"Your coffee is on its way bestie! ☕🚀"' },
  { id: 'Friendly',     emoji: '😊', label: 'Friendly',       example: '"Coffee time! Should we send your usual?"' },
  { id: 'Professional', emoji: '👔', label: 'Professional',   example: '"Your coffee reminder is ready."' },
  { id: 'Funny',        emoji: '😄', label: 'Funny',          example: '"Coffee is calling. Should we answer?"' },
  { id: 'Mom Mode',     emoji: '💝', label: 'Mom Mode',       example: '"Two days no coffee? Are you okay? 😄"' },
];

/* ── Reusable chip components ────────────────────────────────────── */
function MultiChip({ emoji, label, selected, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-2 px-4 py-3 rounded-2xl border-2 font-medium text-sm transition-all active:scale-95 ${
        selected
          ? 'border-brand bg-brand text-white shadow-md shadow-brand/20'
          : 'border-slate-200 bg-white text-slate-700 hover:border-brand/40'
      }`}
    >
      <span className="text-lg">{emoji}</span>
      {label}
      {selected && <Check size={13} className="ml-auto shrink-0" />}
    </button>
  );
}

function SingleChip({ emoji, label, example, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex items-start gap-3 p-4 rounded-2xl border-2 w-full text-left transition-all active:scale-[0.99] ${
        selected ? 'border-brand bg-brand/5' : 'border-slate-200 hover:border-brand/30'
      }`}
    >
      {emoji && <span className="text-2xl shrink-0 mt-0.5">{emoji}</span>}
      <div className="min-w-0 flex-1">
        <div className={`font-semibold text-sm ${selected ? 'text-brand' : 'text-slate-800'}`}>{label}</div>
        {example && <div className="text-xs text-slate-400 mt-0.5 italic">{example}</div>}
      </div>
      {selected && <Check size={16} className="ml-auto shrink-0 text-brand mt-0.5" />}
    </button>
  );
}

function NavBar({ step, onBack, onNext, nextLabel = 'Next', nextDisabled = false }) {
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

/* ── Steps ────────────────────────────────────────────────────────── */

// Step 0 — Welcome
function StepWelcome({ onNext }) {
  return (
    <div className="text-center py-12 space-y-6">
      <motion.div
        animate={{ rotate: [0, -10, 10, -5, 5, 0] }}
        transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 3 }}
        className="text-8xl"
      >
        🍽️
      </motion.div>
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Welcome to<br />Office Café ☕</h1>
        <p className="text-slate-500 mt-3 text-base leading-relaxed">
          Order tea, coffee, snacks, lunch, and more — delivered to your desk in minutes.
          <br /><br />
          Let's set up your preferences in 30 seconds.
        </p>
      </div>
      <button onClick={onNext} className="btn-primary w-full py-4 text-lg font-bold">
        Get Started →
      </button>
    </div>
  );
}

// Step 1 — Preferred name
function StepName({ prefs, set, onNext, onBack }) {
  return (
    <div className="space-y-6 pb-28">
      <div className="text-center pt-4">
        <div className="text-5xl mb-3">👋</div>
        <h2 className="text-2xl font-bold text-slate-900">What should we call you?</h2>
        <p className="text-slate-500 mt-2 text-sm">
          The office boy will see this name when your order arrives.
          <br />Use your first name or a nickname — whatever feels right.
        </p>
      </div>

      <div className="space-y-3">
        <input
          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-4 text-lg font-semibold text-slate-800 placeholder:text-slate-300 focus:border-brand focus:outline-none text-center"
          placeholder="e.g. Naga, Rama, RK…"
          value={prefs.displayName}
          onChange={(e) => set('displayName', e.target.value)}
          maxLength={30}
          autoFocus
        />
        <p className="text-center text-xs text-slate-400">
          Your order will say: <span className="font-bold text-slate-600">"{prefs.displayName || 'Your name'} needs 1x CCD Coffee to Balaji Cabin 🚀"</span>
        </p>
      </div>

      <NavBar step={1} onBack={onBack} onNext={onNext} nextDisabled={!prefs.displayName?.trim()} />
    </div>
  );
}

// Step 2 — Drinks
function StepDrinks({ prefs, toggle, onNext, onBack }) {
  return (
    <div className="space-y-6 pb-28">
      <div className="text-center pt-4">
        <div className="text-5xl mb-3">☕</div>
        <h2 className="text-2xl font-bold text-slate-900">What do you drink?</h2>
        <p className="text-slate-500 mt-2 text-sm">Select all that apply — we'll personalise your home screen.</p>
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
      <NavBar step={1} onBack={onBack} onNext={onNext} />
    </div>
  );
}

// Step 2 — Snacks
function StepSnacks({ prefs, toggle, onNext, onBack }) {
  return (
    <div className="space-y-6 pb-28">
      <div className="text-center pt-4">
        <div className="text-5xl mb-3">🍪</div>
        <h2 className="text-2xl font-bold text-slate-900">Snacks & food?</h2>
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
      <NavBar step={2} onBack={onBack} onNext={onNext} />
    </div>
  );
}

// Step 3 — Taste preferences (dynamic based on drink selection)
function StepTaste({ prefs, toggle, onNext, onBack }) {
  const hasCoffee = prefs.drinks.some(d => d.toLowerCase().includes('coffee'));
  const hasTea    = prefs.drinks.includes('Regular Tea');
  const hasLemon  = prefs.drinks.includes('Lemon Tea');

  const groups = [];
  if (hasCoffee) groups.push({ label: '☕ Coffee — how do you take it?', opts: COFFEE_TASTE });
  if (hasTea)    groups.push({ label: '🍵 Tea — how do you like it?',    opts: TEA_TASTE });
  if (hasLemon)  groups.push({ label: '🍋 Lemon Tea preference',         opts: LEMON_TASTE });

  if (!groups.length) {
    return (
      <div className="space-y-6 pb-28">
        <div className="text-center pt-10 text-slate-400 space-y-3">
          <div className="text-5xl">🤷</div>
          <p className="text-sm">No hot drinks selected — skipping taste preferences.</p>
        </div>
        <NavBar step={3} onBack={onBack} onNext={onNext} nextLabel="Skip →" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-28">
      <div className="text-center pt-4">
        <div className="text-5xl mb-3">🎨</div>
        <h2 className="text-2xl font-bold text-slate-900">Your taste preference</h2>
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
      <NavBar step={3} onBack={onBack} onNext={onNext} />
    </div>
  );
}

// Step 4 — Location
function StepLocation({ prefs, set, onNext, onBack }) {
  return (
    <div className="space-y-6 pb-28">
      <div className="text-center pt-4">
        <div className="text-5xl mb-3">📍</div>
        <h2 className="text-2xl font-bold text-slate-900">Where's your usual spot?</h2>
        <p className="text-slate-500 mt-2 text-sm">We'll pre-fill this when you order.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {LOCATION_OPTS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => set('location', id === prefs.location ? '' : id)}
            className={`p-3 rounded-2xl border-2 text-sm font-semibold transition-all active:scale-95 ${
              prefs.location === id
                ? 'border-brand bg-brand text-white shadow-md shadow-brand/20'
                : 'border-slate-200 bg-white text-slate-700 hover:border-brand/30'
            }`}
          >
            {prefs.location === id && <Check size={12} className="inline mr-1" />}
            {label}
          </button>
        ))}
      </div>
      <NavBar step={4} onBack={onBack} onNext={onNext} />
    </div>
  );
}

// Step 5 — Reminders
function StepReminders({ prefs, set, onNext, onBack }) {
  const items = [
    { key: 'morningReminder',   label: '☀️ Morning drink',       sub: 'Reminds you around 10:45 AM',  timeKey: 'morningTime',   defTime: '10:45' },
    { key: 'afternoonReminder', label: '🌤️ Afternoon drink',     sub: 'Reminds you around 2:45 PM',   timeKey: 'afternoonTime', defTime: '14:45' },
    { key: 'lunchReminder',     label: '🍱 Lunch reminder',       sub: 'Reminds you around 12:45 PM',  timeKey: 'lunchTime',     defTime: '12:45' },
    { key: 'waterReminder',     label: '💧 Hydration nudge',      sub: 'Reminds you to drink water',   timeKey: null,            defTime: null },
  ];

  return (
    <div className="space-y-6 pb-28">
      <div className="text-center pt-4">
        <div className="text-5xl mb-3">🔔</div>
        <h2 className="text-2xl font-bold text-slate-900">Remind me to order?</h2>
        <p className="text-slate-500 mt-2 text-sm">Toggle what you want. Change anytime in Settings.</p>
      </div>
      <div className="space-y-3">
        {items.map(({ key, label, sub, timeKey, defTime }) => (
          <div key={key} className={`p-4 rounded-2xl border-2 transition-all ${prefs[key] ? 'border-brand bg-brand/5' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
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
                className="input mt-3 w-full"
                defaultValue={defTime}
                onChange={e => set(timeKey, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
      <NavBar step={5} onBack={onBack} onNext={onNext} />
    </div>
  );
}

// Step 6 — Tone
function StepTone({ prefs, set, onNext, onBack }) {
  return (
    <div className="space-y-6 pb-28">
      <div className="text-center pt-4">
        <div className="text-5xl mb-3">💬</div>
        <h2 className="text-2xl font-bold text-slate-900">How should we talk to you?</h2>
        <p className="text-slate-500 mt-2 text-sm">Controls notifications and AI personality.</p>
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
      <NavBar step={6} onBack={onBack} onNext={onNext} nextLabel="Almost Done →" />
    </div>
  );
}

// Step 7 — Done
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
          Order anything. We'll send it right to you.
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

/* ── Main Onboarding ─────────────────────────────────────────────── */
const TOTAL = 9;

export default function Onboarding({ onComplete }) {
  const { session } = useAuth();
  const [step,   setStep]   = useState(0);
  const [saving, setSaving] = useState(false);

  // Pre-fill displayName from Microsoft profile (full_name or email prefix)
  const defaultName = (() => {
    const meta = session?.user?.user_metadata;
    const name = meta?.full_name || meta?.name || meta?.preferred_username || '';
    return name.split(' ')[0] || '';
  })();

  const [prefs,  setPrefs]  = useState({
    displayName: defaultName,
    drinks: [],
    snacks: [],
    tastes: [],
    location: '',
    morningReminder:   true,
    morningTime:       '10:45',
    afternoonReminder: false,
    afternoonTime:     '14:45',
    lunchReminder:     false,
    lunchTime:         '12:45',
    waterReminder:     false,
    tone: 'gen_z',
  });

  function toggleArr(field, value) {
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

  const next = () => setStep(s => Math.min(s + 1, TOTAL - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));

  async function savePrefs(data) {
    const { error } = await supabase
      .from('employee_cafeteria_preferences')
      .upsert(data, { onConflict: 'user_id' });
    if (error) throw error;
  }

  async function finish() {
    setSaving(true);
    try {
      // Save preferred name back to profiles so backend uses it
      if (prefs.displayName?.trim()) {
        await supabase
          .from('profiles')
          .update({ preferred_name: prefs.displayName.trim() })
          .eq('id', session.user.id);
      }

      await savePrefs({
        user_id:              session.user.id,
        preferred_name:       prefs.displayName?.trim() || null,
        drink_prefs:          prefs.drinks.filter(d => d !== 'None'),
        snack_prefs:          prefs.snacks.filter(s => s !== 'none'),
        taste_prefs:          prefs.tastes,
        preferred_location:   prefs.location || null,
        reminder_enabled:     prefs.morningReminder || prefs.afternoonReminder || prefs.lunchReminder || prefs.waterReminder,
        reminder_time:        prefs.morningTime || null,
        notification_tone:    prefs.tone,
        onboarding_completed: true,
      });
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
      await savePrefs({
        user_id:              session.user.id,
        notification_tone:    'gen_z',
        onboarding_completed: true,
      });
    } catch (_) {
      // Silently ignore — gate will still be cleared
    } finally {
      setSaving(false);
      onComplete({});
    }
  }

  const steps = [
    <StepWelcome   key={0} onNext={next} />,
    <StepName      key={1} prefs={prefs} set={set} onNext={next} onBack={back} />,
    <StepDrinks    key={2} prefs={prefs} toggle={v => toggleArr('drinks', v)} onNext={next} onBack={back} />,
    <StepSnacks    key={3} prefs={prefs} toggle={v => toggleArr('snacks', v)} onNext={next} onBack={back} />,
    <StepTaste     key={4} prefs={prefs} toggle={v => toggleArr('tastes', v)} onNext={next} onBack={back} />,
    <StepLocation  key={5} prefs={prefs} set={set}  onNext={next} onBack={back} />,
    <StepReminders key={6} prefs={prefs} set={set} onNext={next} onBack={back} />,
    <StepTone      key={7} prefs={prefs} set={v => set('tone', v)} onNext={next} onBack={back} />,
    <StepDone      key={8} onFinish={finish} saving={saving} />,
  ];

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col overflow-hidden">
      {/* ── Progress bar ── */}
      <div className="px-6 pt-5 pb-2 flex items-center gap-3">
        <div className="flex gap-1 flex-1">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step   ? 'flex-[2] bg-brand' :
                i < step     ? 'flex-1 bg-brand/40' :
                               'flex-1 bg-slate-100'
              }`}
            />
          ))}
        </div>
        {step > 0 && step < TOTAL - 1 && (
          <button
            onClick={skip}
            disabled={saving}
            className="text-xs text-slate-400 hover:text-slate-600 whitespace-nowrap"
          >
            Skip setup
          </button>
        )}
      </div>

      {/* Step counter */}
      <div className="text-center text-xs text-slate-400 pb-1">
        {step + 1} of {TOTAL}
      </div>

      {/* ── Content ── */}
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
              {steps[step]}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
