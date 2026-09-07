export interface AIProviderConfig {
  apiKey: string;
  model: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  content: string;
  metadata?: any;
}

export abstract class BaseAIProvider {
  protected config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  abstract chat(messages: ChatMessage[]): Promise<AIResponse>;

  abstract streamChat(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
  ): Promise<AIResponse>;
}