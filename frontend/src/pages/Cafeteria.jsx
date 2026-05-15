import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, MapPin, Send, ChevronRight, X, Clock,
  Plus, Minus, CheckCircle, Zap, Check,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../hooks/useAuth.js';
import WakingUp from '../components/WakingUp.jsx';

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
  beverage: '☕', food: '🥪', snack: '🍪',
  meal: '🍱', stationery: '📎', cleaning: '🧹', other: '📦',
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
function ItemChip({ item, qty, outOfStock, onAdd, onRemove }) {
  const inCart = qty > 0;

  if (outOfStock) {
    return (
      <div className="relative rounded-2xl border-2 border-rose-100 bg-rose-50/60 p-3 flex flex-col gap-2 opacity-70">
        <div className="text-2xl text-center grayscale">{item.emoji || CATEGORY_EMOJI[item.category] || '☕'}</div>
        <div className="text-center">
          <div className="text-xs font-bold text-slate-500 leading-tight">{item.item_name}</div>
          <div className="text-[10px] text-rose-500 font-bold mt-1">😔 Out today</div>
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
        <div className="text-xs font-bold text-slate-700 leading-tight">{item.item_name}</div>
        {item.description && (
          <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{item.description}</div>
        )}
      </div>

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

// ── Order Confirmation Sheet ───────────────────────────────────────────────────
function OrderSheet({ cart, customizations, items, onClose, onConfirm, busy }) {
  const [location, setLocation] = useState('');
  const [note,     setNote]     = useState('');

  const cartItems = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ item: items.find((i) => i.id === id), qty, customNote: customizations[id] || '' }))
    .filter((x) => x.item);

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
          {cartItems.map(({ item, qty, customNote }) => (
            <div key={item.id} className="flex items-start justify-between py-2 border-b border-slate-50 gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-lg shrink-0">{item.emoji || '☕'}</span>
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 text-sm">{item.item_name}</div>
                  {customNote && (
                    <div className="text-[11px] text-slate-400 mt-0.5 italic">{customNote}</div>
                  )}
                </div>
              </div>
              <span className="font-bold text-brand text-sm shrink-0">×{qty}</span>
            </div>
          ))}
        </div>

        {/* Location */}
        <div className="mb-4">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
            Deliver to <span className="text-rose-400">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {LOCATIONS.map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => setLocation(loc === location ? '' : loc)}
                className={`text-xs px-3 py-2.5 rounded-xl border-2 font-semibold transition-all ${
                  location === loc ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600 border-slate-100 hover:border-brand/30'
                }`}
              >
                {loc}
              </button>
            ))}
          </div>
        </div>

        {/* Extra note */}
        <div className="mb-5">
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

        <button
          disabled={!location || busy}
          onClick={() => onConfirm({ location, note, cartItems })}
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
  const [activeOrder,  setActiveOrder]  = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [cart,         setCart]         = useState({});     // { [id]: qty }
  const [customizations, setCustomizations] = useState({}); // { [id]: 'instruction text' }
  const [itemPrefs,    setItemPrefs]    = useState({});     // { [item_name_lower]: { slices, toast } }
  const [customTarget, setCustomTarget] = useState(null);   // item being customized
  const [showSheet,    setShowSheet]    = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [orderBusy,    setOrderBusy]    = useState(false);
  const [successMsg,   setSuccessMsg]   = useState('');
  const [errorMsg,     setErrorMsg]     = useState('');

  // Custom text request
  const [showCustom, setShowCustom] = useState(false);
  const [customText, setCustomText] = useState('');
  const [customLoc,  setCustomLoc]  = useState('');
  const [customBusy, setCustomBusy] = useState(false);

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const hasInCart = cartCount > 0;

  const load = useCallback(async () => {
    try {
      const [itemsData, requestsData] = await Promise.all([
        api.cafeteriaItems(),
        api.listRequests(),
      ]);
      setItems(itemsData || []);

      const active = (requestsData || []).find(
        (r) => ['pending', 'in_progress'].includes(r.status)
      );
      setActiveOrder(active || null);

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

  // Load saved item preferences (bread slices/toast prefs)
  useEffect(() => {
    if (!session) return;
    supabase
      .from('employee_cafeteria_preferences')
      .select('item_prefs')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.item_prefs) setItemPrefs(data.item_prefs);
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
    await supabase
      .from('employee_cafeteria_preferences')
      .upsert({ user_id: session.user.id, item_prefs: updated }, { onConflict: 'user_id' })
      .catch(() => {});
  }

  // ── Cart handlers ───────────────────────────────────────────────────────────
  function handleAdd(item) {
    if (isBreadItem(item.item_name)) {
      // Show customization sheet instead of adding directly
      setCustomTarget(item);
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
  async function placeOrder({ location, note, cartItems }) {
    setOrderBusy(true);
    setErrorMsg('');
    try {
      let lastReq = null;
      for (const { item, qty, customNote } of cartItems) {
        const instruction = [customNote, note].filter(Boolean).join('. ');
        const r = await api.quickOrder({
          quick_item:        item.item_name,
          quick_location:    location,
          quick_quantity:    qty,
          quick_instruction: instruction,
        });
        lastReq = r?.request;
      }
      setCart({});
      setCustomizations({});
      setShowSheet(false);
      setSuccessMsg('Order placed! 🚀');
      setTimeout(() => {
        setSuccessMsg('');
        if (lastReq?.id) navigate(`/track/${lastReq.id}`);
      }, 1500);
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setOrderBusy(false);
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
    } finally {
      setCustomBusy(false);
    }
  }

  // ── Group items by category ──────────────────────────────────────────────────
  const grouped = items.reduce((acc, item) => {
    const cat = item.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const catOrder  = ['beverage', 'food', 'snack', 'meal', 'stationery', 'cleaning', 'other'];
  const catLabels = {
    beverage: 'Drinks', food: 'Food', snack: 'Snacks', meal: 'Meals',
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

      {/* ── Active order banner ── */}
      {activeOrder && (
        <ActiveOrderBanner
          order={activeOrder}
          onPress={() => navigate(`/track/${activeOrder.id}`)}
        />
      )}

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
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-rose-50 text-rose-700 rounded-2xl p-4 text-sm border border-rose-100"
          >
            {errorMsg}
          </motion.div>
        )}
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
              const isOut = item.stock_today !== null && item.stock_today !== undefined && item.stock_today <= 0;
              return (
                <ItemChip
                  key={item.id}
                  item={item}
                  qty={cart[item.id] || 0}
                  outOfStock={isOut}
                  onAdd={() => handleAdd(item)}
                  onRemove={() => removeFromCart(item.id)}
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
              onClick={() => setShowSheet(true)}
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

      {/* ── Order Sheet ── */}
      <AnimatePresence>
        {showSheet && (
          <OrderSheet
            cart={cart}
            customizations={customizations}
            items={items}
            onClose={() => setShowSheet(false)}
            onConfirm={placeOrder}
            busy={orderBusy}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
