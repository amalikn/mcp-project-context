#!/usr/bin/env node

import fs from "fs";
import path from "path";

const timestampKeyPattern = /(createdAt|updatedAt|lastAccessedAt|startTime|endTime|timestamp|completedAt)$/;
const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function pad(value, length = 2) {
  return String(value).padStart(length, "0");
}

function toLocalISOString(date) {
  const totalMinutes = -date.getTimezoneOffset();
  const sign = totalMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(totalMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}.${pad(date.getMilliseconds(), 3)}${sign}${pad(hours)}:${pad(minutes)}`;
}

function convertValue(value) {
  if (typeof value !== "string" || !isoPattern.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return toLocalISOString(parsed);
}

function visit(node, key = "") {
  let changed = 0;

  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index += 1) {
      const current = node[index];
      if (current && typeof current === "object") {
        changed += visit(current, key);
      } else if (timestampKeyPattern.test(key)) {
        const converted = convertValue(current);
        if (converted !== current) {
          node[index] = converted;
          changed += 1;
        }
      }
    }
    return changed;
  }

  if (!node || typeof node !== "object") {
    return changed;
  }

  for (const [childKey, childValue] of Object.entries(node)) {
    if (childValue && typeof childValue === "object") {
      changed += visit(childValue, childKey);
      continue;
    }

    if (!timestampKeyPattern.test(childKey)) {
      continue;
    }

    const converted = convertValue(childValue);
    if (converted !== childValue) {
      node[childKey] = converted;
      changed += 1;
    }
  }

  return changed;
}

function collectJsonFiles(rootDir) {
  const files = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function run(dataDir, dryRun = false) {
  if (!fs.existsSync(dataDir)) {
    console.error(`Data directory not found: ${dataDir}`);
    process.exitCode = 1;
    return;
  }

  const files = collectJsonFiles(dataDir);
  let convertedFiles = 0;
  let convertedValues = 0;

  for (const file of files) {
    const original = fs.readFileSync(file, "utf8");
    let parsed;

    try {
      parsed = JSON.parse(original);
    } catch {
      continue;
    }

    const changed = visit(parsed);
    if (changed > 0) {
      if (!dryRun) {
        fs.writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
      }
      convertedFiles += 1;
      convertedValues += changed;
    }
  }

  if (dryRun) {
    console.log(
      `[dry-run] Would convert ${convertedValues} timestamp values across ${convertedFiles} files in ${dataDir}`
    );
  } else {
    console.log(
      `Converted ${convertedValues} timestamp values across ${convertedFiles} files in ${dataDir}`
    );
  }
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const pathArg = args.find((arg) => !arg.startsWith("--"));
const dataDir = pathArg ? path.resolve(pathArg) : path.resolve(process.cwd(), "data");
run(dataDir, dryRun);
