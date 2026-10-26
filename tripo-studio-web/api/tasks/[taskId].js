import { json, requireUser, tripoFetch } from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  let auth;
  try { auth = await requireUser(req); } catch (e) { return json(res, 500, { error: e.message }); }
  if (auth.error) return json(res, auth.status, { error: auth.error });
  const { user, supabase } = auth;
  const taskId = req.query.taskId;
  if (typeof taskId !== 'string' || !/^[a-zA-Z0-9_-]{3,120}$/.test(taskId)) return json(res, 400, { error: 'Invalid task ID.' });
  const { data: row, error: rowError } = await supabase.from('generations').select('id,status,credits_refunded').eq('user_id', user.id).eq('task_id', taskId).maybeSingle();
  if (rowError) return json(res, 500, { error: 'Could not load generation history.' });
  if (!row) return json(res, 404, { error: 'Generation not found for this account.' });
  try {
    const result = await tripoFetch(`/tasks/${encodeURIComponent(taskId)}`);
    const task = result?.data || {};
    const status = task.status || 'running';
    const output = task.output ? { modelUrl: task.output.model_url || null, previewUrl: task.output.rendered_image_url || null } : null;
    const patch = { status, progress: Number.isFinite(task.progress) ? task.progress : (status === 'success' ? 100 : 0), error_message: task.message || null, updated_at: new Date().toISOString() };
    if (status === 'success' && output) { patch.model_url = output.modelUrl; patch.preview_url = output.previewUrl; patch.completed_at = new Date().toISOString(); }
    if (['failed', 'cancelled', 'banned'].includes(status) && !row.credits_refunded) {
      await supabase.rpc('refund_failed_task_credit', { p_task_id: taskId, p_reason: `task_${status}` });
      patch.credits_refunded = true;
    }
    await supabase.from('generations').update(patch).eq('id', row.id).eq('user_id', user.id);
    const { data: profile } = await supabase.from('profiles').select('credits').eq('id', user.id).maybeSingle();
    return json(res, 200, { taskId, status, progress: patch.progress, output, error: task.message || null, creditsRemaining: profile?.credits ?? null });
  } catch (e) { return json(res, 502, { error: e.message || 'Unable to check task.' }); }
}
