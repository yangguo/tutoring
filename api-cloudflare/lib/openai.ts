// OpenAI integration for Cloudflare Worker
export async function chatWithOpenAI(messages: any[], apiKey: string) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages,
    }),
  });
  if (!response.ok) throw new Error('OpenAI API error');
  return await response.json();
}
