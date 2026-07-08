# AI-Powered Competitive Programming Analyzer

A monorepo app that pulls live LeetCode + Codeforces data, sends it to Gemini AI
for coaching-style analysis, stores the result in Neon Postgres, and displays
it in a "judge terminal" themed dashboard.

```
ai-cp-analyzer/
├── vercel.json              # monorepo build/routing config
├── schema.sql                # run once against your Neon DB
├── backend/
│   ├── package.json
│   ├── .env.example
│   └── api/index.js          # Express app (Vercel serverless entry point)
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    ├── .env.example
    └── src/
        ├── main.jsx
        ├── App.jsx
        └── App.css
```

## ⚠️ Security note

Rotate any database password or API key that has ever been pasted into a chat,
committed, or shared in plain text — treat it as compromised even if it "still
works." Generate fresh credentials before deploying for real:
- Neon: dashboard → your project → **Connection Details** → reset password
- Gemini: [Google AI Studio](https://aistudio.google.com/app/apikey) → delete old key → create new one

## 1. Database setup

Run the schema once against your Neon database:

```bash
psql "$DATABASE_URL" -f schema.sql
```

(or paste `schema.sql`'s contents into the Neon SQL editor in the dashboard).

## 2. Environment variables

### `backend/.env` (copy from `backend/.env.example`)

| Variable        | Required | Description                                                |
|-----------------|----------|--------------------------------------------------------------|
| `DATABASE_URL`  | yes      | Neon pooled connection string, must include `sslmode=require` |
| `GEMINI_API_KEY`| yes      | Google Gemini API key                                       |
| `GEMINI_MODEL`  | no       | Defaults to `gemini-2.0-flash`                               |
| `PORT`          | no       | Local dev only, defaults to `3001`                           |

### `frontend/.env` (copy from `frontend/.env.example`)

| Variable        | Required | Description                                                                                   |
|-----------------|----------|-------------------------------------------------------------------------------------------------|
| `VITE_API_URL`  | no       | Leave blank for local dev (Vite proxy) and for Vercel (same-domain). Set only if backend is on a separate domain. |

## 3. Local development

```bash
# terminal 1 - backend
cd backend
npm install
npm run dev          # http://localhost:3001

# terminal 2 - frontend
cd frontend
npm install
npm run dev           # http://localhost:5173 (proxies /api to :3001)
```

## 4. Deploying to Vercel

1. Push this repo to GitHub.
2. In Vercel: **New Project** → import the repo. Vercel will detect the root
   `vercel.json` and build both `frontend` (static) and `backend` (serverless
   function) from a single deployment — no need to set a "root directory."
3. In the Vercel project's **Settings → Environment Variables**, add:
   - `DATABASE_URL`
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` (optional)
4. Deploy. The frontend will be served at your Vercel domain, and API calls
   to `/api/*` will route to the backend function automatically (see
   `vercel.json`'s `routes`).

## API reference

- `POST /api/analyze` — body: `{ leetcodeUsername?, codeforcesUsername? }` → returns the AI analysis, stores it in Postgres.
- `GET /api/history?limit=10` — recent past analyses.
- `GET /api/health` — liveness check.
