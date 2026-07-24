import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function javascriptFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await javascriptFiles(absolute));
    else if (entry.name.endsWith(".js")) files.push(absolute);
  }
  return files;
}

test("every API and model action module can be loaded by Node ESM", async () => {
  const files = await javascriptFiles(path.join(projectRoot, "api"));
  const failures = [];

  for (const file of files) {
    try {
      await import(pathToFileURL(file));
    } catch (error) {
      failures.push({
        file: path.relative(projectRoot, file),
        type: error?.name || "Error",
      });
    }
  }

  assert.deepEqual(failures, []);
  assert.equal(files.length > 100, true);
});
