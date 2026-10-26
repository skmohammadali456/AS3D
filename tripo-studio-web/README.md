# AS3D, AI 3D Studio

AS3D is a responsive AI 3D model creation interface using React + Vite, Vercel serverless functions, Supabase Auth/Postgres/Storage, and the Tripo API.

## Features in this codebase

- Responsive dark charcoal and lime-green studio UI for desktop, tablet, and mobile.
- Supabase email/password sign-up and sign-in.
- Text-to-3D and image URL-to-3D task creation through server-side API routes.
- Generation status polling and per-user generation history.
- Free plan allows one generation per account and hides model download/export access.
- Paid-plan export interface for GLB, STL, OBJ, and USDZ. GLB downloads the source file; other formats are converted in the browser with Three.js exporters.
- UPI-only billing information UI for India. Live payment processing and automatic paid-plan activation are **not yet connected**.
- Server-side Tripo API key and Supabase service-role key usage.

## Local development

Use Node.js 20 or newer.

```bash
cd tripo-studio-web
npm install
cp .env.example .env.local
npm run dev
```

Set these in `.env.local` for local development:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
TRIPO_API_KEY=YOUR_TRIPO_API_KEY
TRIPO_BASE_URL=https://openapi.tripo3d.ai/v3
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `TRIPO_API_KEY` in variables beginning with `VITE_`, and never commit `.env` files.

## Supabase setup

1. Create a Supabase project.
2. Open SQL Editor and run `supabase/schema.sql`.
3. Enable email/password authentication.
4. Configure redirect URLs for local development and your deployed Vercel domain.
5. Set the environment variables in Vercel Project Settings.

## Deploy to Vercel

Import the GitHub repository `skmohammadali456/AS3D`. Set the Vercel **Root Directory** to `tripo-studio-web`, framework preset to Vite, and add the environment variables above. Deploy, then check `/api/health`.

## Important limitations before production

- The project has not been validated by a full live build or integration test in this environment. Run `npm install` and `npm run build` before deployment.
- Tripo model output URLs may block browser CORS requests. Browser-based STL, OBJ, and USDZ conversion will fail on such URLs; use a tightly allowlisted server-side proxy that restricts hostnames, file sizes, and timeouts. Do not build an unrestricted URL proxy because that can create an SSRF vulnerability.
- A free user is limited by the Supabase reservation function to one generation. Generation failures should be refunded by the task refund function.
- The current payment page is a design/UI only. UPI gateway creation, signed webhook verification, idempotent payment records, tax/receipt handling, paid-plan assignment, and credit-pack fulfillment must be implemented before charging customers.
- Store generated model assets in durable storage if customers need long-term access. Tripo output URLs may be temporary.
- Obtain written authorization from Tripo if their API terms require approval for reselling or exposing their generation service publicly.
