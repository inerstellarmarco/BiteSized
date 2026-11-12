import { LlmUnavailableError, type LlmProvider, type LlmRequest } from "@/lib/llm/types";

type ChatResponse = { choices?: { message?: { content?: string } }[] };

/** Any provider that speaks the OpenAI chat completions API. */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly id: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl: string,
    id = "openai",
  ) {
    this.id = id;
  }

  async complete(input: LlmRequest): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: input.temperature,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user },
          ],
          response_format: input.json === false ? undefined : { type: "json_object" },
        }),
      });
    } catch {
      throw new LlmUnavailableError();
    }
    if (!response.ok) throw new LlmUnavailableError();
    const payload = (await response.json()) as ChatResponse;
    const text = payload.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new LlmUnavailableError();
    return text;
  }
}
