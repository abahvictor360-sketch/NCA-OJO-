-- Live updates for every table so other devices sync quickly
alter publication supabase_realtime add table public.members, public.follow_ups, public.finance_entries, public.admins;
