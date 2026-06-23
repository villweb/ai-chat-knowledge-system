import { spawn } from "node:child_process";

class CommandError extends Error {
  constructor(readonly code: number) {
    super(`Command failed with exit code ${code}`);
  }
}

const target = process.argv[2] ?? "--dir";

let buildStatus = 0;
try {
  await run("npm", ["run", "desktop:build"]);
  await run("electron-builder", [target]);
} catch (error) {
  buildStatus = error instanceof CommandError ? error.code : 1;
} finally {
  await run("npm", ["run", "sqlite:rebuild"]);
}

process.exit(buildStatus);

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32" });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new CommandError(code ?? 1));
      }
    });
  });
}
