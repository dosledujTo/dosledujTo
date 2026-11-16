// Vitest has no `--env-file`, and the configuration is validated at import
// time, so `.env` has to be in `process.env` before anything from `shared` is
// loaded. Setup files run before the test module graph is imported.

import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    if (process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

process.env.NODE_ENV = "test";
// Tests assert on responses, not on logs; a passing run should be quiet.
process.env.LOG_LEVEL = "silent";
