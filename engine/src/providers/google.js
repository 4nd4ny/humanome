// humanome engine — providers: Google Gemini generateContent adapter (cahier §5).
// DOM-free ESM module (ADR-001). The API key travels in the x-goog-api-key
// header — never as a ?key= URL parameter (P5: no key in URLs/logs).

export const GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com'

export const googleAdapter = {
  defaultBaseUrl: GOOGLE_BASE_URL,
  requiresApiKey: true,

  buildRequest({ baseUrl, apiKey }, { model, system, prompt, maxTokens, temperature }) {
    const generationConfig = { maxOutputTokens: maxTokens }
    if (temperature !== undefined) generationConfig.temperature = temperature
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig
    }
    if (system != null) body.systemInstruction = { parts: [{ text: system }] }
    return {
      url: `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { 'x-goog-api-key': apiKey },
      body
    }
  },

  parseResponse(data, requestedModel) {
    const parts = data.candidates?.[0]?.content?.parts ?? []
    return {
      text: parts.map((part) => part.text ?? '').join(''),
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0
      },
      model: data.modelVersion ?? requestedModel
    }
  }
}
