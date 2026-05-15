import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Star, MapPin } from 'lucide-react';

/* ── Stages definition ───────────────────────────────────────────── */
const STAGES = [
  {
    id:      'placed',
    emoji:   '📋',
    label:   'Order Placed',
    sub:     'Your request is in the queue',
    color:   'bg-slate-100 text-slate-600',
    ring:    'ring-slate-300',
  },
  {
    id:      'accepted',
    emoji:   '✅',
    label:   'Accepted',
    sub:     'Office boy is on it!',
    color:   'bg-blue-50 text-blue-600',
    ring:    'ring-blue-400',
  },
  {
    id:      'preparing',
    emoji:   '☕',
    label:   'Preparing',
    sub:     'Being made with love ❤️',
    color:   'bg-amber-50 text-amber-600',
    ring:    'ring-amber-400',
  },
  {
    id:      'on_the_way',
    emoji:   '🛵',
    label:   'On the Way',
    sub:     'Coming to you right now!',
    color:   'bg-brand/10 text-brand',
    ring:    'ring-brand',
  },
  {
    id:      'done',
    emoji:   '🎉',
    label:   'Delivered!',
    sub:     'Enjoy! Rate your experience below.',
    color:   'bg-emerald-50 text-emerald-600',
    ring:    'ring-emerald-400',
  },
];

const CANCELLED = {
  id:    'cancelled',
  emoji: '❌',
  label: 'Cancelled',
  sub:   'This request was cancelled.',
  color: 'bg-rose-50 text-rose-600',
};

function stageIndex(live_status) {
  const i = STAGES.findIndex((s) => s.id === live_status);
  return i >= 0 ? i : 0;
}

