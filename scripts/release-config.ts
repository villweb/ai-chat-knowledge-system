import { buildReleaseReadiness } from "../app/core";

const readiness = buildReleaseReadiness();

assert(readiness.identity.app_name === "AI Chat Knowledge", "应用名称必须固定。");
assert(readiness.identity.app_id === "com.villweb.aichatknowledge", "应用包名必须固定。");
assert(readiness.identity.default_vault_dir_name === "vault", "默认 vault 目录必须固定。");
assert(readiness.uninstall_policy === "retain_user_data", "卸载策略必须默认保留用户数据。");
assert(readiness.signing.length === 2, "必须声明 macOS 和 Windows 签名要求。");
assert(readiness.update.provider === "generic", "自动更新 provider 必须固定。");
assert(readiness.update.url.startsWith("https://"), "自动更新地址必须使用 HTTPS。");

console.log(JSON.stringify(readiness, null, 2));

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
