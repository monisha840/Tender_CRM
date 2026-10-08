// Generates public/demo/gate-attendance-demo.csv from the deterministic demo seed (no database access).
//   npx tsx scripts/make-demo-gate-file.ts
// The planted mismatches and the counts a reconciliation must report are documented in docs/gate-demo.md.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildDemoGate, DEMO_PERIOD, DEMO_PROJECT_CODE } from "../src/modules/gate-reconciliation/demo";

const out = resolve(process.cwd(), "public/demo/gate-attendance-demo.csv");
const demo = buildDemoGate();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, demo.csv + "\r\n", "utf8");
console.log(`Wrote ${demo.rows.length} gate rows for ${DEMO_PROJECT_CODE} ${DEMO_PERIOD} to ${out}`);
console.log("Expected reconciliation:", JSON.stringify(demo.expected));
