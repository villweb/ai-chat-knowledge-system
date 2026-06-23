import path from "node:path";
import type { VaultRelativePath } from "../schemas";

export function resolveVaultPath(vaultRoot: string, vaultRelativePath: VaultRelativePath): string {
  const resolved = path.resolve(vaultRoot, vaultRelativePath);
  const root = path.resolve(vaultRoot);

  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Path escapes vault root: ${vaultRelativePath}`);
  }

  return resolved;
}

export function toVaultRelativePath(vaultRoot: string, absolutePath: string): VaultRelativePath {
  return path.relative(vaultRoot, absolutePath).split(path.sep).join("/");
}
