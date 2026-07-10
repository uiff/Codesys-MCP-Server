// End-to-end test against a REAL local CODESYS installation.
// Drives the full pipeline over the MCP stdio protocol:
//   create project -> list devices -> insert controller -> create GVL/POUs
//   -> create task -> wire program -> build (expect 0 errors).
// Relies on auto-detection (no --codesys-path/--codesys-profile flags).
// Usage: node test/e2e.mjs [projectPath] [controllerFilter]
//   controllerFilter: device-name substring, default "CODESYS Control Win"
//   (e.g. "M3000" for a Weidmüller UC20-M3000)

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(here, '..', 'dist', 'bin.js');
const PROJECT = process.argv[2] ?? path.join(os.tmpdir(), `cauto_e2e_${Date.now()}.project`);
const CTRL_FILTER = process.argv[3] ?? 'CODESYS Control Win';

const CALL_TIMEOUT_MS = 600_000;

const server = spawn(process.execPath, [BIN], { stdio: ['pipe', 'pipe', 'pipe'] });
let stderrLog = '';
server.stderr.on('data', (d) => { stderrLog += d.toString(); });

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
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch { /* ignore non-JSON */ }
  }
});

let nextId = 1;
function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`RPC timeout: ${method} (id ${id})`));
    }, CALL_TIMEOUT_MS);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

