import assert from 'node:assert/strict';
import { mergeAdminSnapshotForWrite } from './firebaseDb';

const baseLink = { id: 'base', nome: 'Base', link: 'https://base.example' };
const base = { cargos: ['Engenheiro'], databaseLinks: [baseLink] };
const linkA = { id: 'a', nome: 'A', link: 'https://a.example' };
const linkB = { id: 'b', nome: 'B', link: 'https://b.example' };

const afterLinkWriter = mergeAdminSnapshotForWrite(
  base,
  { ...base, databaseLinks: [baseLink, linkA] },
  ['databaseLinks'],
  base.databaseLinks,
);
const afterStaleConfigWriter = mergeAdminSnapshotForWrite(
  afterLinkWriter,
  { ...base, cargos: ['Coordenador'] },
  ['cargos'],
  base.databaseLinks,
);
assert.deepEqual(afterStaleConfigWriter.databaseLinks, [baseLink, linkA]);

const afterSecondLinkWriter = mergeAdminSnapshotForWrite(
  afterLinkWriter,
  { ...base, databaseLinks: [baseLink, linkB] },
  ['databaseLinks'],
  base.databaseLinks,
);
assert.deepEqual(afterSecondLinkWriter.databaseLinks, [baseLink, linkA, linkB]);

console.log('banco links persistence: OK');
