import { json, requireUser, tripoFetch } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  let auth;
  try { auth = await requireUser(req); } catch (e) { return json(res, 500, { error: e.message }); }
  if (auth.error) return json(res, auth.status, { error: auth.error });
  const { user, supabase } = auth;
  const { mode = 'text', prompt, imageUrl, model = 'v3.1-20260211' } = req.body || {};
  if (mode === 'text' && (typeof prompt !== 'string' || prompt.trim().length < 3 || prompt.trim().length > 1500)) return json(res, 400, { error: 'Enter a prompt between 3 and 1,500 characters.' });
  if (mode === 'image' && (typeof imageUrl !== 'string' || !/^https:\/\//i.test(imageUrl))) return json(res, 400, { error: 'Upload an image or provide a public HTTPS image URL.' });
  if (!['text', 'image'].includes(mode)) return json(res, 400, { error: 'Unsupported generation mode.' });
  const allowedModels = ['v3.1-20260211', 'P2-20260801', 'v3.0-20260909'];
  if (!allowedModels.includes(model)) return json(res, 400, { error: 'Unsupported model version.' });

  const { data: reserve, error: reserveError } = await supabase.rpc('reserve_generation_credit', { p_user_id: user.id });
  if (reserveError) return json(res, 500, { error: 'Could not reserve a generation credit. Run supabase/schema.sql and try again.' });
  if (!reserve?.ok) {
    if (reserve?.reason === 'free_limit_reached') return json(res, 402, { error: 'Your one free 3D generation has already been used. Upgrade to a paid plan to generate more models and unlock downloads.', code: 'FREE_LIMIT_REACHED' });
    return json(res, 402, { error: 'You are out of generation credits. Paid credit packs are not enabled yet.' });
  }

  try {
    const path = mode === 'text' ? '/generation/text-to-model' : '/generation/image-to-model';
    const body = mode === 'text' ? { prompt: prompt.trim(), model } : { file: { type: 'image', url: imageUrl.trim() }, model };
    const result = await tripoFetch(path, { method: 'POST', body: JSON.stringify(body) });
    const taskId = result?.data?.task_id;
    if (!taskId) throw new Error('Tripo did not return a task ID.');
    const { error: insertError } = await supabase.from('generations').insert({ user_id: user.id, task_id: taskId, mode, prompt: mode === 'text' ? prompt.trim() : null, source_image_url: mode === 'image' ? imageUrl.trim() : null, model_version: model, status: 'queued', credits_used: 1 });
    if (insertError) throw new Error('The task started but the history record could not be saved. Contact support before retrying.');
    return json(res, 200, { taskId, status: 'queued', creditsUsed: 1, creditsRemaining: reserve.credits_remaining, plan: reserve.plan, freeGenerationUsed: reserve.plan === 'free' });
  } catch (e) {
    await supabase.rpc('refund_generation_credit', { p_user_id: user.id, p_reason: 'generation_start_failed' });
    return json(res, 502, { error: e.message || 'Unable to start generation.' });
  }
}
