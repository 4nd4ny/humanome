// humanome engine — providers: OpenAI chat-completions adapter (cahier §5).
// DOM-free ESM module (ADR-001). Also the shared shape for the OpenAI-compatible
// providers (xAI, OpenRouter) which differ only by base URL.

export const OPENAI_BASE_URL = 'https://api.openai.com'

/** Build an adapter for any OpenAI-compatible chat-completions endpoint. */
export function createOpenAiCompatibleAdapter(defaultBaseUrl) {
  return {
    defaultBaseUrl,
    requiresApiKey: true,

    buildRequest({ baseUrl, apiKey }, { model, system, prompt, maxTokens, temperature }) {
      const messages = []
      if (system != null) messages.push({ role: 'system', content: system })
      messages.push({ role: 'user', content: prompt })
      const body = { model, messages, max_tokens: maxTokens }
      if (temperature !== undefined) body.temperature = temperature
      return {
        url: `${baseUrl}/v1/chat/completions`,
        headers: { authorization: `Bearer ${apiKey}` },
        body
      }
    },

    parseResponse(data, requestedModel) {
      return {
        text: data.choices?.[0]?.message?.content ?? '',
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0
        },
        model: data.model ?? requestedModel
      }
    }
  }
}

export const openaiAdapter = createOpenAiCompatibleAdapter(OPENAI_BASE_URL)
