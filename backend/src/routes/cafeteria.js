import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/cafeteria/items — all authenticated users
router.get('/items', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('cafeteria_items')
      .select('*')
      .eq('available', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { next(e); }
});

// POST /api/cafeteria/items — leadership only
router.post('/items', requireRole('leadership'), async (req, res, next) => {
  try {
    const { item_name, category, emoji = '☕', description = '', tags = [] } = req.body;
    if (!item_name || !category) {
      return res.status(400).json({ error: 'item_name and category are required' });
    }
    const { data, error } = await supabaseAdmin
      .from('cafeteria_items')
      .insert({ item_name, category, emoji, description, tags, available: true })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { next(e); }
});

// PATCH /api/cafeteria/items/:id
// stock_today + stock_note: office_boy / facility_manager / leadership
// all other fields: leadership only
router.patch('/items/:id', requireRole('office_boy', 'facility_manager', 'leadership'), async (req, res, next) => {
  try {
    const isLeadership = ['leadership'].includes(req.user.role);
    // Non-leadership can only update stock fields
    const stockOnly = ['stock_today', 'stock_note'];
    const fullAllowed = ['item_name', 'category', 'emoji', 'description', 'available', 'tags', 'sort_order', 'stock_today', 'stock_note'];
    const allowed = isLeadership ? fullAllowed : stockOnly;
    const update = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    );
    const { data, error } = await supabaseAdmin
      .from('cafeteria_items')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) { next(e); }
});

export default router;
