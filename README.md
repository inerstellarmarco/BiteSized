# Bite Sized

Bite Sized is a small learning app for Eric and his family. Up to three people each get a profile. Lessons are short cards, one idea at a time, and a quiz is always a separate choice.

The app does not assume a subject. **Applied AI Engineering** is the first course: the default seed loads module A1 (`content/packages/applied-ai-engineering`), and the complete five-track course (Tracks A–E: 50 modules, 330 sub-lessons, 1,794 cards, and 1,805 quiz questions) lives in `content/course/package` and can be imported as a ZIP from the Family page. Another course can be imported later without changing the app.

It is an installable web app, so the same site runs on Android, iPhone, and Windows. It needs a connection. There is no offline copy of the course.

Product decisions live in [PLAN.md](PLAN.md). That file is the reference when scope changes.

## Stack

Next.js (App Router) and TypeScript, with Tailwind. One web codebase deploys as a site and as a PWA, which covers phones and Windows without three native apps.

The database is Postgres-shaped. Drizzle is the query layer.

- On this machine, with `DATABASE_URL` unset, the app uses [PGlite](https://pglite.dev/): Postgres compiled to WebAssembly, stored in `data/bitesized`. Nothing else has to be running, and the cost is $0.
- For a hosted copy, point `DATABASE_URL` at [Neon](https://neon.tech)’s free Postgres and import [inerstellarmarco/BiteSized](https://github.com/inerstellarmarco/BiteSized) into a [Vercel](https://vercel.com) Hobby project from GitHub. Both have a $0 tier that fits a family of three. The code does not change between the two.

Course files are JSON. The database is the master copy. Packages are how you import, export, and back up, so a backup is not trapped inside Neon.

AI keys stay in server environment variables (`GEMINI_API_KEY` or `LLM_API_KEY`, never `NEXT_PUBLIC_`). A backup provider (`LLM_BACKUP_PROVIDER`, `LLM_BACKUP_API_KEY`, `LLM_BACKUP_MODEL`) fails over automatically when the primary call fails, and the daily regenerate cap defaults to 100 per profile (`LLM_DAILY_REGENERATE_CAP`, adjustable in Admin Settings).

## Run it locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

The first launch creates Eric as an admin. The starting passphrase is `family-admin`. Change it in Settings after you sign in. Set `SEED_ADMIN_PIN` before the first launch if you want a different one.

```bash
npm test
```

Content-model, PIN, quiz, and package tests use an in-memory database. They do not touch `data/bitesized`.

## Profiles

- At most three active profiles. Sign in with a PIN. A trusted device stays signed in for 90 days.
- Five wrong PINs lock that profile for 15 minutes. There is also a limit on how many attempts a profile or address can make in that window.
- A learner PIN is 4–8 digits. An admin can use that, a longer numeric PIN, or a passphrase of at least 8 characters.
- Admin is a right you can give any profile. Eric starts as an admin. The last admin cannot be removed or demoted. The home page asks you to add a second admin while there is only one.
- Any admin can reset another profile’s PIN from Family settings.

### Emergency PIN reset

Whoever can run commands against the database can reset a PIN without the old one. Stop `npm run dev` first if you are on the local PGlite file (it is locked while the server is open). On Neon you can run this live, with `DATABASE_URL` set.

```bash
npm run emergency-reset -- --name "Eric" --pin "a-new-passphrase"
```

That also clears a lockout.

## Courses

A package is an `index.json` table of contents (permanent ids, title, author, licence, and an AI-generated flag) plus one JSON file per sub-lesson.

```bash
npm run export-package -- --out ./course-export
npm run import-package -- --from ./course-export
```

Import from the Family page updates the course and leaves progress alone. `--replace` is a full replace, including learners when the folder has them, and is what restore uses.

Sample seed content (module A1) lives in `content/packages/applied-ai-engineering`. `course.ts` is the hand-written source. `npm run package:write` refreshes the JSON. The database is seeded from that JSON on first launch.

The complete five-track course (Tracks A–E, 50 modules, 330 sub-lessons, 1,794 cards) lives in `content/course/source/*.txt` and builds into `content/course/package`:

```bash
npm run course:build -- --zip ./course-zips
```

Ordering uses fractional keys, so an insert or a move updates one row. Deletes are archives and can be restored. Edits write a row to `content_revisions`. Progress is counted from the bites that are still in the course, so adding or archiving a bite changes the percentage.

## Backup and restore

`npm run backup` writes a full package (course, archived rows, progress, PIN hashes, edit history) to `BACKUP_EXTERNAL_DIR`, or to `backups/` if that is unset. Keep that folder somewhere that is not the database: another disk, a private repo, or a sync folder. If `DATABASE_URL` is set and `pg_dump` is installed, the same folder also gets `database.sql`.

```bash
BACKUP_EXTERNAL_DIR=/var/backups/bite-sized npm run backup
npm run restore -- --from /var/backups/bite-sized/<stamp>
```

A daily cron entry:

```
0 3 * * * cd /path/to/bite-sized && BACKUP_EXTERNAL_DIR=/var/backups/bite-sized npm run backup
```

After a restore, people sign in again. Sessions are not part of the backup.

### Restore drill

Ran `npm run restore-drill` against a throwaway PGlite directory. It seeded A1 and Eric, marked a bite seen, saved a wrong quiz answer, backed up to a temp folder outside that database, wiped the database, and restored. Result:

```json
{
  "result": "RESTORE_DRILL_PASSED",
  "bites": 30,
  "progressRows": 1,
  "wrongAnswers": 1,
  "pinVerified": true
}
```

Deploy steps for Neon and Vercel are in [DEPLOY.md](DEPLOY.md).

## Deploy for $0

1. Create a Neon project on the free tier and copy the pooled connection string.
2. In Vercel, choose **Add New… → Project** and import the GitHub repository [inerstellarmarco/BiteSized](https://github.com/inerstellarmarco/BiteSized). Production tracks `main`.
3. Set `DATABASE_URL`, `SEED_ADMIN_PIN`, and `COOKIE_SECURE=true`.
4. Deploy. The first request creates the course and Eric.
5. Sign in, change the PIN, and add a second admin.
6. From a machine that has `DATABASE_URL`, run `npm run backup` into a folder that is not on Neon. `pg_dump` (`postgresql-client`) adds a SQL dump next to the JSON package.

Install the site from the browser: Android Chrome “Install app”, Windows Edge or Chrome “Install Bite Sized”, iPhone Share then “Add to Home Screen”. iPhone does not show an automatic install banner; Add to Home Screen is the path. The app still needs a network.

## Tests

`npm test` covers:

- insert and move touching one row, archive, restore, and revision history
- progress dropping and rising as bites are archived or added
- PIN lockout, rate limiting, trusted sessions, the last-admin rule, and emergency reset
- quiz scoring and saved wrong answers
- package export, wipe, and import, including progress

UI checks (Playwright, against the dev server):

```bash
npx playwright test
```

Phone viewport 412×915 and desktop 1280×800: Learn (with a Mermaid diagram), Quiz, the quiz result, and the course tree.

## Still ahead

Phases 1 to 4 are done. What remains for Phase 5 is in [PLAN.md](PLAN.md): Word and PDF outline import, the full approvals inbox and admin dashboard, and final go-live checks.

Quizzes support multiple-choice, true/false, and predict-the-output questions, with retake rules (random order, no repeats, and the question just missed does not come straight back), full attempt score history, and 1/3/7/21-day spaced repetition for wrong answers. Learners also have a dashboard on Home with category/module/lesson progress, quiz score trends, daily bite goals and streaks, private notes on bites, course search, prerequisite skip warnings, and learner progress export.

## Phase 2: style, import, and review

Admins open Style, Import, and Review from the Family page.

### Gemini

The model boundary is `src/lib/llm`. Gemini is the default, using `gemini-3.8-flash` (override with `GEMINI_MODEL`). The call is server-side `generateContent` with thinking set to low. Set the key only in the environment:

```bash
GEMINI_API_KEY=your-key
```

`LLM_API_KEY` is accepted as an alias. A backup-provider slot (`LLM_BACKUP_PROVIDER`, `LLM_BACKUP_API_KEY`, `LLM_BACKUP_MODEL`) fails over automatically if the primary provider fails, and a daily cap (`LLM_DAILY_REGENERATE_CAP`, default 100, editable on the Admin page) limits regenerations per profile per day.

With no key, or with `LLM_PROVIDER=mock`, the app uses a deterministic mock. Tests use that mock. If a live call fails, the screen says "AI unavailable, try later."

### Locked style

Style is a draft until an admin locks it. Locking saves version 1, 2, 3… with the guide, up to 20 examples, the model name, and the temperature. Editing the draft does not change a locked version, and it does not rewrite bites that were already generated. Each generated bite and question stores the style version that made it.

The default guide asks for one friendly, accurate idea, about 45–75 words, readable in about 30 seconds on a phone.

### Google Docs

Import reads headings and keeps their levels. The admin can point the levels at category, sub-category, lesson, toolkit, or ignore before applying. The default matches Eric's outline: H1 category, H2 sub-category with a `[Foundations]` style tag, H3 lesson, numbered lines as sub-lessons, bullets as bite topics, H4 toolkit, `(see B3.2)` as a cross-link, and the "Learning path" sentence as prerequisites.

How a document gets in, in the order the app tries:

1. Paste a Google Doc link shared as **anyone with the link**. The server fetches `https://docs.google.com/document/d/{id}/export?format=html`. No OAuth and no service account. A private doc cannot be read this way.
2. Upload the same HTML export, a `.docx`, or the outline text format if the link is not public.

The preview lists what will be created. Apply matches existing rows by heading code (such as `A1.1`) and then by title, so a second import does not duplicate them. New topics become pending bites. Approved bites are left alone.

### Generation and review

After a style is locked, Apply queues one job per sub-lesson and runs a small batch. Continue generation on the Review page picks up the rest, with backoff, and does not wipe bites that already succeeded. The model writes the bite, then multiple-choice questions, then a second pass plus a structural check (exactly one correct choice, distinct choices). Doubtful questions are flagged and cannot be batch-approved until an admin edits them and re-checks. Approval sets the bite's last-reviewed date. Learners only see approved bites.
