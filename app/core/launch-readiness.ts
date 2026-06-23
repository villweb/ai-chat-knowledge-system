export type LaunchReadinessStatus = "ready" | "blocked";

export interface LaunchReadinessItem {
  item_id: string;
  title: string;
  status: LaunchReadinessStatus;
  evidence: string[];
  missing: string[];
}

export interface LaunchReadinessReport {
  schema_version: "launch_readiness_report.v1";
  status: LaunchReadinessStatus;
  ready_count: number;
  blocked_count: number;
  items: LaunchReadinessItem[];
}

export interface LaunchReadinessEnv {
  [key: string]: string | undefined;
}

const REQUIRED_ENV = {
  mac_signing: ["CSC_LINK", "CSC_KEY_PASSWORD", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"],
  windows_signing: ["WIN_CSC_LINK", "WIN_CSC_KEY_PASSWORD"],
  update_server: ["AI_KB_UPDATE_URL"],
  license_server: ["AI_KB_LICENSE_PUBLIC_KEY", "AI_KB_LICENSE_SERVER_URL"],
  payment_account: ["AI_KB_PAYMENT_URL", "AI_KB_ACCOUNT_URL"],
  feedback_support: ["AI_KB_FEEDBACK_URL", "AI_KB_SUPPORT_EMAIL"]
} as const;

export function buildLaunchReadinessReport(env: LaunchReadinessEnv = process.env): LaunchReadinessReport {
  const items: LaunchReadinessItem[] = [
    buildEnvItem("mac_signing", "macOS 签名和 notarization", REQUIRED_ENV.mac_signing, env),
    buildEnvItem("windows_signing", "Windows 代码签名", REQUIRED_ENV.windows_signing, env),
    buildUrlItem("update_server", "更新发布服务器", REQUIRED_ENV.update_server, env),
    buildUrlItem("license_server", "授权服务", REQUIRED_ENV.license_server, env),
    buildUrlItem("payment_account", "支付和账号服务", REQUIRED_ENV.payment_account, env),
    buildUrlItem("feedback_support", "反馈和支持入口", REQUIRED_ENV.feedback_support, env)
  ];
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  return {
    schema_version: "launch_readiness_report.v1",
    status: blockedCount > 0 ? "blocked" : "ready",
    ready_count: items.length - blockedCount,
    blocked_count: blockedCount,
    items
  };
}

function buildEnvItem(itemId: string, title: string, names: readonly string[], env: LaunchReadinessEnv): LaunchReadinessItem {
  const missing = names.filter((name) => !env[name]);
  return {
    item_id: itemId,
    title,
    status: missing.length === 0 ? "ready" : "blocked",
    evidence: names.filter((name) => env[name]).map((name) => `${name}=configured`),
    missing
  };
}

function buildUrlItem(itemId: string, title: string, names: readonly string[], env: LaunchReadinessEnv): LaunchReadinessItem {
  const missing = names.filter((name) => !env[name] || (name.endsWith("_URL") && !env[name]?.startsWith("https://")));
  return {
    item_id: itemId,
    title,
    status: missing.length === 0 ? "ready" : "blocked",
    evidence: names.filter((name) => env[name]).map((name) => `${name}=${redactValue(env[name] ?? "")}`),
    missing
  };
}

function redactValue(value: string): string {
  if (value.startsWith("https://")) {
    return value;
  }
  return "configured";
}
