import { LlmUnavailableError, type LlmProvider, type LlmRequest } from "@/lib/llm/types";

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

export class GeminiProvider implements LlmProvider {
  readonly id = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(input: LlmRequest): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    const callModel = async (includeFileUri: boolean) => {
      const userParts: Array<{ text: string } | { fileData: { fileUri: string; mimeType?: string } }> = [];
      if (includeFileUri && input.fileUri) {
        userParts.push({
          fileData: {
            fileUri: input.fileUri,
            ...(input.fileMimeType ? { mimeType: input.fileMimeType } : {}),
          },
        });
      }
      userParts.push({ text: input.user });
      return fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [{ role: "user", parts: userParts }],
          generationConfig: {
            temperature: input.temperature,
            responseMimeType: input.json === false ? "text/plain" : "application/json",
            thinkingConfig: { thinkingLevel: "low" },
          },
        }),
      });
    };
    let response: Response;
    try {
      response = await callModel(Boolean(input.fileUri));
      if (!response.ok && input.fileUri) {
        response = await callModel(false);
      }
    } catch {
      throw new LlmUnavailableError();
    }
    if (!response.ok) throw new LlmUnavailableError();
    const payload = (await response.json()) as GeminiResponse;
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    if (!text.trim()) throw new LlmUnavailableError();
    return text;
  }
}
