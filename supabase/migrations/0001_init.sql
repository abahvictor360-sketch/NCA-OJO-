-- NCA Ojo Attendance: initial schema
-- Members never log in. Only emails listed in public.admins can read or write data.

create extension if not exists pgcrypto;

-- Admin allowlist ---------------------------------------------------------
create table public.admins (
  email      text primary key,
  full_name  text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Members -----------------------------------------------------------------
create table public.members (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  phone      text,
  gender     text check (gender in ('male', 'female')),
  notes      text,
  active     boolean not null default true,
  joined_on  date not null default current_date,
  created_at timestamptz not null default now()
);
create index members_name_idx on public.members (lower(full_name));

-- Services (one per Sunday) -----------------------------------------------
create table public.services (
  id           uuid primary key default gen_random_uuid(),
  service_date date not null unique,
  closed       boolean not null default false,
  closed_at    timestamptz,
  created_at   timestamptz not null default now()
);

-- Attendance: a row means the member was present --------------------------
create table public.attendance (
  service_id uuid not null references public.services (id) on delete cascade,
  member_id  uuid not null references public.members (id) on delete cascade,
  marked_by  text default (auth.jwt() ->> 'email'),
  marked_at  timestamptz not null default now(),
  primary key (service_id, member_id)
);
create index attendance_member_idx on public.attendance (member_id);

-- Follow-ups: one per absent member per closed service --------------------
create table public.follow_ups (
  id         uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  member_id  uuid not null references public.members (id) on delete cascade,
  done       boolean not null default false,
  note       text,
  done_by    text,
  done_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (service_id, member_id)
);
create index follow_ups_open_idx on public.follow_ups (done) where done = false;

-- Row level security: admins only -----------------------------------------
alter table public.admins     enable row level security;
alter table public.members    enable row level security;
alter table public.services   enable row level security;
alter table public.attendance enable row level security;
alter table public.follow_ups enable row level security;

create policy admins_read on public.admins for select to authenticated using (public.is_admin());
create policy members_all on public.members for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy services_all on public.services for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy attendance_all on public.attendance for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy follow_ups_all on public.follow_ups for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Close a service: lock it and create follow-ups for every absent member ---
create or replace function public.close_service(p_service_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_date  date;
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;

  select service_date into v_date from public.services where id = p_service_id;
  if v_date is null then
    raise exception 'service not found';
  end if;

  insert into public.follow_ups (service_id, member_id)
  select p_service_id, m.id
  from public.members m
  where m.active
    and m.joined_on <= v_date
    and not exists (
      select 1 from public.attendance a
      where a.service_id = p_service_id and a.member_id = m.id
    )
  on conflict (service_id, member_id) do nothing;

  -- members marked present after a reopen should not keep a follow-up
  delete from public.follow_ups f
  where f.service_id = p_service_id
    and f.done = false
    and exists (
      select 1 from public.attendance a
      where a.service_id = p_service_id and a.member_id = f.member_id
    );

  update public.services set closed = true, closed_at = now() where id = p_service_id;

  select count(*) into v_count from public.follow_ups where service_id = p_service_id;
  return v_count;
end;
$$;

-- Reopen a service so attendance can be corrected --------------------------
create or replace function public.reopen_service(p_service_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  update public.services set closed = false, closed_at = null where id = p_service_id;
end;
$$;

-- Report: misses per member across closed services -------------------------
create or replace function public.member_report(p_from date default null, p_to date default null)
returns table (
  member_id       uuid,
  full_name       text,
  phone           text,
  active          boolean,
  services_count  integer,
  attended        integer,
  missed          integer,
  current_streak  integer,
  last_attended   date
)
language sql
stable
security invoker
set search_path = public
as $$
  with svc as (
    select s.id, s.service_date
    from public.services s
    where s.closed
      and (p_from is null or s.service_date >= p_from)
      and (p_to   is null or s.service_date <= p_to)
  ),
  per_member as (
    select
      m.id, m.full_name, m.phone, m.active, m.joined_on,
      count(svc.id) filter (where svc.service_date >= m.joined_on) as services_count,
      count(a.member_id) as attended
    from public.members m
    left join svc on true
    left join public.attendance a on a.service_id = svc.id and a.member_id = m.id
    group by m.id
  )
  select
    p.id,
    p.full_name,
    p.phone,
    p.active,
    p.services_count::int,
    p.attended::int,
    greatest(p.services_count - p.attended, 0)::int as missed,
    (
      select count(*)::int
      from public.services s2
      where s2.closed
        and s2.service_date >= p.joined_on
        and s2.service_date > coalesce(
          (select max(s3.service_date)
             from public.attendance a3
             join public.services s3 on s3.id = a3.service_id
            where a3.member_id = p.id),
          date '1900-01-01')
    ) as current_streak,
    (select max(s4.service_date)
       from public.attendance a4
       join public.services s4 on s4.id = a4.service_id
      where a4.member_id = p.id) as last_attended
  from per_member p;
$$;

grant execute on function public.close_service(uuid) to authenticated;
grant execute on function public.reopen_service(uuid) to authenticated;
grant execute on function public.member_report(date, date) to authenticated;
revoke execute on function public.close_service(uuid) from anon, public;
revoke execute on function public.reopen_service(uuid) from anon, public;
revoke execute on function public.member_report(date, date) from anon, public;
revoke execute on function public.is_admin() from anon, public;
grant execute on function public.is_admin() to authenticated;
