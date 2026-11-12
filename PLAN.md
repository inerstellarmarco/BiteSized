# Bite Sized: App Plan

Source of truth for the plan (mirrors the "Bite Sized: App Plan" Page). Keep this file updated when the plan changes.

Bite Sized is a learning app that works for any subject and runs online on Android, iPhone and Windows. Each sub-lesson has a Learn mode for scrolling bites and a Quiz mode, with AI in a locked teaching style. Applied AI Engineering is the first course.

## At a glance
| | |
|---|---|
| What it is | Short lesson bites with AI rewrites, diagrams and quizzes |
| Subjects | Any subject; the app never assumes what it teaches |
| Modes | Each sub-lesson offers Learn (scroll the bites) or Quiz, chosen separately |
| Master copy | The database; course packages are for import and export |
| First course | Applied AI Engineering, from Eric's own outline |
| Devices | Android, iPhone and Windows, from one installable web app; needs internet |
| Users | Up to 3 profiles, all adults or older teens |
| Roles | Admin is a right any profile can be given; Eric starts as admin |
| AI | Gemini by default, a backup provider, a locked teaching style, daily cap of 100 regenerations per profile (admin setting) |
| Cost target | $0/month; prices and free-tier limits checked as we go |

## Content model
Course > Category > Sub-category > Lesson > Sub-lesson > Bite > Quiz question (questions belong to bites). Lessons can have optional "learn this first" prerequisite links.

- **Bites and questions:** bites sit only under sub-lessons; each bite has its own quiz questions.
- **Question types:** multiple choice, true or false, predict the output; more can be added later.
- **Prerequisites:** optional; the app suggests a path and warns on skips.
- **Source and confidence:** each bite notes where it came from (outline or AI) and AI confidence.
- **Last reviewed date:** per bite, so stale material can be surfaced.
- **Level tag:** per sub-category (Foundations, Intermediate, Advanced, Expert).
- **Toolkit:** per sub-category: hands-on projects, tools and frameworks, learning outcomes.
- **Cross-links:** a bite can point to a related lesson elsewhere.
- **Diagrams:** stored as Mermaid text; if it won't render, the bite shows without it and the diagram is flagged.

### Frequent adds and deletes
- Permanent IDs that never change.
- Order positions with gaps (fractional keys), so an insert or move touches one item.
- Archive-first deletes, restorable or purged later.
- Progress computed from the current course.

## Outline mapping (Applied AI Engineering)
| In the outline | Example | Becomes |
|---|---|---|
| Doc title | Applied AI Engineering | Course |
| Heading 1: Track | Track A: Foundations | Category |
| Heading 2: Module | A1 Python Concepts [Foundations] | Sub-category with level tag |
| Heading 3: Lesson | A1.1 Core Programming Concepts | Lesson |
| Numbered line | 1. Data Types & Structures | Sub-lesson |
| Bullet | Lists, dictionaries, sets, tuples | Bite topic, written up by the AI |
| Heading 4: Toolkit | A1 Toolkit | Sub-category toolkit |
| (see B3.2) | Cross-reference tag | Cross-link |
| Learning path | A, then B, then C, D, E | Prerequisites between categories |

About 5 tracks, 45 modules, 135 lessons.

## Master copy and packages
- The database is the one master copy, including all admin edits.
- Course package = index file (table of contents) + one content file per sub-lesson.
- New material can come in as a separate file; the app previews changes before applying.
- Conflict: if a bite changed in the app and in an uploaded package, warn and let the admin pick.
- Version history on every change.
- Packages carry course info, author, licence and AI-generated labels (sharing or selling later).
- Automatic backups, plus a weekly full export outside the database provider.
- Restore drill in Phase 1; export/wipe/import round-trip test including progress.

## Importing outlines
1. Admin picks a Google Doc (first format). Word next, PDF last.
2. AI maps the structure; admin confirms or adjusts.
3. AI writes bites in the locked style (notes guide content; bare headings filled in).
4. Admin reviews: edit or delete single bites, or batch approve a sub-lesson.
5. Quiz questions drafted per approved bite and reviewed the same way.
6. Separate answer-key check: exactly one correct answer, key verified, doubtful ones flagged.

## Locked AI style
1. Tune: try sample bites; adjust tone, length, reading level, analogies, formatting.
2. Style examples: admin-only "Use as style example" button (separate from heart), capped at 10 to 20, removable or replaceable.
3. Lock: guide, examples and AI settings saved as a numbered style version used by every generation.
4. Change on purpose: only admins edit, creating a new version; old content stays unless regenerated.

