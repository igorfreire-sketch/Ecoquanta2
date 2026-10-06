import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEapMarkdown, scopeProjectRows } from './eapMarkdown';
import { mergeEapOs } from './eapOsOverlay';

function row(code: string, name: string, predecessor = '') {
  const cells = new Array(19).fill('');
  cells[3] = code;
  cells[4] = name;
  cells[8] = predecessor;
  cells[14] = 'ARQ';
  return cells;
}

const markdown = `# EAP Ecoquanta\n\n~~~tsv\n${new Array(19).fill('').map((_, index) => index === 3 ? 'N° item' : index === 4 ? 'Nome da Tarefa' : '').join('\t')}\n${row('0', 'OS 054 - Teste').join('\t')}\n${row('1', 'Projeto', '0').join('\t')}\n${row('1.1', 'Tarefa', '1').join('\t')}\n~~~\n`;
const parsed = parseEapMarkdown(markdown);
assert.equal(parsed.length, 3);
assert.equal(parseEapMarkdown(`texto extra\n\n${markdown.replace(/~~~tsv/, '```tsv').replace(/~~~\n$/, '```\n')}rodapé`).length, 3);
assert.equal(parseEapMarkdown(markdown.match(/~~~tsv\n([\s\S]*?)\n~~~/)![1]).length, 3);

const scoped = scopeProjectRows(parsed, '2.25', 'OS 054 - Teste', true);
assert.deepEqual(scoped.map((item) => item[3]), ['2.25', '2.25.1', '2.25.1.1']);
assert.equal(scoped[1][8], '2.25', 'predecessora WBS precisa acompanhar o novo prefixo da OS');
assert.equal(scoped[2][8], '2.25.1');
assert.throws(() => scopeProjectRows(parsed, '2.25', 'OS 055 - Outra', true), /não confere/);

const updatedAt = { toDate: () => new Date('2026-10-06T12:00:00Z') };
const document = { os: '2.25', version: 3, updatedAt, rowsJson: JSON.stringify(scoped) };
const legacy = {
  cronograma: [],
  data: { cronograma: [['1', 'Contrato'], ['2.25', 'OS antiga'], ['2.25.9', 'Tarefa antiga']] },
};
const merged = mergeEapOs(legacy, [document]);
assert.equal(merged.cronograma.filter((item: any) => item.code === '2.25').length, 1);
assert.ok(!merged.cronograma.some((item: any) => Array.isArray(item) && item[0] === '2.25.9'));
assert.equal(merged.cronograma.find((item: any) => item.code === '2.25').eapVersion, 3);
assert.equal(merged.cronograma.find((item: any) => item.code === '2.25').eapUpdatedAt, '2026-10-06T12:00:00.000Z');

const withoutLegacy = mergeEapOs(null, [document]);
assert.equal(withoutLegacy.atual.length, 3, 'coleção por OS deve funcionar sem appData/eap legado');

const serviceSource = readFileSync(new URL('./eapService.ts', import.meta.url), 'utf8');
assert.match(serviceSource, /runTransaction/, 'publicação deve usar transação Firestore');
assert.doesNotMatch(serviceSource, /post\('\/publish'/, 'publicação não deve depender do servidor de conversão');

console.log('eapUpdate: OK');
