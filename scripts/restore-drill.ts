import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { eq } from "drizzle-orm";
import { verifyPinHash } from "../src/lib/auth/pin";
import { createDatabase } from "../src/lib/db/index";
import { bites, biteProgress, profiles, questions, quizAnswers } from "../src/lib/db/schema";
import { markBiteSeen } from "../src/lib/content/progress";
import { exportPackageToDir, importPackageFromDir, wipeDatabase } from "../src/lib/packages/io";
import { saveQuizAttempt } from "../src/lib/quiz/attempts";

async function main() {
  const dataDir = await mkdtemp(path.join(tmpdir(), "bitesized-drill-db-"));
  const external = await mkdtemp(path.join(tmpdir(), "bitesized-drill-external-"));
  const opened = await createDatabase({ dataDir, databaseUrl: null, seed: true });
  try {
    const [bite] = await opened.db.select().from(bites).limit(1);
    const [question] = await opened.db.select().from(questions).limit(1);
    if (!bite || !question) throw new Error("Seed did not load the sample course.");
    await markBiteSeen(opened.db, "prf_eric", bite.id);
    await saveQuizAttempt(opened.db, {
      profileId: "prf_eric",
      subLessonId: bite.subLessonId,
      answers: [{ questionId: question.id, selectedChoiceId: "wrong-on-purpose" }],
      stoppedEarly: true,
    });
    const beforeBites = (await opened.db.select().from(bites)).length;
    await exportPackageToDir(opened.db, external, {
      includeLearners: true,
      includeHistory: true,
      includeArchived: true,
    });
    await wipeDatabase(opened.db);
    const wiped = (await opened.db.select().from(bites)).length;
    if (wiped !== 0) throw new Error("Wipe did not clear bites.");
    await importPackageFromDir(opened.db, external, {
      replace: true,
      includeLearners: true,
      includeHistory: true,
    });
    const afterBites = (await opened.db.select().from(bites)).length;
    const progress = await opened.db.select().from(biteProgress);
    const answers = await opened.db.select().from(quizAnswers);
    const [eric] = await opened.db.select().from(profiles).where(eq(profiles.id, "prf_eric"));
    const pinOk = eric ? await verifyPinHash(process.env.SEED_ADMIN_PIN || "family-admin", eric.pinHash) : false;
    if (afterBites !== beforeBites) throw new Error(`Bite count changed: ${beforeBites} -> ${afterBites}`);
    if (progress.length !== 1 || progress[0]?.biteId !== bite.id) throw new Error("Progress did not restore.");
    if (!answers.some((answer) => answer.questionId === question.id && answer.correct === false)) {
      throw new Error("Wrong answer was not restored.");
    }
    if (!pinOk) throw new Error("Eric's PIN did not verify after restore.");
    console.log(
      JSON.stringify(
        {
          result: "RESTORE_DRILL_PASSED",
          externalDir: external,
          databaseDir: dataDir,
          bites: afterBites,
          progressRows: progress.length,
          wrongAnswers: answers.filter((answer) => !answer.correct).length,
          pinVerified: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await opened.close();
    await rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
