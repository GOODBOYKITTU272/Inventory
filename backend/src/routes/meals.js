import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// ── Day-of-week meal options ──────────────────────────────────────────────────
// 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
const DAY_OPTIONS = {
  1: ['veg'],                   // Monday: Veg only
  2: ['veg', 'egg'],            // Tuesday: Veg / Egg
  3: ['veg', 'non_veg'],        // Wednesday: Veg / Non-Veg
  4: ['veg', 'egg'],            // Thursday: Veg / Egg
  5: ['veg', 'non_veg'],        // Friday: Veg / Non-Veg
};

function getISTNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function getISTHour() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return ist.getHours() + ist.getMinutes() / 60;
}

function getMealDateDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+05:30');
  return d.getDay(); // 0=Sun ... 6=Sat
}

function isWorkingDay(dateStr) {
  const day = getMealDateDay(dateStr);
  return day >= 1 && day <= 5;
}

function getOptionsForDate(dateStr) {
  const day = getMealDateDay(dateStr);
  return DAY_OPTIONS[day] || [];
}

// Determine what actions are allowed right now for a given meal_date
function getAllowedActions(mealDate) {
  const now = getISTNow();
  const hour = getISTHour();

  // Parse meal date
  const mealDay = new Date(mealDate + 'T00:00:00+05:30');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mealDayClean = new Date(mealDay.getFullYear(), mealDay.getMonth(), mealDay.getDate());

  // If meal date is today or past → locked
  if (mealDayClean <= today) {
    return { canBook: false, canSkip: false, reason: 'past' };
  }

  // If meal date is tomorrow
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (mealDayClean.getTime() === tomorrow.getTime()) {
    // Before 6 PM → full booking
    if (hour < 18) {
      return { canBook: true, canSkip: true, reason: 'open' };
    }
    // 6 PM – 8 PM → only skip
    if (hour < 20) {
      return { canBook: false, canSkip: true, reason: 'skip_only' };
    }
    // After 8 PM → locked
    return { canBook: false, canSkip: false, reason: 'locked' };
  }

  // Future dates (day after tomorrow+) → full booking
  return { canBook: true, canSkip: true, reason: 'open' };
}

// ── GET /api/meals/options?date=2026-05-21 ────────────────────────────────────
// Returns what options are available for a date + current booking + cutoff status
router.get('/options', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date query param required' });

    if (!isWorkingDay(date)) {
      return res.json({ working_day: false, options: [], booking: null });
    }

    const options = getOptionsForDate(date);
    const actions = getAllowedActions(date);

    // Get user's current booking
    const { data: booking } = await supabaseAdmin
      .from('meal_bookings')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('meal_date', date)
      .maybeSingle();

    res.json({
      working_day: true,
      meal_date: date,
      options,           // ['veg'] or ['veg','egg'] or ['veg','non_veg']
      ...actions,        // canBook, canSkip, reason
      booking: booking || null,
    });
  } catch (e) { next(e); }
});

// ── POST /api/meals/book ──────────────────────────────────────────────────────
// Body: { date: "2026-05-21", choice: "veg" | "non_veg" | "egg" | "skip" }
router.post('/book', async (req, res, next) => {
  try {
    const { date, choice } = req.body;
    if (!date || !choice) return res.status(400).json({ error: 'date and choice required' });

    // Validate working day
    if (!isWorkingDay(date)) {
      return res.status(400).json({ error: 'Not a working day' });
    }

    // Check date range
    const settings = await getSettings();
    if (date < settings.active_from || date > settings.active_until) {
      return res.status(400).json({ error: 'Meal booking not available for this date' });
    }

    const actions = getAllowedActions(date);

    if (choice === 'skip') {
      // Skip allowed if canSkip
      if (!actions.canSkip) {
        return res.status(400).json({ error: 'Booking is fully locked. Cannot skip anymore.' });
      }
    } else {
      // Booking (veg/non_veg/egg) allowed only if canBook
      if (!actions.canBook) {
        if (actions.canSkip) {
          return res.status(400).json({ error: 'After 6 PM you can only skip. Cannot change meal type.' });
        }
        return res.status(400).json({ error: 'Booking is locked after 8 PM.' });
      }

      // Validate choice is valid for this day
      const validOptions = getOptionsForDate(date);
      if (!validOptions.includes(choice)) {
        return res.status(400).json({
          error: `${choice} is not available on this day. Options: ${validOptions.join(', ')}`
        });
      }
    }

    // Upsert booking
    const { data, error } = await supabaseAdmin
      .from('meal_bookings')
      .upsert({
        user_id: req.user.id,
        meal_date: date,
        choice,
        booked_at: new Date().toISOString(),
      }, { onConflict: 'user_id,meal_date' })
      .select()
      .single();

    if (error) throw error;

    const emoji = { veg: '🥬', non_veg: '🍗', egg: '🥚', skip: '🚫' };
    res.json({
      ok: true,
      booking: data,
      message: choice === 'skip'
        ? '🚫 Meal skipped for this day'
        : `${emoji[choice] || '🍱'} Booked ${choice} successfully!`
    });
  } catch (e) { next(e); }
});

