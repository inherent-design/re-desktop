import test from 'node:test';
import assert from 'node:assert/strict';
import { securityReport } from '../scripts/security-report.mjs';

test('security reports gate high findings without copying credential matches or code', () => {
  const result = securityReport({ Results: [{ Target: 'config.txt', Secrets: [{ RuleID: 'fixture', Severity: 'HIGH', StartLine: 3, Match: 'private-marker-not-a-token', Code: { Lines: [{ Content: 'private-marker-not-a-token' }] } }], Vulnerabilities: [{ VulnerabilityID: 'CVE-fixture', Severity: 'LOW', PkgName: 'example', InstalledVersion: '1.0.0', FixedVersion: '1.0.1' }] }] });
  assert.equal(result.blocked, 1);
  assert.equal(result.findings.length, 2);
  assert.equal(JSON.stringify(result).includes('private-marker-not-a-token'), false);
  assert.equal(result.sarif.runs[0].results[1].locations[0].physicalLocation.region.startLine, 3);
  assert.equal(securityReport({ Results: [] }).blocked, 0);
});
