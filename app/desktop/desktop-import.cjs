const DEFAULT_ENABLED_SOURCE_APPS = ["codex", "cursor", "deepseek"];

function hasEnabledArg(argv) {
  return argv.includes("--enabled");
}

function parseEnabledApps(argv) {
  const index = argv.indexOf("--enabled");
  if (index === -1) {
    return null;
  }

  const raw = argv[index + 1] ?? "";
  return new Set(raw.split(",").filter(Boolean));
}

function resolveConnectorEnabled(manifest, enabledApps, explicitEnabledArg) {
  if (!explicitEnabledArg) {
    return manifest.default_enabled;
  }

  return enabledApps.has(manifest.source_app);
}

function resolveImportTargetSource(requestedSource, stateSourceApp) {
  const requested = typeof requestedSource === "string" ? requestedSource.trim() : "";
  if (requested) {
    return requested;
  }
  return (stateSourceApp || "").trim();
}

function assertImportSourceEnabled(sourceApp, enabledConnectors) {
  if (!enabledConnectors[sourceApp]) {
    throw new Error(`连接器未启用，无法读取来源：${sourceApp}`);
  }
}

function buildImportDialogOptions() {
  return {
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "AI chat exports", extensions: ["md", "markdown", "txt", "json"] }]
  };
}

function ensureEnabledConnectorsDefaults(enabledConnectors, sourceApps, stateSourceApp) {
  const nextEnabled = { ...enabledConnectors };
  const hasEnabled = sourceApps.some((sourceApp) => nextEnabled[sourceApp]);
  if (!hasEnabled) {
    for (const sourceApp of DEFAULT_ENABLED_SOURCE_APPS) {
      if (sourceApps.includes(sourceApp)) {
        nextEnabled[sourceApp] = true;
      }
    }
  }

  let nextSourceApp = stateSourceApp;
  if (!nextEnabled[nextSourceApp]) {
    nextSourceApp = sourceApps.find((sourceApp) => nextEnabled[sourceApp]) ?? DEFAULT_ENABLED_SOURCE_APPS[0] ?? "codex";
  }

  return {
    enabledConnectors: nextEnabled,
    sourceApp: nextSourceApp
  };
}

module.exports = {
  DEFAULT_ENABLED_SOURCE_APPS,
  hasEnabledArg,
  parseEnabledApps,
  resolveConnectorEnabled,
  resolveImportTargetSource,
  assertImportSourceEnabled,
  buildImportDialogOptions,
  ensureEnabledConnectorsDefaults
};
