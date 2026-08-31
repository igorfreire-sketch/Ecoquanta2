import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('nãocommit/Appscript/ImportBIM360.gs', 'utf8');
assert.match(source, /Utilities\.unzip\(/);
assert.ok(source.includes('const ref = cellXml.match(/\\br="([A-Z]+)\\d+"/);'));
assert.match(source, /toLowerCase\(\) !== 'quality'/);
assert.match(source, /seen\[issueId\]/);
assert.match(source, /Date\.UTC\(1899, 11, 30\)/);
assert.match(source, /SERVICE_ACCOUNT_EMAIL/);
assert.match(source, /SERVICE_ACCOUNT_PRIVATE_KEY/);
assert.doesNotMatch(source, /BEGIN PRIVATE KEY|private_key\s*[:=]\s*["'][^-]/i);
assert.match(source, /Gatilho desativado/);
console.log('ImportBIM360.gs: OK (unzip, colunas por r=, Quality, dedup, data Excel, credenciais externas)');