function toolText(resp) {
  return resp?.result?.content?.map((c) => c.text).join('\n') ?? JSON.stringify(resp);
}
function toolData(resp) {
  const text = toolText(resp);
  const m = text.match(/DATA:\n([\s\S]*)$/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}
function isError(resp) {
  return Boolean(resp?.result?.isError) || Boolean(resp?.error);
}

async function call(name, args, label) {
  const t0 = Date.now();
  const resp = await rpc('tools/call', { name, arguments: args });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const failed = isError(resp);
  console.log(`[${failed ? 'FAIL' : ' OK '}] ${label ?? name} (${secs}s)`);
  if (failed) {
    console.log(toolText(resp).slice(0, 3000));
    throw new Error(`Tool failed: ${name}`);
  }
  return resp;
}

const GVL_DECL = `{attribute 'qualified_only'}
VAR_GLOBAL
    xSensor1 : BOOL;
    xSensor2 : BOOL;
    xEnable  : BOOL;
    xEStopOk : BOOL;
    xConvRun : BOOL;
END_VAR`;

const FB_DECL = `FUNCTION_BLOCK FB_ConveyorSegment
VAR_INPUT
    xSensor1  : BOOL;
    xSensor2  : BOOL;
    xEnable   : BOOL;
    xEStop    : BOOL;
    tStopTime : TIME := T#1S;
END_VAR
VAR_OUTPUT
    xRun          : BOOL;
    xPartDetected : BOOL;
END_VAR
VAR
    trigS1 : R_TRIG;
    trigS2 : R_TRIG;
    tpStop : TP;
END_VAR`;

const FB_IMPL = `trigS1(CLK := xSensor1);
trigS2(CLK := xSensor2);
xPartDetected := trigS1.Q OR trigS2.Q;
tpStop(IN := xPartDetected, PT := tStopTime);
xRun := xEnable AND NOT xEStop AND NOT tpStop.Q;`;

const PRG_DECL = `PROGRAM PLC_PRG
VAR
    fbConveyor : FB_ConveyorSegment;
END_VAR`;

const PRG_IMPL = `fbConveyor(
    xSensor1  := GVL_IO.xSensor1,
    xSensor2  := GVL_IO.xSensor2,
    xEnable   := GVL_IO.xEnable,
    xEStop    := NOT GVL_IO.xEStopOk,
    tStopTime := T#1S);
GVL_IO.xConvRun := fbConveyor.xRun;`;

try {
  console.log(`E2E project: ${PROJECT}`);

  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } });
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  console.log('[ OK ] initialize');

  // 1. Create project (cold start possible — server retries once internally).
  await call('codesys_create_project', { projectFilePath: PROJECT }, 'create_project');

  // 2. Find the controller's device triple in the local repository.
  const devResp = await call('codesys_list_devices', { projectFilePath: PROJECT, filter: CTRL_FILTER }, 'list_devices');
  const devices = toolData(devResp)?.devices ?? [];
  // Prefer the non-x64 base variant when several names match, then the
  // highest installed version of that device id.
  const parseVer = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0);
  const cmpVer = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] ?? 0) - (b[i] ?? 0); if (d) return d; } return 0; };
  const preferred = devices.filter((d) => !/x64/i.test(d.name));
  const pool = preferred.length ? preferred : devices;
  pool.sort((x, y) => cmpVer(parseVer(x.version), parseVer(y.version)));
  const ctrl = pool[pool.length - 1];
  if (!ctrl) throw new Error(`No device matching "${CTRL_FILTER}" found in the repository`);
  console.log(`       controller: ${ctrl.name} (type=${ctrl.type}, id=${ctrl.id}, version=${ctrl.version})`);

  // 3. Insert the controller top-level.
  await call('codesys_insert_device', {
    projectFilePath: PROJECT, parentPath: '', name: 'Device',
    deviceType: ctrl.type, deviceId: ctrl.id, version: ctrl.version, moduleId: '',
  }, 'insert_device (controller)');

  // 4. Browse tree to locate the Application.
  const treeResp = await call('codesys_browse_tree', { projectFilePath: PROJECT, rootPath: '', maxDepth: 6 }, 'browse_tree');
  const nodes = toolData(treeResp)?.nodes ?? [];
  const app = nodes.find((n) => n.type === 'application') ?? nodes.find((n) => n.name === 'Application');
  if (!app) throw new Error(`No Application node found. Tree: ${JSON.stringify(nodes).slice(0, 1500)}`);
  console.log(`       application: ${app.path}`);

  // 5. Add the Standard library (R_TRIG/TP) — script-created projects have no
  //    library references at all — then create GVL + FB + PRG.
  await call('codesys_add_library', { projectFilePath: PROJECT, applicationPath: app.path, libraryName: 'Standard' }, 'add_library Standard');
  await call('codesys_create_gvl', { projectFilePath: PROJECT, parentPath: app.path, name: 'GVL_IO', declaration: GVL_DECL }, 'create_gvl GVL_IO');
  await call('codesys_create_pou', { projectFilePath: PROJECT, parentPath: app.path, name: 'FB_ConveyorSegment', pouType: 'FunctionBlock' }, 'create_pou FB');
  await call('codesys_set_pou_code', { projectFilePath: PROJECT, pouPath: `${app.path}/FB_ConveyorSegment`, declaration: FB_DECL, implementation: FB_IMPL }, 'set_pou_code FB');
  await call('codesys_create_pou', { projectFilePath: PROJECT, parentPath: app.path, name: 'PLC_PRG', pouType: 'Program' }, 'create_pou PLC_PRG');
  await call('codesys_set_pou_code', { projectFilePath: PROJECT, pouPath: `${app.path}/PLC_PRG`, declaration: PRG_DECL, implementation: PRG_IMPL }, 'set_pou_code PLC_PRG');

  // 6. Task: create MainTask if the device template didn't, then wire PLC_PRG.
  const tree2 = toolData(await call('codesys_browse_tree', { projectFilePath: PROJECT, rootPath: '', maxDepth: 8 }, 'browse_tree (tasks)'))?.nodes ?? [];
  let task = tree2.find((n) => /task/i.test(n.name) && n.path.includes('Task'));
  const existingMain = tree2.find((n) => n.name === 'MainTask');
  if (!existingMain) {
    await call('codesys_create_task', { projectFilePath: PROJECT, applicationPath: app.path, name: 'MainTask', interval: '10', unit: 'ms', priority: '10' }, 'create_task MainTask');
    const tree3 = toolData(await call('codesys_browse_tree', { projectFilePath: PROJECT, rootPath: '', maxDepth: 8 }, 'browse_tree (after create_task)'))?.nodes ?? [];
    task = tree3.find((n) => n.name === 'MainTask');
  } else {
    task = existingMain;
  }
  if (!task) throw new Error('MainTask not found after creation');
  console.log(`       task: ${task.path}`);
  await call('codesys_add_program_to_task', { projectFilePath: PROJECT, taskPath: task.path, programName: 'PLC_PRG' }, 'add_program_to_task');

  // 7. Build — the gate. Expect clean:true.
  const buildResp = await call('codesys_build', { projectFilePath: PROJECT }, 'build');
  const build = toolData(buildResp);
  console.log(`       build result: ${JSON.stringify(build)?.slice(0, 2000)}`);
  if (!build || build.clean !== true) {
    console.log('E2E FAIL: build not clean');
    process.exit(1);
  }

  console.log('E2E PASS: full pipeline (project -> controller -> code -> task -> clean build)');
  process.exit(0);
} catch (err) {
  console.log(`E2E FAIL: ${err.message}`);
  console.log('--- server stderr (last 2000 chars) ---');
  console.log(stderrLog.slice(-2000));
  process.exit(1);
} finally {
  server.kill();
}
