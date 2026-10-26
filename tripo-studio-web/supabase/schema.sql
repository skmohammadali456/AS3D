-- Run this script in Supabase SQL Editor before deploying.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  credits integer not null default 1 check (credits >= 0),
  plan text not null default 'free' check (plan in ('free','basic','pro','business')),
  free_generation_used boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null unique,
  mode text not null check (mode in ('text','image')),
  prompt text,
  source_image_url text,
  model_version text not null,
  status text not null default 'queued',
  progress integer not null default 0 check (progress between 0 and 100),
  model_url text,
  preview_url text,
  error_message text,
  credits_used integer not null default 1,
  credits_refunded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists generations_user_created_idx on public.generations(user_id, created_at desc);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists credit_transactions_user_idx on public.credit_transactions(user_id, created_at desc);

alter table public.profiles add column if not exists plan text not null default 'free' check (plan in ('free','basic','pro','business'));
alter table public.profiles add column if not exists free_generation_used boolean not null default false;
update public.profiles p set free_generation_used = true, credits = 0
where p.plan = 'free' and exists (select 1 from public.generations g where g.user_id = p.id);

alter table public.profiles enable row level security;
alter table public.generations enable row level security;
alter table public.credit_transactions enable row level security;
grant select on public.profiles to authenticated;
grant select on public.generations to authenticated;
grant select on public.credit_transactions to authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists "Users can update own display profile" on public.profiles;
create policy "Users can update own display profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "Users can read own generations" on public.generations;
create policy "Users can read own generations" on public.generations for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can read own credit transactions" on public.credit_transactions;
create policy "Users can read own credit transactions" on public.credit_transactions for select to authenticated using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, credits)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), 1)
  on conflict (id) do nothing;
  insert into public.credit_transactions (user_id, amount, reason)
  values (new.id, 1, 'free_generation_entitlement');
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.reserve_generation_credit(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare remaining integer; user_plan text; free_used boolean;
begin
  select plan, free_generation_used into user_plan, free_used
  from public.profiles where id = p_user_id for update;
  if user_plan is null then return jsonb_build_object('ok', false, 'reason', 'profile_missing'); end if;
  if user_plan = 'free' then
    if free_used then return jsonb_build_object('ok', false, 'reason', 'free_limit_reached', 'credits_remaining', 0); end if;
    update public.profiles set free_generation_used = true, credits = 0, updated_at = now()
    where id = p_user_id returning credits into remaining;
  else
    update public.profiles set credits = credits - 1, updated_at = now()
    where id = p_user_id and credits > 0 returning credits into remaining;
    if remaining is null then return jsonb_build_object('ok', false, 'reason', 'no_credits', 'credits_remaining', 0); end if;
  end if;
  insert into public.credit_transactions(user_id, amount, reason) values (p_user_id, -1, case when user_plan = 'free' then 'free_generation_reserved' else 'generation_reserved' end);
  return jsonb_build_object('ok', true, 'credits_remaining', coalesce(remaining, 0), 'plan', user_plan);
end;
$$;

create or replace function public.refund_generation_credit(p_user_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare remaining integer;
begin
  update public.profiles set credits = case when plan = 'free' then 1 else credits + 1 end, free_generation_used = case when plan = 'free' then false else free_generation_used end, updated_at = now()
  where id = p_user_id returning credits into remaining;
  if remaining is null then return jsonb_build_object('ok', false); end if;
  insert into public.credit_transactions(user_id, amount, reason) values (p_user_id, 1, left(p_reason, 100));
  return jsonb_build_object('ok', true, 'credits_remaining', remaining);
end;
$$;

revoke all on function public.reserve_generation_credit(uuid) from public, anon, authenticated;
revoke all on function public.refund_generation_credit(uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_generation_credit(uuid) to service_role;
grant execute on function public.refund_generation_credit(uuid, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('model-inputs', 'model-inputs', true, 10485760, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 10485760, allowed_mime_types = array['image/png','image/jpeg','image/webp'];
drop policy if exists "Users upload own model input images" on storage.objects;
create policy "Users upload own model input images" on storage.objects for insert to authenticated
with check (bucket_id = 'model-inputs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users update own model input images" on storage.objects;
create policy "Users update own model input images" on storage.objects for update to authenticated
using (bucket_id = 'model-inputs' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'model-inputs' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.refund_failed_task_credit(p_task_id text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare target_user uuid; did_refund boolean; remaining integer;
begin
  select user_id, credits_refunded into target_user, did_refund
  from public.generations where task_id = p_task_id for update;
  if target_user is null or did_refund then return jsonb_build_object('ok', false, 'already_refunded', coalesce(did_refund, false)); end if;
  update public.profiles set credits = case when plan = 'free' then 1 else credits + 1 end, free_generation_used = case when plan = 'free' then false else free_generation_used end, updated_at = now()
  where id = target_user returning credits into remaining;
  update public.generations set credits_refunded = true, updated_at = now() where task_id = p_task_id;
  insert into public.credit_transactions(user_id, amount, reason) values (target_user, 1, left(p_reason, 100));
  return jsonb_build_object('ok', true, 'credits_remaining', remaining);
end;
$$;
revoke all on function public.refund_failed_task_credit(text, text) from public, anon, authenticated;
grant execute on function public.refund_failed_task_credit(text, text) to service_role;
