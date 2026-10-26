# AS3D

AS3D is an AI-powered 3D model creation studio built with React, Vercel serverless API routes, Supabase, and Tripo AI.

## Source code

The app, serverless API routes, Supabase schema, and setup instructions are available in [`tripo-studio-web/`](./tripo-studio-web/README.md).

## Architecture

- Frontend: React + Vite, responsive dark charcoal and lime-green UI
- Hosting and backend routes: Vercel
- Authentication, Postgres database, and storage policies: Supabase
- Model generation: Tripo API
- Free plan: one generation per account, preview only, no model downloads
- Paid export options: GLB, STL, OBJ, and USDZ conversion interface
- Payments in India: UPI only. The UI is present, but gateway processing and signed payment verification are not connected yet.

## Before deployment

Read the [setup and production readiness guide](./tripo-studio-web/README.md). Add secrets only as Vercel environment variables. Do not commit Tripo API keys, Supabase service-role keys, or payment secrets. Run `npm install` and `npm run build` from the app directory before deploying.
