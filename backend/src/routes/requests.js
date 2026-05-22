import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { requireRole } from '../middleware/auth.js';
import { chatCompletion } from '../lib/openai.js';
import { postOrderToTeams, postCancelToTeams, postStockAlertToTeams } from '../lib/teams.js';

import { learnFromRating } from '../lib/learning.js';
import { sendPushToUsers } from './push.js';
const router = Router();

// Map well-known cafeteria items to categories
const ITEM_CATEGORY = {
  'ccd coffee': 'beverage', 'regular tea': 'beverage', 'lemon tea': 'beverage',
  'water bottle': 'beverage', 'water': 'beverage', 'tea': 'beverage', 'coffee': 'beverage',
  'bread + peanut butter': 'food', 'bread + jam': 'food', 'bread': 'food',
  'biscuits': 'snack', 'black coffee': 'beverage',
  'stationery': 'stationery', 'cleaning': 'cleaning',
  'maintenance': 'maintenance', 'meeting room setup': 'other',
};

// ── Tone-aware dependency messages ──────────────────────────────────────────
const DEPENDENCY_MESSAGES = {
  'Mom Mode': {
    _default: (item, dep) => `Beta, ${item} toh hai but ${dep} khatam ho gaya 🍞😅 Office boy ko bol diya hai!`,
  },
  'gen_z': {
    _default: (item, dep) => `Bruh, ${dep}'s MIA 💀 ${item} without ${dep} is just chaotic. Restocking!`,
  },
  'Friendly': {
    _default: (item, dep) => `Oops! We have ${item} but ${dep} ran out! We'll restock soon 😊`,
  },
  'Professional': {
    _default: (item, dep) => `${dep} is currently unavailable. ${item} requires ${dep} to serve.`,
  },
  'Funny': {
    _default: (item, dep) => `${item} bina ${dep} ke? Bhai, ye toh crime hai 😂 ${dep} ka stock khatam. Patience!`,
  },
  'Minimal': {
    _default: (item, dep) => `${dep} out of stock. Can't serve ${item}.`,
  },
};

function getDependencyMessage(tone, itemName, depName) {
  const toneMessages = DEPENDENCY_MESSAGES[tone] || DEPENDENCY_MESSAGES['Friendly'];
  const fn = toneMessages[depName] || toneMessages._default;
  return fn(itemName, depName);
}

const PARSER_SYSTEM = `You are the "Applywizz Office Concierge" AI.
Your tone is WITTY, ENERGETIC, and PERSONABLE (like Zomato push notifications).
The office team is aged 23-25, so use emojis and Gen-Z friendly language.

OFFICE CULTURE:
- Working Hours: 9 AM – 5 PM, Mon–Fri.
- Assets: CCD Coffee Machine, Fresh Bread, Peanut Butter, Mixed Fruit Jam.
- Locations: Balaji Cabin, RK Cabin, Manisha Cabin, Resume Cabin, Tech Team, Marketing Team, Conference Room.

Extract these fields and return ONLY valid JSON:
1. "employee_name": Name from the request or the authenticated submitter name.
2. "request_type": "beverage" | "cleaning" | "food" | "stationery" | "other".
3. "item": What they want (e.g. "CCD Coffee", "Lemon Tea", "Bread with PB&J").
4. "quantity": Number or description (default "1" if not stated).
5. "location": Delivery location. If not stated, leave as null.
6. "priority": "Urgent" | "Normal" | "Low".
7. "instruction": A SHORT, WITTY, emoji-filled instruction for the Office Boy (1–2 sentences max).
8. "missing_details": [] (empty array unless item is completely unknown).
9. "follow_up_question": null (see rules below).

CRITICAL RULES FOR follow_up_question:
- Set follow_up_question to null for ALL clear requests. Process them immediately.
- ONLY set a non-null follow_up_question if the item is completely unidentifiable (e.g. user typed "bring me something" with zero context).
- NEVER block a request to ask about health, variety, or suggestions. Put those thoughts in the instruction text instead.
- If location is missing, still process the order — just set location to null.
- "Usual", "my regular", "the normal thing" = process it as their typical item (Coffee if no history).

Example Witty Instruction:
"🚀 Rama's brain needs fuel! Rush a CCD Coffee to Balaji Cabin — productivity depends on it!"

Return JSON ONLY. No markdown, no explanation.`;


