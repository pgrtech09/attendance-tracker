# Smart College Attendance Tracker

A installable, offline-capable Progressive Web App for tracking class-wise
college attendance — built for II-MB, Semester 3, but fully editable for any
branch/section through the Register screen and Settings.

No build step, no framework, no bundler: plain HTML, CSS and ES modules,
backed by Supabase (Postgres + Auth + Storage), deployable straight to
GitHub Pages.

---

## 1. Features

- Roll-number + DOB login (password = DOB as `DDMMYYYY`, generated automatically)
- Today's timetable auto-detected from the current weekday
- One-tap "stamp" attendance marking: Present, Absent, Holiday, Exam Day,
  Non-Working Day, Medical Leave, OD
- Monthly calendar with a full attendance editor for any past or future date
- Per-subject and overall attendance percentage, with live progress bars
- Target-attendance calculator (75/80/85/90/95%): classes required, classes
  you can safely skip, and progress toward the goal
- Semester settings: start/end dates, working days, holidays, mid/external exam dates
- Dashboard with pie / bar / line charts (Chart.js)
- Editable timetable (add/edit/delete periods per weekday)
- Profile with photo upload (Supabase Storage)
- Dark mode / light mode
- Backup (JSON) / Restore, Export to PDF, Export to Excel
- Installable PWA with offline caching, an offline write queue, and
  Background Sync to replay attendance changes once you're back online
- Local reminder notifications (morning / evening)

---

## 2. Project structure

```
/
├── index.html          entry point (redirects to dashboard or login)
├── login.html
├── register.html
├── dashboard.html
├── attendance.html
├── calendar.html
├── profile.html
├── settings.html
├── reports.html
├── manifest.json
├── service-worker.js
├── supabase.sql          <- run this in Supabase's SQL editor
├── assets/
│   ├── css/style.css
│   ├── js/
│   │   ├── supabase-client.js   <- put your Supabase URL/key here
│   │   ├── reference-data.js    <- subjects + default timetable
│   │   ├── auth.js
│   │   ├── app.js               <- shared shell (theme, nav, PWA, offline queue)
│   │   ├── attendance-calc.js   <- all percentage/target math
│   │   ├── dashboard.js
│   │   ├── attendance.js
│   │   ├── calendar.js
│   │   ├── profile.js
│   │   ├── settings.js
│   │   └── reports.js
│   └── icons/             app icons (192, 512, maskable, apple-touch)
└── README.md
```

---

## 3. Supabase setup

1. Create a free project at [supabase.com](https://supabase.com).
2. Go to **Project Settings → API** and copy the **Project URL** and
   **anon public key**.
3. Open **SQL Editor → New query**, paste the entire contents of
   `supabase.sql`, and run it. This creates every table (`profiles`,
   `subjects`, `timetable`, `attendance`, `semester_settings`, `holidays`,
   `notifications`, `user_settings`), all indexes, foreign keys, Row Level
   Security policies, the `avatars` storage bucket, and seeds the subject list.
4. Go to **Authentication → Providers → Email** and **turn OFF "Confirm
   email"**. This app logs students in with a synthetic email built from
   their roll number (e.g. `23a81a0512@students.attendance.local`) — there's
   no inbox to click a confirmation link from, so email confirmation must be
   disabled for sign-up to work immediately.
5. Still under **Authentication → Settings**, you can optionally disable
   "Enable email provider sign-ups" restrictions if your project has any
   custom SMTP restrictions — the default configuration works out of the box.

### Environment variables

This is a static site with no server, so there's no `.env` file. Instead,
open `assets/js/supabase-client.js` and replace the two placeholders:

```js
export const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR-SUPABASE-ANON-KEY';
```

The anon key is safe to expose publicly — it has no power on its own.
Every table is protected by Row Level Security, so a student can only ever
read or write their own rows (`auth.uid() = user_id`).

---

## 4. GitHub setup & deployment (GitHub Pages)

1. Create a new GitHub repository (e.g. `attendance-tracker`).
2. Push this entire folder to the repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Smart College Attendance Tracker"
   git branch -M main
   git remote add origin https://github.com/<your-username>/attendance-tracker.git
   git push -u origin main
   ```
3. In the repository, go to **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to `Deploy from a branch`,
   branch `main`, folder `/ (root)`. Save.
5. GitHub will publish the site at
   `https://<your-username>.github.io/attendance-tracker/` within a minute or two.
6. Because GitHub Pages serves over HTTPS with a service worker, the PWA
   install prompt and offline caching will work automatically once deployed
   (they do **not** work over plain `http://`, only `https://` or `localhost`).

### Local testing before you deploy

You cannot open `index.html` directly with `file://` because ES modules and
service workers require an HTTP server. From the project folder run:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

---

## 5. Database import (if you ever need to reset)

`supabase.sql` is idempotent — every `create table` uses `if not exists`,
every policy is dropped and recreated, and the subject seed uses
`on conflict do nothing`. You can safely re-run the entire file at any time,
including on a brand-new project, to get back to a clean schema.

---

## 6. How to update the app

1. Make your changes locally and test with the local server above.
2. Bump `CACHE_VERSION` at the top of `service-worker.js` (e.g. `v1` → `v2`).
   This is important: without it, users' browsers will keep serving the old
   cached files even after you deploy new ones.
3. Commit and push to `main` — GitHub Pages redeploys automatically.

---

## 7. How to back up your data

Every student can back up their own data without touching the database
directly:

- **Settings → Backup & Export → Backup (JSON)** downloads a JSON file with
  your profile, attendance, timetable, and holidays.
- **Settings → Backup & Export → Restore Backup** re-uploads that JSON file
  and upserts it back into Supabase (useful after clearing your browser or
  moving to a new device before your account syncs).
- **Export PDF** / **Export Excel** produce a shareable report, not a full
  restorable backup.

For a full database-level backup, use Supabase's own **Database → Backups**
panel (Pro plans get daily automatic backups; free plans can trigger a
manual export from **Database → Backups → Point in time** or run
`pg_dump` against the connection string in **Project Settings → Database**).

---

## 8. Notes on notifications

Reminder notifications are scheduled entirely on-device using the Notification
API and a `setInterval` clock inside the service worker. This is reliable
whenever the app (or its service worker) is active in the browser, but like
any web push implementation without a push server, delivery isn't guaranteed
if the browser has fully evicted the service worker (e.g. after very long
periods of inactivity or a device restart). For guaranteed server-sent push,
you would add the Web Push API with VAPID keys and a small serverless
function — this is intentionally left out to keep the whole app static and
Supabase-only.

---

## 9. About the default timetable

No timetable image was available when this project was generated, so the
default schedule in `assets/js/reference-data.js` was built from the subject
list in the brief (COA, SE, DBMS, OOPJ, MSF, CM LAB, DBMS LAB, SE LAB,
OOPJ LAB), matching the two example days given (Monday and Tuesday) exactly.
Every period is fully editable from **Settings → Timetable** — add, edit, or
delete periods per weekday, and the change applies immediately.

---

## 10. Tech stack recap

| Layer          | Choice                                   |
|----------------|-------------------------------------------|
| Frontend       | HTML5, CSS3, vanilla JS (ES modules)      |
| Backend        | Supabase (Postgres, Auth, Storage)        |
| Charts         | Chart.js                                  |
| PDF export     | jsPDF                                     |
| Excel export   | SheetJS (xlsx)                            |
| Icons          | Material Icons Round                      |
| Fonts          | Fraunces, Inter, JetBrains Mono (Google Fonts) |
| PWA            | Web App Manifest, Service Worker, Background Sync |
| Hosting        | GitHub Pages                              |
