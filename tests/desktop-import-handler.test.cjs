const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  assertImportSourceEnabled,
  buildImportDialogOptions,
  ensureEnabledConnectorsDefaults,
  hasEnabledArg,
  parseEnabledApps,
  resolveConnectorEnabled,
  resolveImportTargetSource
} = require("../app/desktop/desktop-import.cjs");

const sourceApps = ["codex", "cursor", "deepseek", "doubao", "workbuddy"];
const codexManifest = { source_app: "codex", default_enabled: true };
const cursorManifest = { source_app: "cursor", default_enabled: true };

test("desktop import: 显式传入空 --enabled 时全部视为停用", () => {
  const argv = ["node", "script", "--enabled", ""];
  assert.equal(hasEnabledArg(argv), true);
  assert.deepEqual(parseEnabledApps(argv), new Set());
  assert.equal(resolveConnectorEnabled(codexManifest, parseEnabledApps(argv), true), false);
  assert.equal(resolveConnectorEnabled(cursorManifest, parseEnabledApps(argv), true), false);
});

test("desktop import: 未传 --enabled 时回退 default_enabled", () => {
  const argv = ["node", "script"];
  assert.equal(hasEnabledArg(argv), false);
  assert.equal(parseEnabledApps(argv), null);
  assert.equal(resolveConnectorEnabled(codexManifest, new Set(), false), true);
});

test("desktop import: resolveImportTargetSource 优先请求来源", () => {
  assert.equal(resolveImportTargetSource("cursor", "codex"), "cursor");
  assert.equal(resolveImportTargetSource("", "codex"), "codex");
  assert.equal(resolveImportTargetSource("  ", "codex"), "codex");
});

test("desktop import: assertImportSourceEnabled 对停用来源抛错", () => {
  assert.throws(
    () => assertImportSourceEnabled("codex", { codex: false, cursor: true }),
    /连接器未启用/
  );
  assert.doesNotThrow(() => assertImportSourceEnabled("codex", { codex: true }));
});

test("desktop import: ensureEnabledConnectorsDefaults 在无启用来源时恢复默认", () => {
  const result = ensureEnabledConnectorsDefaults(
    { codex: false, cursor: false, deepseek: false, doubao: false, workbuddy: false },
    sourceApps,
    "codex"
  );
  assert.equal(result.enabledConnectors.codex, true);
  assert.equal(result.enabledConnectors.cursor, true);
  assert.equal(result.enabledConnectors.deepseek, true);
  assert.equal(result.sourceApp, "codex");
});

test("desktop import: buildImportDialogOptions 包含多选与扩展名过滤", () => {
  const options = buildImportDialogOptions();
  assert.ok(options.properties.includes("openFile"));
  assert.ok(options.properties.includes("multiSelections"));
  assert.ok(options.filters[0].extensions.includes("md"));
});
