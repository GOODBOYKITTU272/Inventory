import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, MapPin, Send, ChevronRight, X, Clock,
  Plus, Minus, CheckCircle, Zap, Check, Trash2, Timer,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../hooks/useAuth.js';
import WakingUp from '../components/WakingUp.jsx';
import MealCard from '../components/MealCard.jsx';

const LOCATIONS = [
  'Balaji Cabin', 'RK Cabin', 'Manisha Cabin',
  'Resume Cabin', 'Tech Team', 'Marketing Team', 'Conference Room',
];

function getISTGreeting() {
  const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false });
  const h = parseInt(now, 10);
  if (h < 12) return { text: 'Good morning', emoji: '☀️' };
  if (h < 17) return { text: 'Good afternoon', emoji: '🌤️' };
  return { text: 'Good evening', emoji: '🌙' };
}

const CATEGORY_EMOJI = {
  beverage: '☕', refreshment: '💧', food: '🥪', snack: '🍪',
  meal: '🍱', stationery: '📎', cleaning: '🧹', other: '📦',
};

// ── Out-of-stock messages by tone ─────────────────────────────────────────────
const OOS_BY_TONE = {
  Professional: [
    "Currently unavailable",
    "Out of stock for today",
    "Not available at the moment",
    "Stock exhausted for today",
  ],
  Friendly: [
    "Oops, all gone for today! 😊",
    "This one's finished, try tomorrow! 🌈",
    "All out! Maybe try something else? 💛",
    "Gone for today, come back tomorrow! ✨",
  ],
  Funny: [
    "Sorry beta, khatam ho gaya 🥺",
    "Aaj ki quota over hai bestie 💅",
    "Unlucky yaar, next time jaldi aa 😭",
    "Sold out era fr fr 🫠",
    "Beta too late, sab kha gaye 🤷‍♀️",
    "Not your day bestie 💀",
    "RIP stock, try tomorrow 🪦",
  ],
  'Mom Mode': [
    "Beta, ye aaj khatam ho gaya 🥺💝",
    "Aur nahi hai beta, doosra le lo na 🫂",
    "Sorry bachcha, kal laa denge 💕",
    "Beta koi baat nahi, kuch aur kha lo 🤗",
    "Mummy promise kal milega, aaj nahi hai 🙏💖",
  ],
  Minimal: [
    "Out of stock",
    "Unavailable",
    "Sold out",
    "Not available",
  ],
  boyfriend: [
    "Hey cutie, this one's all gone for today 🥺💕",
    "Sorry babe, someone else got the last one 😘",
    "Out of stock baby, try something else? 💖",
    "All gone princess, I'll make sure it's here tomorrow 🌹",
  ],
  girlfriend: [
    "Hey handsome, this one's finished for today 🥺💕",
    "Sorry babe, it's all sold out 😘",
    "Out of stock baby, pick something else? 💖",
    "All gone raja, it'll be back tomorrow 🌹",
  ],
  gen_z: [
    "Bruh it's gone 💀",
    "Sold out bestie, no cap 🫠",
    "This one said byebye for today 😭",
    "Not available rn, try another? 🔥",
    "Stock said 'I'm out' fr fr 💅",
  ],
};

function getOosMessage(tone, itemName) {
  const messages = OOS_BY_TONE[tone] || OOS_BY_TONE.Friendly;
  return messages[Math.floor(Math.random() * messages.length)];
}

// ── Low stock messages by tone ────────────────────────────────────────────────
const LOW_STOCK_BY_TONE = {
  Professional: (n) => `${n} remaining`,
  Friendly: (n) => `Only ${n} left! 🏃`,
  Funny: (n) => `${n} bache hai, jaldi kar! 🔥`,
  'Mom Mode': (n) => `Beta jaldi, sirf ${n} hai 💝`,
  Minimal: (n) => `${n} left`,
  boyfriend: (n) => `Hurry babe, only ${n} left! 💕`,
  girlfriend: (n) => `Jaldi karo raja, sirf ${n} bacha! 💕`,
  gen_z: (n) => `${n} left no cap, grab it! 🔥`,
};

const STAGE_INFO = {
  placed:     { icon: '📋', label: 'Order placed' },
  accepted:   { icon: '✅', label: 'Accepted' },
  preparing:  { icon: '☕', label: 'Preparing' },
  on_the_way: { icon: '🛵', label: 'On the way' },
  done:       { icon: '🎉', label: 'Delivered!' },
  cancelled:  { icon: '❌', label: 'Cancelled' },
};

// Items that get a customization prompt
const BREAD_ITEMS = ['bread + peanut butter', 'bread + jam'];
const isBreadItem = (name) => BREAD_ITEMS.includes((name || '').toLowerCase());

// ── Preferences Summary Card (Swiggy/Zomato style) ──────────────────────────


