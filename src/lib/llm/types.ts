export class LlmUnavailableError extends Error {
  readonly code = "unavailable";

  constructor(message = "AI unavailable, try later") {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

export type LlmRequest = {
  system: string;
  user: string;
  temperature: number;
  json?: boolean;
};

export interface LlmProvider {
  id: string;
  complete(input: LlmRequest): Promise<string>;
}
