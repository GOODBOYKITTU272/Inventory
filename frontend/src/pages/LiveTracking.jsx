import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle2, 
  Clock, 
  Coffee, 
  Truck, 
  MapPin, 
  Star,
  ChevronLeft
} from 'lucide-react';

const STAGES = [
  { id: 'placed', label: 'Request Placed', icon: Clock },
  { id: 'accepted', label: 'Office Boy Accepted', icon: CheckCircle2 },
  { id: 'preparing', label: 'Preparing', icon: Coffee },
  { id: 'on_the_way', label: 'On the Way', icon: Truck },
  { id: 'done', label: 'Delivered', icon: CheckCircle2 },
];

export default function LiveTracking() {
  const { id } = useParams();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      // In a real app, we would have a specific getRequest call
      // For now, we list all and filter, or assume api has getRequest
      const data = await api.listRequests();
      const found = data.find(r => r.id === id);
      if (found) {
        setRequest(found);
        if (found.status === 'done' && found.rating_status === 'pending') {
          setShowRating(true);
        }
      } else {
        setError('Request not found');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000); // Poll every 5s for live updates
    return () => clearInterval(timer);
  }, [id]);

  const currentStageIndex = STAGES.findIndex(s => s.id === (request?.live_status || 'placed'));

  if (loading) return <div className="p-8 text-center text-slate-500">Loading tracking...</div>;
  if (error) return <div className="p-8 text-center text-rose-600">{error}</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <Link to="/request" className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <ChevronLeft size={24} />
        </Link>
        <h1 className="text-2xl font-bold">Track Request</h1>
      </div>

      {/* Main Status Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card bg-brand text-white overflow-hidden relative"
      >
        <div className="relative z-10">
          <div className="text-brand-light text-sm font-medium uppercase tracking-wider">Current Status</div>
          <div className="text-3xl font-bold mt-1 capitalize">
            {request.live_status?.replace('_', ' ') || 'Placed'}
          </div>
          <div className="mt-4 flex items-center gap-2 text-brand-light">
            <MapPin size={16} />
            <span>{request.parsed_location || 'Office'}</span>
          </div>
        </div>
        
        {/* Background Animation/Decoration */}
        <div className="absolute right-[-20px] top-[-20px] opacity-10">
          <Coffee size={160} />
        </div>
      </motion.div>

      {/* Timeline */}
      <div className="card">
        <div className="timeline">
          {STAGES.map((stage, idx) => {
            const isDone = idx < currentStageIndex || request.status === 'done';
            const isActive = idx === currentStageIndex && request.status !== 'done';
            const Icon = stage.icon;

            return (
              <div key={stage.id} className="timeline-item">
                <div className={`timeline-dot ${isDone ? 'timeline-dot-done' : isActive ? 'timeline-dot-active' : 'timeline-dot-inactive'}`}>
                  {isDone && <CheckCircle2 size={12} className="text-white" />}
                </div>
                <div className="flex items-center justify-between">
                  <div className={`font-medium ${isActive ? 'text-brand' : isDone ? 'text-slate-900' : 'text-slate-400'}`}>
                    {stage.label}
                  </div>
                  {isActive && (
                    <motion.div 
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <Icon size={20} className="text-brand" />
                    </motion.div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Item Details */}
      <div className="card">
        <h3 className="font-semibold text-slate-900 mb-3">Order Details</h3>
        <div className="flex justify-between items-start border-b border-slate-100 pb-3 mb-3">
          <div>
            <div className="text-lg font-medium">{request.parsed_item}</div>
            <div className="text-sm text-slate-500">Qty: {request.quantity || 1}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400 uppercase">Request ID</div>
            <div className="font-mono text-sm">{request.id.slice(0, 8)}</div>
          </div>
        </div>
        <div className="text-sm text-slate-600 italic">
          "{request.instruction}"
        </div>
      </div>

      {/* Rating Modal/Overlay */}
      <AnimatePresence>
        {showRating && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          >
            <motion.div 
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-8 shadow-2xl"
            >
              <div className="text-center">
                <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={40} />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Hope it hits the spot! 😋</h2>
                <p className="text-slate-500 mt-2">Was the Office Boy fast enough? Help us keep the office vibes 100.</p>
              </div>

              <div className="flex justify-center gap-2 my-8">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button 
                    key={s} 
                    onClick={() => setRating(s)}
                    className="transition-transform active:scale-90"
                  >
                    <Star 
                      size={40} 
                      className={s <= rating ? 'fill-brand text-brand' : 'text-slate-200'} 
                    />
                  </button>
                ))}
              </div>

              <textarea 
                className="input min-h-[100px] mb-6 border-slate-100 bg-slate-50 focus:bg-white"
                placeholder="Any special shoutout for the Office Boy? ✨"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />

              <div className="flex gap-3">
                <button 
                  className="btn-secondary flex-1" 
                  onClick={() => setShowRating(false)}
                >
                  Later
                </button>
                <button 
                  className="btn-primary flex-1 shadow-lg shadow-brand/20"
                  disabled={!rating || busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api.rateRequest(id, { rating, feedback: comment });
                      setShowRating(false);
                      load();
                    } catch (e) {
                      alert(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? 'Submitting...' : 'Send Feedback'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
