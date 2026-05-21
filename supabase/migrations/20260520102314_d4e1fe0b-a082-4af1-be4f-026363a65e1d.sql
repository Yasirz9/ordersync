
-- Roles enum
create type public.app_role as enum ('admin', 'user');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles select own" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "profiles update own" on public.profiles
  for update to authenticated using (auth.uid() = id);
create policy "profiles insert own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

-- User roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create policy "user_roles select own" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

-- Auto profile + default user role on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  insert into public.user_roles (user_id, role)
  values (new.id, 'user');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Search requests (temporary; relay job queue)
create table public.search_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  order_number text not null,
  status text not null default 'pending', -- pending | processing | completed | failed
  result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.search_requests enable row level security;

create index search_requests_status_idx on public.search_requests (status, created_at);
create index search_requests_requester_idx on public.search_requests (requester_id, created_at desc);

-- Requester: create + view own
create policy "search_requests insert own" on public.search_requests
  for insert to authenticated with check (auth.uid() = requester_id);
create policy "search_requests select own" on public.search_requests
  for select to authenticated using (auth.uid() = requester_id);

-- Admin: view all + update all
create policy "search_requests admin select all" on public.search_requests
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "search_requests admin update all" on public.search_requests
  for update to authenticated using (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger search_requests_touch
  before update on public.search_requests
  for each row execute function public.touch_updated_at();

-- Realtime: full row payloads
alter table public.search_requests replica identity full;
alter publication supabase_realtime add table public.search_requests;

-- Cleanup: delete rows older than 1 hour
create or replace function public.cleanup_old_search_requests()
returns void language sql as $$
  delete from public.search_requests where created_at < now() - interval '1 hour';
$$;
