# NCA Ojo Attendance

Sunday attendance and follow-up tracker for **New Creation Assembly Ojo (Overcomers Parish)**.

Admins (pastor and helpers) take attendance each Sunday. When the service is closed, the app lists everyone
who was absent so they can be called or messaged. Reports show how many services each member has missed and
how many Sundays in a row.

Members never log in. Only admin emails listed in the `admins` table can sign in and see data.

## Features

- **Admin login** (email + password, Supabase Auth). No public sign-up.
- **Members**: add, edit, deactivate, search, import from CSV, export to CSV.
- **Take Attendance**: pick a Sunday, tap names to mark present, live counter, search, A-Z jump,
  add a new member on the spot. Two admins can mark at the same time; the list updates live.
- **Close Service**: locks the service and creates a follow-up for every absent member.
  A closed service can be reopened to fix mistakes, then closed again.
- **Follow-ups**: absent members grouped by Sunday, with Call and WhatsApp buttons, a note field and a Done button.
- **Reports**: attended / missed / missed-in-a-row per member, per-service totals, date range, CSV export.
- **Overview**: dashboard cards for the last service, attendance rate, members, open follow-ups.

## Tech stack

| Part      | What                                                   |
| --------- | ------------------------------------------------------ |
| Frontend  | Next.js 15 (App Router), React 19, Tailwind CSS v4     |
| Database  | Supabase (Postgres + Auth + Realtime), project `nca-ojo-attendance` |
| Hosting   | Vercel                                                  |
| Icons     | lucide-react                                            |
| CSV       | papaparse                                               |

## Project layout

```
src/
  app/
    login/page.tsx            Admin sign in
    (app)/layout.tsx          Signed-in shell (sidebar, admin check)
    (app)/page.tsx            Overview dashboard
    (app)/attendance/         Take attendance + close service
    (app)/follow-ups/         Follow-up list
    (app)/members/            Member list, add/edit, CSV import
    (app)/reports/            Missed counts and service history
    globals.css               Brand colors and shared styles (card, btn-*, pill-*, input)
  components/Shell.tsx        Sidebar, mobile menu, admin context
  components/ui.tsx           Charts, modal, pills, avatar
  lib/data.ts                 Supabase queries
  lib/utils.ts                Types, dates, CSV export, WhatsApp number helper
  middleware.ts               Redirects signed-out visitors to /login
supabase/migrations/          Database schema (run in order on a new project)
public/logo.jpg               Church logo (also the app icon)
```

## Database

Tables (all have row level security; only admins can read or write):

| Table        | Purpose                                                        |
| ------------ | -------------------------------------------------------------- |
| `admins`     | Email allowlist. Only these emails can use the app.            |
| `members`    | Church members (name, phone, address). `active = false` hides them from attendance. |
| `services`   | One row per Sunday. `closed = true` once attendance is final.  |
| `attendance` | One row per member present at a service.                       |
| `follow_ups` | One row per member absent at a closed service, with note/done. |

Functions:

- `close_service(service_id)` creates follow-ups for absent members and locks the service.
- `reopen_service(service_id)` unlocks it for corrections.
- `member_report(from, to)` returns attended, missed and current missed-in-a-row per member.

Rules worth knowing:

- Only **closed** services count toward misses.
- A member only counts for services on or after their `joined_on` date.
  CSV imports without a `joined_on` column get `2000-01-01`, so they count from the first service.
- "Missed in a row" counts closed Sundays since the member last attended.

## Set up on a new computer

You need Node.js 20 or newer and Git.

```bash
git clone https://github.com/abahvictor360-sketch/NCA-OJO-.git nca-ojo-attendance
cd nca-ojo-attendance
npm install
cp .env.example .env.local
```

Fill `.env.local` with the Supabase URL and publishable key
(Supabase dashboard > Project `nca-ojo-attendance` > Project Settings > API):

```
NEXT_PUBLIC_SUPABASE_URL=https://rimbdipqlsfkhidcfvbg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

Then run:

```bash
npm run dev
```

Open http://localhost:3000 and sign in with an admin account.

### Starting from a brand new Supabase project

Only needed if the existing project is lost or you want a separate copy.

1. Create a Supabase project.
2. In the SQL editor, run each file in `supabase/migrations/` in number order.
3. Put the new URL and publishable key in `.env.local` (and in Vercel).
4. Add an admin (next section).

## Add or remove an admin

1. Supabase dashboard > Authentication > Users > **Add user** > enter email and password, tick "Auto confirm".
2. SQL editor:

   ```sql
   insert into public.admins (email, full_name) values ('pastor@example.com', 'Pastor Name');
   ```

To remove someone, delete their row from `admins` (and the user under Authentication if you like).

Turn off public sign-ups: Authentication > Sign In / Providers > disable "Allow new users to sign up".
Even if someone signs up, they see nothing unless their email is in `admins`.

## CSV import format

First row is headers. Only `full_name` (or `name`) is required.

```csv
full_name,phone,address,gender,joined_on
Adaeze Okafor,08030000001,"No 2 Olumide, Agric",female,2024-01-07
Bola Adeyemi,08030000002,,male,
```

Names already in the list are skipped, so importing the same file twice is safe.

## Deploy

Hosted on Vercel and connected to this GitHub repo. Every push to `main` deploys.

Vercel environment variables (Project > Settings > Environment Variables):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Sunday workflow

1. Open **Take Attendance**. It opens on the latest Sunday. Tap **Start attendance**.
2. Tap each member who is present. Use search or the letters to find names fast.
3. New face? Tap **New member** to add them and mark present in one step.
4. After service, tap **Close Service**. Follow-ups are created for everyone not marked.
5. During the week, open **Follow-ups**, call or WhatsApp each person, add a note, tap **Done**.
6. Check **Reports** for who keeps missing.

## Scripts

| Command         | What it does           |
| --------------- | ---------------------- |
| `npm run dev`   | Local dev server       |
| `npm run build` | Production build       |
| `npm run start` | Serve production build |
| `npm run lint`  | Lint                   |
