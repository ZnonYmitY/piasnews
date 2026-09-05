#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DISTILLATION_PACKAGE_ID,
  DISTILLATION_PACKAGE_VERSION,
  DISTILLATION_SOURCE_HASH,
} from "../worker/src/persona-runtime.generated.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoDir = resolve(scriptDir, "..");
const lockPath = resolve(repoDir, "worker", "companion-runtime.lock.json");
const artifactPath = resolve(repoDir, "worker", "src", "persona-runtime.generated.js");
const lock = JSON.parse(await readFile(lockPath, "utf8"));
const artifact = await readFile(artifactPath);
const artifactHash = createHash("sha256").update(artifact).digest("hex");

const checks = [
  [DISTILLATION_PACKAGE_ID, lock.package_id, "package id"],
  [DISTILLATION_PACKAGE_VERSION, lock.package_version, "package version"],
  [DISTILLATION_SOURCE_HASH, lock.source_hash, "source hash"],
  [artifactHash, lock.artifact_sha256, "artifact checksum"],
];

for (const [actual, expected, label] of checks) {
  if (actual !== expected) {
    throw new Error(`Companion runtime ${label} mismatch: ${actual} != ${expected}`);
  }
}

console.log(
  `verified ${lock.package_id} ${lock.package_version} from ${lock.source_ref} (${lock.source_hash.slice(0, 16)})`,
);
