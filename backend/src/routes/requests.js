import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { requireRole } from '../middleware/auth.js';
import { chatCompletion } from '../lib/openai.js';
import { postRequestToTeams } from '../lib/teams.js';

import { learnFromRating } from '../lib/learning.js';
const router = Router();

const PARSER_SYSTEM = `You are the "Applywizz Office Concierge" AI. 
Your tone is WITTY, ENERGETIC, and PERSONABLE (like Zomato push notifications).
The office team is aged 23-25, so use emojis and Gen-Z friendly language.

OFFICE CULTURE:
- Working Hours: 9 AM - 5 PM, Mon-Fri.
- Lunch: 1 PM - 2 PM (No orders during this time).
- Assets: CCD Coffee Machine, Fresh Bread, Peanut Butter, Mixed Fruit Jam.

Extract:
1. "employee_name": Name of person who wants it.
2. "request_type": "beverage", "cleaning", "food", "stationery", "other".
3. "item": e.g., "Coffee", "Lemon Tea", "Bread with PB&J".
4. "quantity": number or description.
5. "location": e.g., "Balaji Cabin", "Tech Team".
6. "priority": "Urgent", "Normal", "Low".
7. "instruction": A POLITE, WITTY instruction for the Office Boy.
8. "missing_details": array of missing strings.
9. "follow_up_question": A witty question to get missing info.

Example Witty Instruction:
"🚀 Jagan's brain is at 1%, needs a CCD Coffee at Balaji Cabin ASAP to save the day!"

Rules:
- If someone orders coffee frequently, suggest Lemon Tea or Green Tea occasionally for health.
- If it's near 4 PM, suggest Bread with Peanut Butter and Jam.
- No orders between 1-2 PM. If they ask, politely tell them to enjoy their lunch first.
- Return JSON ONLY.`;

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
    const { raw_text } = createSchema.parse(req.body);

    const { parsed, model } = await parseWithGPT({
      rawText: raw_text,
      submitterName: req.user.full_name || req.user.email,
    });

    // If there are missing details or a follow-up question is generated
    if (parsed.follow_up_question || (parsed.missing_details && parsed.missing_details.length > 0)) {
      return res.status(200).json({
        needs_followup: true,
        followup: parsed.follow_up_question || `Please provide more details: ${parsed.missing_details.join(', ')}`,
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
