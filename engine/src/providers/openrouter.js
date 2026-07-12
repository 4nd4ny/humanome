// humanome engine — providers: OpenRouter adapter (cahier §5).
// OpenAI-compatible chat completions, base URL openrouter.ai/api.

import { createOpenAiCompatibleAdapter } from './openai.js'

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api'

export const openrouterAdapter = createOpenAiCompatibleAdapter(OPENROUTER_BASE_URL)
