// Query OSV using Maven's resolved dependency graph, including test dependencies.
// Generate first: mvn -f backend/pom.xml dependency:tree -DoutputType=tgf -DoutputFile=target/dependencies.tgf
import { readFile, writeFile } from "node:fs/promises";

const source = await readFile("backend/target/dependencies.tgf", "utf8");
const packages = new Map();
for (const line of source.split(/\r?\n/)) {
  if (line.trim() === "#") break;
  const match = line.match(/^\d+ (\S+)$/);
  if (!match) continue;
  const parts = match[1].split(":");
  if (parts.length < 5) continue; // Root project is not a resolved dependency.
  const name = `${parts[0]}:${parts[1]}`;
  const version = parts.at(-2);
  packages.set(`${name}@${version}`, {
    package: { ecosystem: "Maven", name },
    version,
  });
}
if (packages.size < 20)
  throw new Error("Incomplete dependency graph; refusing an empty scan.");
const queries = [...packages.values()];
const response = await fetch("https://api.osv.dev/v1/querybatch", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ queries }),
  signal: AbortSignal.timeout(60000),
});
if (!response.ok) throw new Error(`OSV query failed: ${response.status}`);
const body = await response.json();
if (!Array.isArray(body.results) || body.results.length !== queries.length)
  throw new Error("Incomplete OSV response.");
const findings = body.results.flatMap((result, i) =>
  (result.vulns ?? []).map((vulnerability) => ({
    ...queries[i],
    id: vulnerability.id,
  })),
);
const report = {
  recordedAt: new Date().toISOString(),
  source: "https://api.osv.dev",
  checked: queries.length,
  findings,
};
await writeFile(
  "backend/target/osv-report.json",
  JSON.stringify(report, null, 2),
);
console.log(
  `OSV checked ${queries.length} resolved Maven packages; ${findings.length} advisory matches.`,
);
for (const finding of findings)
  console.log(`${finding.package.name}@${finding.version}: ${finding.id}`);
if (findings.length) process.exitCode = 1;
