// humanome engine — providers: Ollama local adapter (cahier §5).
// DOM-free ESM module (ADR-001). Local /api/chat endpoint, no API key.

export const OLLAMA_BASE_URL = 'http://localhost:11434'

export const ollamaAdapter = {
  defaultBaseUrl: OLLAMA_BASE_URL,
  requiresApiKey: false,

  buildRequest({ baseUrl }, { model, system, prompt, maxTokens, temperature }) {
    const messages = []
    if (system != null) messages.push({ role: 'system', content: system })
    messages.push({ role: 'user', content: prompt })
    const options = { num_predict: maxTokens }
    if (temperature !== undefined) options.temperature = temperature
    return {
      url: `${baseUrl}/api/chat`,
      headers: {},
      body: { model, messages, stream: false, options }
    }
  },

  parseResponse(data, requestedModel) {
    return {
      text: data.message?.content ?? '',
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0
      },
      model: data.model ?? requestedModel
    }
  }
}
