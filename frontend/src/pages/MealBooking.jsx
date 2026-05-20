import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';

const CHOICE_UI = {
  veg:     { emoji: '🥬', label: 'Veg',     bg: 'bg-emerald-100', text: 'text-emerald-700' },
  non_veg: { emoji: '🍗', label: 'Non-Veg', bg: 'bg-red-100',     text: 'text-red-700' },
  egg:     { emoji: '🥚', label: 'Egg',     bg: 'bg-amber-100',   text: 'text-amber-700' },
  skip:    { emoji: '🚫', label: 'Skip',    bg: 'bg-slate-100',   text: 'text-slate-500' },
};

const DAY_OPTIONS = {
  1: ['veg'],            // Mon
  2: ['veg', 'egg'],     // Tue
  3: ['veg', 'non_veg'], // Wed
  4: ['veg', 'egg'],     // Thu
  5: ['veg', 'non_veg'], // Fri
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function getMonthStr(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year, month) {
  return new Date(year, month, 1).getDay(); // 0=Sun
}

export default function MealBooking() {
  const { profile } = useAuth();
  const isManager = ['facility_manager', 'finance', 'leadership'].includes(profile?.role);

  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [bookings, setBookings] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [booking, setBooking] = useState(false);
  const [loading, setLoading] = useState(true);

  const monthStr = getMonthStr(year, month);

  useEffect(() => {
    setLoading(true);
    api.myMealBookings(monthStr)
      .then(setBookings)
      .catch(() => setBookings([]))
      .finally(() => setLoading(false));
  }, [monthStr]);

  // Load summary for selected date (managers only)
  useEffect(() => {
    if (!selectedDate || !isManager) { setSummary(null); return; }
    api.mealSummary(selectedDate).then(setSummary).catch(() => setSummary(null));
  }, [selectedDate, isManager]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  function getBookingForDate(dateStr) {
    return bookings.find(b => b.meal_date === dateStr);
  }

  // Next working day calculation (mirrors backend logic)
  function getNextWorkingDay() {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const nextWorkingDay = getNextWorkingDay();

  async function quickBook(dateStr, choice) {
    setBooking(true);
    try {
      await api.bookMeal({ date: dateStr, choice });
      const updated = await api.myMealBookings(monthStr);
      setBookings(updated);
      if (isManager && selectedDate === dateStr) {
        api.mealSummary(dateStr).then(setSummary).catch(() => {});
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setBooking(false);
    }
  }

  // Build calendar grid
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  // Shift to Monday start: Mon=0, Tue=1, ... Sun=6
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">🍱 Meal Booking</h1>
          <p className="text-sm text-slate-500">Book your lunch for upcoming days</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(CHOICE_UI).map(([key, ui]) => (
          <div key={key} className="flex items-center gap-1">
            <span>{ui.emoji}</span>
            <span className="text-slate-500">{ui.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-slate-300" />
          <span className="text-slate-400">Not booked</span>
        </div>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-100 p-3">
        <button onClick={prevMonth} className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-all">
          <ChevronLeft size={16} />
        </button>
        <h2 className="font-bold text-slate-800">{MONTH_NAMES[month]} {year}</h2>
        <button onClick={nextMonth} className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-all">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        {/* Day headers */}
        <div className="grid grid-cols-5 gap-1 mb-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(d => (
            <div key={d} className="text-center text-xs font-bold text-slate-400 py-1">{d}</div>
          ))}
        </div>

        {/* Date cells — only show Mon–Fri */}
        <div className="grid grid-cols-5 gap-1">
          {/* Empty cells for offset (Mon-based) */}
          {Array.from({ length: Math.min(startOffset, 4) }).map((_, i) => (
            <div key={`empty-${i}`} className="h-16" />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateObj = new Date(year, month, day);
            const dow = dateObj.getDay();

            // Skip weekends
            if (dow === 0 || dow === 6) return null;

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const b = getBookingForDate(dateStr);
            const isPast = dateObj < today || dateObj.getTime() === today.getTime();
            const isToday = dateObj.getTime() === today.getTime();
            const isSelected = selectedDate === dateStr;
            const isBookable = dateStr === nextWorkingDay;
            const ui = b ? CHOICE_UI[b.choice] : null;

            return (
              <motion.button
                key={dateStr}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={`h-16 rounded-xl border-2 flex flex-col items-center justify-center gap-0.5 transition-all text-xs
                  ${isSelected ? 'border-brand bg-brand/5' : 'border-transparent'}
                  ${isPast ? 'opacity-40' : ''}
                  ${!isPast && !isBookable ? 'opacity-60' : ''}
                  ${isBookable ? 'bg-brand/5 hover:bg-brand/10 ring-2 ring-brand/20' : 'hover:bg-slate-50'}
                  ${isToday ? 'ring-2 ring-slate-300' : ''}
                `}
              >
                <span className={`font-bold ${isBookable ? 'text-brand' : isToday ? 'text-slate-500' : 'text-slate-700'}`}>{day}</span>
                {b ? (
                  <span className="text-base">{ui?.emoji}</span>
                ) : isBookable ? (
                  <span className="text-[9px] text-brand font-bold">Book</span>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-slate-200" />
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Selected Date Detail */}
      {selectedDate && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800">
              {new Date(selectedDate + 'T00:00:00+05:30').toLocaleDateString('en-IN', {
                weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata'
              })}
            </h3>
            <button onClick={() => setSelectedDate(null)} className="text-xs text-slate-400 hover:text-slate-600">✕ Close</button>
          </div>

          {/* My booking */}
          {(() => {
            const b = getBookingForDate(selectedDate);
            const dateObj = new Date(selectedDate + 'T00:00:00+05:30');
            const dow = dateObj.getDay();
            const dayOpts = DAY_OPTIONS[dow] || [];
            const isPast = dateObj < today || dateObj.getTime() === today.getTime();
            const isBookable = selectedDate === nextWorkingDay;

            // Past or today — view only
            if (isPast) {
              return (
                <div className={`p-3 rounded-xl ${b ? `${CHOICE_UI[b.choice]?.bg} border` : 'bg-slate-50 border border-slate-200'}`}>
                  <span className="text-sm font-semibold">
                    {b ? `${CHOICE_UI[b.choice]?.emoji} ${CHOICE_UI[b.choice]?.label}` : '⚫ Not booked'}
                  </span>
                </div>
              );
            }

            // Future but NOT next working day — locked, no advance booking
            if (!isBookable) {
              return (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-1">
                  <span className="text-lg">🔒</span>
                  <div className="text-sm font-semibold text-slate-500">Not available yet</div>
                  <div className="text-xs text-slate-400">You can only book for the next working day</div>
                  {b && (
                    <div className={`mt-2 p-2 rounded-lg ${CHOICE_UI[b.choice]?.bg}`}>
                      <span className="text-sm font-semibold">{CHOICE_UI[b.choice]?.emoji} {CHOICE_UI[b.choice]?.label}</span>
                    </div>
                  )}
                </div>
              );
            }

            // Next working day — show booking options
            return (
              <div className="space-y-2">
                <div className="text-xs text-brand font-bold uppercase tracking-wider">Your booking — Next working day</div>
                <div className="flex gap-2">
                  {dayOpts.map(opt => {
                    const ui = CHOICE_UI[opt];
                    const selected = b?.choice === opt;
                    return (
                      <button
                        key={opt}
                        disabled={booking}
                        onClick={() => quickBook(selectedDate, opt)}
                        className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border-2 font-bold text-sm transition-all
                          ${selected ? `${ui.bg} border-current ${ui.text}` : 'bg-white border-slate-200 hover:border-slate-300'}
                          ${booking ? 'opacity-40' : ''}
                        `}
                      >
                        <span className="text-xl">{ui.emoji}</span>
                        <span>{ui.label}</span>
                        {selected && <span>✅</span>}
                      </button>
                    );
                  })}
                  <button
                    disabled={booking}
                    onClick={() => quickBook(selectedDate, 'skip')}
                    className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border-2 font-bold text-sm transition-all
                      ${b?.choice === 'skip' ? 'bg-slate-100 border-slate-400 text-slate-600' : 'bg-white border-slate-200 hover:border-slate-300 text-slate-500'}
                      ${booking ? 'opacity-40' : ''}
                    `}
                  >
                    <span className="text-xl">🚫</span>
                    <span>Skip</span>
                    {b?.choice === 'skip' && <span>✅</span>}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Summary for managers */}
          {isManager && summary && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">Team Summary</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-700">{summary.veg_count}</div>
                  <div className="text-xs text-emerald-600">🥬 Veg · ₹{summary.cost?.veg || 0}</div>
                </div>
                {summary.non_veg_count > 0 && (
                  <div className="bg-red-50 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-red-700">{summary.non_veg_count}</div>
                    <div className="text-xs text-red-600">🍗 Non-Veg · ₹{summary.cost?.non_veg || 0}</div>
                  </div>
                )}
                {summary.egg_count > 0 && (
                  <div className="bg-amber-50 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-amber-700">{summary.egg_count}</div>
                    <div className="text-xs text-amber-600">🥚 Egg · ₹{summary.cost?.egg || 0}</div>
                  </div>
                )}
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-slate-700">{summary.skip_count}</div>
                  <div className="text-xs text-slate-500">🚫 Skipped</div>
                </div>
              </div>
              <div className="flex items-center justify-between bg-brand/5 rounded-xl p-3">
                <span className="font-bold text-sm text-slate-700">Total Meals: {summary.total_meals}</span>
                <span className="font-bold text-sm text-brand">₹{summary.cost?.total || 0}</span>
              </div>
              {summary.not_booked > 0 && (
                <div className="text-xs text-amber-600 font-semibold">
                  ⚠️ {summary.not_booked} people haven't booked yet
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
