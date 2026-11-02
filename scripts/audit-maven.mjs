// Query OSV using Maven's resolved dependency graph, including test dependencies.
// Generate first: mvn -f backend/pom.xml dependency:tree -DoutputType=tgf -DoutputFile=target/dependencies.tgf
import { readFile, writeFile, readdir } from "node:fs/promises";

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
const exceptions = JSON.parse(
  await readFile("scripts/security-exceptions.json", "utf8"),
);
const javaPath = "backend/src/main/java/dev/finoscore/";
const java = (
  await Promise.all(
    (await readdir(javaPath))
      .filter((p) => p.endsWith(".java"))
      .map((p) => readFile(javaPath + p, "utf8")),
  )
).join("\n");
const pom = await readFile("backend/pom.xml", "utf8");
// These scoped exceptions depend on this being a REST-only API without view rendering.
if (
  /XsltView|ViewResolver|FragmentsRendering|ModelAndView|\.render\s*\(/.test(
    java,
  ) ||
  /thymeleaf|freemarker|groovy-templates/.test(pom)
)
  throw new Error(
    "View rendering was added: reassess the Spring advisory exceptions.",
  );
const reviewed = [],
  unreviewed = [];
for (const finding of findings) {
  const exception = exceptions.find(
    (e) =>
      e.id === finding.id &&
      e.package === finding.package.name &&
      e.version === finding.version &&
      Date.parse(e.expires) > Date.now(),
  );
  (exception ? reviewed : unreviewed).push(
    exception ? { ...finding, review: exception } : finding,
  );
}
const report = {
  recordedAt: new Date().toISOString(),
  source: "https://api.osv.dev",
  checked: queries.length,
  findings,
  reviewed,
  unreviewed,
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
console.log(
  `${reviewed.length} explicitly reviewed, time-limited applicability exceptions; ${unreviewed.length} unreviewed matches.`,
);
if (unreviewed.length) process.exitCode = 1;
