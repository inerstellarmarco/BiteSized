# Handover: writing the course cards for BiteSized

Written 13 November 2026 for the next agent taking over this task. Read this whole file before doing anything.

## 1. The job in one paragraph

The owner (not a developer; checks changes on their phone through the Vercel preview of the `dev` branch) wants **every card ("bite") in the whole course written**, with one multiple-choice question each. The course has 5 tracks, 50 modules, 330 sub-lessons and 1,794 cards. **630 cards are written and pushed. 1,164 are still empty** (modules B9 to B16, all of C, D and E). When all are written, build a zip the owner uploads with the **Import package** button on the **Family** page.

## 2. Links

| What | Where |
| --- | --- |
| Repository | https://github.com/inerstellarmarco/BiteSized |
| Branch to work on (the only one) | https://github.com/inerstellarmarco/BiteSized/tree/dev |
| Commit history of the branch (newest first) | https://github.com/inerstellarmarco/BiteSized/commits/dev |
| Card text, one file per module | https://github.com/inerstellarmarco/BiteSized/tree/dev/content/course/source |
| Outline of every module (titles to fill) | https://github.com/inerstellarmarco/BiteSized/tree/dev/content/course/outline |
| Built package (what gets imported) | https://github.com/inerstellarmarco/BiteSized/tree/dev/content/course/package |
| Build script | https://github.com/inerstellarmarco/BiteSized/blob/dev/scripts/build-course.ts |
| Card format parser | https://github.com/inerstellarmarco/BiteSized/blob/dev/src/lib/packages/bite-source.ts |
| Tests for the content | https://github.com/inerstellarmarco/BiteSized/blob/dev/tests/course-content.test.ts |
| Tests for the parser | https://github.com/inerstellarmarco/BiteSized/blob/dev/tests/bite-source.test.ts |
| Local copy of the repo | `C:\Users\D'Souza Family\BiteSized` |
| Owner's original course export | `C:\Users\D'Souza Family\Downloads\bite-sized-course (1).zip` |

## 3. The owner's standing rules (their words, still in force)

1. "Work only on the existing branch "dev". Before starting, pull the latest dev."
2. "Never push to main, never create new branches, never open new pull requests."
3. "Do not touch Vercel, Neon, Gemini, Google or any other service, and do not ask me to. If something needs a setting or secret, just tell me its name and I'll handle it elsewhere."
4. "Run the tests (all must pass) before pushing, and add a test for anything new."
5. "Push the commit to dev, then tell me in plain words: what changed, the commit id, and exactly how to check it in the app, using the real button and page names from the code (look them up, don't guess)."
6. "Do not change the database schema unless I ask. If you have to, add a proper migration file."

Other sessions also push to `dev`, so always `git pull --rebase origin dev` before pushing and re-run the tests after.

## 4. How the content is organised

- `content/course/source/*.txt` is where you write. Plain text, one file per module (`B08.txt`, `B09.txt`, ... `C01.txt` ...). Files are read in sorted name order.
- `content/course/outline/<Module>.txt` lists every sub-lesson id and every card title for that module, already in the source format with empty bodies. Copy it and fill it in.
- `content/course/package/` is generated. **Never edit it by hand.** It is `index.json` plus one `sublessons/<id>.json` per sub-lesson, in the app's `bite-sized.package` v1 format. The build keeps every existing id.
- **Do not touch `content/packages/applied-ai-engineering/`.** That is the small sample package the app's own tests and seed use.

## 5. The source format

```
// B8 Planning, Reasoning & Reflection          <- comment line (only outside a card)
@@ sll_Gr4_QOJmlM0v | B8.1 Reasoning Techniques > Chain of Thought
## Step-by-step reasoning in prompts
First paragraph of the card.

Second paragraph. A blank line starts a new paragraph.
?? The question?
+ The correct answer (always listed first; the build shuffles it)
- Wrong answer one
- Wrong answer two
- Wrong answer three
= One sentence explaining why the correct answer is right.
## Next card title
~m
Body of a card about products, prices or market facts...
```

Rules the parser and tests enforce:

- `@@ <sub-lesson id> | any note` starts a sub-lesson. The id must exist in the package.
- `## Title` must match a card title in the outline **exactly** (copy and paste it; only case and spacing are forgiven). A title that does not match makes the build fail.
- Body is at least 25 words. Aim for 70 to 110.
- Each card has at least one question: `??`, then one `+`, then exactly three `-`, then `=`. No two answers the same.
- A line containing only `~m` inside a card marks it as a fast-moving topic (it gets the note "check current details · confidence: medium"). Use it on cards that name products, companies, prices, dates or laws.
- `##+ Title` adds an extra card after the previous one (not needed so far).
- `-- Title` placed right after the `@@` line archives an existing card (used only in `A1.txt` for 11 old duplicates).
- Do not start a body line with `##`, `??`, `+ `, `- `, `= `, `@@`, `--`, `~m` or `//`. So no bullet lists inside bodies; write short sentences instead.
- If one sub-lesson appears in a source file, **every** card in that sub-lesson must be written (a test checks this). Finish whole sub-lessons.

## 6. The writing style the owner approved

Their words: "explained clearly, simply and concise - Meaning easy to understand tone, with clarity but not ignoring or compromising the complexity of it.. often giving analogies and Examples". There is no limit on cards per sub-lesson, but the outline already fixes the titles, so write one card per title.

How that has been applied in the 630 finished cards (read `B05.txt` or `B07.txt` for the house voice before writing):

- Open with a plain statement of what the thing is.
- Give one analogy from everyday life or one concrete business example, on its own short line ("It is a doctor writing a prescription.").
- Keep the true caveat or limit. Do not simplify until it is wrong.
- Short paragraphs, 70 to 110 words in all. British spelling. No em dashes. No bullet lists. No hype.
- Do not repeat the previous card; each card covers its own title.
- The question tests the main idea of the card, not a trivial detail. Wrong answers are clearly wrong to someone who read the card, without being silly every time.
- Facts are as of mid 2026. Where something may have changed, add `~m` and say "check the current details" in the body.
- The learner is training to become an AI consultant, so tie ideas to client work where it fits.

## 7. The working loop

Run everything from the repo root.

```bash
git pull --rebase origin dev
```

Write `content/course/source/B09.txt` from `content/course/outline/B9.txt`, then:

```bash
npx tsx scripts/build-course.ts
```

It prints, for example, `330 sub-lessons, 1794 bites, 630 written, 1164 still empty, 641 questions`. If it throws, the message names the file and line. Then:

```bash
npx vitest run
```

All 17 test files (87 tests) must pass; the run takes about a minute. Then commit `content/course` and push to `dev`. Push every two or three modules so nothing is lost.

Notes for this Windows machine:

- The folder path has an apostrophe (`D'Souza Family`). Quote it. `npm run build` fails locally for that reason only; it is not needed for this task.
- `git add` prints hundreds of harmless "LF will be replaced by CRLF" warnings.
- Playwright e2e tests are not run locally.

## 8. What is done

| Module | Source file | State |
| --- | --- | --- |
| A1 to A5 | `A1.txt` ... `A5.txt` | written, pushed |
| A6 | `A6a.txt`, `A6b.txt` | written, pushed |
| B1 to B7 | `B01.txt` ... `B07.txt` | written, pushed |
| B8 | `B08a.txt`, `B08b.txt` | written, pushed |

Everything the previous agent wrote is pushed; nothing is held back anywhere else. **Start at B9.**

## 9. What is left (sub-lessons / cards)

| Track B | | Track C | | Track D | | Track E | |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B8 | done | C1 | 7 / 42 | D1 | 5 / 31 | E1 | 3 / 19 |
| B9 | 6 / 28 | C2 | 6 / 38 | D2 | 4 / 25 | E2 | 3 / 17 |
| B10 | 11 / 63 | C3 | 7 / 37 | D3 | 6 / 36 | E3 | 3 / 16 |
| B11 | 6 / 29 | C4 | 6 / 37 | D4 | 5 / 30 | E4 | 4 / 22 |
| B12 | 8 / 40 | C5 | 6 / 37 | D5 | 5 / 28 | E5 | 4 / 23 |
| B13 | 8 / 33 | C6 | 6 / 38 | D6 | 5 / 30 | E6 | 4 / 24 |
| B14 | 7 / 32 | C7 | 6 / 34 | D7 | 4 / 22 | E7 | 9 / 48 |
| B15 | 8 / 39 | C8 | 6 / 32 | D8 | 4 / 25 | E8 | 8 / 43 |
| B16 | 10 / 39 | C9 | 6 / 33 | D9 | 4 / 22 | E9 | 7 / 37 |
| | | | | | | E10 | 7 / 35 |
| **303 cards** | | **328 cards** | | **249 cards** | | **284 cards** | |

Total left: 1,164 cards. Name the files with two digits so they sort correctly: `B09.txt` ... `B16.txt`, `C01.txt` ... `E10.txt`.

## 10. Finishing, once every card is written

1. In `tests/course-content.test.ts`, tighten the "no empty card" test so it requires **no empty, non-archived card anywhere** (today it only checks sub-lessons that have a source).
2. Build the zips into a folder the owner can open:

   ```bash
   npx tsx scripts/build-course.ts --zip "C:/Users/D'Souza Family/Downloads/bitesized-import"
   ```

   This writes `bite-sized-course-full.zip` and five fallbacks, `bite-sized-course-part-A.zip` to `-E.zip`. Each must be under 5 MB (the upload limit; a test checks the full one).
3. Run the tests, push, and give the owner the report rule 5 asks for.

## 11. What to tell the owner at the end

- How to load the content: open the **Family** page, find **Course package**, press **Import package** and choose `bite-sized-course-full.zip`. If that times out (the import runs several thousand database queries one after another, and this has not been tried on Vercel), import the five part zips A to E one at a time instead.
- One question was written per card.
- 11 old A1 cards were archived, not deleted, because the outline re-import had created near-duplicates of them: "Strings, numbers, and booleans", "Lists, dictionaries, sets, and tuples", "Mutability", "Data models", "Virtual environments", "Dependency files", "Synchronous vs asynchronous code", "Concurrent API calls", "Retries and timeouts", "Print, logs, and breakpoints", "Testing concepts".
- New cards carry the note "Drafted by AI, November 2026 · confidence: high" (or "medium" for fast-moving topics) and show as not reviewed yet.
- `content/course/package/index.json` was left as the owner exported it. Its course description still says the package is only module A1, and the course is still marked as hand-written. Changing either is the owner's call.
- Nothing in this task was checked in a browser, and the e2e tests were not run.

## 12. Other work done in the same session (finished, for context)

Commit `310c273`: on desktop the card again shows its buttons along the bottom ("Regenerate…", "Revisit later", "Flag for rework", "Report an error", and "Use as style example" for admins); phones keep the "…" menu. Card bodies are now shown as separate paragraphs. Code is in `src/lib/bite-actions.ts` and `src/components/learn-deck.tsx`, with a test in `tests/bite-actions.test.ts`. Another session has since edited `learn-deck.tsx` (commit `ea3d345`), so read it before changing it.
