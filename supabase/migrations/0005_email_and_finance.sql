-- Member email
alter table public.members add column if not exists email text;

-- Finance: tithe, offering and other income, plus expenses. Amounts in Naira.
create table if not exists public.finance_entries (
  id          uuid primary key default gen_random_uuid(),
  entry_date  date not null default current_date,
  kind        text not null check (kind in ('income', 'expense')),
  category    text not null,
  amount      numeric(14, 2) not null check (amount > 0),
  member_id   uuid references public.members (id) on delete set null,
  description text,
  recorded_by text default (auth.jwt() ->> 'email'),
  created_at  timestamptz not null default now()
);
create index if not exists finance_entries_date_idx on public.finance_entries (entry_date desc);

alter table public.finance_entries enable row level security;
create policy finance_all on public.finance_entries for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
