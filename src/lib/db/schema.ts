import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import type { Choice, FontSize, QuestionType, ThemePreference, Toolkit } from "@/lib/types";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
};

export const courses = pgTable("courses", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  description: text("description").notNull().default(""),
  author: text("author").notNull().default(""),
  licence: text("licence").notNull().default(""),
  aiGenerated: boolean("ai_generated").notNull().default(false),
  position: text("position").notNull().default("a0"),
  ...timestamps,
});

export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  courseId: text("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  code: text("code").notNull().default(""),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  position: text("position").notNull(),
  ...timestamps,
});

export const subCategories = pgTable("sub_categories", {
  id: text("id").primaryKey(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  code: text("code").notNull().default(""),
  title: text("title").notNull(),
  levelTag: text("level_tag").notNull().default(""),
  toolkit: jsonb("toolkit").$type<Toolkit>().notNull(),
  position: text("position").notNull(),
  ...timestamps,
});

export const lessons = pgTable("lessons", {
  id: text("id").primaryKey(),
  subCategoryId: text("sub_category_id")
    .notNull()
    .references(() => subCategories.id, { onDelete: "cascade" }),
  code: text("code").notNull().default(""),
  title: text("title").notNull(),
  prerequisiteIds: jsonb("prerequisite_ids").$type<string[]>().notNull(),
  position: text("position").notNull(),
  ...timestamps,
});

export const subLessons = pgTable("sub_lessons", {
  id: text("id").primaryKey(),
  lessonId: text("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  position: text("position").notNull(),
  ...timestamps,
});

export const bites = pgTable("bites", {
  id: text("id").primaryKey(),
  subLessonId: text("sub_lesson_id")
    .notNull()
    .references(() => subLessons.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  sourceNote: text("source_note").notNull().default(""),
  lastReviewedOn: text("last_reviewed_on"),
  diagram: text("diagram"),
  position: text("position").notNull(),
  reviewStatus: text("review_status").notNull().default("approved"),
  styleVersionId: text("style_version_id"),
  ...timestamps,
});

export const biteLinks = pgTable("bite_links", {
  id: text("id").primaryKey(),
  biteId: text("bite_id")
    .notNull()
    .references(() => bites.id, { onDelete: "cascade" }),
  targetCode: text("target_code").notNull(),
  label: text("label").notNull(),
  position: text("position").notNull(),
});

export const questions = pgTable("questions", {
  id: text("id").primaryKey(),
  biteId: text("bite_id")
    .notNull()
    .references(() => bites.id, { onDelete: "cascade" }),
  type: text("type").$type<QuestionType>().notNull(),
  prompt: text("prompt").notNull(),
  choices: jsonb("choices").$type<Choice[]>().notNull(),
  correctChoiceId: text("correct_choice_id").notNull(),
  explanation: text("explanation").notNull().default(""),
  position: text("position").notNull(),
  reviewStatus: text("review_status").notNull().default("approved"),
  styleVersionId: text("style_version_id"),
  answerKeyStatus: text("answer_key_status").notNull().default("confirmed"),
  answerKeyNote: text("answer_key_note").notNull().default(""),
  ...timestamps,
});

export const contentRevisions = pgTable("content_revisions", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  op: text("op").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  actorProfileId: text("actor_profile_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  pinHash: text("pin_hash").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  fontSize: text("font_size").$type<FontSize>().notNull().default("md"),
  theme: text("theme").$type<ThemePreference>().notNull().default("system"),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  ...timestamps,
});

export const pinAttempts = pgTable("pin_attempts", {
  id: text("id").primaryKey(),
  profileId: text("profile_id"),
  ip: text("ip").notNull().default(""),
  success: boolean("success").notNull(),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  trusted: boolean("trusted").notNull().default(true),
  userAgent: text("user_agent").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const biteProgress = pgTable(
  "bite_progress",
  {
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    biteId: text("bite_id")
      .notNull()
      .references(() => bites.id, { onDelete: "cascade" }),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.profileId, table.biteId] })],
);

export const learnerCursors = pgTable("learner_cursors", {
  profileId: text("profile_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  subLessonId: text("sub_lesson_id").notNull(),
  biteId: text("bite_id"),
  mode: text("mode").notNull().default("learn"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quizAttempts = pgTable("quiz_attempts", {
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  subLessonId: text("sub_lesson_id")
    .notNull()
    .references(() => subLessons.id, { onDelete: "cascade" }),
  correctCount: integer("correct_count").notNull(),
  answeredCount: integer("answered_count").notNull(),
  totalCount: integer("total_count").notNull(),
  stoppedEarly: boolean("stopped_early").notNull().default(false),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull().defaultNow(),
});

export const styleDrafts = pgTable("style_drafts", {
  id: text("id").primaryKey(),
  tone: text("tone").notNull(),
  lengthGuide: text("length_guide").notNull(),
  readingLevel: text("reading_level").notNull(),
  analogyUse: text("analogy_use").notNull(),
  formatting: text("formatting").notNull(),
  temperature: text("temperature").notNull().default("0.4"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const styleVersions = pgTable("style_versions", {
  id: text("id").primaryKey(),
  number: integer("number").notNull(),
  tone: text("tone").notNull(),
  lengthGuide: text("length_guide").notNull(),
  readingLevel: text("reading_level").notNull(),
  analogyUse: text("analogy_use").notNull(),
  formatting: text("formatting").notNull(),
  temperature: text("temperature").notNull(),
  model: text("model").notNull(),
  provider: text("provider").notNull(),
  examples: jsonb("examples").$type<{ title: string; body: string }[]>().notNull(),
  lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
  lockedBy: text("locked_by"),
});

export const styleExamples = pgTable("style_examples", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  position: text("position").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const importDrafts = pgTable("import_drafts", {
  id: text("id").primaryKey(),
  sourceLabel: text("source_label").notNull(),
  blocks: jsonb("blocks").$type<unknown[]>().notNull(),
  mapping: jsonb("mapping").$type<Record<string, string>>().notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const generationJobs = pgTable("generation_jobs", {
  id: text("id").primaryKey(),
  subLessonId: text("sub_lesson_id")
    .notNull()
    .references(() => subLessons.id, { onDelete: "cascade" }),
  styleVersionId: text("style_version_id").notNull(),
  status: text("status").notNull(),
  stage: text("stage").notNull().default("bites"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error").notNull().default(""),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quizAnswers = pgTable("quiz_answers", {
  id: text("id").primaryKey(),
  attemptId: text("attempt_id")
    .notNull()
    .references(() => quizAttempts.id, { onDelete: "cascade" }),
  questionId: text("question_id").notNull(),
  selectedChoiceId: text("selected_choice_id"),
  correct: boolean("correct").notNull(),
});
