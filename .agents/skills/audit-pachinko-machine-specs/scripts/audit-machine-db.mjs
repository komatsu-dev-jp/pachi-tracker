#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
const root = resolve(rootArg ? rootArg.slice(7) : process.cwd());
const dbPath = resolve(root, "src", "machineDB.js");
if (!existsSync(dbPath)) {
  console.error(`ERROR: src/machineDB.js was not found under ${root}`);
  process.exit(2);
}

const { machineDB, machineModelRegistry } = await import(pathToFileURL(dbPath).href);
const errors = [];
const warnings = [];
const https = (v) => typeof v === "string" && /^https:\/\//.test(v);
const finite = (v) => Number.isFinite(Number(v));

function auditModes(machine, modes, field) {
  const machineName = machine.name || "unnamed machine";
  if (!Array.isArray(modes) || !modes.length) {
    errors.push(`${machineName}: ${field} is missing`);
    return;
  }
  modes.forEach((mode, mi) => {
    const key = `${machineName}: ${field}[${mi}]`;
    const modeText = `${mode?.name || ""} ${mode?.note || ""}`;
    const hasNoTransition = /RUSH機能なし|遷移なし|移行なし/.test(modeText);
    if (!mode?.name?.trim()) warnings.push(`${key} has no state name`);
    if (!Array.isArray(mode?.rows) || !mode.rows.length) {
      errors.push(`${key} has no rows`);
      return;
    }
    let total = 0;
    mode.rows.forEach((row, ri) => {
      const rowKey = `${key}.rows[${ri}]`;
      if (!finite(row?.rate) || Number(row.rate) < 0) errors.push(`${rowKey} has an invalid rate`);
      else total += Number(row.rate);
      if (!finite(row?.payout) || Number(row.payout) < 0) errors.push(`${rowKey} has an invalid payout`);
      if (!(Number(row?.rounds) > 0) && !String(row?.roundsLabel || "").trim()) errors.push(`${rowKey} needs rounds or roundsLabel`);
      if (!hasNoTransition && !String(row?.label || row?.destination || "").trim()) warnings.push(`${rowKey} has no transition label`);
    });
    if (Math.abs(total - 100) > 0.11) errors.push(`${key} totals ${total}% instead of 100%`);
  });
}

machineDB.forEach((machine) => {
  const name = machine.name || "unnamed machine";
  if (machine.modelVerified === true) {
    if (!String(machine.modelName || "").trim()) errors.push(`${name}: verified modelName is missing`);
    if (!https(machine.modelSourceUrl)) errors.push(`${name}: verified modelSourceUrl must be HTTPS`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(machine.modelUpdatedAt || ""))) errors.push(`${name}: modelUpdatedAt must be YYYY-MM-DD`);
  }
  if (machine.allocationVerified !== true) return;
  if (!Array.isArray(machine.sourceUrls) || !machine.sourceUrls.length) errors.push(`${name}: verified allocation needs sourceUrls`);
  else if (machine.sourceUrls.some((url) => !https(url))) errors.push(`${name}: all sourceUrls must be HTTPS`);
  auditModes(machine, machine.hesoModes, "hesoModes");
  auditModes(machine, machine.rushModes, "rushModes");
  if (!(Number(machine.stdDev) > 0)) warnings.push(`${name}: stdDev is missing`);
  if (machine.stdDevMethod === "p-evidence-branching-v2" && !String(machine.stdDevLabel || "").includes("P-EVIDENCE")) warnings.push(`${name}: branching estimate needs a P-EVIDENCE label`);
  if (Array.isArray(machine.roundLoops)) machine.roundLoops.forEach((loop, li) => {
    const key = `${name}: roundLoops[${li}]`;
    if (!(Number(loop?.rounds) > 0)) errors.push(`${key} needs positive rounds`);
    if (!Array.isArray(loop?.baseMultipliers) || loop.baseMultipliers.some((v) => !(Number(v) > 0))) errors.push(`${key} needs positive baseMultipliers`);
    if (!(Number(loop?.loopBaseMult) > 0)) warnings.push(`${key} has no positive loopBaseMult`);
    if (!(Number(loop?.incrementMult) > 0)) warnings.push(`${key} has no positive incrementMult`);
    if (!(Number(loop?.incrementPayout) > 0)) warnings.push(`${key} has no positive incrementPayout`);
    if (!https(loop?.sourceUrl)) warnings.push(`${key} has no HTTPS sourceUrl`);
  });
});

Object.keys(machineModelRegistry).forEach((name) => {
  if (!machineDB.some((machine) => machine.name === name)) errors.push(`${name}: registry entry has no machine record`);
});

const result = {
  machines: machineDB.length,
  registeredModels: Object.keys(machineModelRegistry).length,
  unregisteredRecords: machineDB.filter((m) => !machineModelRegistry[m.name]).length,
  verifiedAllocations: machineDB.filter((m) => m.allocationVerified === true).length,
  errors,
  warnings,
};
if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`Machines: ${result.machines}`);
  console.log(`Registered models: ${result.registeredModels}`);
  console.log(`Unregistered master records: ${result.unregisteredRecords}`);
  console.log(`Verified allocations: ${result.verifiedAllocations}`);
  console.log(`Errors: ${errors.length}`);
  errors.forEach((v) => console.log(`  ERROR ${v}`));
  console.log(`Warnings: ${warnings.length}`);
  warnings.forEach((v) => console.log(`  WARN  ${v}`));
}
process.exitCode = errors.length || (process.argv.includes("--strict") && warnings.length) ? 1 : 0;
