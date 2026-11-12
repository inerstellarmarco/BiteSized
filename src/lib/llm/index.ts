import { getLlmConfig } from "@/lib/llm/config";
import { completeWithFailover } from "@/lib/llm/failover";
import { GeminiProvider } from "@/lib/llm/gemini";
import { mockProvider } from "@/lib/llm/mock";
import { OpenAiCompatibleProvider } from "@/lib/llm/openai";
import type { LlmProvider } from "@/lib/llm/types";

export { LlmUnavailableError } from "@/lib/llm/types";
export type { LlmProvider, LlmRequest } from "@/lib/llm/types";

export type LlmClient = LlmProvider & {
  providerId: string;
  backupProviderId: string;
  model: string;
  backupModel: string;
  dailyCap: number;
  usingMock: boolean;
  backup: LlmProvider | null;
};

function backupProvider(id: string, apiKey: string, model: string, baseUrl: string): LlmProvider | null {
  if (!apiKey) return null;
  if (id === "gemini") return new GeminiProvider(apiKey, model);
  return new OpenAiCompatibleProvider(apiKey, model, baseUrl, id || "openai");
}

export function getLlmClient(): LlmClient {
  const config = getLlmConfig();
  const backup = backupProvider(
    config.backupProvider,
    config.backupApiKey,
    config.backupModel,
    process.env.LLM_BACKUP_BASE_URL ?? "https://api.openai.com/v1",
  );
  const useMock = config.provider === "mock" || config.apiKey.length === 0;
  const primary: LlmProvider = useMock ? mockProvider : new GeminiProvider(config.apiKey, config.model);
  return {
    id: primary.id,
    providerId: primary.id,
    backupProviderId: config.backupProvider,
    model: useMock ? "mock" : config.model,
    backupModel: config.backupModel,
    dailyCap: config.dailyRegenerateCapPerProfile,
    usingMock: useMock,
    backup,
    complete(input) {
      return completeWithFailover(primary, backup, input);
    },
  };
}

export const AI_UNAVAILABLE = "AI unavailable, try later";
