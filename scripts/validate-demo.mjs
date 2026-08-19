#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  core: "blueprints/lead-intake-core-v2.blueprint.json",
  adapter: "blueprints/crm-adapter-google-sheets-v2.blueprint.json",
  contract: "contract/leadflow.crm-adapter.v2.json",
  sampleLeads: "examples/sample-leads.json",
  expectedOutcomes: "examples/expected-outcomes.json",
  crmTemplate: "examples/crm-lite-template.csv",
};

const failures = [];
const pass = (message) => process.stdout.write(`PASS  ${message}\n`);
const fail = (message) => failures.push(message);
const assert = (condition, message) => (condition ? pass(message) : fail(message));

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(relativePath) {
  try {
    return JSON.parse(readText(relativePath));
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error.message}`);
    return null;
  }
}

function walkModules(flow, modules = []) {
  for (const module of flow ?? []) {
    modules.push(module);
    for (const route of module.routes ?? []) walkModules(route.flow, modules);
    walkModules(module.onerror, modules);
  }
  return modules;
}

function collectStrings(value, strings = []) {
  if (typeof value === "string") strings.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, strings));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectStrings(item, strings));
  }
  return strings;
}

function hasModule(modules, type) {
  return modules.some((module) => module.module === type);
}

for (const relativePath of Object.values(files)) {
  assert(fs.existsSync(path.join(root, relativePath)), `${relativePath} exists`);
}

const core = readJson(files.core);
const adapter = readJson(files.adapter);
const contract = readJson(files.contract);
const samples = readJson(files.sampleLeads);
const outcomes = readJson(files.expectedOutcomes);

if (core && adapter && contract && samples && outcomes) {
  const coreModules = walkModules(core.flow);
  const adapterModules = walkModules(adapter.flow);
  const coreTypes = coreModules.map((module) => module.module);
  const adapterTypes = adapterModules.map((module) => module.module);
  const coreText = JSON.stringify(core);
  const adapterText = JSON.stringify(adapter);

  assert(coreModules.length === 26, "Core contains the expected 26 modules");
  assert(adapterModules.length === 20, "Adapter contains the expected 20 modules");
  assert(hasModule(coreModules, "scenario-service:CallSubscenario"), "Core calls one CRM adapter subscenario");
  assert(coreTypes.filter((type) => type === "scenario-service:CallSubscenario").length === 1, "Core contains exactly one adapter call");
  assert(hasModule(coreModules, "datastore:ExistRecord"), "Core checks the request ledger");
  assert(hasModule(coreModules, "datastore:AddRecord"), "Core claims new requests in the ledger");
  assert(hasModule(coreModules, "datastore:UpdateRecord"), "Core completes confirmed ledger results");

  const forbiddenCorePrefixes = ["google-sheets:", "gmail:", "google-email:", "http:", "gateway:"];
  assert(
    !coreTypes.some((type) => forbiddenCorePrefixes.some((prefix) => type.startsWith(prefix))),
    "Core contains no CRM, email, HTTP, or webhook module",
  );

  assert(adapterTypes.filter((type) => type === "google-sheets:filterRows").length === 2, "Adapter contains two duplicate lookups");
  assert(adapterTypes.filter((type) => type === "google-sheets:addRow").length === 1, "Adapter contains one create-row operation");
  assert(!adapterTypes.some((type) => type.startsWith("datastore:") || type.startsWith("google-email:")), "Adapter contains no ledger or notification module");

  const dataStoreBindings = coreModules
    .filter((module) => module.module.startsWith("datastore:"))
    .map((module) => module.parameters?.datastore);
  assert(dataStoreBindings.length > 0 && dataStoreBindings.every((value) => value === 0), "Core Data Store bindings are intentionally empty");

  const adapterCall = coreModules.find((module) => module.module === "scenario-service:CallSubscenario");
  assert(adapterCall?.parameters?.scenario === 0, "Core adapter scenario binding is intentionally empty");

  const sheetModules = adapterModules.filter((module) => module.module.startsWith("google-sheets:"));
  assert(sheetModules.every((module) => !module.parameters?.__IMTCONN__), "Google Sheets connection bindings are absent");

  assert(coreText.includes("__CONFIGURE_CLIENT_KEY__"), "Core requires a fixed client key");
  assert(coreText.includes("__CONFIGURE_ENVIRONMENT__"), "Core requires a fixed environment");
  assert(adapterText.includes("__CONFIGURE_CLIENT_KEY__"), "Adapter requires a fixed client key");
  assert(adapterText.includes("__CONFIGURE_ENVIRONMENT__"), "Adapter requires a fixed environment");
  assert(adapterText.includes("__BIND_CLIENT_SPREADSHEET_ID__"), "Adapter requires a client spreadsheet binding");

  const contractInputs = contract.core_input_spec?.map((field) => field.name);
  const blueprintInputs = core.io?.input_spec?.map((field) => field.name);
  assert(JSON.stringify(contractInputs) === JSON.stringify(blueprintInputs), "Core input interface matches the public contract");

  const contractOutputs = contract.core_output_spec?.map((field) => field.name);
  const blueprintOutputs = core.io?.output_spec?.map((field) => field.name);
  assert(JSON.stringify(contractOutputs) === JSON.stringify(blueprintOutputs), "Core output interface matches the public contract");

  assert(samples.requests?.length === outcomes.outcomes?.length, "Every sample request has one expected outcome");
  assert(samples.requests?.every((item) => !item.email || item.email.endsWith("@example.test")), "Sample identities use the reserved example.test domain");

  const blueprintStrings = collectStrings([core, adapter]);
  const combinedBlueprintText = blueprintStrings.join("\n");
  const secretPatterns = [
    /\bsk-[A-Za-z0-9_-]{16,}\b/,
    /\bghp_[A-Za-z0-9]{20,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
    /\bBearer\s+[A-Za-z0-9._~-]{16,}\b/i,
    /https:\/\/hook\.[^\s"']+/i,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  ];
  assert(!secretPatterns.some((pattern) => pattern.test(combinedBlueprintText)), "Blueprints contain no common credential or private-webhook pattern");

  const concreteResourceKeys = ["connection", "connectionId", "scenarioId", "spreadsheetId", "dataStoreId"];
  function findConcreteResource(value, trail = []) {
    if (!value || typeof value !== "object") return [];
    const findings = [];
    for (const [key, child] of Object.entries(value)) {
      const nextTrail = [...trail, key];
      if (
        concreteResourceKeys.includes(key) &&
        ((typeof child === "number" && child > 0) ||
          (typeof child === "string" && child.trim() && !child.includes("__") && !child.startsWith("{{")))
      ) {
        findings.push(nextTrail.join("."));
      }
      findings.push(...findConcreteResource(child, nextTrail));
    }
    return findings;
  }
  assert(findConcreteResource([core, adapter]).length === 0, "Blueprints contain no concrete connection, scenario, spreadsheet, or Data Store identifier");
}

function listTextFiles(directory, filesFound = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) listTextFiles(absolutePath, filesFound);
    else if (/\.(?:md|json|csv|mjs|yml)$/i.test(entry.name) || entry.name === ".gitignore") {
      filesFound.push(absolutePath);
    }
  }
  return filesFound;
}

assert(
  listTextFiles(root).every((file) => !fs.readFileSync(file, "utf8").includes("\u2014")),
  "Public text files contain no em dashes",
);

const architectureText = `${readText("README.md")}\n${readText("docs/architecture.md")}`;
const requiredArchitectureTerms = [
  "Make Data Store",
  "payload hash",
  "request ID",
  "normalized email",
  "RAW",
  "IN_PROGRESS",
  "RECOVERY_REQUIRED",
  "UNCERTAIN",
];
assert(
  requiredArchitectureTerms.every((term) => architectureText.includes(term)),
  "Architecture documentation covers ledger, lookup, write, and recovery paths",
);

if (failures.length) {
  process.stderr.write(`\n${failures.length} validation failure(s):\n`);
  failures.forEach((message) => process.stderr.write(`FAIL  ${message}\n`));
  process.exit(1);
}

process.stdout.write("\nAll structural and sanitization checks passed.\n");
