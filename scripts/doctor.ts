import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

try {
  require("better-sqlite3");
  console.log("doctor: better-sqlite3 native module is compatible.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("doctor: better-sqlite3 native module is not compatible with the current Node.js runtime.");
  console.error(message);
  console.error("Run: npm run sqlite:rebuild");
  process.exit(1);
}
