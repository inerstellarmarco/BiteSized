/**
 * Server-only model settings. Never read these from NEXT_PUBLIC_ variables.
 * Phase 3 will use the backup provider and the daily cap. Both stay in this
 * config so that work does not need a new shape.
 */
export type LlmConfig = {
  provider: string;
  backupProvider: string;
  model: string;
  backupModel: string;
  dailyRegenerateCapPerProfile: number;
  apiKey: string;
  backupApiKey: string;
  temperature: number;
};

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export function getLlmConfig(): LlmConfig {
  const cap = Number(process.env.LLM_DAILY_REGENERATE_CAP ?? "100");
  const temperature = Number(process.env.LLM_TEMPERATURE ?? "0.4");
  return {
    provider: process.env.LLM_PROVIDER ?? "gemini",
    backupProvider: process.env.LLM_BACKUP_PROVIDER ?? "openai",
    model: process.env.GEMINI_MODEL ?? process.env.LLM_MODEL ?? DEFAULT_GEMINI_MODEL,
    backupModel: process.env.LLM_BACKUP_MODEL ?? "gpt-4.1-mini",
    dailyRegenerateCapPerProfile: Number.isFinite(cap) && cap > 0 ? cap : 100,
    apiKey: process.env.GEMINI_API_KEY ?? process.env.LLM_API_KEY ?? "",
    backupApiKey: process.env.LLM_BACKUP_API_KEY ?? "",
    temperature: Number.isFinite(temperature) ? temperature : 0.4,
  };
}
