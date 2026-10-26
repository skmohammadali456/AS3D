import { createClient } from '@supabase/supabase-js';

export function json(res, status, body) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

export function adminClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase server environment is not configured.');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function requireUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return { error: 'Please sign in to continue.', status: 401 };
  const supabase = adminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { error: 'Your session is invalid or expired. Please sign in again.', status: 401 };
  return { user: data.user, supabase };
}

export async function tripoFetch(path, options = {}) {
  if (!process.env.TRIPO_API_KEY) throw new Error('Tripo API is not configured. Add TRIPO_API_KEY in Vercel environment variables.');
  const base = (process.env.TRIPO_BASE_URL || 'https://openapi.tripo3d.ai/v3').replace(/\/$/, '');
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${process.env.TRIPO_API_KEY}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || (typeof payload.code === 'number' && payload.code !== 0)) {
    throw new Error(payload.message || payload.error || `Tripo API request failed (${response.status})`);
  }
  return payload;
}
