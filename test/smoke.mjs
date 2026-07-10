// Protocol smoke test: starts the server over stdio (with a dummy CODESYS
// path — no CODESYS needed), performs the MCP handshake, lists tools, and
// exercises a knowledge-base tool. Exits non-zero on failure.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(here, '..', 'dist', 'bin.js');

const server = spawn(process.execPath, [BIN, '--codesys-path', 'C:/nonexistent/CODESYS.exe', '--codesys-profile', 'Smoke'], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

let out = '';
server.stdout.on('data', (d) => { out += d.toString(); });
server.stderr.on('data', () => {});

const send = (o) => server.stdin.write(JSON.stringify(o) + '\n');

setTimeout(() => send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } } }), 1000);
setTimeout(() => {
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'codesys_list_patterns', arguments: {} } });
}, 2500);

setTimeout(() => {
  let initOk = false;
  let tools = [];
  let patternsOk = false;
  for (const line of out.split('\n').filter(Boolean)) {
    try {
      const m = JSON.parse(line);
      if (m.id === 1 && m.result) initOk = true;
      if (m.id === 2 && m.result?.tools) tools = m.result.tools.map((t) => t.name);
      if (m.id === 3 && m.result?.content?.[0]?.text?.includes('FB_ConveyorSegment')) patternsOk = true;
    } catch { /* non-JSON line */ }
  }
  console.log(`init=${initOk} tools=${tools.length} patterns=${patternsOk}`);
  server.kill();
  const pass = initOk && tools.length >= 18 && patternsOk;
  console.log(pass ? 'SMOKE PASS' : `SMOKE FAIL (tools: ${tools.join(', ')})`);
  process.exit(pass ? 0 : 1);
}, 8000);