async function parseWithGPT({ rawText, submitterName }) {
  const userPrompt =
    `Submitter (already authenticated, may be the same as employee): ${submitterName || 'unknown'}\n\nRequest:\n"${rawText}"`;
  const { content, model, usage } = await chatCompletion({
    system: PARSER_SYSTEM,
    user: userPrompt,
    model: 'gpt-4o-mini',
    temperature: 0.1,
  });
  let parsed;
  try {
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`GPT returned non-JSON: ${content.slice(0, 200)}`);
  }
  return { parsed, model, usage };
}

const createSchema = z.object({
  raw_text: z.string().min(3).max(500),
});

router.post('/', async (req, res, next) => {
  try {
    // ── Quick order (cafeteria tap — no AI needed) ───────────────
    const { quick_item, quick_location, quick_quantity = 1, quick_instruction = '', quick_bread_type = '' } = req.body;
    if (quick_item) {
      const qty = parseInt(quick_quantity, 10) || 1;
      const firstName = req.user.preferred_name || (req.user.full_name || req.user.email || 'Someone').split(' ')[0];
      const locPart  = quick_location ? ` to ${quick_location}` : '';
      const notePart = quick_instruction ? ` Note: ${quick_instruction}.` : '';
      const instruction = `🚀 ${firstName} needs ${qty}x ${quick_item}${locPart}. Please deliver promptly!${notePart}`;
      const category = ITEM_CATEGORY[quick_item.toLowerCase()] || 'other';

      // ── Stock check & decrement ───────────────────────────────────
      const { data: itemRow } = await supabaseAdmin
        .from('cafeteria_items')
        .select('id, stock_today, stock_servings, dependencies, sides_option')
        .ilike('item_name', quick_item)
        .maybeSingle();

      if (itemRow && itemRow.stock_today !== null) {
        if (itemRow.stock_today < qty) {
          const oosMessages = [
            `Sorry beta, ${quick_item} khatam ho gaya 🥺`,
            `Aaj ki ${quick_item} quota over hai bestie 💅`,
            `Unlucky yaar, ${quick_item} sold out 😭`,
            `${quick_item} ka stock RIP ho gaya 🫠`,
            `Beta too late, sab ${quick_item} kha/pi gaye 🤷‍♀️`,
          ];
          const lowMessages = [
            `Arre yaar, sirf ${itemRow.stock_today} ${quick_item} bacha hai but you want ${qty} 😬`,
            `Only ${itemRow.stock_today} left bestie, ${qty} nahi milega 🥲`,
            `${quick_item} almost khatam — ${itemRow.stock_today} hi bacha, ${qty} chahiye? No can do 💀`,
          ];
          const msg = itemRow.stock_today === 0
            ? oosMessages[Math.floor(Math.random() * oosMessages.length)]
            : lowMessages[Math.floor(Math.random() * lowMessages.length)];
          return res.status(400).json({ error: msg });
        }
        // Decrement stock
        await supabaseAdmin
          .from('cafeteria_items')
          .update({ stock_today: itemRow.stock_today - qty })
          .eq('id', itemRow.id);
      }

      // ── Dependency check (e.g., Jam needs Bread) ───────────────────
      const deps = itemRow?.dependencies;
      const isBothSides = /both\s*side/i.test(quick_instruction);
      const sidesMultiplier = (itemRow?.sides_option && isBothSides) ? 2 : 1;

      if (Array.isArray(deps) && deps.length > 0) {
        // Load user's tone preference for personalized message
        let userTone = 'Friendly';
        try {
          const { data: prefRow } = await supabaseAdmin
            .from('employee_preferences')
            .select('notification_tone')
            .eq('employee_id', req.user.id)
            .maybeSingle();
          if (prefRow?.notification_tone) userTone = prefRow.notification_tone;
        } catch (_) { /* use default tone */ }

        for (const depName of deps) {
          // If user chose a specific bread type, use that instead of generic dependency
          const lookupName = (depName.toLowerCase() === 'bread' && quick_bread_type) ? quick_bread_type : depName;

          const { data: depItem } = await supabaseAdmin
            .from('cafeteria_items')
            .select('id, stock_today, stock_servings, display_name, item_name')
            .ilike('item_name', lookupName)
            .maybeSingle();

          if (!depItem) continue; // dependency item doesn't exist in menu, skip check

          const depStock = depItem.stock_today;
          const depServings = depItem.stock_servings;
          const neededServings = qty * sidesMultiplier;

          // Check servings first, then raw stock
          if (depServings !== null && depServings < neededServings) {
            const displayDep = depItem.display_name || depItem.item_name;
            return res.status(400).json({ error: getDependencyMessage(userTone, quick_item, displayDep) });
          }
          if (depStock !== null && depStock <= 0) {
            const displayDep = depItem.display_name || depItem.item_name;
            return res.status(400).json({ error: getDependencyMessage(userTone, quick_item, displayDep) });
          }

          // Decrement dependency stock (slices for bread)
          const depUpdate = {};
          if (depStock !== null) depUpdate.stock_today = depStock - (qty * sidesMultiplier);
          if (depServings !== null) depUpdate.stock_servings = depServings - neededServings;
          if (Object.keys(depUpdate).length > 0) {
            await supabaseAdmin.from('cafeteria_items').update(depUpdate).eq('id', depItem.id);
          }
        }
      }

      // Also decrement servings on the main item if tracked
      if (itemRow?.stock_servings !== null && itemRow?.stock_servings !== undefined) {
        const mainServingsUsed = qty * sidesMultiplier;
        const newServings = (itemRow.stock_servings || 0) - mainServingsUsed;
        await supabaseAdmin
          .from('cafeteria_items')
          .update({ stock_servings: newServings })
          .eq('id', itemRow.id);

        // Stock alert if running low
        if (newServings <= 3 && newServings >= 0) {
          postStockAlertToTeams({ ...itemRow, stock_servings: newServings }).catch(() => {});
        }
      }

      const breadPart = quick_bread_type ? ` [bread:${quick_bread_type}]` : '';
      const { data: qData, error: qErr } = await supabaseAdmin
        .from('requests')
        .insert({
          raw_text:              `${qty}x ${quick_item}${locPart}${breadPart}`,
          category,
          parsed_item:           quick_item,
          parsed_location:       quick_location || null,
          instruction,
          submitted_by:          req.user.id,
          live_status:           'placed',
          status:                'pending',
        })
        .select()
        .single();
      if (qErr) throw qErr;

      postOrderToTeams({ ...qData, priority: 'Normal', quantity: String(qty) }).catch((e) => console.error('[Teams quick-order]', e.message));

      // Push notification to office boy / facility manager
      supabaseAdmin.from('profiles').select('id').in('role', ['office_boy', 'facility_manager']).then(({ data }) => {
        if (data?.length) sendPushToUsers(data.map(u => u.id), {
          title: `🔔 New Order`,
          body:  `${firstName}: ${qty}x ${quick_item}${locPart}`,
          url:   '/queue',
          tag:   `order-${qData.id}`,
        }).catch(() => {});
      });

      return res.status(201).json({ needs_followup: false, request: qData });
    }

    // ── Standard AI-parsed request ────────────────────────────────
    const { raw_text } = createSchema.parse(req.body);

    const { parsed, model } = await parseWithGPT({
      rawText: raw_text,
      submitterName: req.user.full_name || req.user.email,
    });

    // Only block if item is genuinely unknown (cannot make the order at all)
    const itemMissing = !parsed.item || parsed.item.trim() === '';
    const hasRealFollowup = parsed.follow_up_question && itemMissing;
    if (hasRealFollowup) {
      return res.status(200).json({
        needs_followup: true,
        followup: parsed.follow_up_question,
        parsed,
        model,
      });
    }

    const { data, error } = await supabaseAdmin
      .from('requests')
      .insert({
        raw_text,
        category:              parsed.request_type || 'other',
        parsed_item:           parsed.item || parsed.request_details || parsed.request_type || null,
        parsed_employee_name:  parsed.employee_name || req.user.full_name || req.user.email,
        parsed_location:       parsed.location || null,
        instruction:           parsed.instruction,
        submitted_by:          req.user.id,
        live_status:           'placed',
        status:                'pending',
      })
      .select()
      .single();
    if (error) throw error;

    // Push notification to office boy / facility manager
    const insertedId = data?.id;
    supabaseAdmin.from('profiles').select('id').in('role', ['office_boy', 'facility_manager']).then(({ data: staffRows }) => {
      if (staffRows?.length) sendPushToUsers(staffRows.map(u => u.id), {
        title: `🔔 New ${parsed.request_type || 'Request'}`,
        body:  `${parsed.employee_name || req.user.full_name}: ${parsed.item || 'New request'}`,
        url:   '/queue',
        tag:   `order-${insertedId}`,
      }).catch(() => {});
    });

    // Fire-and-forget Teams notification
    const teamsResult = await postOrderToTeams({
      ...data,
      priority: parsed.priority || 'Normal',
      quantity: parsed.quantity || '1',
    });

    res.status(201).json({
      needs_followup: false,
      request:        data,
      teams:          teamsResult,
      model,
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/requests/queue-count — count of active orders (for ETA calculation)
router.get('/queue-count', async (req, res, next) => {
  try {
    const { count: pending, error: e1 } = await supabaseAdmin
      .from('requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    if (e1) throw e1;

    const { count: in_progress, error: e2 } = await supabaseAdmin
      .from('requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'in_progress');
    if (e2) throw e2;

    res.json({ pending: pending || 0, in_progress: in_progress || 0 });
  } catch (e) {
    next(e);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status;
    const isStaff = ['office_boy', 'facility_manager', 'leadership'].includes(req.user.role);

    let q = supabaseAdmin
      .from('v_request_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (!isStaff) q = q.eq('submitted_by', req.user.id);
    if (status)   q = q.eq('status', status);

    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    next(e);
  }
});

// GET /api/requests/:id — for live tracking
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('v_request_queue')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Request not found' });
    // Only the submitter or staff can view
    const isStaff = ['office_boy', 'facility_manager', 'leadership'].includes(req.user.role);
    if (!isStaff && data.submitted_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(data);
  } catch (e) { next(e); }
});

router.patch(
  '/:id/status',
  requireRole('office_boy', 'facility_manager', 'leadership'),
  async (req, res, next) => {
    try {
      const statusSchema = z.object({
        status: z.enum(['pending', 'in_progress', 'done', 'cancelled']),
        live_status: z.string().optional(),
        notes: z.string().optional(),
      });
      const { status, live_status, notes } = statusSchema.parse(req.body);

      const update = { status };
      if (live_status) update.live_status = live_status;
      if (notes !== undefined) update.notes = notes;

      if (status === 'in_progress' && !live_status) update.live_status = 'accepted';

      if (live_status === 'accepted')    update.accepted_at = new Date().toISOString();
      if (live_status === 'preparing')   update.started_at = new Date().toISOString();
      if (live_status === 'on_the_way')  update.on_the_way_at = new Date().toISOString();
      if (status === 'done') {
        update.fulfilled_by = req.user.id;
        update.fulfilled_at = new Date().toISOString();
        update.live_status = 'done';
      }
      if (status === 'cancelled') {
        update.cancelled_at = new Date().toISOString();
        update.live_status = 'cancelled';
      }

      const { data, error } = await supabaseAdmin
        .from('requests')
        .update(update)
        .eq('id', req.params.id)
        .select()
        .single();
      if (error) throw error;

      // ── Teams notification on staff cancel ─────────────────────────────────
      if (status === 'cancelled' && data) {
        postCancelToTeams(data, 'staff').catch((e) => console.error('[Teams cancel]', e.message));
      }

      // ── Restore stock on staff cancel ─────────────────────────────────────
      if (status === 'cancelled' && data?.parsed_item) {
        const cancelQty = parseInt(data.raw_text?.match(/^(\d+)x/)?.[1], 10) || 1;
        const isBoth = /both\s*side/i.test(data.instruction || '');
        const sidesM = isBoth ? 2 : 1;

        const { data: itemRow } = await supabaseAdmin
          .from('cafeteria_items')
          .select('id, stock_today, stock_servings, dependencies, sides_option')
          .ilike('item_name', data.parsed_item)
          .maybeSingle();

        if (itemRow && itemRow.stock_today !== null) {
          const restore = { stock_today: itemRow.stock_today + cancelQty };
          if (itemRow.stock_servings !== null) restore.stock_servings = (itemRow.stock_servings || 0) + (cancelQty * sidesM);
          await supabaseAdmin.from('cafeteria_items').update(restore).eq('id', itemRow.id);
        }

        // Restore dependency stock (e.g., Bread when Jam cancelled)
        // Parse specific bread type from raw_text: "1x Mix Fruit Jam [bread:MRBWL MLK BREAD]"
        const staffBreadMatch = data.raw_text?.match(/\[bread:(.+?)\]/);
        const staffBreadType = staffBreadMatch ? staffBreadMatch[1] : null;

        if (itemRow && Array.isArray(itemRow.dependencies) && itemRow.dependencies.length > 0) {
          for (const depName of itemRow.dependencies) {
            const lookupName = (depName.toLowerCase() === 'bread' && staffBreadType) ? staffBreadType : depName;
            const { data: depItem } = await supabaseAdmin
              .from('cafeteria_items')
              .select('id, stock_today, stock_servings')
              .ilike('item_name', lookupName)
              .maybeSingle();
            if (depItem) {
              const depRestore = {};
              if (depItem.stock_today !== null) depRestore.stock_today = (depItem.stock_today || 0) + (cancelQty * sidesM);
              if (depItem.stock_servings !== null) depRestore.stock_servings = (depItem.stock_servings || 0) + (cancelQty * sidesM);
              if (Object.keys(depRestore).length > 0) {
                await supabaseAdmin.from('cafeteria_items').update(depRestore).eq('id', depItem.id);
              }
            }
          }
        }
      }

      // ── Push notification to the employee who placed the order ──────────────
      if (data?.submitted_by) {
        const effectiveStatus = update.live_status || live_status || status;
        const item = data.parsed_item || data.raw_text || 'your order';

        const PUSH_MESSAGES = {
          accepted:   { title: '✅ Order Accepted!',      body: `${item} has been accepted and is being prepared.` },
          preparing:  { title: '☕ Being Prepared!',       body: `${item} is being made right now.` },
          on_the_way: { title: '🛵 On the Way!',           body: `${item} is heading to you now!` },
          done:       { title: '🎉 Delivered!',            body: `${item} has been delivered. Enjoy! Rate your experience in the app.` },
          cancelled:  { title: '❌ Order Cancelled',       body: `${item} was cancelled. You can place a new order anytime.` },
        };

        const msg = PUSH_MESSAGES[effectiveStatus];
        if (msg) {
          sendPushToUsers([data.submitted_by], {
            ...msg,
            url: `/track/${data.id}`,
            tag: `status-${data.id}`,
          }).catch(() => {});
        }
      }

      res.json(data);
    } catch (e) {
      next(e);
    }
  },
);

// POST /api/requests/:id/cancel — self-cancel by order owner within 30s
router.post('/:id/cancel', async (req, res, next) => {
  try {
    // Fetch the order
    const { data: order, error: fetchErr } = await supabaseAdmin
      .from('requests')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (fetchErr) throw fetchErr;
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Must be the owner
    if (order.submitted_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only cancel your own orders' });
    }

    // Must be pending + placed
    if (order.status !== 'pending' || (order.live_status && order.live_status !== 'placed')) {
      return res.status(400).json({ error: 'Order has already been accepted and cannot be cancelled' });
    }

    // Must be within 30 seconds
    const createdAt = new Date(order.created_at).getTime();
    const elapsed = (Date.now() - createdAt) / 1000;
    if (elapsed > 35) { // 5s grace for network latency
      return res.status(400).json({ error: 'Cancel window has expired' });
    }

    const { data, error } = await supabaseAdmin
      .from('requests')
      .update({
        status: 'cancelled',
        live_status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        notes: 'Cancelled by user',
      })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;

    // ── Teams notification on self-cancel ─────────────────────────────
    postCancelToTeams(data, 'self').catch((e) => console.error('[Teams self-cancel]', e.message));

    // ── Restore stock on cancel ──────────────────────────────────────
    if (order.parsed_item) {
      const cancelQty = parseInt(order.raw_text?.match(/^(\d+)x/)?.[1], 10) || 1;
      const isBoth = /both\s*side/i.test(order.instruction || '');
      const sidesM = isBoth ? 2 : 1;

      const { data: itemRow } = await supabaseAdmin
        .from('cafeteria_items')
        .select('id, stock_today, stock_servings, dependencies, sides_option')
        .ilike('item_name', order.parsed_item)
        .maybeSingle();

      if (itemRow && itemRow.stock_today !== null) {
        const restore = { stock_today: itemRow.stock_today + cancelQty };
        if (itemRow.stock_servings !== null) restore.stock_servings = (itemRow.stock_servings || 0) + (cancelQty * sidesM);
        await supabaseAdmin.from('cafeteria_items').update(restore).eq('id', itemRow.id);
      }

      // Restore dependency stock (e.g., Bread when Jam cancelled)
      // Parse specific bread type from raw_text: "1x Mix Fruit Jam to RK Cabin [bread:MRBWL MLK BREAD]"
      const breadMatch = order.raw_text?.match(/\[bread:(.+?)\]/);
      const cancelBreadType = breadMatch ? breadMatch[1] : null;

      if (itemRow && Array.isArray(itemRow.dependencies) && itemRow.dependencies.length > 0) {
        for (const depName of itemRow.dependencies) {
          const lookupName = (depName.toLowerCase() === 'bread' && cancelBreadType) ? cancelBreadType : depName;
          const { data: depItem } = await supabaseAdmin
            .from('cafeteria_items')
            .select('id, stock_today, stock_servings')
            .ilike('item_name', lookupName)
            .maybeSingle();
          if (depItem) {
            const depRestore = {};
            if (depItem.stock_today !== null) depRestore.stock_today = (depItem.stock_today || 0) + (cancelQty * sidesM);
            if (depItem.stock_servings !== null) depRestore.stock_servings = (depItem.stock_servings || 0) + (cancelQty * sidesM);
            if (Object.keys(depRestore).length > 0) {
              await supabaseAdmin.from('cafeteria_items').update(depRestore).eq('id', depItem.id);
            }
          }
        }
      }
    }

    res.json(data);
  } catch (e) {
    next(e);
  }
});

// POST /api/requests/:id/rate
router.post(
  '/:id/rate',
  async (req, res, next) => {
    try {
      const { rating, feedback } = req.body;
      const { data, error } = await supabaseAdmin
        .from('requests')
        .update({
          rating,
          feedback,
          rating_status: 'done'
        })
        .eq('id', req.params.id)
        .select()
        .single();
      if (error) throw error;

      // Trigger AI Learning (Async)
      learnFromRating(req.user.id, req.params.id).catch(console.error);

      res.json(data);
    } catch (e) {
      next(e);
    }
  }
);

export default router;