function PreferencesSummary({ prefs, location, drinkPrefs, tastePrefs, items, onEdit, onQuickOrder }) {
  const entries = Object.entries(prefs || {});
  const hasDrinks = drinkPrefs && drinkPrefs.length > 0;
  const hasTastes = tastePrefs && tastePrefs.length > 0;
  const hasSomething = location || entries.length > 0 || hasDrinks || hasTastes;

  if (!hasSomething) {
    return (
      <button onClick={onEdit}
        className="w-full p-4 rounded-2xl border-2 border-dashed border-brand/30 bg-brand/5 text-left hover:border-brand/50 transition-all"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">👋</span>
          <div>
            <div className="font-bold text-slate-800 text-sm">Set your preferences!</div>
            <div className="text-xs text-slate-400">Save location & drink prefs for faster ordering</div>
          </div>
          <ChevronRight size={16} className="text-brand ml-auto shrink-0" />
        </div>
      </button>
    );
  }

  const DRINK_EMOJI = { coffee: '☕', espresso: '☕', latte: '☕', cappuccino: '☕', 'milk coffee': '🥛', tea: '🍵', assam: '🍵', elaichi: '🍵', ginger: '🍵', 'green tea': '🍃', lemon: '🍋', 'hot chocolate': '🍫', badam: '🥜', water: '💧' };

  function getDrinkEmoji(name) {
    const n = (name || '').toLowerCase();
    return Object.entries(DRINK_EMOJI).find(([k]) => n.includes(k))?.[1] || '☕';
  }

  // Check if a drink from preferences is currently in stock
  function isDrinkInStock(drinkName) {
    if (!items || !items.length) return true; // optimistic if items not loaded yet
    const dn = drinkName.toLowerCase();
    const match = items.find(i => (i.item_name || '').toLowerCase().includes(dn) || (i.display_name || '').toLowerCase().includes(dn));
    if (!match) return false; // not in menu
    const obOut = match.stock_today !== null && match.stock_today !== undefined && match.stock_today <= 0;
    const servOut = match.stock_servings !== null && match.stock_servings !== undefined && match.stock_servings <= 0;
    return !obOut && !servOut;
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-brand/5 via-white to-amber-50/50 border border-brand/10 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-extrabold text-brand uppercase tracking-wider flex items-center gap-1.5">
          ⚡ Quick Order
        </h3>
        <button onClick={onEdit} className="text-[11px] font-bold text-brand bg-brand/10 px-2.5 py-1 rounded-full hover:bg-brand/20 transition-all">Edit Prefs</button>
      </div>

      {/* Location chip */}
      {location && (
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-xs bg-blue-50 text-blue-700 font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
            📍 {location}
          </span>
        </div>
      )}

      {/* Drink preference chips — TAPPABLE for quick order */}
      {hasDrinks && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {drinkPrefs.map(d => {
            const inStock = isDrinkInStock(d);
            const emoji = getDrinkEmoji(d);
            return inStock ? (
              <button
                key={d}
                onClick={() => onQuickOrder && onQuickOrder(d, emoji)}
                className="text-[11px] bg-amber-50 text-amber-800 font-bold px-2.5 py-1 rounded-full flex items-center gap-1 border border-amber-200 hover:bg-amber-100 hover:border-amber-300 active:scale-95 transition-all cursor-pointer shadow-sm"
              >
                {emoji} {d} <span className="text-[9px] text-amber-500 font-bold">TAP</span>
              </button>
            ) : (
              <span
                key={d}
                className="text-[11px] bg-slate-100 text-slate-400 font-bold px-2.5 py-1 rounded-full flex items-center gap-1 border border-slate-200 line-through cursor-not-allowed"
              >
                {emoji} {d} <span className="text-[9px] no-underline">😔</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Taste chips — display only, not tappable */}
      {hasTastes && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {tastePrefs.slice(0, 4).map(t => (
            <span key={t} className="text-[10px] bg-slate-100 text-slate-500 font-medium px-2 py-0.5 rounded-full">
              {t}
            </span>
          ))}
          {tastePrefs.length > 4 && (
            <span className="text-[10px] text-slate-400 font-medium px-1">+{tastePrefs.length - 4} more</span>
          )}
        </div>
      )}

      {hasDrinks && (
        <p className="text-[9px] text-slate-400 mt-1">Tap a drink chip to order instantly with your saved prefs</p>
      )}

      {/* Item-level saved preferences */}
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {entries.slice(0, 3).map(([key, val]) => {
            let detail = '';
            if (Array.isArray(val?.taste) && val.taste.length) detail = val.taste.join(', ');
            else if (val?.sides) detail = val.sides === 'both' ? 'Both sides' : 'One side';
            if (!detail) return null;
            return (
              <span key={key} className="text-[10px] bg-emerald-50 text-emerald-700 font-medium px-2 py-0.5 rounded-full border border-emerald-100">
                {getDrinkEmoji(key)} {key}: {detail}
              </span>
            );
          }).filter(Boolean)}
        </div>
      )}
    </div>
  );
}

// ── Active Order Banner ────────────────────────────────────────────────────────
function ActiveOrderBanner({ order, onPress }) {
  const stage = STAGE_INFO[order.live_status] || STAGE_INFO.placed;
  return (
    <motion.button
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      onClick={onPress}
      className="w-full text-left rounded-2xl bg-gradient-to-r from-brand to-emerald-500 text-white p-4 flex items-center justify-between gap-3 shadow-lg shadow-brand/20 mb-4"
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{stage.icon}</span>
        <div>
          <div className="text-xs font-bold uppercase tracking-wider opacity-80">Active Order</div>
          <div className="font-bold text-sm">{order.parsed_item || order.raw_text}</div>
          <div className="text-xs opacity-80">{stage.label}</div>
        </div>
      </div>
      <div className="flex items-center gap-1 text-sm font-bold opacity-90 shrink-0">
        Track <ChevronRight size={16} />
      </div>
    </motion.button>
  );
}

// ── Item Chip ──────────────────────────────────────────────────────────────────
function ItemChip({ item, qty, outOfStock, onAdd, onRemove, tone, needsBread, breadAvailable }) {
  const inCart = qty > 0;
  const blockedByBread = needsBread && !breadAvailable;
  // Use frontend_name > display_name > item_name (cleanest name first)
  const displayName = item.frontend_name || item.display_name || item.item_name;
  const cal = item.calories_per_serving;

  if (blockedByBread) {
    return (
      <div className="relative rounded-2xl border-2 border-amber-100 bg-amber-50/60 p-3 flex flex-col gap-2 opacity-70">
        <div className="text-2xl text-center grayscale">{item.emoji || CATEGORY_EMOJI[item.category] || '☕'}</div>
        <div className="text-center">
          <div className="text-xs font-bold text-slate-500 leading-tight">{displayName}</div>
          {cal > 0 && <div className="text-[9px] text-slate-400 mt-0.5">🔥 {cal} cal</div>}
          <div className="text-[10px] text-amber-600 font-bold mt-1">🍞 Needs bread</div>
        </div>
      </div>
    );
  }

  if (outOfStock) {
    const msg = getOosMessage(tone, item.item_name);
    return (
      <div className="relative rounded-2xl border-2 border-rose-100 bg-rose-50/60 p-3 flex flex-col gap-2 opacity-70">
        <div className="text-2xl text-center grayscale">{item.emoji || CATEGORY_EMOJI[item.category] || '☕'}</div>
        <div className="text-center">
          <div className="text-xs font-bold text-slate-500 leading-tight">{displayName}</div>
          <div className="text-[10px] text-rose-500 font-bold mt-1">{msg}</div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className={`relative rounded-2xl border-2 p-3 flex flex-col gap-2 transition-all cursor-pointer
        ${inCart ? 'border-brand bg-brand/5' : 'border-slate-100 bg-white hover:border-brand/30'}`}
      onClick={() => !inCart && onAdd()}
    >
      <div className="text-2xl text-center">{item.emoji || CATEGORY_EMOJI[item.category] || '☕'}</div>
      <div className="text-center">
        <div className="text-xs font-bold text-slate-700 leading-tight">{displayName}</div>
        {cal > 0 && <div className="text-[9px] text-slate-400 mt-0.5">🔥 {cal} cal</div>}
        {item.description && (
          <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{item.description}</div>
        )}
      </div>

      {/* Low stock badge — use servings if available, otherwise stock_today */}
      {(() => {
        const s = item.stock_servings ?? item.stock_today;
        return s !== null && s !== undefined && s > 0 && s <= 5 ? (
          <div className="absolute top-1.5 right-1.5 bg-amber-100 text-amber-700 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full">
            {(LOW_STOCK_BY_TONE[tone] || LOW_STOCK_BY_TONE.Friendly)(s)}
          </div>
        ) : null;
      })()}

      {inCart ? (
        <div className="flex items-center justify-center gap-2 mt-1">
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="h-6 w-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-500 transition-all"
          >
            <Minus size={12} />
          </button>
          <span className="font-bold text-brand text-sm w-4 text-center">{qty}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            className="h-6 w-6 rounded-full bg-brand text-white flex items-center justify-center hover:bg-brand/80 transition-all"
          >
            <Plus size={12} />
          </button>
        </div>
      ) : (
        <div className="text-center">
          <span className="text-[10px] text-brand font-bold">Tap to add</span>
        </div>
      )}
    </motion.div>
  );
}

// ── Bread Customization Sheet ──────────────────────────────────────────────────
// Shown when someone taps a bread item. Asks slices + toast level.
function BreadCustomSheet({ item, savedPref, onConfirm, onClose }) {
  const [slices,    setSlices]    = useState(savedPref?.slices    ?? 1);
  const [toast,     setToast]     = useState(savedPref?.toast     ?? 'No Toast');
  const [remember,  setRemember]  = useState(false);

  const TOAST_OPTS = ['No Toast', 'Light', 'Medium', 'Well Done'];

  function confirm() {
    const instruction = `${slices} slice${slices > 1 ? 's' : ''}, ${toast.toLowerCase()} toast`;
    onConfirm({ instruction, pref: remember ? { slices, toast } : null });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-xl">{item.emoji || '🥪'}</div>
            <h2 className="font-extrabold text-slate-900">{item.item_name}</h2>
            <p className="text-xs text-slate-400">How do you like it?</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200">
            <X size={15} />
          </button>
        </div>

        {/* Slices */}
        <div className="mb-5">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
            How many slices?
          </label>
          <div className="flex gap-2">
            {[1, 2].map((n) => (
              <button
                key={n}
                onClick={() => setSlices(n)}
                className={`flex-1 py-3 rounded-2xl border-2 font-bold text-sm transition-all ${
                  slices === n ? 'bg-brand text-white border-brand' : 'border-slate-200 text-slate-600 hover:border-brand/30'
                }`}
              >
                {n} slice{n > 1 ? 's' : ''}
              </button>
            ))}
          </div>
        </div>

        {/* Toast level */}
        <div className="mb-5">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
            Toast level?
          </label>
          <div className="grid grid-cols-2 gap-2">
            {TOAST_OPTS.map((t) => (
              <button
                key={t}
                onClick={() => setToast(t)}
                className={`py-2.5 rounded-2xl border-2 font-semibold text-xs transition-all ${
                  toast === t ? 'bg-brand text-white border-brand' : 'border-slate-200 text-slate-600 hover:border-brand/30'
                }`}
              >
                {t === 'No Toast' ? '🍞 No Toast' : t === 'Light' ? '🌅 Light' : t === 'Medium' ? '🟤 Medium' : '🔥 Well Done'}
              </button>
            ))}
          </div>
        </div>

        {/* Remember toggle */}
        <button
          onClick={() => setRemember((v) => !v)}
          className={`w-full flex items-center justify-between p-3 rounded-2xl border-2 mb-5 transition-all ${
            remember ? 'border-brand bg-brand/5' : 'border-slate-100'
          }`}
        >
          <div className="text-left">
            <div className="text-sm font-semibold text-slate-800">Remember my preference</div>
            <div className="text-xs text-slate-400">Pre-fill this every time I order {item.item_name}</div>
          </div>
          <div className={`w-10 h-5.5 rounded-full relative flex items-center transition-colors ml-3 shrink-0 ${remember ? 'bg-brand' : 'bg-slate-200'}`}
               style={{ height: 22, width: 40 }}>
            <div className={`absolute w-4 h-4 bg-white rounded-full shadow transition-all ${remember ? 'left-5' : 'left-1'}`} />
          </div>
        </button>

        <button
          onClick={confirm}
          className="w-full h-12 bg-brand text-white rounded-2xl font-bold text-sm shadow-lg shadow-brand/20 hover:scale-[1.01] active:scale-[0.99] transition-all"
        >
          Add to order ✓
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── Jam/PB Customization Sheet (bread picker + sides) ────────────────────────
function JamCustomSheet({ item, savedPref, onConfirm, onClose, breadItems }) {
  const availableBreads = (breadItems || []).filter(b => {
    const servings = b.stock_servings ?? b.stock_today;
    return servings === null || servings > 0;
  });
  const [selectedBread, setSelectedBread] = useState(
    savedPref?.bread_type
      ? availableBreads.find(b => b.item_name === savedPref.bread_type)?.id || availableBreads[0]?.id || ''
      : availableBreads[0]?.id || ''
  );
  const [sides, setSides] = useState(savedPref?.sides || 'one');
  const [remember, setRemember] = useState(false);

  const chosenBread = availableBreads.find(b => b.id === selectedBread);

  function confirm() {
    const breadName = chosenBread?.item_name || '';
    const breadDisplay = chosenBread?.display_name || breadName;
    const sidesLabel = sides === 'both' ? 'both sides' : 'one side';
    const instruction = `${sidesLabel}, ${breadDisplay}`;
    onConfirm({
      instruction,
      breadType: breadName,
      pref: remember ? { sides, bread_type: breadName } : null,
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-xl">{item.emoji || '🍓'}</div>
            <h2 className="font-extrabold text-slate-900">{item.display_name || item.item_name}</h2>
            <p className="text-xs text-slate-400">Choose your bread & style</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200">
            <X size={15} />
          </button>
        </div>

        {/* 1. Bread type picker */}
        <div className="mb-5">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
            🍞 Choose bread
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(breadItems || []).map((bread) => {
              const servings = bread.stock_servings ?? bread.stock_today;
              const isOut = servings !== null && servings <= 0;
              const slicesLeft = servings !== null ? servings : null;
              return (
                <button
                  key={bread.id}
                  disabled={isOut}
                  onClick={() => !isOut && setSelectedBread(bread.id)}
                  className={`py-3 px-2 rounded-2xl border-2 text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                    isOut
                      ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                      : selectedBread === bread.id
                        ? 'bg-brand text-white border-brand'
                        : 'border-slate-200 text-slate-600 hover:border-brand/30'
                  }`}
                >
                  <span className="text-lg">{bread.emoji || '🍞'}</span>
                  <span className="leading-tight text-center">{bread.display_name || bread.item_name}</span>
                  {isOut ? (
                    <span className="text-[9px] font-normal opacity-70">Out of stock</span>
                  ) : slicesLeft !== null ? (
                    <span className={`text-[9px] font-normal ${selectedBread === bread.id ? 'opacity-80' : 'text-amber-600'}`}>
                      {slicesLeft} slices left
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Sides picker */}
        <div className="mb-5">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
            How many sides?
          </label>
          {(() => {
            const isPB = (item.item_name || '').toLowerCase().includes('peanut butter') || (item.item_name || '').toLowerCase().includes('pb');
            const spreadName = isPB ? 'PB' : 'Jam';
            const oneSideGrams = isPB ? '20g' : '15g';
            const bothSidesGrams = isPB ? '40g' : '30g';
            const oneSideCals = isPB ? 268 : 190;
            const bothSidesCals = isPB ? 386 : 230;

            return (
              <div className="flex gap-3">
                <button
                  onClick={() => setSides('one')}
                  className={`flex-1 py-4 rounded-2xl border-2 font-bold text-sm transition-all flex flex-col items-center gap-1 ${
                    sides === 'one' ? 'bg-brand text-white border-brand' : 'border-slate-200 text-slate-600 hover:border-brand/30'
                  }`}
                >
                  <span className="text-2xl">🍞</span>
                  One Side
                  <span className="text-[10px] opacity-75 font-normal">{oneSideGrams} {spreadName} ({oneSideCals} kcal)</span>
                </button>
                <button
                  onClick={() => setSides('both')}
                  className={`flex-1 py-4 rounded-2xl border-2 font-bold text-sm transition-all flex flex-col items-center gap-1 ${
                    sides === 'both' ? 'bg-brand text-white border-brand' : 'border-slate-200 text-slate-600 hover:border-brand/30'
                  }`}
                >
                  <span className="text-2xl">🥪</span>
                  Both Sides
                  <span className="text-[10px] opacity-75 font-normal">{bothSidesGrams} {spreadName} ({bothSidesCals} kcal)</span>
                </button>
              </div>
            );
          })()}
        </div>

        {/* 3. Remember toggle */}
        <button
          onClick={() => setRemember((v) => !v)}
          className={`w-full flex items-center justify-between p-3 rounded-2xl border-2 mb-5 transition-all ${
            remember ? 'border-brand bg-brand/5' : 'border-slate-100'
          }`}
        >
          <div className="text-left">
            <div className="text-sm font-semibold text-slate-800">Remember my choice</div>
            <div className="text-xs text-slate-400">Pre-fill next time</div>
          </div>
          <div className={`rounded-full relative flex items-center transition-colors ml-3 shrink-0 ${remember ? 'bg-brand' : 'bg-slate-200'}`}
               style={{ height: 22, width: 40 }}>
            <div className={`absolute w-4 h-4 bg-white rounded-full shadow transition-all ${remember ? 'left-5' : 'left-1'}`} />
          </div>
        </button>

        <button
          onClick={confirm}
          disabled={!selectedBread}
          className="w-full h-12 bg-brand text-white rounded-2xl font-bold text-sm shadow-lg shadow-brand/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-40"
        >
          Add to order ({(() => {
            const isPB = (item.item_name || '').toLowerCase().includes('peanut butter') || (item.item_name || '').toLowerCase().includes('pb');
            return sides === 'both' ? (isPB ? 386 : 230) : (isPB ? 268 : 190);
          })()} kcal) ✓
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── Beverage Taste Preference Sheet (first-time popup for coffee/tea) ─────────
const COFFEE_TASTES = ['Strong Coffee', 'Light Coffee', 'Less Sugar', 'No Sugar', 'With Milk', 'Without Milk'];
const TEA_TASTES    = ['Strong Tea', 'Light Tea', 'Less Sugar', 'No Sugar'];
const LEMON_TASTES  = ['Normal', 'Less Sugar', 'Strong Lemon', 'Mild Lemon', 'With Honey 🍯', 'Without Honey'];
const GREEN_TEA_TASTES = ['Plain Green Tea', 'With Honey 🍯', 'With Lemon', 'Light Brew', 'Strong Brew'];
const HOT_CHOC_TASTES = ['Less Sugar', 'No Sugar', 'Extra Milk'];

function getTastesForItem(itemName) {
  const n = (itemName || '').toLowerCase();
  if (n.includes('lemon')) return LEMON_TASTES;
  if (n.includes('green tea')) return GREEN_TEA_TASTES;
  if (n.includes('tea') || n.includes('elaichi') || n.includes('ginger') || n.includes('assam')) return TEA_TASTES;
  if (n.includes('hot chocolate') || n.includes('hot choc')) return HOT_CHOC_TASTES;
  if (n.includes('coffee') || n.includes('espresso') || n.includes('latte') || n.includes('cappuccino') || n.includes('badam')) return COFFEE_TASTES;
  return null;
}

function BeverageCustomSheet({ item, savedPref, onConfirm, onClose }) {
  const tastes = getTastesForItem(item.item_name) || COFFEE_TASTES;
  const [selected, setSelected] = useState(savedPref?.taste || []);
  const [remember, setRemember] = useState(false);

  function toggleTaste(t) {
    setSelected(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  function confirm() {
    const instruction = selected.length > 0 ? selected.join(', ') : '';
    onConfirm({
      instruction,
      pref: remember ? { taste: selected } : null,
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-xl">{item.emoji || '☕'}</div>
            <h2 className="font-extrabold text-slate-900">{item.display_name || item.item_name}</h2>
            <p className="text-xs text-slate-400">How do you like it?</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200">
            <X size={15} />
          </button>
        </div>

        {/* Taste grid */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          {tastes.map(t => (
            <button
              key={t}
              onClick={() => toggleTaste(t)}
              className={`py-3 px-2 rounded-2xl border-2 text-xs font-bold transition-all ${
                selected.includes(t)
                  ? 'bg-brand text-white border-brand'
                  : 'border-slate-200 text-slate-600 hover:border-brand/30'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Remember toggle */}
        <button
          onClick={() => setRemember(v => !v)}
          className={`w-full flex items-center justify-between p-3 rounded-2xl border-2 mb-5 transition-all ${
            remember ? 'border-brand bg-brand/5' : 'border-slate-100'
          }`}
        >
          <div className="text-left">
            <div className="text-sm font-semibold text-slate-800">Remember my preference</div>
            <div className="text-xs text-slate-400">Auto-apply next time</div>
          </div>
          <div className={`rounded-full relative flex items-center transition-colors ml-3 shrink-0 ${remember ? 'bg-brand' : 'bg-slate-200'}`}
               style={{ height: 22, width: 40 }}>
            <div className={`absolute w-4 h-4 bg-white rounded-full shadow transition-all ${remember ? 'left-5' : 'left-1'}`} />
          </div>
        </button>

        <button
          onClick={confirm}
          className="w-full h-12 bg-brand text-white rounded-2xl font-bold text-sm shadow-lg shadow-brand/20 hover:scale-[1.01] active:scale-[0.99] transition-all"
        >
          {selected.length > 0 ? `Add with ${selected.join(', ')} ✓` : 'Add to order ✓'}
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── Order Confirmation Sheet ───────────────────────────────────────────────────
function getCartItemCalories(item, qty, customNote) {
  if (item.sides_option) {
    const isBothSides = /both\s*side/i.test(customNote || '');
    const isPB = (item.item_name || '').toLowerCase().includes('peanut butter') || (item.item_name || '').toLowerCase().includes('pb');
    const spreadCal = isPB ? 118 : 40;
    const multiplier = isBothSides ? 2 : 1;
    return qty * (150 + (spreadCal * multiplier));
  }
  return qty * (item.calories_per_serving || 0);
}

function OrderSheet({ cart, customizations, items, onClose, onConfirm, busy, savedLocation, onRemoveItem, onUpdateQty, itemPrefs, queueAhead, selfPickupDay, deliveryMode, onDeliveryModeChange, isNightShift }) {
  // On leave days or night shift → force self-pickup
  const effectiveMode = (selfPickupDay?.is_self_pickup_day || isNightShift) ? 'self_pickup' : deliveryMode;

  // Auto-fill saved location (Zomato style) — unless "Ask Every Time" or self-pickup
  const autoFill = (effectiveMode !== 'self_pickup' && savedLocation && savedLocation !== 'Ask Every Time') ? savedLocation : '';
  const [location, setLocation] = useState(autoFill);
  const [showLocationPicker, setShowLocationPicker] = useState(!autoFill && effectiveMode !== 'self_pickup');
  const [note,     setNote]     = useState('');

  const cartItems = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ item: items.find((i) => i.id === id), qty, customNote: customizations[id] || '' }))
    .filter((x) => x.item);

  const totalCalories = cartItems.reduce((sum, { item, qty, customNote }) => {
    return sum + getCartItemCalories(item, qty, customNote);
  }, 0);
  const totalCount = cartItems.reduce((sum, x) => sum + x.qty, 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-extrabold text-lg text-slate-900">Review Order 🛒</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">
            <X size={16} />
          </button>
        </div>

        {/* Items */}
        <div className="space-y-2 mb-5">
          {cartItems.map(({ item, qty, customNote }) => {
            const prefKey = item.item_name?.toLowerCase();
            const savedPref = itemPrefs?.[prefKey];
            const prefNote = savedPref?.note || savedPref?.sides ? `${savedPref.sides === 'both' ? 'Both sides' : 'One side'}` : null;
            return (
              <div key={item.id} className="flex items-start justify-between py-2 border-b border-slate-50 gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-lg shrink-0">{item.emoji || '☕'}</span>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 text-sm">{item.display_name || item.item_name}</div>
                    {customNote && (
                      <div className="text-[11px] text-slate-400 mt-0.5 italic">{customNote}</div>
                    )}
                    {prefNote && !customNote && (
                      <div className="text-[10px] text-brand/60 mt-0.5">Your pref: {prefNote}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => onUpdateQty?.(item.id, -1)}
                    className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-rose-50 hover:text-rose-500 transition-all">
                    <Minus size={10} />
                  </button>
                  <span className="font-bold text-brand text-sm w-4 text-center">{qty}</span>
                  <button onClick={() => onUpdateQty?.(item.id, 1)}
                    className="h-6 w-6 rounded-full bg-brand text-white flex items-center justify-center hover:bg-brand/80 transition-all">
                    <Plus size={10} />
                  </button>
                  <button onClick={() => onRemoveItem?.(item.id)}
                    className="h-6 w-6 rounded-full bg-rose-50 flex items-center justify-center text-rose-400 hover:bg-rose-100 hover:text-rose-600 transition-all ml-1">
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Delivery Mode Toggle */}
        <div className="mb-4">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
            🚚 Delivery mode
          </label>
          {selfPickupDay?.is_self_pickup_day ? (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-orange-50 border border-orange-200">
              <span className="text-base">🏃</span>
              <span className="text-xs font-bold text-orange-700">
                Self-pickup only — {selfPickupDay.message}
              </span>
            </div>
          ) : isNightShift ? (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-indigo-50 border border-indigo-200">
              <span className="text-base">🌙</span>
              <div>
                <div className="text-xs font-bold text-indigo-700">
                  🌙 Night shift — Self pickup only
                </div>
                <div className="text-[10px] text-indigo-600 mt-0.5">
                  No office boy available at night. Collect your order from the pantry counter.
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {[{ value: 'get_it_here', label: '🛵 Get it here', sub: 'Office boy delivers' },
                { value: 'self_pickup', label: '🏃 I\'ll pick it up', sub: 'Collect from pantry' }].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onDeliveryModeChange?.(opt.value)}
                  className={`flex flex-col items-center p-3 rounded-xl border-2 font-semibold text-xs transition-all ${
                    effectiveMode === opt.value
                      ? 'bg-brand text-white border-brand shadow-md shadow-brand/20'
                      : 'bg-white text-slate-600 border-slate-100 hover:border-brand/30'
                  }`}
                >
                  <span className="text-base mb-0.5">{opt.label.split(' ')[0]}</span>
                  <span>{opt.label.split(' ').slice(1).join(' ')}</span>
                  <span className={`text-[10px] mt-0.5 font-normal ${
                    effectiveMode === opt.value ? 'text-white/70' : 'text-slate-400'
                  }`}>{opt.sub}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ETA */}
        <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
          <Timer size={14} className="text-emerald-600 shrink-0" />
          <span className="text-xs text-emerald-700 font-medium">
            Est. delivery: ~{queueAhead >= 3 ? '3' : queueAhead >= 1 ? '2' : '1'} min
            {queueAhead > 0 && <span className="text-emerald-500"> ({queueAhead} order{queueAhead > 1 ? 's' : ''} ahead)</span>}
          </span>
        </div>

        {/* Location — hidden for self-pickup orders */}
        {effectiveMode !== 'self_pickup' && (
        <div className="mb-4">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
            Deliver to <span className="text-rose-400">*</span>
          </label>

          {/* If auto-filled, show compact view with Change button */}
          {!showLocationPicker && location ? (
            <div className="flex items-center justify-between p-3 rounded-xl border-2 border-brand bg-brand/5">
              <div className="flex items-center gap-2">
                <span className="text-base">📍</span>
                <span className="font-bold text-sm text-brand">{location}</span>
                <span className="text-emerald-500">✓</span>
              </div>
              <button
                type="button"
                onClick={() => setShowLocationPicker(true)}
                className="text-xs font-bold text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100 transition-all"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {LOCATIONS.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => { setLocation(loc === location ? '' : loc); if (loc !== location) setShowLocationPicker(false); }}
                  className={`text-xs px-3 py-2.5 rounded-xl border-2 font-semibold transition-all ${
                    location === loc ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600 border-slate-100 hover:border-brand/30'
                  }`}
                >
                  {loc}
                </button>
              ))}
            </div>
          )}
        </div>
        )}{/* end self-pickup hide */}

        {/* Extra note */}
        <div className="mb-4">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
            Anything else? (optional)
          </label>
          <input
            className="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-sm focus:border-brand focus:outline-none"
            placeholder="Extra sugar, carry bag, etc."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {/* Total Calories & Servings Summary */}
        <div className="mb-5 flex items-center justify-between text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100 font-medium">
          <div>
            Total Servings: <span className="font-bold text-slate-700">{totalCount}</span>
          </div>
          {totalCalories > 0 && (
            <div>
              Total Energy: <span className="font-bold text-slate-700">🔥 {totalCalories} kcal</span>
            </div>
          )}
        </div>

        <button
          disabled={effectiveMode !== 'self_pickup' && !location || busy}
          onClick={() => onConfirm({ location: effectiveMode === 'self_pickup' ? 'Pantry Counter' : location, note, cartItems, delivery_mode: effectiveMode })}
          className="w-full h-12 bg-brand text-white rounded-2xl font-bold text-sm shadow-lg shadow-brand/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {busy
            ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Placing...</>
            : <><Zap size={16} /> Place Order 🚀</>}
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── Main Cafeteria Page ────────────────────────────────────────────────────────
export default function Cafeteria() {
  const { profile, session } = useAuth();
  const navigate    = useNavigate();
  const greeting    = getISTGreeting();
  const firstName   = (profile?.full_name || profile?.email || 'there').split(' ')[0];

  const [items,        setItems]        = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [cart,         setCart]         = useState({});     // { [id]: qty }
  const [customizations, setCustomizations] = useState({}); // { [id]: 'instruction text' }
  const [itemPrefs,    setItemPrefs]    = useState({});     // { [item_name_lower]: { slices, toast } }
  const [deliveryMode, setDeliveryMode] = useState('get_it_here'); // 'get_it_here' | 'self_pickup'
  const [selfPickupDay, setSelfPickupDay] = useState(null); // null or { is_self_pickup_day, ob_name, message }
  const [customTarget, setCustomTarget] = useState(null);   // item being customized
  const [showSheet,    setShowSheet]    = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [orderBusy,    setOrderBusy]    = useState(false);
  const [successMsg,   setSuccessMsg]   = useState('');
  const [errorMsg,     setErrorMsg]     = useState('');
  const [tone,         setTone]         = useState('Friendly'); // AI personality tone
  const [savedLocation, setSavedLocation] = useState(''); // From onboarding preferences

  // Custom text request
  const [showCustom, setShowCustom] = useState(false);
  const [customText, setCustomText] = useState('');
  const [customLoc,  setCustomLoc]  = useState('');
  const [customBusy, setCustomBusy] = useState(false);
  const [queueAhead, setQueueAhead] = useState(0);

  // ── Quick Order from preference chip ────────────────────────────────────────
  const [openCartOnConfirm, setOpenCartOnConfirm] = useState(false);

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const hasInCart = cartCount > 0;

  // Compute bread availability for dependency checks
  const breadItems = items.filter(i => {
    const name = (i.item_name || '').toLowerCase();
    const tags = Array.isArray(i.tags) ? i.tags.map(t => t.toLowerCase()) : [];
    // Exclude items that DEPEND on bread (like Jam, PB) — those have 'bread' in their dependencies
    const dependsOnBread = Array.isArray(i.dependencies) && i.dependencies.some(d => d.toLowerCase() === 'bread');
    return (name.includes('bread') || name.includes('brd') || tags.includes('bread'))
      && !dependsOnBread;
  });
  const anyBreadInStock = breadItems.some(b => {
    const servings = b.stock_servings ?? b.stock_today;
    return servings === null || servings > 0;
  });

  const load = useCallback(async () => {
    try {
      const [itemsData, requestsData, pickupStatus] = await Promise.all([
        api.cafeteriaItems(),
        api.listRequests(),
        api.selfPickupStatus().catch(() => ({ is_self_pickup_day: false })),
      ]);
      setItems(itemsData || []);
      setSelfPickupDay(pickupStatus);

      const active = (requestsData || []).filter(
        (r) => ['confirming', 'pending', 'in_progress'].includes(r.status)
      );
      setActiveOrders(active);

      const recent = (requestsData || [])
        .filter((r) => r.status === 'done' || r.status === 'cancelled')
        .slice(0, 5);
      setRecentOrders(recent);
    } catch (e) {
      console.error('Cafeteria load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load saved item preferences, tone, drink/taste prefs
  const [userDrinkPrefs, setUserDrinkPrefs] = useState([]);
  const [userTastePrefs, setUserTastePrefs] = useState([]);

  const [userShift, setUserShift] = useState('morning');

  useEffect(() => {
    if (!session) return;
    supabase
      .from('employee_cafeteria_preferences')
      .select('item_prefs, preferred_location, notification_tone, drink_prefs, taste_prefs, shift')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.item_prefs) setItemPrefs(data.item_prefs);
        if (data?.preferred_location) setSavedLocation(data.preferred_location);
        if (data?.notification_tone) setTone(data.notification_tone);
        if (Array.isArray(data?.drink_prefs)) setUserDrinkPrefs(data.drink_prefs);
        if (Array.isArray(data?.taste_prefs)) setUserTastePrefs(data.taste_prefs);
        if (data?.shift) setUserShift(data.shift);
      })
      .catch(() => {});
  }, [session]);

  useEffect(() => { load(); }, [load]);

  // Save a single item preference to DB
  async function saveItemPref(itemName, pref) {
    const key = itemName.toLowerCase();
    const updated = { ...itemPrefs, [key]: pref };
    setItemPrefs(updated);
    if (!session) return;
    try {
      await supabase
        .from('employee_cafeteria_preferences')
        .upsert({ user_id: session.user.id, item_prefs: updated }, { onConflict: 'user_id' });
    } catch (_) { /* ignore */ }
  }

  // ── Cart handlers ───────────────────────────────────────────────────────────
  const [jamTarget, setJamTarget] = useState(null); // item with sides_option
  const [beverageTarget, setBeverageTarget] = useState(null); // beverage needing taste popup

  function isBeverage(item) {
    return item.category === 'beverage' && getTastesForItem(item.item_name) !== null;
  }

  function handleAdd(item) {
    if (item.sides_option) {
      // Show jam sides customization sheet
      setJamTarget(item);
    } else if (isBreadItem(item.item_name)) {
      // Show bread customization sheet
      setCustomTarget(item);
    } else if (isBeverage(item)) {
      // Beverage: check if user has saved taste preference
      const key = item.item_name.toLowerCase();
      const saved = itemPrefs[key];
      if (saved?.taste && saved.taste.length > 0) {
        // Auto-apply saved preference — no popup needed
        const instruction = saved.taste.join(', ');
        setCart((c) => ({ ...c, [item.id]: (c[item.id] || 0) + 1 }));
        setCustomizations((c) => ({ ...c, [item.id]: instruction }));
      } else {
        // First time — show taste preference popup
        setBeverageTarget(item);
      }
    } else {
      setCart((c) => ({ ...c, [item.id]: (c[item.id] || 0) + 1 }));
    }
  }

  function handleBreadConfirm({ instruction, pref }) {
    const item = customTarget;
    if (!item) return;
    setCart((c) => ({ ...c, [item.id]: (c[item.id] || 0) + 1 }));
    setCustomizations((c) => ({ ...c, [item.id]: instruction }));
    if (pref) saveItemPref(item.item_name, pref);
    setCustomTarget(null);
  }

  function handleBeverageConfirm({ instruction, pref }) {
    const item = beverageTarget;
    if (!item) return;
    setCart((c) => ({ ...c, [item.id]: (c[item.id] || 0) + 1 }));
    if (instruction) setCustomizations((c) => ({ ...c, [item.id]: instruction }));
    if (pref) saveItemPref(item.item_name, pref);
    setBeverageTarget(null);
    if (openCartOnConfirm) {
      api.queueCount().then(d => setQueueAhead((d?.pending || 0) + (d?.in_progress || 0))).catch(() => {});
      setShowSheet(true);
      setOpenCartOnConfirm(false);
    }
  }

  function handleJamConfirm({ instruction, pref, breadType }) {
    const item = jamTarget;
    if (!item) return;
    setCart((c) => ({ ...c, [item.id]: (c[item.id] || 0) + 1 }));
    // Store instruction + breadType together for placeOrder
    setCustomizations((c) => ({ ...c, [item.id]: instruction, [`${item.id}__bread`]: breadType || '' }));
    if (pref) saveItemPref(item.item_name, pref);
    setJamTarget(null);
  }

  // Delete item from cart entirely (for OrderSheet trash button)
  function deleteFromCart(id) {
    setCart((c) => { const n = { ...c }; delete n[id]; return n; });
    setCustomizations((cc) => { const nc = { ...cc }; delete nc[id]; delete nc[`${id}__bread`]; return nc; });
  }

  // Update qty from OrderSheet +/- buttons
  function updateCartQty(id, delta) {
    setCart((c) => {
      const newQty = (c[id] || 0) + delta;
      if (newQty <= 0) {
        deleteFromCart(id);
        return c;
      }
      return { ...c, [id]: newQty };
    });
  }

  function removeFromCart(id) {
    setCart((c) => {
      const n = { ...c };
      if (n[id] > 1) n[id]--;
      else {
        delete n[id];
        setCustomizations((cc) => { const nc = { ...cc }; delete nc[id]; return nc; });
      }
      return n;
    });
  }

  // ── Place order ─────────────────────────────────────────────────────────────
  async function handleConfirmOrder({ location, note, cartItems, delivery_mode }) {
    setShowSheet(false);
    setOrderBusy(true);
    setErrorMsg('');
    try {
      let lastReq = null;
      for (const { item, qty, customNote } of cartItems) {
        const instruction = [customNote, note].filter(Boolean).join('. ');
        const breadType = customizations[`${item.id}__bread`] || '';
        const r = await api.quickOrder({
          quick_item:        item.item_name,
          quick_location:    delivery_mode === 'self_pickup' ? null : location,
          quick_quantity:    qty,
          quick_instruction: instruction,
          quick_bread_type:  breadType,
          delivery_mode:     delivery_mode,
        });
        lastReq = r?.request;
      }
      setCart({});
      setCustomizations({});
      setShowSheet(false);
      setSuccessMsg('Order placed! 🚀');
      // Remember location for next time
      if (location && session) {
        setSavedLocation(location);
        supabase.from('employee_cafeteria_preferences')
          .upsert({ user_id: session.user.id, preferred_location: location }, { onConflict: 'user_id' })
          .then(() => {})
          .catch(() => {});
      }
      setTimeout(() => {
        setSuccessMsg('');
        if (lastReq?.id) navigate(`/track/${lastReq.id}`);
      }, 1500);
    } catch (e) {
      setErrorMsg(e.message);
      setShowSheet(false); // Close order sheet so error toast is visible on top
      // Refresh items to get updated stock counts
      api.cafeteriaItems().then((d) => d && setItems(d)).catch(() => {});
      // Auto-dismiss error after 6 seconds
      setTimeout(() => setErrorMsg(''), 6000);
    } finally {
      setOrderBusy(false);
    }
  }

  // ── Quick order directly from preference chip ────────────────────────────────
  function handleQuickOrder(drinkName, emoji) {
    const dn = drinkName.toLowerCase();
    const item = items.find(i => (i.item_name || '').toLowerCase().includes(dn) || (i.display_name || '').toLowerCase().includes(dn));
    if (!item) return;

    const key = item.item_name.toLowerCase();
    const saved = itemPrefs[key];

    let appliedTastes = [];
    if (saved?.taste && saved.taste.length > 0) {
      appliedTastes = saved.taste;
    } else if (userTastePrefs && userTastePrefs.length > 0) {
      const validTastes = getTastesForItem(item.item_name) || [];
      appliedTastes = userTastePrefs.filter(t => validTastes.includes(t));
    }

    if (appliedTastes.length > 0) {
      setCart((c) => ({ ...c, [item.id]: (c[item.id] || 0) + 1 }));
      setCustomizations((c) => ({ ...c, [item.id]: appliedTastes.join(', ') }));
      api.queueCount().then(d => setQueueAhead((d?.pending || 0) + (d?.in_progress || 0))).catch(() => {});
      setShowSheet(true);
    } else {
      setOpenCartOnConfirm(true);
      setBeverageTarget(item);
    }
  }

  // ── Custom AI request ────────────────────────────────────────────────────────
  async function submitCustom(e) {
    e?.preventDefault();
    setCustomBusy(true);
    setErrorMsg('');
    try {
      const combined = customLoc ? `${customText.trim()} (Location: ${customLoc})` : customText.trim();
      const r = await api.submitRequest(combined);
      if (r.needs_followup) {
        setErrorMsg(`🤔 ${r.followup}`);
      } else {
        setCustomText(''); setCustomLoc(''); setShowCustom(false);
        navigate(`/track/${r.request.id}`);
      }
    } catch (e) {
      setErrorMsg(e.message);
      setTimeout(() => setErrorMsg(''), 6000);
    } finally {
      setCustomBusy(false);
    }
  }

  // ── Group items by category (only orderable items) ───────────────────────────
  const orderableItems = items.filter((item) => item.orderable !== false);
  const grouped = orderableItems.reduce((acc, item) => {
    const cat = item.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const catOrder  = ['beverage', 'refreshment', 'food', 'snack', 'meal', 'stationery', 'cleaning', 'other'];
  const catLabels = {
    beverage: 'Drinks', refreshment: 'Refreshments', food: 'Food', snack: 'Snacks', meal: 'Meals',
    stationery: 'Stationery', cleaning: 'Cleaning', other: 'Other',
  };
  const sortedGroups = catOrder.filter((c) => grouped[c]?.length);

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="h-10 w-10 border-4 border-brand/20 border-t-brand rounded-full animate-spin" />
      <p className="text-slate-400 text-sm">Loading cafeteria…</p>
      <WakingUp loading={loading} />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-24">
      {/* ── Greeting ── */}
      <div className="pt-2">
        <h1 className="text-2xl font-extrabold text-slate-900">
          {greeting.emoji} {greeting.text}, {firstName}!
        </h1>
        <p className="text-slate-500 text-sm mt-1">What can we get you today?</p>
      </div>

      {/* ── Self-Pickup Day Banner (OB on leave) ── */}
      {selfPickupDay?.is_self_pickup_day && (
        <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-2xl shrink-0">🏖</span>
          <div>
            <div className="font-extrabold text-orange-800 text-sm">
              {selfPickupDay.ob_name || 'Office Boy'} is on leave today
            </div>
            <div className="text-xs text-orange-600 mt-0.5">
              All orders are self-pickup from pantry. Prep times still apply!
            </div>
          </div>
        </div>
      )}

      {/* ── Night Shift Banner ── */}
      {userShift === 'night' && (
        <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-2xl shrink-0">🌙</span>
          <div>
            <div className="font-extrabold text-indigo-800 text-sm">
              You're on night shift — self pickup only
            </div>
            <div className="text-xs text-indigo-600 mt-0.5">
              No office boy at night. Collect your order from the pantry counter.
            </div>
          </div>
        </div>
      )}
      <PreferencesSummary
        prefs={itemPrefs}
        location={savedLocation}
        drinkPrefs={userDrinkPrefs}
        tastePrefs={userTastePrefs}
        items={items}
        onEdit={() => navigate('/settings')}
        onQuickOrder={handleQuickOrder}
      />



      {/* ── Meal Booking Card ── */}
      <MealCard />

      {/* ── Active order banners ── */}
      {activeOrders.map((order) => (
        <ActiveOrderBanner
          key={order.id}
          order={order}
          onPress={() => navigate(`/track/${order.id}`)}
        />
      ))}

      {/* ── Flash messages ── */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-emerald-500 text-white rounded-2xl p-4 flex items-center gap-3 font-bold shadow-lg shadow-emerald-500/20"
          >
            <CheckCircle size={20} /> {successMsg}
          </motion.div>
        )}
        {/* Inline error placeholder — real error shows as floating toast below */}
      </AnimatePresence>

      {/* ── Items by category ── */}
      {sortedGroups.map((cat) => (
        <section key={cat}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">{CATEGORY_EMOJI[cat]}</span>
            <h2 className="font-extrabold text-slate-800 text-sm tracking-wide">{catLabels[cat]}</h2>
            <div className="h-px flex-1 bg-slate-100" />
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {grouped[cat].map((item) => {
              // stock_today = 0  → Office Boy marked it OUT for today (always OOS)
              // stock_today = null → OB manages as unlimited/available (e.g. Water)
              // stock_servings = 0 → servings exhausted
              const stockToday    = item.stock_today;
              const stockServings = item.stock_servings;
              const obMarkedOut   = stockToday !== null && stockToday !== undefined && stockToday <= 0;
              const servingsOut   = stockServings !== null && stockServings !== undefined && stockServings <= 0;
              const isOut = obMarkedOut || servingsOut;
              const hasBreadDep = Array.isArray(item.dependencies) && item.dependencies.some(d => d.toLowerCase() === 'bread');
              return (
                <ItemChip
                  key={item.id}
                  item={item}
                  qty={cart[item.id] || 0}
                  outOfStock={isOut}
                  onAdd={() => handleAdd(item)}
                  onRemove={() => removeFromCart(item.id)}
                  tone={tone}
                  needsBread={hasBreadDep}
                  breadAvailable={anyBreadInStock}
                />
              );
            })}
          </div>
        </section>
      ))}

      {/* ── Custom AI Request ── */}
      <section>
        <button
          onClick={() => setShowCustom((v) => !v)}
          className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border-2 border-dashed border-slate-200 hover:border-brand/40 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-brand/10 flex items-center justify-center group-hover:bg-brand/20 transition-all">
              <Sparkles size={18} className="text-brand" />
            </div>
            <div className="text-left">
              <div className="font-bold text-slate-800 text-sm">Something else?</div>
              <div className="text-xs text-slate-400">Describe anything — AI will parse it</div>
            </div>
          </div>
          <ChevronRight
            size={18}
            className={`text-slate-400 transition-transform ${showCustom ? 'rotate-90' : ''}`}
          />
        </button>

        <AnimatePresence>
          {showCustom && (
            <motion.form
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              onSubmit={submitCustom}
              className="overflow-hidden"
            >
              <div className="pt-3 space-y-3">
                <textarea
                  className="w-full border-2 border-slate-100 rounded-2xl p-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none min-h-[80px] resize-none"
                  placeholder="e.g. 2 hot coffees for a client meeting in Conference Room"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  required
                  minLength={3}
                  maxLength={500}
                />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {LOCATIONS.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setCustomLoc(loc === customLoc ? '' : loc)}
                      className={`text-xs px-2 py-2 rounded-xl border-2 font-semibold transition-all ${
                        customLoc === loc ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600 border-slate-100 hover:border-brand/30'
                      }`}
                    >
                      {loc}
                    </button>
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={customBusy || customText.trim().length < 3}
                  className="w-full h-11 bg-brand text-white rounded-2xl font-bold text-sm shadow-md shadow-brand/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {customBusy
                    ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sending…</>
                    : <><Send size={14} /> Send to Office Boy</>}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </section>

      {/* ── Recent Orders ── */}
      {recentOrders.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={15} className="text-slate-400" />
            <h2 className="font-extrabold text-slate-800 text-sm tracking-wide">Recent Orders</h2>
            <div className="h-px flex-1 bg-slate-100" />
            <button
              onClick={() => navigate('/orders')}
              className="text-xs font-bold text-brand hover:underline shrink-0"
            >
              View All →
            </button>
          </div>
          <div className="space-y-2">
            {recentOrders.map((r) => (
              <button
                key={r.id}
                onClick={() => navigate(`/track/${r.id}`)}
                className="w-full flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 hover:border-brand/30 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{r.status === 'done' ? '✅' : '❌'}</span>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-slate-800">
                      {r.parsed_item || r.raw_text}
                    </div>
                    <div className="text-xs text-slate-400">
                      {r.parsed_location || 'No location'} · {r.status}
                    </div>
                  </div>
                </div>
                <ChevronRight size={15} className="text-slate-300 group-hover:text-brand transition-colors" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Floating Cart Button ── */}
      <AnimatePresence>
        {hasInCart && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-sm px-4"
          >
            <button
              onClick={() => {
                setShowSheet(true);
                api.queueCount().then(d => setQueueAhead((d?.pending || 0) + (d?.in_progress || 0))).catch(() => {});
              }}
              className="w-full h-14 bg-brand text-white rounded-2xl font-bold text-sm shadow-2xl shadow-brand/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-between px-5"
            >
              <span className="bg-white/20 rounded-full h-7 w-7 flex items-center justify-center font-extrabold text-sm">
                {cartCount}
              </span>
              <span>Review Order</span>
              <span className="opacity-80">🛒</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bread Customization Sheet ── */}
      <AnimatePresence>
        {customTarget && (
          <BreadCustomSheet
            item={customTarget}
            savedPref={itemPrefs[customTarget.item_name?.toLowerCase()]}
            onConfirm={handleBreadConfirm}
            onClose={() => setCustomTarget(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Jam Customization Sheet ── */}
      <AnimatePresence>
        {jamTarget && (
          <JamCustomSheet
            item={jamTarget}
            savedPref={itemPrefs[jamTarget.item_name?.toLowerCase()]}
            onConfirm={handleJamConfirm}
            onClose={() => setJamTarget(null)}
            breadItems={breadItems}
          />
        )}
      </AnimatePresence>

      {/* ── Beverage Taste Preference Sheet ── */}
      <AnimatePresence>
        {beverageTarget && (
          <BeverageCustomSheet
            item={beverageTarget}
            savedPref={itemPrefs[beverageTarget.item_name?.toLowerCase()]}
            onConfirm={handleBeverageConfirm}
            onClose={() => { setBeverageTarget(null); setOpenCartOnConfirm(false); }}
          />
        )}
      </AnimatePresence>

      {/* ── Order Sheet ── */}
      <AnimatePresence>
        {showSheet && (
          <OrderSheet
            cart={cart}
            customizations={customizations}
            items={items}
            onClose={() => { setShowSheet(false); if (Object.keys(cart).length === 0) setCart({}); }}
            onConfirm={handleConfirmOrder}
            busy={orderBusy}
            savedLocation={savedLocation}
            onRemoveItem={deleteFromCart}
            onUpdateQty={updateCartQty}
            itemPrefs={itemPrefs}
            queueAhead={queueAhead}
            selfPickupDay={selfPickupDay}
            deliveryMode={(selfPickupDay?.is_self_pickup_day || userShift === 'night') ? 'self_pickup' : deliveryMode}
            onDeliveryModeChange={setDeliveryMode}
            isNightShift={userShift === 'night'}
          />
        )}
      </AnimatePresence>

      {/* ── Floating Error Toast — always on TOP of everything ── */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-sm px-4"
          >
            <div className="bg-white rounded-2xl shadow-2xl border border-rose-200 overflow-hidden">
              {/* Red accent bar */}
              <div className="h-1 bg-gradient-to-r from-rose-500 to-amber-500" />
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0 mt-0.5">😔</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800 text-sm mb-1">Oops!</div>
                    <div className="text-sm text-slate-600 leading-relaxed">{errorMsg}</div>
                  </div>
                  <button
                    onClick={() => setErrorMsg('')}
                    className="shrink-0 h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
                  >
                    <X size={14} className="text-slate-500" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
