// Deep diagnostic: introspect the ScriptEngine device-repository accessor
// directly via interop (bypasses MCP). No project needed.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { runScript } = require('../dist/interop.js');
const { detectCodesys } = require('../dist/detect.js');

const det = detectCodesys();
if (!det) { console.log('no CODESYS found'); process.exit(1); }
const cfg = { codesysPath: det.codesysPath, profileName: det.profileName, timeoutMs: 300000 };

const script = `# -*- coding: utf-8 -*-
import sys, json
import scriptengine as se
info = {}
info["se_device_names"] = [n for n in dir(se) if "device" in n.lower() or "repo" in n.lower()]
repo = getattr(se, "device_repository", None)
if repo is None:
    repo = globals().get("device_repository")
info["repo_found"] = repo is not None
if repo is not None:
    info["repo_type"] = str(type(repo))
    info["repo_members"] = [m for m in dir(repo) if not m.startswith("_")][:60]
    results = {}
    for args in [(), (None,), ("",), (None, None), ("", None)]:
        key = repr(args)
        try:
            r = repo.get_all_devices(*args)
            try:
                n = len(r)
            except Exception:
                r = list(r)
                n = len(r)
            names = []
            for d in r[:5]:
                try:
                    names.append(str(d.name))
                except Exception as ne:
                    names.append("ERR:" + str(ne))
            results[key] = {"count": n, "sample": names}
        except Exception as e:
            results[key] = {"error": str(e)}
    info["get_all_devices"] = results
    # Also try sources-based enumeration
    try:
        srcs = repo.sources
        info["sources_count"] = len(srcs)
        per_src = []
        for s in srcs:
            try:
                r = repo.get_all_devices("", s)
                try:
                    n = len(r)
                except Exception:
                    r = list(r)
                    n = len(r)
                per_src.append(n)
            except Exception as e:
                per_src.append("ERR:" + str(e))
        info["per_source_counts"] = per_src
    except Exception as e:
        info["sources_error"] = str(e)
sys.stdout.write("###JSON_START###" + json.dumps(info) + "###JSON_END###\\n")
print("SCRIPT_SUCCESS: repo probe done")
`;

const r = await runScript(script, cfg);
console.log('success:', r.success, 'timedOut:', r.timedOut);
console.log(JSON.stringify(r.data, null, 2) ?? r.output.slice(0, 4000));
if (!r.data) console.log(r.output.slice(0, 4000));
