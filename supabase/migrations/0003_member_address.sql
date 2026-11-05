-- Members' home address (from the paper bio-data list)
alter table public.members add column if not exists address text;
