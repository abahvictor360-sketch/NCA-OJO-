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
- **Works offline (local database)**: every device keeps a full copy of the data in IndexedDB. Screens read
  the local copy; changes are saved locally first and sent to Supabase when there is internet. The badge in the
  sidebar shows **Synced**, **Syncing** or **Offline · N to send** (tap it to sync now).
- **Install as an app (PWA)**: on phones and in Chrome/Edge, use "Install" / "Add to Home screen".
- **Windows desktop app (.exe)**: same app with its own local database, syncs with the same Supabase project.
- **Full report**: Reports > **Full Report** downloads Excel, Word or PDF with the church logo: summary,
  services, member attendance, follow-ups and finance for the chosen period (Excel also has a P/A register).
- **Finance**: record tithe, offering and other income (optionally linked to a member) and expenses.
  Totals, balance and category breakdown by period, edit/delete entries, CSV export. Amounts in Naira.

## Tech stack

| Part      | What                                                   |
| --------- | ------------------------------------------------------ |
| Frontend  | Next.js 15 (App Router, static export), React 19, Tailwind CSS v4 |
| Database  | Supabase (Postgres + Auth + Realtime), project `nca-ojo-attendance` |
| Hosting   | Vercel                                                  |
| Icons     | lucide-react                                            |
| CSV       | papaparse                                               |
| Local DB  | IndexedDB via `idb` (`src/lib/store.ts`)                |
| Reports   | exceljs, docx, jspdf + jspdf-autotable (`src/lib/report.ts`) |
| Desktop   | Electron + electron-builder (`electron/main.js`)        |

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
    (app)/finance/            Tithe, offering and expenses
    (app)/admins/             Super admin: manage admins
    globals.css               Brand colors and shared styles (card, btn-*, pill-*, input)
  components/Shell.tsx        Sidebar, mobile menu, admin context
  components/ui.tsx           Charts, modal, pills, avatar
  lib/data.ts                 Supabase queries
  lib/utils.ts                Types, dates, CSV export, WhatsApp number helper
  lib/store.ts                Local database + sync queue (offline support)
  lib/logic.ts                Close service, report numbers (runs on the device)
  lib/report.ts               Excel / Word / PDF report export
  components/Pwa.tsx          Service worker registration + install button
