import process from "node:process";
import { listSourceConnectorManifests } from "../app/connectors";

const enabled = new Set(getArgValue("--enabled")?.split(",").filter(Boolean) ?? []);

console.log(JSON.stringify(
  listSourceConnectorManifests().map((manifest) => ({
    ...manifest,
    enabled: enabled.size > 0 ? enabled.has(manifest.source_app) : manifest.default_enabled
  })),
  null,
  2
));

function getArgValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}
