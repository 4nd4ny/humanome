// humanome engine — providers: Anthropic Messages API adapter (cahier §5).
// DOM-free ESM module (ADR-001). Direct browser transport: the user's own key
// travels in the x-api-key header, and the CORS opt-in header
// anthropic-dangerous-direct-browser-access is required by Anthropic for
// browser-originated calls.

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
export const ANTHROPIC_VERSION = '2023-06-01'

export const anthropicAdapter = {
  defaultBaseUrl: ANTHROPIC_BASE_URL,
  requiresApiKey: true,

  buildRequest({ baseUrl, apiKey }, { model, system, prompt, maxTokens, temperature }) {
    const body = {
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    }
    if (system != null) body.system = system
    if (temperature !== undefined) body.temperature = temperature
    return {
      url: `${baseUrl}/v1/messages`,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body
    }
  },

  parseResponse(data, requestedModel) {
    const text = (data.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
    return {
      text,
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0
      },
      model: data.model ?? requestedModel
    }
  }
}
