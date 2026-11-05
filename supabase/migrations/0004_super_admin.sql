-- Roles: a super admin can add and remove other admins. Admins do everything else.
alter table public.admins
  add column if not exists role text not null default 'admin' check (role in ('super_admin', 'admin'));

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role = 'super_admin'
  );
$$;

revoke execute on function public.is_super_admin() from anon, public;
grant execute on function public.is_super_admin() to authenticated;

-- Emails are stored lower case so matching is simple
create or replace function public.admins_lower_email()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists admins_lower_email on public.admins;
create trigger admins_lower_email before insert or update on public.admins
  for each row execute function public.admins_lower_email();

create policy admins_insert on public.admins for insert to authenticated
  with check (public.is_super_admin());
create policy admins_update on public.admins for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
-- A super admin cannot remove their own row (avoids locking everyone out)
create policy admins_delete on public.admins for delete to authenticated
  using (public.is_super_admin() and lower(email) <> lower(coalesce(auth.jwt() ->> 'email', '')));

insert into public.admins (email, full_name, role)
values ('abahvictor760@gmail.com', null, 'super_admin')
on conflict (email) do update set role = 'super_admin';
