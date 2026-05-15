import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, MapPin, Send, ChevronRight, X, Clock,
  RefreshCw, Coffee, Zap, Plus, Minus, CheckCircle,
} from 'lucide-react';
import { api } from '../lib/api.js';
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
  beverage: '☕',
  food: '🥪',
  snack: '🍪',
  meal: '🍱',
  stationery: '📎',
  cleaning: '🧹',
  other: '📦',
};

const STAGE_INFO = {
  placed:      { icon: '📋', label: 'Order placed' },
  accepted:    { icon: '✅', label: 'Accepted' },
  preparing:   { icon: '☕', label: 'Preparing' },
  on_the_way:  { icon: '🛵', label: 'On the way' },
  done:        { icon: '🎉', label: 'Delivered!' },
  cancelled:   { icon: '❌', label: 'Cancelled' },
};

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

// ── Quick Order Chip ───────────────────────────────────────────────────────────
function ItemChip({ item, qty, onAdd, onRemove, onQuickOrder }) {
  const inCart = qty > 0;
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

// ── Order Confirmation Sheet ───────────────────────────────────────────────────
function OrderSheet({ cart, items, onClose, onConfirm, busy }) {
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');

  const cartItems = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ item: items.find((i) => i.id === id), qty }))
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
          {cartItems.map(({ item, qty }) => (
            <div key={item.id} className="flex items-center justify-between py-2 border-b border-slate-50">
              <div className="flex items-center gap-2">
                <span className="text-lg">{item.emoji || '☕'}</span>
                <span className="font-medium text-slate-800 text-sm">{item.item_name}</span>
              </div>
              <span className="font-bold text-brand text-sm">×{qty}</span>
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
                  location === loc
                    ? 'bg-brand text-white border-brand'
                    : 'bg-white text-slate-600 border-slate-100 hover:border-brand/30'
                }`}
              >
                {loc}
              </button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div className="mb-5">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
            Special instructions (optional)
          </label>
          <input
            className="w-full border-2 border-slate-100 rounded-xl px-3 py-2 text-sm focus:border-brand focus:outline-none"
            placeholder="No sugar, extra hot, etc."
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
            : <><Zap size={16} /> Place Order 🚀</>
          }
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── Main Cafeteria Page ────────────────────────────────────────────────────────
export default function Cafeteria() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const greeting    = getISTGreeting();
  const firstName   = (profile?.full_name || profile?.email || 'there').split(' ')[0];

  const [items,        setItems]        = useState([]);
  const [activeOrder,  setActiveOrder]  = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [cart,         setCart]         = useState({});
  const [showSheet,    setShowSheet]    = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [orderBusy,    setOrderBusy]    = useState(false);
  const [successMsg,   setSuccessMsg]   = useState('');
  const [errorMsg,     setErrorMsg]     = useState('');

  // Custom text request
  const [showCustom,  setShowCustom]  = useState(false);
  const [customText,  setCustomText]  = useState('');
  const [customLoc,   setCustomLoc]   = useState('');
  const [customBusy,  setCustomBusy]  = useState(false);

  const cartCount  = Object.values(cart).reduce((a, b) => a + b, 0);
  const hasInCart  = cartCount > 0;

  const load = useCallback(async () => {
    try {
      const [itemsData, requestsData] = await Promise.all([
        api.cafeteriaItems(),
        api.listRequests(),
      ]);
      setItems(itemsData || []);

      const active = (requestsData || []).find((r) =>
        ['pending', 'in_progress'].includes(r.status) && r.submitted_by === profile?.id
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
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  // Cart handlers
  const addToCart  = (id) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const removeFromCart = (id) =>
    setCart((c) => { const n = { ...c }; if (n[id] > 1) n[id]--; else delete n[id]; return n; });

  // Place order from cart
  async function placeOrder({ location, note, cartItems }) {
    setOrderBusy(true);
    setErrorMsg('');
    try {
      // Fire one quick-order request per line item
      let lastReq = null;
      for (const { item, qty } of cartItems) {
        const r = await api.quickOrder({
          quick_item:        item.item_name,
          quick_location:    location,
          quick_quantity:    qty,
          quick_instruction: note || '',
        });
        lastReq = r?.request;
      }
      setCart({});
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

  // Custom text request
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
        setCustomText('');
        setCustomLoc('');
        setShowCustom(false);
        navigate(`/track/${r.request.id}`);
      }
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setCustomBusy(false);
    }
  }

  // Group items by category
  const grouped = items.reduce((acc, item) => {
    const cat = item.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const catOrder = ['beverage', 'food', 'snack', 'meal', 'stationery', 'cleaning', 'other'];
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
        <p className="text-slate-500 text-sm mt-1">
          What can we get you today?
        </p>
      </div>

      {/* ── Active order banner ── */}
      {activeOrder && (
        <ActiveOrderBanner
          order={activeOrder}
          onPress={() => navigate(`/track/${activeOrder.id}`)}
        />
      )}

      {/* ── Success / Error flash ── */}
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
            <h2 className="font-extrabold text-slate-800 capitalize text-sm tracking-wide">
              {cat === 'beverage' ? 'Drinks' :
               cat === 'food'    ? 'Food' :
               cat === 'snack'   ? 'Snacks' :
               cat === 'meal'    ? 'Meals' :
               cat === 'stationery' ? 'Stationery' :
               cat === 'cleaning'   ? 'Cleaning' : 'Other'}
            </h2>
            <div className="h-px flex-1 bg-slate-100" />
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {grouped[cat].map((item) => (
              <ItemChip
                key={item.id}
                item={item}
                qty={cart[item.id] || 0}
                onAdd={() => addToCart(item.id)}
                onRemove={() => removeFromCart(item.id)}
                onQuickOrder={() => {
                  setCart({ [item.id]: 1 });
                  setShowSheet(true);
                }}
              />
            ))}
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
                        customLoc === loc
                          ? 'bg-brand text-white border-brand'
                          : 'bg-white text-slate-600 border-slate-100 hover:border-brand/30'
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
                  <span className="text-lg">
                    {r.status === 'done' ? '✅' : '❌'}
                  </span>
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

      {/* ── Order Sheet ── */}
      <AnimatePresence>
        {showSheet && (
          <OrderSheet
            cart={cart}
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
