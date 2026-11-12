import { getLlmConfig } from "@/lib/llm/config";
import { GeminiProvider } from "@/lib/llm/gemini";
import { mockProvider } from "@/lib/llm/mock";
import { LlmUnavailableError, type LlmProvider } from "@/lib/llm/types";

export { LlmUnavailableError } from "@/lib/llm/types";
export type { LlmProvider, LlmRequest } from "@/lib/llm/types";

export type LlmClient = LlmProvider & {
  providerId: string;
  backupProviderId: string;
  model: string;
  backupModel: string;
  dailyCap: number;
  usingMock: boolean;
  /** Present for Phase 3 fallback. Phase 2 does not call it. */
  backup: LlmProvider | null;
};

function backupProvider(id: string, apiKey: string, model: string): LlmProvider | null {
  if (!apiKey) return null;
  if (id === "gemini") return new GeminiProvider(apiKey, model);
  return { id, complete: async () => { throw new LlmUnavailableError(); } };
}

export function getLlmClient(): LlmClient {
  const config = getLlmConfig();
  const backup = backupProvider(config.backupProvider, config.backupApiKey, config.backupModel);
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
    async complete(input) {
      try {
        return await primary.complete(input);
      } catch (error) {
        if (error instanceof LlmUnavailableError) throw error;
        throw new LlmUnavailableError();
      }
    },
  };
}

export const AI_UNAVAILABLE = "AI unavailable, try later";
