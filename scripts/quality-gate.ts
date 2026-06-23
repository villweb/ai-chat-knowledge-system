import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runQualityGate } from "../app/core";

const { projectRoot, output } = parseArgs(process.argv.slice(2));
const report = await runQualityGate(projectRoot);
const content = `${JSON.stringify(report, null, 2)}\n`;

if (output) {
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, content, "utf8");
}

console.log(content);

if (report.status === "failed") {
  process.exit(1);
}

function parseArgs(args: string[]): { projectRoot: string; output?: string } {
  const parsed: { projectRoot: string; output?: string } = {
    projectRoot: readOption(args, "--project-root") ?? process.cwd()
  };
  const output = readOption(args, "--output");
  if (output) {
    parsed.output = output;
  }
  return parsed;
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}
