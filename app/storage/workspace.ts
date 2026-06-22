import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { VaultRelativePath } from "../schemas";
import type { WorkspacePaths } from "./storage-provider";

const REQUIRED_RELATIVE_DIRS: VaultRelativePath[] = [
  "raw/imports",
  "data/normalized",
  "data/daily_runs",
  "knowledge/inbox",
  "knowledge/approved",
  "knowledge/rejected",
  "knowledge/merged",
  "logs"
];

export async function ensureWorkspaceDirectories(paths: WorkspacePaths): Promise<void> {
  await Promise.all([
    ...REQUIRED_RELATIVE_DIRS.map((dir) => mkdir(resolveVaultPath(paths.vault_root, dir), { recursive: true })),
    mkdir(path.dirname(resolveVaultPath(paths.vault_root, paths.sqlite_path)), { recursive: true }),
    mkdir(resolveVaultPath(paths.vault_root, paths.raw_imports_dir), { recursive: true }),
    mkdir(resolveVaultPath(paths.vault_root, paths.knowledge_dir), { recursive: true }),
    mkdir(resolveVaultPath(paths.vault_root, paths.logs_dir), { recursive: true })
  ]);
}

function resolveVaultPath(vaultRoot: string, vaultRelativePath: VaultRelativePath): string {
  const resolved = path.resolve(vaultRoot, vaultRelativePath);
  const root = path.resolve(vaultRoot);

  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Path escapes vault root: ${vaultRelativePath}`);
  }

  return resolved;
}
