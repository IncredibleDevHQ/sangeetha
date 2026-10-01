import { it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
it("finalizes audio using the development Node/tsx runtime outside the Vitest module loader", async () => {
  const result = await promisify(execFile)(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "scripts/audio-runtime-check.ts"],
    { timeout: 30000 },
  );
  expect(result.stdout).toContain("audio finalization passed");
}, 40000);
