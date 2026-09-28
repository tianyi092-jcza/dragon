#!/usr/bin/env node
/** Optional outbound Jev advisor for explicit, bounded development artifacts. */
import { readFile, realpath } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateJev } from "./jev/client.mjs";
import {
  buildAssessmentRequest,
  DEFAULT_MODEL,
  PROFILES,
  summarizeAssessment,
} from "./jev/profiles.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BLOCKED_PATH_PARTS = new Set([
  ".dragon-runtime",
  ".git",
  ".playwright-cli",
  ".dev.vars",
  "node_modules",
]);

function usage() {
  return `Usage:
  node tools/jev_assess.mjs <change|failure|reverse-triage> --input <file|-> [options]

Default behavior is a local preview: it prints the exact redacted request and does
not contact TypeSafe. A live request requires the explicit --send flag.

Options:
  --send           POST to TypeSafe instead of previewing the request
  --model <id>     Model id (default: ${DEFAULT_MODEL})
  --label <text>   Non-sensitive source label included in state
  --help           Show this help

Credentials:
  TYPESAFE_API_KEY is required for live requests.

Examples:
  node tools/jev_assess.mjs change --input review.txt
  node tools/jev_assess.mjs failure --input test.log --send
  node tools/jev_assess.mjs reverse-triage --input evidence-summary.txt --send
  git diff -- web/src/game/clock.js | node tools/jev_assess.mjs change --input - --send
`;
}

function parseArguments(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const profile = argv[0];
  if (!PROFILES[profile]) {
    throw new TypeError(
      "First argument must be the change, failure, or reverse-triage profile",
    );
  }
  const options = {
    profile,
    input: null,
    label: null,
    model: DEFAULT_MODEL,
    send: false,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--send") {
      options.send = true;
      continue;
    }
    if (["--input", "--label", "--model"].includes(argument)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new TypeError(`${argument} needs a value`);
      }
      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new TypeError(`Unknown argument: ${argument}`);
  }
  if (!options.input) throw new TypeError("--input <file|-> is required");
  return options;
}

function assertSafeInputPath(path) {
  const pathRelative = relative(repositoryRoot, path);
  if (
    pathRelative === "" ||
    pathRelative === ".." ||
    pathRelative.startsWith(`..${sep}`) ||
    resolve(repositoryRoot, pathRelative) !== path
  ) {
    throw new Error(
      "Input files must be inside this repository; pipe reviewed text through --input - for other sources",
    );
  }
  const parts = pathRelative.split(/[\\/]/);
  const lowerParts = parts.map((part) => part.toLowerCase());
  if (
    lowerParts.some((part) => BLOCKED_PATH_PARTS.has(part)) ||
    lowerParts.some((part) => part === "save.dat" || part === "save.json") ||
    lowerParts.some((part) => part === ".env" || part.startsWith(".env."))
  ) {
    throw new Error(`Refusing sensitive or private input path: ${pathRelative}`);
  }
}

async function readStandardInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function readInput(input) {
  if (input === "-") {
    if (process.stdin.isTTY) {
      throw new Error("--input - requires piped standard input");
    }
    return {
      text: await readStandardInput(),
      defaultLabel: "reviewed standard input",
    };
  }
  const path = await realpath(resolve(process.cwd(), input));
  assertSafeInputPath(path);
  return {
    text: await readFile(path, "utf8"),
    defaultLabel: relative(repositoryRoot, path).replaceAll("\\", "/"),
  };
}

export function typesafeCredential(environment) {
  if (!environment.TYPESAFE_API_KEY?.trim()) return null;
  return { key: environment.TYPESAFE_API_KEY, source: "TYPESAFE_API_KEY" };
}

export async function main(argv = process.argv.slice(2), environment = process.env) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const input = await readInput(options.input);
  const assessment = buildAssessmentRequest(options.profile, input.text, {
    model: options.model,
    sourceLabel: options.label ?? input.defaultLabel,
  });
  if (!options.send) {
    process.stdout.write(
      `${JSON.stringify(
        {
          mode: "preview-no-network",
          metadata: assessment.metadata,
          request: assessment.request,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const selectedCredential = typesafeCredential(environment);
  if (!selectedCredential) {
    throw new Error("Live Jev requests need TYPESAFE_API_KEY");
  }
  const response = await evaluateJev(assessment.request, {
    apiKey: selectedCredential.key,
  });
  const result = summarizeAssessment(
    options.profile,
    response,
    assessment.metadata,
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.stderr.write(
    `Jev advisory completed with ${response.model}; credential source: ${selectedCredential.source}.\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`jev_assess: ${error.message}\n`);
    process.exitCode = 1;
  });
}
