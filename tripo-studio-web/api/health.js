import { json } from './_lib.js';
export default function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  return json(res, 200, { ok: true, tripoConfigured: Boolean(process.env.TRIPO_API_KEY), supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) });
}