Not model fine-tuning; that can be added later if the style drifts.

## Learn mode
- Phone: one bite per card, swipe up for next. PC: Next/Back buttons, clickable cards, keyboard.
- Progress bar through the sub-lesson.
- Regenerate with presets only: simpler, analogy, explain differently, in the locked style.
- Personal versions are profile-only; if the original changes, keep yours with an "Original updated" badge and an option to switch.
- Admin save options: just for themselves, overwrite original (into version history), or both.
- Heart: personal favourite only.
- Flags: revisit, rework (unclear or too hard), report error (factually wrong).
- New sub-lessons: anyone proposes; AI suggests placement; admin approves or moves.

## Quiz mode and review
- Separate mode per sub-lesson; uses every question, option to stop early; then option to go to the next sub-lesson.
- Retakes: random order, no repeats within a retake, the question just missed doesn't come straight back.
- Score history for every attempt.
- Spaced repetition for wrong answers: 1, 3, 7, 21 days.
- Revisit list.
- Rework and error lists go to an admin, who regenerates or fixes, then accepts for everyone.

## Extras
Daily bites goal and streak (private per profile), search, private notes on bites, export of course package and each learner's progress, accessibility (font size, light/dark theme, reduced motion).

## Dashboards
- Learner: overall progress; by category, sub-category and lesson; quiz scores and trend; due reviews, revisit list, streak; where to continue.
- Admin: starts as a simple list of pending sub-lessons, rework and error reports; later every learner's progress, course versions and recent changes; current style version; AI usage against the cap.

## Admin and learners
| Action | Learner | Admin |
|---|---|---|
| Learn, quiz, heart, notes | Yes | Yes |
| Regenerate, save personal version | Yes | Yes |
| Flag revisit, rework, error | Yes | Yes |
| Propose a new sub-lesson | Yes | Yes |
| Overwrite the original | No | Yes |
| Use as style example | No | Yes |
| Import outlines and packages, batch approve | No | Yes |
| Approve new sub-lessons and placement | No | Yes |
| Edit or delete course content | No | Yes |
| Tune and lock AI style | No | Yes |
| Manage profiles, AI settings, caps | No | Yes |
| Give or remove admin rights | No | Yes |

## Users, devices and safety
- PINs only, lockout after several wrong tries; admin PINs can be longer or a passphrase.
- Remembered trusted devices.
- Any admin can reset another's PIN; documented emergency reset for whoever runs the server.
- Never zero admins; nudge to add a second admin early.
- Online only; progress follows you across devices.
- Android tested from Phase 1; iPhone (Safari, Add to Home Screen) checked before going live; Windows via Chrome or Edge install.
- Learners are adults or older teens.

## Tech choices
| Part | Plan | Why |
|---|---|---|
| App | Installable web app (Next.js) | One codebase for every device |
| Data | Hosted Postgres (Neon), the master copy | One source of truth, backed up |
| AI | Gemini plus a backup provider | Swappable behind one module |
| AI limits | Daily regenerate cap per profile (100) | Protects the free tier |
| AI outage | "AI unavailable, try later" message | A limit never looks like a crash |
| AI key | Server only | Never reaches a phone or browser |
| Hosting | Vercel Hobby (free), code on GitHub | Light use for 3 people |

## Build phases
1. **Core loop:** content model, profiles with PINs, admin rights and recovery, Learn mode on phone and PC, progress bar, basic multiple-choice Quiz, sample package from module A1, backups with restore drill, Android testing. (Done)
2. **Style and Google Docs import:** tune and lock the AI style, Google Docs import with batch approve, load the outline. (Done)
3. **AI features:** regenerate and personal versions, admin save options, hearts, style examples, diagrams, suggested placement, report error, simple admin list, backup provider and daily cap. (Done. Neon and Vercel steps are written in DEPLOY.md; going live stays in phase 5.)
4. **Learning depth:** spaced repetition, all question types, retake rules, prerequisites, learner dashboard, streaks, search, notes, progress export.
5. **More imports and go live:** Word then PDF import, full approvals inbox and admin dashboard, hosting, iPhone check.

## Later development
- Re-importing an updated outline: match by permanent ID for packages, by heading code (e.g. A1.1) for fresh documents.
- Staging copy separate from live data.
- Planned, reversible database migrations.
- Basic error logging in one checked place.
- Diagrams tested at phone width, with an admin fix tool.
