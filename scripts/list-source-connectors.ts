import process from "node:process";
import { listSourceConnectorManifests } from "../app/connectors";

const argv = process.argv.slice(2);
const enabledArgIndex = argv.indexOf("--enabled");
const hasExplicitEnabledArg = enabledArgIndex !== -1;
const enabledApps = hasExplicitEnabledArg
  ? new Set((argv[enabledArgIndex + 1] ?? "").split(",").filter(Boolean))
  : new Set<string>();

console.log(JSON.stringify(
  listSourceConnectorManifests().map((manifest) => ({
    ...manifest,
    enabled: hasExplicitEnabledArg ? enabledApps.has(manifest.source_app) : manifest.default_enabled
  })),
  null,
  2
));
