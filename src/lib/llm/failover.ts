import { LlmUnavailableError, type LlmProvider, type LlmRequest } from "@/lib/llm/types";

export async function completeWithFailover(primary: LlmProvider, backup: LlmProvider | null, input: LlmRequest): Promise<string> {
  try {
    return await primary.complete(input);
  } catch (error) {
    if (!backup) {
      throw error instanceof LlmUnavailableError ? error : new LlmUnavailableError();
    }
    try {
      return await backup.complete(input);
    } catch {
      throw new LlmUnavailableError();
    }
  }
}