electron/main.js              Windows desktop app (serves ./out from app://nca)
public/sw.js                  Service worker (opens the app offline)
supabase/migrations/          Database schema (run in order on a new project)
public/logo.jpg               Church logo (also the app icon)
```

## Database

Tables (all have row level security; only admins can read or write):

| Table        | Purpose                                                        |
| ------------ | -------------------------------------------------------------- |
| `admins`     | Email allowlist with role (`super_admin` or `admin`). Only these emails can use the app. |
| `members`    | Church members (name, phone, email, address). `active = false` hides them from attendance. |
| `services`   | One row per Sunday. `closed = true` once attendance is final.  |
| `attendance` | One row per member present at a service.                       |
| `follow_ups` | One row per member absent at a closed service, with note/done. |
| `finance_entries` | Income (tithe, offering, ...) and expenses: date, category, amount, optional member. |

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

All admin features are under `src/app/(app)/`; the super admin page is `src/app/(app)/admins/page.tsx`.

### Starting from a brand new Supabase project

Only needed if the existing project is lost or you want a separate copy.

1. Create a Supabase project.
2. In the SQL editor, run each file in `supabase/migrations/` in number order.
3. Put the new URL and publishable key in `.env.local` (and in Vercel).
4. Add an admin (next section).

## Admins and the super admin

- **Super admin** (`abahvictor760@gmail.com`): everything, plus the **Admins** page to add or remove admins.
- **Admin**: attendance, members, follow-ups, reports.

Add an admin (super admin only):

1. **Admins > Add Admin**, enter their email and choose a role.
2. Send them the login link. On the login page they tap **First time? Create password**.
3. If Supabase email confirmation is on, they confirm from the email, then sign in.

Anyone can technically create a password on the login page, but they see nothing unless their email is on
the admin list. A super admin cannot remove themselves, so the app can't be locked out by accident.

Supabase settings to check once (Authentication > URL Configuration):

- **Site URL**: `https://nca-ojo-attendance.vercel.app`
- **Redirect URLs**: add `https://nca-ojo-attendance.vercel.app/**` and `http://localhost:3000/**`

Without these, the confirmation email link opens localhost instead of the live site.

If the admin list is ever empty, add a super admin in the Supabase SQL editor:

```sql
insert into public.admins (email, role) values ('someone@example.com', 'super_admin');
```

## CSV import format

First row is headers. Only `full_name` (or `name`) is required.

```csv
full_name,phone,email,address,gender,joined_on
Adaeze Okafor,08030000001,adaeze@example.com,"No 2 Olumide, Agric",female,2024-01-07
Bola Adeyemi,08030000002,,,male,
```

Names already in the list are skipped, so importing the same file twice is safe.

## How offline and sync work

- On sign in, the device downloads every table into its local database (IndexedDB).
- Every change (attendance tap, new member, follow-up note, finance entry) is written locally and put in a queue.
- The queue is sent to Supabase straight away when online, on reconnect, every minute, and when the badge is tapped.
  After sending, the device downloads fresh data, so changes from other devices appear (live updates also trigger this).
- Last write wins. Each Sunday's service has the same id on every device, so two phones that start attendance
  offline end up with one service.
- Signing out wipes the local copy (it warns first if changes have not been sent yet).
- First sign-in on a new device needs internet. After that the app opens and works offline.
- Managing admins needs internet.

## Windows desktop app

Build it (on Windows):

```bash
npm install
npm run dist:win
```

Output in `dist-desktop/`:

- `NCA-Ojo-Attendance-Setup-<version>.exe`: installer with Start menu and desktop shortcut.
- `NCA-Ojo-Attendance-Portable-<version>.exe`: single file, runs without installing.

`npm run desktop` builds and opens it without packaging. The app's local database lives in
`%APPDATA%
ca-ojo-attendance`. The .exe is not code-signed, so Windows SmartScreen may warn the first time:
click **More info > Run anyway**.

If `npm run dist:win` fails with "Cannot create symbolic link", extract the cached winCodeSign archive once:
`node_modules/7zip-bin/win/x64/7za.exe x <%LOCALAPPDATA%>/electron-builder/Cache/winCodeSign/<newest>.7z -o<same folder>/winCodeSign-2.6.0`.

## macOS desktop app

Mac builds need a Mac, so they are made on GitHub by the release workflow below.

The Mac app is not notarized by Apple. First open: right-click the app > **Open** > **Open**.
If macOS says it "is damaged", run once in Terminal: `xattr -cr "/Applications/NCA Ojo Attendance.app"`.

## Releasing a new version (Windows + Mac)

Releases are built on GitHub, so no Windows or Mac machine is needed:

1. Bump `"version"` in `package.json` (e.g. `1.2.0`) and write the release text in `.github/release-notes.md`.
2. Commit, then tag and push: `git tag v1.2.0 && git push origin main v1.2.0`
   (or **Actions > Release desktop apps > Run workflow** and enter the tag).
3. The workflow builds the Windows installer + portable .exe and the Intel + Apple Silicon Mac apps,
   attaches them to a draft release, and publishes it once all builds succeed.

The builds read `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the repo's Actions variables
(Settings > Secrets and variables > Actions > Variables).

## Install as a PWA

- Android (Chrome): open the site, menu > **Install app** (or the Install button in the corner).
- iPhone (Safari): Share > **Add to Home Screen**.
- Desktop Chrome/Edge: install icon in the address bar.

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
| `npm run lint`  | Lint                   |
| `npm run desktop` | Build and open the desktop app |
| `npm run dist:win` | Build the Windows .exe files into `dist-desktop/` |
