// humanome engine — providers: xAI (Grok) adapter (cahier §5).
// OpenAI-compatible chat completions, base URL api.x.ai.

import { createOpenAiCompatibleAdapter } from './openai.js'

export const XAI_BASE_URL = 'https://api.x.ai'

export const xaiAdapter = createOpenAiCompatibleAdapter(XAI_BASE_URL)
