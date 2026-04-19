# Deploy on Coolify (note.rohitkesharwani.com)

Two services are recommended: **API** (Node) + **Web** (nginx static). Postgres can be a Coolify **Database** on the same server (internal Docker DNS — no clash with host ports like 5432).

## Ports

- This app’s API defaults to **`3100`** inside the container (see `backend/Dockerfile` and `backend/src/index.js`). Coolify maps it to HTTPS on your subdomain; you do **not** need to bind host `3000`, `8000`, etc.
- **PostgreSQL** on Coolify: use the **internal** hostname and port Coolify shows for the database resource (often `5432` **inside** the Docker network). That is separate from “host 5432 already used.”

## 1) Database (Coolify)

1. Create a **PostgreSQL** database in Coolify (new DB for this app).
2. Copy the internal `DATABASE_URL` (or build it: `postgresql://USER:PASSWORD@HOST:5432/DATABASE`).
3. Run migrations: the API container runs `setup-db.js` on start (`backend/Dockerfile` CMD).

## 2) API resource (backend)

- **Build pack / Dockerfile**: Dockerfile at **`backend/Dockerfile`** (set context to repo root, Dockerfile path `backend/Dockerfile`, or set root to `backend` per Coolify UI).
- **Port**: set container port to **`3100`** (or set env `PORT` to whatever you expose; keep Dockerfile `EXPOSE` aligned).
- **Environment variables** (minimum):

| Variable | Example |
|----------|---------|
| `DATABASE_URL` | `postgresql://…@coolify-postgres:5432/yourdb` |
| `JWT_SECRET` | long random string (≥16 chars) |
| `FRONTEND_URL` | `https://note.rohitkesharwani.com` |
| `PORT` | `3100` |
| `GOOGLE_CLIENT_ID` | from Google Cloud |
| `GOOGLE_CLIENT_SECRET` | from Google Cloud |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://api.note.rohitkesharwani.com/api/auth/google/callback` |
| `BREVO_API_KEY` / `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` | if using email reset |

- **Domain**: e.g. `https://api.note.rohitkesharwani.com` → proxy to this service (Coolify generates TLS).

## 3) Web resource (frontend)

- **Dockerfile**: **`Dockerfile`** at repo root.
- **Build argument**: `VITE_API_URL` = `https://api.note.rohitkesharwani.com` (no trailing slash), so the built JS calls the correct API.
- **Port**: nginx listens on **80** in the image; Coolify maps to `https://note.rohitkesharwani.com`.

## 4) Google OAuth

In Google Cloud Console → OAuth client → **Authorized redirect URIs**, add:

`https://api.note.rohitkesharwani.com/api/auth/google/callback`

**Authorized JavaScript origins** (if required):

- `https://note.rohitkesharwani.com`
- `https://api.note.rohitkesharwani.com`

## 5) After deploy

- Open `https://note.rohitkesharwani.com` and sign in / register.
- If CORS errors appear, `FRONTEND_URL` in the API must match the frontend origin exactly (`https://note.rohitkesharwani.com`, no trailing slash).
