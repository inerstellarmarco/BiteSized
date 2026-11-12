# Deploy Bite Sized

This is the free path: a Neon Postgres database and a Vercel Hobby project. The site is the same one you install on Android, iPhone, and Windows.

You need a GitHub account, a Neon account, and a Vercel account. No credit card is required for the free tiers.

## 1. Put the code on GitHub

Create an empty repository. The intended name is `inerstellarmarco/bite-sized`. Push this project there when you are ready. Do not make it public if the family PINs matter to you.

## 2. Create the Neon database

1. Sign in at [https://neon.tech](https://neon.tech) and create a project. The free plan is enough.
2. Choose a region close to you.
3. Open **Connection details** and copy the **pooled** connection string. It looks like `postgres://user:password@ep-something.region.aws.neon.tech/neondb?sslmode=require`.
4. Keep that string secret. It is the only copy of the database password Neon will show in full.

## 3. Create the Vercel project

1. Sign in at [https://vercel.com](https://vercel.com) and import the GitHub repository.
2. Framework preset: Next.js. Leave the build command as `npm run build` and the output as Next.js default.
3. Before the first deploy, open **Settings → Environment Variables** and add:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | The Neon pooled string |
| `SEED_ADMIN_PIN` | A passphrase you will change after the first sign-in |
| `COOKIE_SECURE` | `true` |
| `GEMINI_API_KEY` | Your Gemini key, or leave unset to use the built-in mock |
| `GEMINI_MODEL` | `gemini-3.8-flash` |
| `LLM_PROVIDER` | `gemini` |
| `LLM_BACKUP_PROVIDER` | `openai` |
| `LLM_BACKUP_API_KEY` | A backup key, optional until you want failover |
| `LLM_BACKUP_MODEL` | `gpt-4.1-mini` |
| `LLM_BACKUP_BASE_URL` | `https://api.openai.com/v1` |
| `LLM_DAILY_REGENERATE_CAP` | `100` |
| `CRON_SECRET` | A long random string |

Do not add a `NEXT_PUBLIC_` copy of any key. The app reads keys only on the server.

4. Deploy.

Vercel sets `VERCEL=1`. Without `DATABASE_URL` the app refuses to start, so it never writes a database file on the server disk.

## 4. Migrations and the A1 course

From your computer, with Node installed and the repo checked out:

```bash
npm install
DATABASE_URL="postgres://…" npm run db:migrate
DATABASE_URL="postgres://…" SEED_ADMIN_PIN="your-passphrase" npm run db:seed
```

`db:migrate` creates the tables on Neon. `db:seed` loads the A1 sample course and, if there is no profile yet, creates Eric as admin with `SEED_ADMIN_PIN`.

Open the Vercel URL. Sign in as Eric. Change the passphrase in Settings. Add a second admin so a forgotten PIN is not a crisis.

PIN lockouts and rate limits are rows in Neon (`pin_attempts` and `profiles.locked_until`). They apply no matter which serverless instance handles the request.

## 5. Install the app

The site is a PWA. It needs a connection.

- **Android:** open the site in Chrome. Menu → **Install app** or **Add to Home screen**.
- **iPhone:** open the site in Safari. Share → **Add to Home Screen**. iPhone does not show an automatic install banner.
- **Windows:** open the site in Edge or Chrome. Menu → **Install Bite Sized**.

## 6. Backups off Neon

Neon’s free tier is not your only copy. The backup is a JSON package (course, progress, PIN hashes, history) plus a SQL dump when `pg_dump` is installed.

GitHub Actions is the path that does not need a disk on Vercel. In the GitHub repo, add a secret named `DATABASE_URL` with the same Neon string. The workflow `.github/workflows/backup.yml` runs every day at 04:00 UTC and uploads the package as a private Actions artifact for 30 days. You can also run it from the Actions tab with **Run workflow**.

Download an artifact when you want a copy on your own machine. That folder is outside Neon.

Optional: set `BACKUP_WEBHOOK_URL` on Vercel. The cron route `/api/cron/backup` builds the same package in memory and POSTs the zip there. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. A webhook you do not control should not be used.

To restore on your machine:

```bash
DATABASE_URL="postgres://…" npm run restore -- --from /path/to/the/artifact
```

Everyone signs in again after a restore.

## 7. Gemini and the backup model

Leave `GEMINI_API_KEY` empty and the app uses a built-in mock, which is enough to click through generation. When you add the key and redeploy, Gemini 3.8 Flash is used. If Gemini returns an error or a rate limit, the app tries the OpenAI-compatible backup (`LLM_BACKUP_API_KEY` and `LLM_BACKUP_BASE_URL`) and then stops. The daily cap starts at 100 regenerations per profile and can be changed on the Style page without another deploy.

## 8. Forgotten admin PIN

On your computer:

```bash
DATABASE_URL="postgres://…" npm run emergency-reset -- --name "Eric" --pin "a-new-passphrase"
```

This talks to Neon directly. It does not need the old PIN.
