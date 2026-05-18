import dotenv from 'dotenv';

dotenv.config();

const aiProvider = (process.env.AI_PROVIDER || 'deepseek').toLowerCase();

const providerDefaults = {
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    chatModel: process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat',
    reasoningModel: process.env.DEEPSEEK_REASONING_MODEL || 'deepseek-reasoner',
  },
  zhipu: {
    apiKey: process.env.ZHIPU_API_KEY || '',
    baseUrl: process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/',
    chatModel: process.env.ZHIPU_CHAT_MODEL || 'glm-4.5',
    reasoningModel: process.env.ZHIPU_REASONING_MODEL || 'glm-4.5',
  },
} as const;

const activeProvider =
  aiProvider in providerDefaults
    ? (aiProvider as keyof typeof providerDefaults)
    : 'deepseek';

export const config = {
  aiProvider: activeProvider,
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  zhipuApiKey: process.env.ZHIPU_API_KEY || '',
  zhipuBaseUrl: process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/',
  aiApiKey: providerDefaults[activeProvider].apiKey,
  aiBaseUrl: providerDefaults[activeProvider].baseUrl,
  aiChatModel: process.env.AI_CHAT_MODEL || providerDefaults[activeProvider].chatModel,
  aiReasoningModel:
    process.env.AI_REASONING_MODEL || providerDefaults[activeProvider].reasoningModel,
};
