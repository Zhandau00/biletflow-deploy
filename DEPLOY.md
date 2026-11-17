# Deploying BiletFlow on Vercel

This repository holds both apps:

| Folder | What | Vercel project |
| --- | --- | --- |
| `backend/` | FastAPI API (Python 3.11), served as one serverless function (`backend/api/index.py`) | `biletflow-api` |
| `frontend/` | Next.js 16 website; the browser only talks to it, and it calls the API server-side | `biletflow-web` |

Create **two Vercel projects from this one repository**, each with its own *Root Directory*. Deploy the backend first, because the frontend needs its address.

## 1. Database

The backend needs PostgreSQL. In the backend project: **Storage → Create Database → Neon (Postgres)**, or any hosted Postgres.

Use the **direct (non-pooled)** connection string, in the asyncpg form:

```
postgresql+asyncpg://USER:PASSWORD@HOST/DBNAME?ssl=require
```

(Replace `postgresql://` with `postgresql+asyncpg://`, and `sslmode=require` with `ssl=require`. Drop `channel_binding=require` if present.)

Create the tables once, from your computer (Vercel does not run migrations):

```bash
cd backend
DATABASE_URL="postgresql+asyncpg://...?ssl=require" uv run alembic upgrade head
```

Run it again after every change that adds a migration.

## 2. Backend project (`backend/`)

- **New Project → import this repository → Root Directory: `backend`**. Framework preset: Other. No build command.
- Environment variables:

| Name | Value |
| --- | --- |
| `ENVIRONMENT` | `production` |
| `DATABASE_URL` | the asyncpg URL from step 1 |
| `SECRET_KEY` | 48+ random characters: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `ORIGINS` | `["https://<your-frontend>.vercel.app"]` |
| `FRONTEND_URL` | `https://<your-frontend>.vercel.app` (links in emails) |
| `PUBLIC_BASE_URL` | `https://<your-backend>.vercel.app` |
| `MEDIA_DIR` | `/tmp/media` (only `/tmp` is writable; see storage below) |
| `TICKET_FONT_PATH` | `fonts/DejaVuSans.ttf` |
| `TICKET_FONT_BOLD_PATH` | `fonts/DejaVuSans-Bold.ttf` |
| `EMAIL_ENABLED` | `false` to log emails, or `true` plus the SMTP settings below |

- Email (optional): `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_USE_TLS=true`, `EMAIL_FROM`. Any SMTP service works, e.g. Resend, Brevo or Mailgun.
- Image uploads: Vercel's disk is temporary, so for uploads that last set `STORAGE_BACKEND=s3` and `S3_ENDPOINT_URL`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PUBLIC_BASE_URL`. Cloudflare R2 or AWS S3 work.
- Check: `https://<your-backend>.vercel.app/api/v1/events/` answers with a list (empty at first), and `/docs` shows the API.

With `ENVIRONMENT=production` the backend refuses to start with the development secret key, a short key, or `ORIGINS=["*"]`.

## 3. Frontend project (`frontend/`)

- **New Project → same repository → Root Directory: `frontend`**. Framework preset: Next.js (detected).
- Environment variable: `BACKEND_API_URL` = `https://<your-backend>.vercel.app/api/v1`
- Deploy, then put the frontend's address into the backend's `ORIGINS` and `FRONTEND_URL` and redeploy the backend.

## 4. First admin account

Sign up on the website, then make that account a platform admin in the database:

```sql
UPDATE users SET is_platform_admin = true, email_verified_at = now() WHERE email = 'you@example.com';
```

**Do not run `scripts/seed_demo.py` against a public deployment**: its sample accounts share a password that is in this public repository, and one of them is a platform admin. If you seed a demo, change those passwords or suspend the accounts afterwards.

## Limits of this setup

- Sign-in and email rate limits are kept in memory, per serverless instance, so they are looser than on one server. A shared store (Upstash Redis) would make them exact.
- Emails are sent after the response, inside the same function run; on serverless they may occasionally be cut off. A queue would make delivery reliable.
- Payments are simulated; no money moves.

## Local development

See `backend/README.md` (Docker Compose with Postgres and Mailpit) and `frontend/README.md`.
