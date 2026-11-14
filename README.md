# TechNeeds 2.0: AI-Powered Multi-Role Mentorship Platform

Next.js 15 (frontend) + Express 5 / MongoDB (backend) + JWT roles + Gemini for the AI Profile.

## Run locally
```bash
# 1. backend
cd backend
cp .env.example .env        # fill MONGO_URI, JWT_SECRET (32+ chars), ADMIN_PASSWORD (12+ chars), LLM_API_KEY (optional)
npm install
npm run seed                # wipes the DB and loads demo data (prints credentials + the admin 2FA QR code)
npm run dev                 # http://localhost:5000
npm test                    # points / ranking / badge / AI-fallback / TOTP / admin-security tests

# 2. frontend (new terminal)
cd frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:5000" > .env.local
npm install
npm run dev                 # http://localhost:3000
```
`npm run seed` deletes every collection first. Never run it against real data.

## Frontend design
Shared design tokens live in `frontend/src/app/globals.css`; reusable component styles (`tn-*` classes) in `frontend/src/components/ui/tn.css`. The landing page is `components/Home/` (hero, roadmap, roles, features, cohorts, team, testimonials). Charts are pure CSS, so there is no chart library to install.

## Demo logins
| Role | Login | Password |
|---|---|---|
| Admin | `ADMIN_EMAIL` from `.env` (default admin@techneeds.in), at **/admin-access** | `ADMIN_PASSWORD` from `.env`, or the random one `npm run seed` prints once. Plus a 6-digit authenticator code unless `ADMIN_2FA_REQUIRED=false` |
| Mentor | priya.sharma@techneeds.in | Mentor@001 |
| Mentor | ankit.verma@techneeds.in | Mentor@002 |
| Mentee | TN26-0001 (Aarav, Web Dev) | Pass@1234 |
| Mentee | TN26-0002 (Diya, Web Dev) | Pass@1234 |
| Mentee | TN26-0003 ... TN26-0010 | Pass@1234 (forced password change on first login) |

## Demo script (3 minutes)
1. Home: zigzag roadmap, team section, **Get Started** -> Cohorts -> **Login to join**.
2. Request mentor access on the login page, then open **/admin-access** and sign in as **Admin**: approve the request (temp password shown once), create a cohort, assign a mentor.
3. Log in as **Mentor** (Priya): add mentees (credentials table + CSV), add a video, create a quiz with a deadline.
4. Log in as **Mentee** (TN26-0001): dashboard, cohort page (syllabus, video, quiz), take the quiz, see points.
5. Mentee **Roadmap** (`/roadmap`): zigzag path of videos and quizzes with Done / Next / Opens soon / Missed states, progress ring and milestone badges.
6. **Leaderboard** updates; open **My AI Profile** (avatar, badges, chart, summary, 3 recommendations).
7. Back as Mentor: open a mentee's AI Profile (read-only).

## Points (rule-based, in `backend/utils/points.js`)
Quiz `round(score/max*100)` + 10 on-time bonus per quiz, +5 per completed video, up to 100 per verified project.
Ties: earliest last activity wins. AI never decides ranks, points or badges. It only writes the summary and suggestions, and falls back to a template if the key is missing or the call fails.

## API summary
- `POST /api/auth/login`, `POST /api/auth/change-password`, `POST /api/mentor-requests`
- Public: `GET /api/public/cohorts`, `GET /api/public/leaderboard/:cohortId`
- Admin (`/api/admin`): stats, mentor-requests (+approve/reject), cohorts CRUD, assign/remove mentor, analytics, mentors
- Mentor (`/api/mentor`): me, cohorts, cohorts/:id/overview, mentees/bulk, videos, quizzes, mentees/:id/profile
- Roadmap page (`/roadmap`) is frontend-only: it reads `GET /api/m/cohorts/:id` and computes states and milestones in `frontend/src/lib/roadmap.js` (rule-based, no AI).
- Mentee (`/api/m`): dashboard, cohorts/:id, resources/:id/complete, resources/:id/quiz (+/submit), profile (+/refresh), avatar
- Chat (`/api/chat`, mentors and mentees only): contacts, conversations, unread, messages (GET with `room=community` or `peer=<role>:<id>`, `after`/`before` cursors; POST to send)
- Admin sign-in (`/api/auth/admin/login` then `/api/auth/admin/verify-2fa`), `POST /api/admin/logout-all`, `GET /api/admin/audit-log`
All non-public routes are role-checked on the server (`middleware/requireRole.js`).

