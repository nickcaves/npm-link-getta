#!/usr/bin/env node
/**
 * Embeds data/albums-with-links.json into a JS file so the site can load it without fetch.
 * Run before serving (e.g. npm run site does this automatically).
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const INPUT = join(ROOT, "data", "albums-with-links.json");
const OUTPUT = join(ROOT, "data", "albums-data.js");

try {
  const json = readFileSync(INPUT, "utf8");
  const data = JSON.parse(json);
  mkdirSync(join(ROOT, "data"), { recursive: true });
  writeFileSync(
    OUTPUT,
    `window.ALBUMS_DATA = ${JSON.stringify(data)};\n`,
    "utf8"
  );
  console.log("Embedded albums into data/albums-data.js");
} catch (err) {
  console.error("embed-albums:", err.message);
  process.exit(1);
}
