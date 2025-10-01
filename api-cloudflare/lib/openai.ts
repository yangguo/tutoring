type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

interface ChatCompletionOptions {
  messages: ChatMessage[];
  apiKey: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export async function createChatCompletion({
  messages,
  apiKey,
  baseUrl = 'https://api.openai.com/v1',
  model = 'gpt-3.5-turbo',
  temperature = 0.7,
  maxTokens = 500,
}: ChatCompletionOptions): Promise<any> {
  const url = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
  }

  return await response.json();
}
