/**
 * Boundary for later AI features. Phase 1 never calls a model.
 *
 * Keys stay in server environment variables. Do not add NEXT_PUBLIC_ copies.
 * The daily regenerate cap defaults to 100 per profile and is configurable.
 */
export type LlmConfig = {
  provider: string;
  backupProvider: string;
  dailyRegenerateCapPerProfile: number;
  apiKey: string;
  backupApiKey: string;
};

export function getLlmConfig(): LlmConfig {
  const cap = Number(process.env.LLM_DAILY_REGENERATE_CAP ?? "100");
  return {
    provider: process.env.LLM_PROVIDER ?? "gemini",
    backupProvider: process.env.LLM_BACKUP_PROVIDER ?? "openai",
    dailyRegenerateCapPerProfile: Number.isFinite(cap) && cap > 0 ? cap : 100,
    apiKey: process.env.LLM_API_KEY ?? "",
    backupApiKey: process.env.LLM_BACKUP_API_KEY ?? "",
  };
}
