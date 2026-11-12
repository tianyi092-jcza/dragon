// Fresh, read-only LSP process using the checked-in project launcher/options.
// Virtual documents exercise semantic diagnostics; no fixture .vue is written.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import config from '../.pi-lens.json' with { type: 'json' };
import installed from './node_modules/@vue/language-server/package.json' with { type: 'json' };

const root = fileURLToPath(new URL('../', import.meta.url));
const override = config.lsp.serverOverrides.vue;
assert.equal(installed.version, '2.2.12');
assert.equal(override.initializationOptions.vue.hybridMode, false);
const [command, ...args] = override.command;
const child = spawn(command, args, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
let buffer = Buffer.alloc(0), sequence = 0, stderr = '', bridgeRequests = 0;
const pending = new Map();
let resolveErrorPush, pushTimer;
const errorPush = new Promise(resolve => { resolveErrorPush = resolve; });
const send = message => {
  const body = Buffer.from(JSON.stringify(message));
  child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  child.stdin.write(body);
};
const notify = (method, params) => send({ jsonrpc: '2.0', method, params });
const request = async (method, params) => {
  const id = ++sequence;
  const result = await new Promise(resolve => {
    const timer = setTimeout(() => { pending.delete(id); resolve({ error: { message: `${method} timed out after 20s` } }); }, 20000);
    pending.set(id, message => { clearTimeout(timer); resolve(message); });
    send({ jsonrpc: '2.0', id, method, params });
  });
  assert.equal(result.error, undefined, JSON.stringify(result));
  return result.result;
};
child.stderr.on('data', chunk => { stderr += chunk; });
child.stdout.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const end = buffer.indexOf('\r\n\r\n');
    if (end < 0) break;
    const size = Number(buffer.subarray(0, end).toString().match(/Content-Length: (\d+)/i)[1]);
    if (buffer.length < end + 4 + size) break;
    let message;
    try { message = JSON.parse(buffer.subarray(end + 4, end + 4 + size).toString()); }
    catch (error) { child.kill(); throw error; }
    buffer = buffer.subarray(end + 4 + size);
    if (message.method && message.id !== undefined) {
      let result = null;
      if (message.method === 'workspace/configuration') result = message.params.items.map(() => ({}));
      if (message.method === 'workspace/workspaceFolders') result = [{ uri: pathToFileURL(root).href, name: 'editor-ui' }];
      send({ jsonrpc: '2.0', id: message.id, result });
    } else if (message.method) {
      if (message.method === 'tsserver/request') bridgeRequests++;
      if (message.method === 'textDocument/publishDiagnostics' && message.params.diagnostics.some(item => item.code === 2322)) resolveErrorPush(true);
    } else if (pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  }
});
const open = (uri, text) => notify('textDocument/didOpen', { textDocument: { uri, languageId: 'vue', version: 1, text } });
const diagnostics = async uri => {
  // Standalone Volar 2 registers this handler even though inter-file dependency
  // mode advertises push rather than pull. Also verify standard push below.
  const report = await request('textDocument/diagnostic', { textDocument: { uri } });
  assert.equal(report.kind, 'full');
  return report.items;
};
try {
  const started = Date.now();
  const init = await request('initialize', {
    processId: process.pid,
    rootUri: pathToFileURL(root).href,
    workspaceFolders: [{ uri: pathToFileURL(root).href, name: 'editor-ui' }],
    initializationOptions: override.initializationOptions,
    capabilities: { workspace: { configuration: true, workspaceFolders: true }, textDocument: { diagnostic: { dynamicRegistration: false }, publishDiagnostics: {} } },
  });
  process.stdout.write(`INIT Vue LS ${installed.version}: ${Date.now() - started}ms; advertised pull=${Boolean(init.capabilities.diagnosticProvider)}\n`);
  notify('initialized', {});
  const uri = new URL('../src/__readonly_lsp_probe__.vue', import.meta.url).href;
  const correct = '<script setup lang="ts">\nconst count: number = 1;\n</script>\n<template><div>{{ count }}</div></template>\n';
  open(uri, correct);
  const symbols = await request('textDocument/documentSymbol', { textDocument: { uri } });
  assert.ok(symbols.length > 0);
  const initial = await diagnostics(uri);
  assert.equal(initial.filter(item => item.severity === 1).length, 0);
  pushTimer = setTimeout(() => resolveErrorPush(false), 5000);
  notify('textDocument/didChange', { textDocument: { uri, version: 2 }, contentChanges: [{ text: correct.replace('= 1', '= "bad"') }] });
  const invalid = await diagnostics(uri);
  assert.ok(invalid.some(item => item.code === 2322), JSON.stringify(invalid));
  assert.equal(await errorPush, true, 'standard diagnostic push must report the genuine semantic error');
  clearTimeout(pushTimer);
  notify('textDocument/didChange', { textDocument: { uri, version: 3 }, contentChanges: [{ text: correct }] });
  const fixed = await diagnostics(uri);
  assert.equal(fixed.filter(item => item.severity === 1).length, 0, 'correcting the value clears fresh diagnostics');
  notify('textDocument/didClose', { textDocument: { uri } });
  process.stdout.write('PASS semantic error TS2322 via full request AND standard push; correction clears it; symbols respond.\n');
  const entries = await readdir(new URL('../src/', import.meta.url));
  const files = entries.filter(name => name.endsWith('.vue'));
  for (const name of files) {
    const path = new URL(`../src/${name}`, import.meta.url);
    open(path.href, await readFile(path, 'utf8'));
    const started = Date.now();
    const items = await diagnostics(path.href);
    assert.equal(items.filter(item => item.severity === 1 || item.code === 7016).length, 0, `${name}: ${JSON.stringify(items)}`);
    process.stdout.write(`PASS ${name}: ${Date.now() - started}ms, ${items.length} diagnostics\n`);
    if (items.length) { process.stdout.write(`${JSON.stringify(items.map(({ severity, code, message }) => ({ severity, code, message })))}\n`); }
    notify('textDocument/didClose', { textDocument: { uri: path.href } });
  }
  assert.equal(bridgeRequests, 0, 'standalone mode must not need the missing TypeScript bridge');
  assert.equal(stderr.trim(), '');
  process.stdout.write(`PASS ${files.length} actual SFCs, bridgeRequests=0; no project source/config files written by this check.\n`);
} finally {
  clearTimeout(pushTimer);
  child.stdin.end();
  child.kill();
  await new Promise(resolve => { if (child.exitCode !== null || child.signalCode !== null) resolve(); else child.once('exit', resolve); });
}
