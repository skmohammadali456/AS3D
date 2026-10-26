# AS3D

AS3D is an AI-powered 3D model creation studio built with React, Vercel serverless API routes, Supabase, and Tripo AI.

## Project files

The full source code is being published to this repository. See `tripo-studio-web/README.md` for setup, environment variables, Tripo API integration, Supabase schema, UPI-only checkout planning, and model export notes.

## Architecture

- Frontend: React + Vite
- Hosting and backend routes: Vercel
- Authentication and database: Supabase
- Model generation: Tripo API
- Payments for India: UPI only (production payment verification must be configured before collecting payments)

## Safety

Never commit API keys, Supabase service-role keys, or payment secrets. Configure them as Vercel environment variables.
