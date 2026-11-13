# TechNeeds 2.0: AI-Powered Multi-Role Mentorship Platform

Next.js 15 (frontend) + Express 5 / MongoDB (backend) + JWT roles + Gemini for the AI Profile.

## Run locally
```bash
# 1. backend
cd backend
cp .env.example .env        # fill MONGO_URI, JWT_SECRET, LLM_API_KEY (optional)
npm install
npm run seed                # wipes the DB and loads demo data (prints credentials)
npm run dev                 # http://localhost:5000
npm test                    # points / ranking / badge / AI-fallback tests

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
| Admin | admin@techneeds.in | Admin@2026 |
| Mentor | priya.sharma@techneeds.in | Mentor@001 |
| Mentor | ankit.verma@techneeds.in | Mentor@002 |
| Mentee | TN26-0001 (Aarav, Web Dev) | Pass@1234 |
| Mentee | TN26-0002 (Diya, Web Dev) | Pass@1234 |
| Mentee | TN26-0003 ... TN26-0010 | Pass@1234 (forced password change on first login) |

## Demo script (3 minutes)
1. Home: zigzag roadmap, team section, **Get Started** -> Cohorts -> **Login to join**.
2. Request mentor access on the login page, then log in as **Admin**: approve the request (temp password shown once), create a cohort, assign a mentor.
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
All non-public routes are role-checked on the server (`middleware/requireRole.js`).

## Not built (future scope)
AI auto-labelling of uploads, mentor support alerts, mentor handover, adaptive practice, reminders/notifications, per-video discussion, mentor ratings, project submissions UI (backend model fields kept).
