import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function securityReport(scan) {
  const findings = [];
  for (const result of scan.Results ?? []) {
    const target = result.Target ?? 'package-lock.json';
    for (const item of result.Vulnerabilities ?? []) findings.push({ id: item.VulnerabilityID, severity: item.Severity, target, message: `${item.PkgName} ${item.InstalledVersion}: ${item.Title ?? item.VulnerabilityID}; fixed: ${item.FixedVersion || 'unavailable'}` });
    for (const item of result.Misconfigurations ?? []) findings.push({ id: item.ID, severity: item.Severity, target, line: item.CauseMetadata?.StartLine, message: item.Title ?? item.ID });
    for (const item of result.Secrets ?? []) findings.push({ id: item.RuleID, severity: item.Severity, target, line: item.StartLine, message: 'Potential credential detected; inspect the source privately. Match and code are omitted.' });
  }
  const blocked = findings.filter(f => ['HIGH', 'CRITICAL'].includes(f.severity));
  const safe = text => String(text).replace(/[\r\n|]/g, ' ');
  const markdown = ['# Security scan', '', `Trivy reported ${findings.length} findings; ${blocked.length} are HIGH or CRITICAL.`, '', '| Severity | Rule | File | Finding |', '| --- | --- | --- | --- |', ...findings.slice(0, 100).map(f => `| ${safe(f.severity)} | ${safe(f.id)} | ${safe(f.target)} | ${safe(f.message)} |`), '', ...(findings.length > 100 ? ['Only the first 100 findings are shown here; consult code scanning or the retained report.'] : [])].join('\n');
  const sarif = { version: '2.1.0', $schema: 'https://json.schemastore.org/sarif-2.1.0.json', runs: [{ tool: { driver: { name: 'Trivy', informationUri: 'https://github.com/aquasecurity/trivy', rules: [...new Set(findings.map(f => f.id))].map(id => ({ id })) } }, results: findings.map(f => ({ ruleId: f.id, level: ['HIGH', 'CRITICAL'].includes(f.severity) ? 'error' : 'warning', message: { text: f.message }, locations: [{ physicalLocation: { artifactLocation: { uri: encodeURI(f.target.replaceAll('\\', '/').replace(`${process.cwd()}/`, '')) }, region: { startLine: Math.max(1, f.line ?? 1) } } }] })) }] };
  return { findings, blocked: blocked.length, markdown, sarif };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const path = process.argv[2] ?? 'artifacts/security/trivy.json';
  const report = securityReport(JSON.parse(await readFile(path, 'utf8')));
  await writeFile('artifacts/security/trivy.sarif', JSON.stringify(report.sarif, null, 2) + '\n');
  await writeFile('artifacts/security/summary.md', report.markdown + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report.markdown + '\n');
  console.log(`Trivy: ${report.findings.length} findings; ${report.blocked} HIGH/CRITICAL. Credential matches are omitted from reports.`);
  if (report.blocked) process.exitCode = 1;
}
