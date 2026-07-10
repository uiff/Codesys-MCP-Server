// Diagnostic probe: list device-repository contents via the running server.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(here, '..', 'dist', 'bin.js');
const PROJECT = path.join(os.tmpdir(), `cauto_probe_${Date.now()}.project`);

const server = spawn(process.execPath, [BIN], { stdio: ['pipe', 'pipe', 'pipe'] });
let buffer = '';
const pending = new Map();
server.stdout.on('data', (d) => {
  buffer += d.toString();
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    } catch { /* ignore */ }
  }
});

let nextId = 1;
function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { pending.delete(id); reject(new Error('timeout ' + method)); }, 600000);
    pending.set(id, (m) => { clearTimeout(t); resolve(m); });
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
const text = (r) => r?.result?.content?.map((c) => c.text).join('\n') ?? JSON.stringify(r);

try {
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'probe', version: '1' } });
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  let r = await rpc('tools/call', { name: 'codesys_create_project', arguments: { projectFilePath: PROJECT } });
  console.log('create_project:', r?.result?.isError ? 'ERR' : 'ok');

  r = await rpc('tools/call', { name: 'codesys_list_devices', arguments: { projectFilePath: PROJECT, filter: '', maxResults: 500 } });
  const t = text(r);
  const m = t.match(/DATA:\n([\s\S]*)$/);
  if (!m) { console.log('NO DATA BLOCK. Raw output:\n' + t.slice(0, 3000)); process.exit(1); }
  const data = JSON.parse(m[1]);
  console.log(`totalMatches=${data.totalMatches} returned=${data.returned}`);
  const names = data.devices.map((d) => `${d.name}  [type=${d.type} id=${d.id} v=${d.version}]`);
  const interesting = names.filter((n) => /win|control|plc/i.test(n));
  console.log('--- devices matching win|control|plc ---');
  console.log(interesting.join('\n') || '(none)');
  console.log('--- first 30 devices ---');
  console.log(names.slice(0, 30).join('\n'));
  process.exit(0);
} catch (e) {
  console.log('PROBE FAIL: ' + e.message);
  process.exit(1);
} finally {
  server.kill();
}
