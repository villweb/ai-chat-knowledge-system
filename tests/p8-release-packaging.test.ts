import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import YAML from "yaml";
import {
  RELEASE_IDENTITY,
  RELEASE_SIGNING_REQUIREMENTS,
  RELEASE_UNINSTALL_POLICY,
  buildDefaultVaultRoot,
  buildReleaseReadiness
} from "../app/core";

test("P8 release identity and default vault path are stable", () => {
  const appDataPath = path.join(os.tmpdir(), "AI Chat Knowledge");
  const readiness = buildReleaseReadiness();

  assert.equal(readiness.identity.app_name, "AI Chat Knowledge");
  assert.equal(readiness.identity.app_id, "com.villweb.aichatknowledge");
  assert.equal(buildDefaultVaultRoot(appDataPath), path.join(appDataPath, "vault"));
  assert.equal(RELEASE_UNINSTALL_POLICY, "retain_user_data");
});

test("P8 package scripts expose macOS and Windows distributable builds", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    main: string;
    productName: string;
    author: string;
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  assert.equal(packageJson.main, "app/desktop/main.cjs");
  assert.equal(packageJson.productName, RELEASE_IDENTITY.app_name);
  assert.equal(packageJson.author, "Villweb");
  assert.match(packageJson.scripts["desktop:dist:mac"] ?? "", /package-desktop\.ts --mac/);
  assert.match(packageJson.scripts["desktop:dist:win"] ?? "", /package-desktop\.ts --win/);
  assert.match(packageJson.scripts["desktop:pack"] ?? "", /package-desktop\.ts --dir/);
  assert.equal("tsx" in packageJson.dependencies, true);
  assert.equal("tsx" in packageJson.devDependencies, false);
});

test("P8 electron-builder config keeps app resources and user data boundaries", async () => {
  const config = YAML.parse(await readFile("electron-builder.yml", "utf8")) as {
    appId: string;
    productName: string;
    asar: boolean;
    asarUnpack: string[];
    files: string[];
    mac: { icon: string; target: string[]; hardenedRuntime: boolean };
    win: { icon: string; target: string[] };
    nsis: { artifactName: string; deleteAppDataOnUninstall: boolean };
    portable: { artifactName: string };
    publish: { provider: string; url: string; channel: string };
  };

  assert.equal(config.appId, RELEASE_IDENTITY.app_id);
  assert.equal(config.productName, RELEASE_IDENTITY.app_name);
  assert.equal(config.asar, true);
  assert.equal(config.asarUnpack.includes("package.json"), true);
  assert.equal(config.asarUnpack.includes("node_modules/better-sqlite3/**/*"), true);
  assert.equal(config.asarUnpack.includes("node_modules/@esbuild/**/*"), true);
  assert.equal(config.asarUnpack.includes("node_modules/yaml/**/*"), true);
  assert.equal(config.files.includes("!spec/**/*"), true);
  assert.equal(config.files.includes("!data/**/*"), true);
  assert.deepEqual(config.mac.target, ["dmg", "zip"]);
  assert.equal(config.mac.icon, "resources/icons/icon.icns");
  assert.equal(config.mac.hardenedRuntime, true);
  assert.equal(config.win.icon, "resources/icons/icon.ico");
  assert.equal(config.win.target.includes("nsis"), true);
  assert.match(config.nsis.artifactName, /setup/);
  assert.match(config.portable.artifactName, /portable/);
  assert.equal(config.nsis.deleteAppDataOnUninstall, false);
  assert.equal(config.publish.provider, "generic");
  assert.equal(config.publish.url, "https://updates.villweb.com/ai-chat-knowledge-system");
  assert.equal(config.publish.channel, "stable");
});

test("P8 signing requirements are declared for release distribution", () => {
  const platforms = RELEASE_SIGNING_REQUIREMENTS.map((item) => item.platform).sort();
  const mac = RELEASE_SIGNING_REQUIREMENTS.find((item) => item.platform === "macos");
  const win = RELEASE_SIGNING_REQUIREMENTS.find((item) => item.platform === "windows");

  assert.deepEqual(platforms, ["macos", "windows"]);
  assert.equal(mac?.required_for_distribution, true);
  assert.equal(win?.required_for_distribution, true);
  assert.equal(mac?.env_vars.includes("APPLE_TEAM_ID"), true);
  assert.equal(win?.env_vars.includes("WIN_CSC_LINK"), true);
});

test("P8 release workflow builds native installers on target operating systems", async () => {
  const workflow = YAML.parse(await readFile(".github/workflows/release-build.yml", "utf8")) as {
    jobs: { build: { strategy: { matrix: { include: Array<{ platform: string; os: string; script: string }> } } } };
  };
  const matrix = workflow.jobs.build.strategy.matrix.include;

  assert.equal(matrix.some((item) => item.platform === "macos" && item.os === "macos-latest" && item.script === "desktop:dist:mac"), true);
  assert.equal(matrix.some((item) => item.platform === "windows" && item.os === "windows-latest" && item.script === "desktop:dist:win"), true);
});
