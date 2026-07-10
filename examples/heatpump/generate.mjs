// Regenerates the complete heat-pump controller project from the ST sources
// in ./st/ using the server's script builders. CODESYS is auto-detected.
//
//   node examples/heatpump/generate.mjs [outputProjectPath]
//
// Default output: ./Waermepumpe.generated.project (next to this script).
// Expected result: a clean build ({"clean": true}).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', '..', 'dist');
const { runScript } = require(path.join(dist, 'interop.js'));
const { detectCodesys } = require(path.join(dist, 'detect.js'));
const S = require(path.join(dist, 'scripts.js'));

const det = detectCodesys();
if (!det) {
  console.error('No CODESYS installation found. Set CODESYS_PATH / CODESYS_PROFILE.');
  process.exit(1);
}
const cfg = { codesysPath: det.codesysPath, profileName: det.profileName, timeoutMs: 300000 };
const P = path.resolve(process.argv[2] ?? path.join(here, 'Waermepumpe.generated.project'));
const APP = 'Device/Plc Logic/Application';

const st = (f) => readFileSync(path.join(here, 'st', f), 'utf8');

async function step(label, script) {
  const t0 = Date.now();
  const r = await runScript(script, cfg);
  console.log(`[${r.success ? ' OK ' : 'FAIL'}] ${label} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (!r.success) {
    console.log(r.output.split('\n').filter((l) => /SCRIPT_ERROR|Exception/.test(l)).slice(0, 4).join('\n'));
    process.exit(1);
  }
  return r;
}

console.log(`Target project: ${P}`);
await step('create project', S.createProject(P));
// Controller: CODESYS Control Win V3 — '*' resolves to the newest installed.
await step('insert Control Win V3', S.insertDevice(P, '', 'Device', 4096, '0000 0001', '*', ''));
await step('add Standard library', S.addLibrary(P, APP, 'Standard'));
await step('create E_HpState', S.createDut(P, APP, 'E_HpState', 'Enumeration', st('E_HpState.st')));
await step('create GVL_IO', S.createGvl(P, APP, 'GVL_IO', st('GVL_IO.st')));
await step('create GVL_Param', S.createGvl(P, APP, 'GVL_Param', st('GVL_Param.st')));

for (const fb of ['FB_HeatCurve', 'FB_Hysteresis', 'FB_CompressorProtect', 'FB_HeatPump']) {
  await step(`create ${fb}`, S.createPou(P, APP, fb, 'FunctionBlock', ''));
  await step(`set ${fb} code`, S.setPouCode(P, `${APP}/${fb}`, st(`${fb}.decl.st`), st(`${fb}.impl.st`)));
}

await step('create PLC_PRG', S.createPou(P, APP, 'PLC_PRG', 'Program', ''));
await step('set PLC_PRG code', S.setPouCode(P, `${APP}/PLC_PRG`, st('PLC_PRG.decl.st'), st('PLC_PRG.impl.st')));
await step('create MainTask (20 ms)', S.createTask(P, APP, 'MainTask', '20', 'ms', '10'));
await step('wire PLC_PRG into MainTask', S.addProgramToTask(P, `${APP}/Task Configuration/MainTask`, 'PLC_PRG'));

const b = await step('BUILD', S.build(P));
console.log('BUILD RESULT:', JSON.stringify(b.data));
if (b.data?.clean === true) {
  console.log(`\nSUCCESS — open in CODESYS: ${P}`);
  process.exit(0);
}
process.exit(2);
