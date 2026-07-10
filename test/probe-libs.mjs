// Diagnostic: inspect the application's library manager + the librarymanager
// global in the last E2E project. Usage: node test/probe-libs.mjs <project>
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { runScript } = require('../dist/interop.js');
const { detectCodesys } = require('../dist/detect.js');

const PROJECT = process.argv[2];
if (!PROJECT) { console.log('usage: node probe-libs.mjs <project>'); process.exit(1); }
const det = detectCodesys();
const cfg = { codesysPath: det.codesysPath, profileName: det.profileName, timeoutMs: 300000 };

const script = `# -*- coding: utf-8 -*-
import sys, json, os
import scriptengine as se
info = {}
flags = se.VersionUpdateFlags.NoUpdates | se.VersionUpdateFlags.SilentMode
project = se.projects.open(${JSON.stringify(PROJECT)}, update_flags=flags)
app = project.active_application
info["app_found"] = app is not None
if app is None:
    for ch in project.get_children(True):
        if getattr(ch, "is_application", False):
            app = ch
            break
def safe(s):
    try:
        return s.encode("ascii", "xmlcharrefreplace")
    except Exception:
        return repr(s)
if app is not None:
    lm_obj = app.get_library_manager()
    info["lm_type"] = str(type(lm_obj))
    try:
        libs = lm_obj.get_libraries(False)
        info["app_libraries"] = [safe(str(x)) for x in libs]
    except Exception as e:
        info["app_libraries_error"] = str(e)
lmgr = getattr(se, "librarymanager", None) or globals().get("librarymanager")
info["lmgr_found"] = lmgr is not None
if lmgr is not None:
    try:
        f = lmgr.find_library("Standard")
        info["find_Standard_type"] = str(type(f))
        info["find_Standard_repr"] = safe(repr(f))
    except Exception as e:
        info["find_Standard_error"] = str(e)
    try:
        hits = []
        for lib in lmgr.get_all_libraries(True):
            nm = str(getattr(lib, "displayname", getattr(lib, "name", lib)))
            if "standard" in nm.lower():
                hits.append(safe(nm))
        info["installed_standard_like"] = hits[:20]
    except Exception as e:
        info["get_all_error"] = str(e)
sys.stdout.write("###JSON_START###" + json.dumps(info) + "###JSON_END###\\n")
print("SCRIPT_SUCCESS: lib probe done")
`;

const r = await runScript(script, cfg);
console.log('success:', r.success);
console.log(JSON.stringify(r.data, null, 2) ?? '');
if (!r.data) console.log(r.output.slice(0, 4000));
