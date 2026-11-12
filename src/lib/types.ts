export const QUESTION_TYPES = ["multiple_choice", "true_false", "predict_output"] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export type Choice = {
  id: string;
  text: string;
};

export type Toolkit = {
  handsOnProjects: string[];
  toolsAndFrameworks: string[];
  learningOutcomes: string[];
};

export type CrossLink = {
  targetCode: string;
  label: string;
};

export type FontSize = "sm" | "md" | "lg";
export type ThemePreference = "light" | "dark" | "system";

export const MAX_PROFILES = 3;
export const PIN_FAILS_BEFORE_LOCK = 5;
export const PIN_LOCK_MS = 15 * 60 * 1000;
export const PIN_WINDOW_MS = 15 * 60 * 1000;
export const PIN_PROFILE_ATTEMPT_LIMIT = 8;
export const PIN_IP_ATTEMPT_LIMIT = 20;
export const TRUSTED_SESSION_DAYS = 90;
export const SHORT_SESSION_HOURS = 12;

export const PACKAGE_FORMAT = "bite-sized.package";
export const PACKAGE_VERSION = 1;