## Chat (mentees and mentors)
Open **Chat** in the navbar (or the Chat button on the dashboard / mentor panel), at `/chat`.
- **Community room**: one shared room for all mentees and mentors. Anyone can ask a question, anyone can answer.
- **Direct messages**: a mentee can message any approved mentor. A mentor can message any mentee or any other mentor. Mentee-to-mentee chat happens in the community room.
- Unread badges on the sidebar and the navbar, "Load earlier messages", Enter to send (Shift+Enter for a new line), 1000 characters per message, a flood limit of 15 messages per 30 seconds.
- **Admins have no chat**: every `/api/chat` route is `requireRole('mentor','mentee')`, so an admin token gets 403, and the admin navbar has no Chat link.
- Messages refresh by polling every 4 seconds while the tab is visible, so there is nothing new to install. Models: `ChatMessage`, `ChatRead`.

## Admin security
Admin is the most powerful role (delete cohorts, approve mentors), so a leaked password must not be enough.

| Layer | What it does |
|---|---|
| Two-factor sign-in | Password, then a 6-digit authenticator code (Google Authenticator, Authy, ...). Codes can't be replayed. 8 one-time recovery codes are issued at setup. `ADMIN_2FA_REQUIRED` defaults to **true**. |
| Separate admin login | `POST /api/auth/login` only accepts `mentor` and `mentee`. Admins use `/api/auth/admin/login`, so admin passwords can't be tried through the public endpoint. |
| Hidden entry page | `/admin-access`, not linked anywhere, `noindex`. This only reduces noise; the layers around it do the protecting. |
| Lockout | 5 failed attempts in 15 minutes locks that account for 15 minutes (wrong password **or** wrong 2FA code). Unknown emails lock identically, so nothing reveals which accounts exist. Applies to mentor and mentee logins too, plus a higher per-IP ceiling. Stored in MongoDB, so a restart doesn't reset it. |
| Short sessions | Admin tokens last `ADMIN_SESSION_HOURS` (default 1). **Sign out everywhere** (admin panel) and changing the admin password end all other sessions. |
| Audit log | Admin panel, **Audit log** tab: sign-ins (successful, failed, locked out) and every change (mentors, cohorts), with time, IP and who. Passwords and codes are never recorded. |
| No default password | `npm run seed` uses `ADMIN_PASSWORD` or generates a random one and prints it once. Admin passwords must be 12+ characters. |

Extras: JWTs are pinned to HS256, a weak `JWT_SECRET` stops the server in production, `CORS_ORIGINS` restricts browser access to your frontend, and the TOTP secret is stored encrypted.

**Set up 2FA.** 2FA is enrolled on the server, never over HTTP, so a leaked password can't be used to register an attacker's phone. `npm run seed` prints the QR code and recovery codes. For an existing database, or to reset a lost phone, run:
```bash
cd backend && npm run admin:2fa -- admin@techneeds.in
```
This prints a new QR code and recovery codes, ends the admin's existing sessions and clears any lockout.

**Demo mode.** If you don't want to pull out a phone on stage, set `ADMIN_2FA_REQUIRED=false` (password only, 1-hour session). Turn it back on for any real deployment; sessions created while it was off stop working the moment it is on again.

**Deploying.** Set `NODE_ENV=production`, a strong `JWT_SECRET`, `CORS_ORIGINS=<your frontend URL>`, and `TRUST_PROXY` to the number of proxy hops (default 1 in production) so lockouts see real client IPs. Serve over HTTPS.

**Known limits.** Tokens live in the browser's localStorage (as before), so an XSS bug elsewhere could read them; the 1-hour admin session and 2FA limit the damage. Lockout is per account, so someone who knows a mentee's enrollment number can lock them out for 15 minutes. Mentor/mentee sessions are still 7 days.

## Not built (future scope)
AI auto-labelling of uploads, mentor support alerts, mentor handover, adaptive practice, reminders/notifications, per-video discussion (chat is global / direct only), chat moderation tools, real-time sockets, mentor ratings, project submissions UI (backend model fields kept).
