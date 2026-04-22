#!/usr/bin/env node
// Bootstraps local dev config idempotently:
//   1. Copies .env.example -> .env if .env is missing.
//   2. Writes .secrets.local.cue with a JWT_SIGNING_SECRET of the form
//      `<32-byte hex>+<cute-name>+salt+camel` if the file is missing.
// Existing files are never overwritten, so `npm install` won't rotate the
// dev secret behind your back.

import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(here, "..");
const envPath = resolve(backendDir, ".env");
const envExamplePath = resolve(backendDir, ".env.example");
const secretsPath = resolve(backendDir, ".secrets.local.cue");

if (!existsSync(envPath) && existsSync(envExamplePath)) {
  copyFileSync(envExamplePath, envPath);
  console.log("[init-secret] copied .env.example -> .env");
}

if (existsSync(secretsPath)) {
  console.log("[init-secret] .secrets.local.cue already exists, skipping.");
  process.exit(0);
}

const cuteNames = [
  "mochi", "biscuit", "pickle", "muffin", "waffle", "pebble",
  "peanut", "nori", "sprout", "jellybean", "cupcake", "pumpkin",
  "noodle", "dumpling", "sushi", "nugget", "pancake", "bagel",
  "pretzel", "taco", "cookie", "marshmallow", "popsicle", "tater",
  "sprinkle", "snickerdoodle", "whiskers", "hopscotch", "clover",
  "poppy", "acorn", "pebbles", "butterbean", "gumdrop", "macaron",
];

const cuteName = cuteNames[Math.floor(Math.random() * cuteNames.length)];
const hex = randomBytes(32).toString("hex");
const secret = `${hex}_${cuteName}_camel`;

writeFileSync(secretsPath, `JWT_SIGNING_SECRET: "${secret}"\n`);
console.log(`[init-secret] wrote .secrets.local.cue (name: ${cuteName}).`);