/* ── Progress bar ────────────────────────────────────────────────── */
function ProgressBar({ current, total }) {
  const pct = Math.round((current / (total - 1)) * 100);
  return (
    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
      <motion.div
        className="h-2 bg-brand rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  );
}

/* ── Stage row ───────────────────────────────────────────────────── */
function StageRow({ stage, state }) {
  // state: 'done' | 'active' | 'waiting'
  return (
    <div className="flex items-center gap-4">
      {/* Icon */}
      <motion.div
        animate={state === 'active' ? { scale: [1, 1.15, 1] } : { scale: 1 }}
        transition={state === 'active' ? { repeat: Infinity, duration: 1.8 } : {}}
        className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 ring-2 ${
          state === 'done'
            ? 'bg-emerald-50 ring-emerald-300'
            : state === 'active'
            ? `${stage.color} ${stage.ring}`
            : 'bg-slate-50 ring-slate-200 opacity-40'
        }`}
      >
        {state === 'done' ? '✅' : stage.emoji}
      </motion.div>

      {/* Labels */}
      <div className="min-w-0">
        <div className={`font-semibold text-sm ${
          state === 'active' ? 'text-slate-900' : state === 'done' ? 'text-slate-700' : 'text-slate-400'
        }`}>
          {stage.label}
        </div>
        {state === 'active' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-slate-500 mt-0.5"
          >
            {stage.sub}
          </motion.div>
        )}
      </div>

      {/* Active pulse dot */}
      {state === 'active' && (
        <motion.div
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="ml-auto w-2.5 h-2.5 rounded-full bg-brand shrink-0"
        />
      )}
      {state === 'done' && (
        <div className="ml-auto text-xs text-emerald-600 font-medium shrink-0">Done</div>
      )}
    </div>
  );
}

/* ── Rating sheet ────────────────────────────────────────────────── */
function RatingSheet({ requestId, onDone }) {
  const [rating, setRating]   = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy]       = useState(false);

  async function submit() {
    if (!rating) return;
    setBusy(true);
    try {
      await api.rateRequest(requestId, { rating, feedback: comment });
      onDone();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
    >
      <motion.div
        initial={{ y: 120, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 120, opacity: 0 }}
        className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-8 shadow-2xl space-y-6"
      >
        <div className="text-center">
          <div className="text-5xl mb-3">🎉</div>
          <h2 className="text-2xl font-bold text-slate-900">Hope it hit the spot!</h2>
          <p className="text-slate-500 text-sm mt-1">
            Rate your experience — it takes 5 seconds.
          </p>
        </div>

        <div className="flex justify-center gap-3">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              onClick={() => setRating(s)}
              className="transition-transform active:scale-90 hover:scale-110"
            >
              <Star
                size={40}
                className={s <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}
              />
            </button>
          ))}
        </div>

        <textarea
          className="input min-h-[90px] bg-slate-50"
          placeholder="Shoutout for the Office Boy? ✨ (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />

        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={onDone}>
            Later
          </button>
          <button
            className="btn-primary flex-1"
            disabled={!rating || busy}
            onClick={submit}
          >
            {busy ? 'Submitting…' : '🚀 Send Rating'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Main component ──────────────────────────────────────────────── */
export default function LiveTracking() {
  const { id }          = useParams();
  const [req, setReq]   = useState(null);
  const [err, setErr]   = useState('');
  const [showRate, setShowRate] = useState(false);
  const shownRatingRef  = useRef(false);

  async function load() {
    try {
      const data = await api.getRequest(id);
      setReq(data);
      // Show rating once when order first reaches 'done'
      if (data.status === 'done' && data.rating_status !== 'done' && !shownRatingRef.current) {
        shownRatingRef.current = true;
        setTimeout(() => setShowRate(true), 1200);
      }
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [id]);

  if (err) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-rose-500">
      <div className="text-4xl">😕</div>
      <div className="text-sm">{err}</div>
      <Link to="/request" className="btn-secondary text-sm mt-2">← Back to Request</Link>
    </div>
  );

  if (!req) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
      <div className="w-8 h-8 border-2 border-slate-200 border-t-brand rounded-full animate-spin" />
      <span className="text-sm">Loading your order…</span>
    </div>
  );

  const isCancelled = req.status === 'cancelled';
  const isDone      = req.status === 'done';
  const curIdx      = isCancelled ? -1 : stageIndex(req.live_status || 'placed');
  const curStage    = isCancelled ? CANCELLED : STAGES[curIdx];

  return (
    <div className="max-w-lg mx-auto pb-24 space-y-4">

      {/* Back */}
      <Link to="/request" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand pt-2">
        <ChevronLeft size={16} /> Back to Request
      </Link>

      {/* Hero status card */}
      <motion.div
        key={curStage.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`card ${curStage.color} border-0 shadow-lg`}
      >
        <div className="flex items-center gap-4">
          <motion.div
            animate={!isCancelled && !isDone ? { scale: [1, 1.12, 1] } : { scale: 1 }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="text-6xl"
          >
            {curStage.emoji}
          </motion.div>
          <div className="min-w-0">
            <div className="text-xl font-bold">{curStage.label}</div>
            <div className="text-sm opacity-80 mt-0.5">{curStage.sub}</div>
            {req.parsed_location && (
              <div className="flex items-center gap-1 text-xs mt-2 opacity-70">
                <MapPin size={12} /> {req.parsed_location}
              </div>
            )}
          </div>
        </div>

        {/* Progress bar (only when active) */}
        {!isCancelled && (
          <div className="mt-5">
            <ProgressBar current={curIdx} total={STAGES.length} />
            <div className="flex justify-between text-[10px] mt-1 opacity-60">
              <span>Placed</span>
              <span>Delivered</span>
            </div>
          </div>
        )}
      </motion.div>

      {/* Stage timeline */}
      {!isCancelled && (
        <div className="card space-y-5">
          <h3 className="font-semibold text-slate-900 text-sm uppercase tracking-wide">Live Status</h3>
          {STAGES.map((stage, idx) => (
            <StageRow
              key={stage.id}
              stage={stage}
              state={
                idx < curIdx ? 'done'
                : idx === curIdx ? 'active'
                : 'waiting'
              }
            />
          ))}
        </div>
      )}

      {/* Order details */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-slate-900 text-sm uppercase tracking-wide">Order Details</h3>
        <div className="flex justify-between items-start">
          <div>
            <div className="font-medium text-slate-900 text-base">
              {req.parsed_item || 'Your Request'}
            </div>
            {req.parsed_employee_name && (
              <div className="text-xs text-slate-500 mt-0.5">For: {req.parsed_employee_name}</div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] text-slate-400 uppercase">Request ID</div>
            <div className="font-mono text-xs text-slate-600">{req.id?.slice(0, 8)}</div>
          </div>
        </div>
        {req.instruction && (
          <div className="text-sm text-slate-600 italic bg-slate-50 rounded-xl p-3">
            "{req.instruction}"
          </div>
        )}
      </div>

      {/* Rating prompt when done */}
      {isDone && req.rating_status === 'done' && (
        <div className="card bg-emerald-50 border-0 text-center space-y-1">
          <div className="text-2xl">⭐</div>
          <div className="font-semibold text-emerald-800 text-sm">Thanks for the rating!</div>
          <div className="text-xs text-emerald-600">
            {'★'.repeat(req.rating || 0)}{'☆'.repeat(5 - (req.rating || 0))}
          </div>
          {req.feedback && (
            <div className="text-xs text-emerald-700 italic">"{req.feedback}"</div>
          )}
        </div>
      )}

      {isDone && req.rating_status !== 'done' && !showRate && (
        <button
          className="w-full btn-secondary text-sm"
          onClick={() => setShowRate(true)}
        >
          ⭐ Rate this order
        </button>
      )}

      {/* Rating sheet */}
      <AnimatePresence>
        {showRate && (
          <RatingSheet
            requestId={id}
            onDone={() => { setShowRate(false); load(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
