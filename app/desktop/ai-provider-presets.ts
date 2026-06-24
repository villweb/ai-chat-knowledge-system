/** OpenAI 兼容 API 服务商预设 */
export type AiProviderPresetId =
  | "fixture"
  | "deepseek"
  | "openai"
  | "moonshot"
  | "zhipu"
  | "qwen"
  | "siliconflow"
  | "custom";

export interface AiProviderPreset {
  id: AiProviderPresetId;
  label: string;
  baseUrl?: string;
  defaultModel?: string;
  aiProvider: "fixture" | "openai-compatible";
}

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: "fixture",
    label: "本地测试模式（不调用 API）",
    aiProvider: "fixture"
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    aiProvider: "openai-compatible"
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    aiProvider: "openai-compatible"
  },
  {
    id: "moonshot",
    label: "月之暗面（Moonshot）",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-8k",
    aiProvider: "openai-compatible"
  },
  {
    id: "zhipu",
    label: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
    aiProvider: "openai-compatible"
  },
  {
    id: "qwen",
    label: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    aiProvider: "openai-compatible"
  },
  {
    id: "siliconflow",
    label: "SiliconFlow",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "deepseek-ai/DeepSeek-V3",
    aiProvider: "openai-compatible"
  },
  {
    id: "custom",
    label: "自定义（手动填写）",
    aiProvider: "openai-compatible"
  }
];

export function normalizeBaseUrl(url?: string): string {
  return (url ?? "").trim().replace(/\/+$/, "");
}

export function findPresetById(id: string): AiProviderPreset | undefined {
  return AI_PROVIDER_PRESETS.find((preset) => preset.id === id);
}

/** 根据已保存配置推断当前应选中的服务商预设 */
export function resolvePresetId(
  aiProvider: string,
  baseUrl?: string,
  savedPreset?: string
): AiProviderPresetId {
  if (savedPreset && findPresetById(savedPreset)) {
    return savedPreset as AiProviderPresetId;
  }
  if (aiProvider === "fixture") {
    return "fixture";
  }
  const normalized = normalizeBaseUrl(baseUrl);
  const matched = AI_PROVIDER_PRESETS.find(
    (preset) => preset.baseUrl && normalizeBaseUrl(preset.baseUrl) === normalized
  );
  return matched?.id ?? "custom";
}
