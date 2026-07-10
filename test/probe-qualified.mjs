// Test hypothesis: script-added library references default to qualified_only,
// hiding R_TRIG/TP behind the Standard. namespace. Reads the flag, clears it,
// rebuilds, and reports the error count — all in one CODESYS run.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { runScript } = require('../dist/interop.js');
const { detectCodesys } = require('../dist/detect.js');

const PROJECT = process.argv[2];
if (!PROJECT) { console.log('usage: node probe-qualified.mjs <project>'); process.exit(1); }
const det = detectCodesys();
const cfg = { codesysPath: det.codesysPath, profileName: det.profileName, timeoutMs: 300000 };

const script = `# -*- coding: utf-8 -*-
import sys, json
import scriptengine as se
from System import Guid
info = {"refs": []}
flags = se.VersionUpdateFlags.NoUpdates | se.VersionUpdateFlags.SilentMode
project = se.projects.open(${JSON.stringify(PROJECT)}, update_flags=flags)
app = project.active_application
lm = app.get_library_manager()
try:
    for ref in lm.references:
        entry = {}
        try:
            entry["name"] = str(getattr(ref, "name", ref))
        except Exception:
            entry["name"] = "?"
        try:
            entry["qualified_only_before"] = bool(ref.qualified_only)
            if ref.qualified_only:
                ref.qualified_only = False
                entry["qualified_only_after"] = bool(ref.qualified_only)
        except Exception as e:
            entry["qo_error"] = str(e)
        info["refs"].append(entry)
except Exception as e:
    info["refs_error"] = str(e)
project.save()
# rebuild and count errors
sysobj = se.system
CG = Guid("{97F48D64-A2A3-4856-B640-75C046E37EA9}")
try:
    sysobj.clear_messages(CG)
except Exception:
    pass
app.generate_code()
errs = []
try:
    for m in sysobj.get_message_objects(CG):
        sev = str(getattr(m, "severity", ""))
        if "error" in sev.lower():
            errs.append(str(getattr(m, "text", "")).encode("ascii", "xmlcharrefreplace"))
except Exception as e:
    info["msg_error"] = str(e)
info["error_count_after"] = len(errs)
info["errors_sample"] = errs[:5]
sys.stdout.write("###JSON_START###" + json.dumps(info) + "###JSON_END###\\n")
print("SCRIPT_SUCCESS: qualified probe done")
`;

const r = await runScript(script, cfg);
console.log('success:', r.success);
console.log(JSON.stringify(r.data, null, 2) ?? '');
if (!r.data) console.log(r.output.slice(0, 4000));