// ── GET /api/meals/my-bookings?month=2026-05 ─────────────────────────────────
// Returns all bookings for the user in a month (for calendar view)
router.get('/my-bookings', async (req, res, next) => {
  try {
    const { month } = req.query; // "2026-05"
    if (!month) return res.status(400).json({ error: 'month query param required (YYYY-MM)' });

    const startDate = `${month}-01`;
    // Get last day of month
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

    const { data, error } = await supabaseAdmin
      .from('meal_bookings')
      .select('*')
      .eq('user_id', req.user.id)
      .gte('meal_date', startDate)
      .lte('meal_date', endDate)
      .order('meal_date');

    if (error) throw error;
    res.json(data || []);
  } catch (e) { next(e); }
});

// ── GET /api/meals/summary?date=2026-05-21 ───────────────────────────────────
// FM + Finance: headcount summary for a date
router.get('/summary',
  requireRole('facility_manager', 'finance', 'leadership'),
  async (req, res, next) => {
    try {
      const { date } = req.query;
      if (!date) return res.status(400).json({ error: 'date query param required' });

      const { data: bookings, error } = await supabaseAdmin
        .from('meal_bookings')
        .select('choice, user_id, profiles!inner(full_name, preferred_name)')
        .eq('meal_date', date);

      if (error) throw error;

      const settings = await getSettings();

      const summary = {
        date,
        veg: [],
        non_veg: [],
        egg: [],
        skip: [],
      };

      for (const b of (bookings || [])) {
        const name = b.profiles?.preferred_name || b.profiles?.full_name || 'Unknown';
        if (summary[b.choice]) {
          summary[b.choice].push(name);
        }
      }

      // Get total employee count for "not booked"
      const { count: totalEmployees } = await supabaseAdmin
        .from('profiles')
        .select('id', { count: 'exact', head: true });

      const bookedCount = (bookings || []).length;

      res.json({
        ...summary,
        veg_count: summary.veg.length,
        non_veg_count: summary.non_veg.length,
        egg_count: summary.egg.length,
        skip_count: summary.skip.length,
        not_booked: (totalEmployees || 0) - bookedCount,
        total_meals: summary.veg.length + summary.non_veg.length + summary.egg.length,
        cost: {
          veg: summary.veg.length * (settings.cost_per_veg || 80),
          non_veg: summary.non_veg.length * (settings.cost_per_non_veg || 120),
          egg: summary.egg.length * (settings.cost_per_egg || 100),
          total: (summary.veg.length * (settings.cost_per_veg || 80)) +
                 (summary.non_veg.length * (settings.cost_per_non_veg || 120)) +
                 (summary.egg.length * (settings.cost_per_egg || 100)),
        },
      });
    } catch (e) { next(e); }
  }
);

// ── GET /api/meals/settings ───────────────────────────────────────────────────
router.get('/settings', async (req, res, next) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (e) { next(e); }
});

async function getSettings() {
  const { data } = await supabaseAdmin
    .from('meal_settings')
    .select('*')
    .limit(1)
    .single();
  return data || {
    cutoff_time: '18:00',
    skip_cutoff_time: '20:00',
    cost_per_veg: 80,
    cost_per_non_veg: 120,
    cost_per_egg: 100,
    active_from: '2026-05-20',
    active_until: '2026-12-31',
  };
}

export default router;
