// Read-only verification of the fixed DDL-owner inventory after platform
// extraction and the additive frozen distribution ledger. Compare against the
// explicit frozen declarations, never derive acceptance from observed DDL.
// Pair with verify_distribution_schema.mjs (actual workerd constructor).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openStorage } from '../vps/sqlite-port.mjs';
import { assertDeletionDefinitions } from '../server/deletiondefinitions.js';
const modules = ['editorapp', 'metadata', 'stageapi', 'commandtargets', 'sourcecatalog', 'admincopy',
  'drafts', 'jobs', 'datacompiler', 'imagejobs', 'fallbackjobs', 'privatewrites',
  'deletionjobfreeze', 'deletiondraftfreeze', 'releases', 'topology', 'portraits',
  'published', 'playpacks', 'trials', 'announcements', 'distribution', 'distributionledger'];
const storage = openStorage(':memory:');
const tables = new Set(), indexes = [];
try {
  for (const name of modules) {
    const text = readFileSync(new URL(`../server/${name}.js`, import.meta.url), 'utf8');
    for (const match of text.matchAll(/\.exec\(\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g)) {
      const literal = match[1];
      let sql;
      if (literal.startsWith('"')) {
        try { sql = JSON.parse(literal); }
        catch (cause) { throw new Error(`fixed DDL literal in ${name}`, { cause }); }
      } else {
        sql = literal.slice(1, -1);
        if (sql.includes('\\')) { assert.ok(!sql.startsWith('CREATE '), 'escaped DDL needs explicit decoder'); continue; }
      }
      if (sql.startsWith('CREATE TABLE IF NOT EXISTS ')) {
        const table = /^CREATE TABLE IF NOT EXISTS ([a-z][a-z0-9_]*) \(/.exec(sql)?.[1];
        assert.ok(table && !tables.has(table) && !sql.includes(';'), `duplicate/invalid DDL in ${name}`);
        tables.add(table); storage.sql.exec(sql);
      } else if (/^CREATE (UNIQUE )?INDEX /.test(sql)) {
        assert.ok(!sql.includes(';')); indexes.push(sql);
      }
    }
  }
  for (const sql of indexes) storage.sql.exec(sql);
  assert.equal(modules.length, 23); assert.equal(tables.size, 54);
  const result = assertDeletionDefinitions(storage.sql);
  assert.equal(result.tablesVerified, 54); assert.equal(result.indexesVerified, 52);
  assert.equal(result.foreignKeyDeclarationsVerified, 4);
  const columns = [...tables].reduce((sum, name) => sum + storage.sql.exec(`PRAGMA table_xinfo(${name})`).toArray().length, 0);
  assert.equal(columns, 361);
  process.stdout.write('schema sources: 23 owners / 54 tables / 52 indexes / 361 columns / 4 FK; exact additive frozen gates\n');
} finally { storage.close(); }
