import path from "node:path";

export type ReleaseChannel = "stable" | "beta" | "alpha";
export type DesktopPlatform = "darwin" | "win32" | "linux";
export type UserDataUninstallPolicy = "retain_user_data";

export interface ReleaseIdentity {
  app_name: string;
  app_id: string;
  executable_name: string;
  data_dir_name: string;
  default_vault_dir_name: string;
}

export interface SigningRequirement {
  platform: "macos" | "windows";
  env_vars: string[];
  required_for_distribution: boolean;
}

export interface UpdateConfig {
  provider: "generic";
  channel: ReleaseChannel;
  url: string;
  url_env: string;
}

export interface ReleaseReadiness {
  identity: ReleaseIdentity;
  signing: SigningRequirement[];
  update: UpdateConfig;
  uninstall_policy: UserDataUninstallPolicy;
}

export const RELEASE_IDENTITY: ReleaseIdentity = {
  app_name: "AI Chat Knowledge",
  app_id: "com.villweb.aichatknowledge",
  executable_name: "AI Chat Knowledge",
  data_dir_name: "AI Chat Knowledge",
  default_vault_dir_name: "vault"
};

export const RELEASE_SIGNING_REQUIREMENTS: SigningRequirement[] = [
  {
    platform: "macos",
    env_vars: ["CSC_LINK", "CSC_KEY_PASSWORD", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"],
    required_for_distribution: true
  },
  {
    platform: "windows",
    env_vars: ["WIN_CSC_LINK", "WIN_CSC_KEY_PASSWORD"],
    required_for_distribution: true
  }
];

export const RELEASE_UPDATE_CONFIG: UpdateConfig = {
  provider: "generic",
  channel: "stable",
  url: "https://updates.villweb.com/ai-chat-knowledge-system",
  url_env: "AI_KB_UPDATE_URL"
};

export const RELEASE_UNINSTALL_POLICY: UserDataUninstallPolicy = "retain_user_data";

export function buildDefaultVaultRoot(appDataPath: string): string {
  return path.join(appDataPath, RELEASE_IDENTITY.default_vault_dir_name);
}

export function buildReleaseReadiness(): ReleaseReadiness {
  return {
    identity: RELEASE_IDENTITY,
    signing: RELEASE_SIGNING_REQUIREMENTS,
    update: RELEASE_UPDATE_CONFIG,
    uninstall_policy: RELEASE_UNINSTALL_POLICY
  };
}

export function isSupportedDesktopPlatform(platform: NodeJS.Platform): platform is DesktopPlatform {
  return platform === "darwin" || platform === "win32" || platform === "linux";
}
