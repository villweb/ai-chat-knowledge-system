import process from "node:process";
import { rebuildLocalIndexes } from "../app/core";

const summary = await rebuildLocalIndexes({
  vault_root: process.cwd()
});

console.log(JSON.stringify(summary, null, 2));
