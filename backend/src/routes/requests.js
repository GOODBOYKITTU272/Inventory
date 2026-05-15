import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { requireRole } from '../middleware/auth.js';
import { chatCompletion } from '../lib/openai.js';
import { postRequestToTeams } from '../lib/teams.js';

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
    const { quick_item, quick_location, quick_quantity = 1, quick_instruction = '' } = req.body;
    if (quick_item) {
      const firstName = req.user.preferred_name || (req.user.full_name || req.user.email || 'Someone').split(' ')[0];
      const locPart  = quick_location ? ` to ${quick_location}` : '';
      const notePart = quick_instruction ? ` Note: ${quick_instruction}.` : '';
      const instruction = `🚀 ${firstName} needs ${quick_quantity}x ${quick_item}${locPart}. Please deliver promptly!${notePart}`;
      const category = ITEM_CATEGORY[quick_item.toLowerCase()] || 'other';

      const { data: qData, error: qErr } = await supabaseAdmin
        .from('requests')
        .insert({
          raw_text:              `${quick_quantity}x ${quick_item}${locPart}`,
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

      postRequestToTeams({ ...qData, priority: 'Normal', quantity: String(quick_quantity) }).catch((e) => console.error('[Teams quick-order]', e.message));

      // Push notification to office boy / facility manager
      supabaseAdmin.from('profiles').select('id').in('role', ['office_boy', 'facility_manager']).then(({ data }) => {
        if (data?.length) sendPushToUsers(data.map(u => u.id), {
          title: `🔔 New Order`,
          body:  `${firstName}: ${quick_quantity}x ${quick_item}${locPart}`,
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
    const teamsResult = await postRequestToTeams({
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
      res.json(data);
    } catch (e) {
      next(e);
    }
  },
);

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
