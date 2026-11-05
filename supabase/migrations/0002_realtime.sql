-- Live updates so two admins marking attendance at once see the same list
alter publication supabase_realtime add table public.attendance;
alter publication supabase_realtime add table public.services;
