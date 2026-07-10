/**
 * scripts.ts — builders that produce the IronPython (Python 2.7) payload for
 * each tool. Bodies are written flush-left (no TS indentation) because Python
 * is indentation-sensitive. Values are injected via pyStr()/b64()/number.
 */

import { pyStr, b64, wrap } from './pyscript';

const BUILD_CATEGORY_GUID = '{97F48D64-A2A3-4856-B640-75C046E37EA9}';

export function createProject(projectPath: string): string {
  return wrap(`PROJECT = ${pyStr(projectPath)}
try:
    if not os.path.isabs(PROJECT):
        raise ValueError("projectFilePath must be an ABSOLUTE path (got: %r)." % PROJECT)
    d = os.path.dirname(PROJECT)
    if d and not os.path.exists(d):
        os.makedirs(d)
    p = se.projects.create(PROJECT)
    p.save()
    ok("Project created: " + PROJECT)
except Exception as e:
    traceback.print_exc()
    fail(e)`);
}

export function openProject(projectPath: string): string {
  return wrap(`PROJECT = ${pyStr(projectPath)}
try:
    p = ensure_open(PROJECT)
    # ScriptProject has .path but no get_name() — derive the name from the path.
    nm = os.path.basename(p.path) if p else PROJECT
    ok("Project open: " + str(nm))
except Exception as e:
    traceback.print_exc()
    fail(e)`);
}

export function saveProject(projectPath: string): string {
  return wrap(`PROJECT = ${pyStr(projectPath)}
try:
    p = ensure_open(PROJECT)
    p.save()
    ok("Project saved")
except Exception as e:
    traceback.print_exc()
    fail(e)`);
}

export function browseTree(projectPath: string, rootPath: string, maxDepth: number): string {
  return wrap(`PROJECT = ${pyStr(projectPath)}
ROOT = ${pyStr(rootPath)}
MAXD = ${String(maxDepth)}
def node_type(o):
    try:
        if getattr(o, "is_folder", False): return "folder"
        if getattr(o, "is_device", False): return "device"
        if getattr(o, "is_application", False): return "application"
        if getattr(o, "is_task_configuration", False): return "task_config"
        if getattr(o, "is_task", False): return "task"
        # No is_pou marker exists in the ScriptEngine — detect POUs by their
        # textual implementation part.
        if getattr(o, "has_textual_implementation", False): return "pou"
        if hasattr(o, "textual_implementation") and o.textual_implementation is not None: return "pou"
        if hasattr(o, "textual_declaration") and o.textual_declaration is not None: return "declaration"
    except Exception:
        pass
    return "object"
def walk(o, prefix, depth, acc):
    try:
        name = o.get_name()
    except Exception:
        name = "?"
    p = (prefix + "/" + name) if prefix else name
    acc.append({"path": p, "name": name, "type": node_type(o)})
    if depth <= 0:
        return
    try:
        for ch in o.get_children(False):
            walk(ch, p, depth - 1, acc)
    except Exception:
        pass
try:
    project = ensure_open(PROJECT)
    start = project
    if ROOT:
        start = find_obj(project, ROOT)
        if start is None:
            raise ValueError("Path not found: " + ROOT)
    acc = []
    for ch in start.get_children(False):
        walk(ch, "", MAXD - 1, acc)
    emit({"count": len(acc), "nodes": acc})
    ok("tree read")
except Exception as e:
    traceback.print_exc()
    fail(e)`);
}

export function createPou(projectPath: string, parentPath: string, name: string, pouType: string, returnType: string): string {
  return wrap(`PROJECT = ${pyStr(projectPath)}
PARENT = ${pyStr(parentPath)}
NAME = ${pyStr(name)}
PTYPE = ${pyStr(pouType)}
RTYPE = ${pyStr(returnType)}
try:
    project = ensure_open(PROJECT)
    parent = find_obj(project, PARENT)
    if parent is None:
        raise ValueError("Parent not found: " + PARENT)
    tmap = {"Program": se.PouType.Program, "FunctionBlock": se.PouType.FunctionBlock, "Function": se.PouType.Function}
    if PTYPE not in tmap:
        raise ValueError("Bad POU type: " + PTYPE)
    if PTYPE == "Function":
        if not RTYPE:
            raise ValueError("returnType is required when pouType is 'Function' (e.g. 'BOOL', 'INT').")
        parent.create_pou(name=NAME, type=tmap[PTYPE], language=None, return_type=RTYPE)
    else:
        parent.create_pou(name=NAME, type=tmap[PTYPE], language=None)
    project.save()
    ok("POU created: " + NAME)
except Exception as e:
    traceback.print_exc()
    fail(e)`);
}

export function setPouCode(projectPath: string, pouPath: string, declaration?: string, implementation?: string): string {
  return wrap(`PROJECT = ${pyStr(projectPath)}
POU = ${pyStr(pouPath)}
DECL_SET = ${declaration !== undefined ? 'True' : 'False'}
DECL_B64 = ${pyStr(declaration !== undefined ? b64(declaration) : '')}
IMPL_SET = ${implementation !== undefined ? 'True' : 'False'}
IMPL_B64 = ${pyStr(implementation !== undefined ? b64(implementation) : '')}
try:
    if not (DECL_SET or IMPL_SET):
        raise ValueError("Provide declaration and/or implementation — neither was given.")
    project = ensure_open(PROJECT)
    obj = find_obj(project, POU)
    if obj is None:
        raise ValueError("Object not found: " + POU)
    changed = []
    if DECL_SET:
        if not hasattr(obj, "textual_declaration") or obj.textual_declaration is None:
            raise ValueError("Object has no textual declaration: " + POU)
        obj.textual_declaration.replace(dec(DECL_B64) or "")
        changed.append("declaration")
    if IMPL_SET:
        if not hasattr(obj, "textual_implementation") or obj.textual_implementation is None:
            raise ValueError("Object has no textual implementation: " + POU)
        obj.textual_implementation.replace(dec(IMPL_B64) or "")
        changed.append("implementation")
    project.save()
    ok("Code set (" + "+".join(changed) + "): " + POU)
except Exception as e:
    traceback.print_exc()
    fail(e)`);
}

export function getPouCode(projectPath: string, pouPath: string): string {
  return wrap(`PROJECT = ${pyStr(projectPath)}
POU = ${pyStr(pouPath)}
try:
    project = ensure_open(PROJECT)
    obj = find_obj(project, POU)
    if obj is None:
        raise ValueError("Object not found: " + POU)
    decl = ""
    impl = ""
    try:
        if hasattr(obj, "textual_declaration"):
            decl = obj.textual_declaration.text
    except Exception:
        pass
    try:
        if hasattr(obj, "textual_implementation"):
            impl = obj.textual_implementation.text
    except Exception:
        pass
    emit({"path": POU, "declaration": decl, "implementation": impl})
    ok("code read")
except Exception as e:
    traceback.print_exc()
    fail(e)`);
}

export function createGvl(projectPath: string, parentPath: string, name: string, declaration?: string): string {
  return wrap(`PROJECT = ${pyStr(projectPath)}
PARENT = ${pyStr(parentPath)}
NAME = ${pyStr(name)}
DECL_B64 = ${pyStr(declaration ? b64(declaration) : '')}
try:
    project = ensure_open(PROJECT)
    parent = find_obj(project, PARENT)
    if parent is None:
        raise ValueError("Parent not found: " + PARENT)
    gvl = parent.create_gvl(NAME)
    decl = dec(DECL_B64)
    if decl is not None and hasattr(gvl, "textual_declaration"):
        gvl.textual_declaration.replace(decl)
    project.save()
    ok("GVL created: " + NAME)
except Exception as e:
    traceback.print_exc()
    fail(e)`);
}

export function createTask(projectPath: string, appPath: string, name: string, interval: string, unit: string, priority: string): string {
  return wrap(`PROJECT = ${pyStr(projectPath)}
APP = ${pyStr(appPath)}
NAME = ${pyStr(name)}
INTERVAL = ${pyStr(interval)}
UNIT = ${pyStr(unit)}
PRIORITY = ${pyStr(priority)}
try:
    project = ensure_open(PROJECT)
    app = find_obj(project, APP) if APP else active_app(project)
    if app is None:
        raise ValueError("Application not found")
    tc = None
    try:
        for ch in app.get_children(True):
            if getattr(ch, "is_task_configuration", False):
                tc = ch
                break
    except Exception:
        pass
    if tc is None:
        tc = app.create_task_configuration()
    task = tc.create_task(NAME)
    kt = getattr(se, "KindOfTask", None) or globals().get("KindOfTask")
    if kt is not None:
        task.kind_of_task = kt.Cyclic
    else:
        task.kind_of_task = 1  # KindOfTask.Cyclic
    task.interval = INTERVAL
    task.interval_unit = UNIT
    task.priority = PRIORITY
    project.save()
    ok("Task created: " + NAME)
except Exception as e:
    traceback.print_exc()
    fail(e)`);
}

export function addProgramToTask(projectPath: string, taskPath: string, programName: string): string {
  return wrap(`PROJECT = ${pyStr(projectPath)}
TASKPATH = ${pyStr(taskPath)}
PROG = ${pyStr(programName)}
try:
    project = ensure_open(PROJECT)
    task = find_obj(project, TASKPATH)
    if task is None:
        raise ValueError("Task not found: " + TASKPATH)
    task.pous.add(PROG)
    project.save()
    ok("Program added to task: " + PROG)
except Exception as e:
    traceback.print_exc()
    fail(e)`);
}

export function addLibrary(projectPath: string, appPath: string, libraryName: string): string {
  return wrap(`PROJECT = ${pyStr(projectPath)}
APP = ${pyStr(appPath)}
LIBNAME = ${pyStr(libraryName)}
try:
    project = ensure_open(PROJECT)
    app = find_obj(project, APP) if APP else active_app(project)
    container = app if app is not None else project
    if not hasattr(container, "get_library_manager"):
        raise RuntimeError("Container does not support a library manager")
    lm_obj = container.get_library_manager()
    lmgr = getattr(se, "librarymanager", None) or globals().get("librarymanager") or getattr(se, "library_manager", None) or globals().get("library_manager")
    if lmgr is None:
        raise RuntimeError("ScriptEngine 'librarymanager' global not found")
    # Installed display names look like "Standard, 3.5.22.0 (System)".
    # Match on the BASE name before the comma — a raw substring search would
    # hit "IoStandard" when asked for "Standard". Prefer exact base match,
    # highest version. (find_library is broken on some versions.)
    def lib_disp(lib):
        return str(getattr(lib, "displayname", getattr(lib, "name", lib)))
    def lib_base(nm):
        return nm.split(",")[0].strip().lower()
    def lib_ver(nm):
        try:
            v = nm.split(",")[1].strip().split(" ")[0]
            return [int(x) for x in v.split(".")]
        except Exception:
            return [0]
    want = LIBNAME.split(",")[0].strip().lower()
    exact = []
    partial = []
    for lib in lmgr.get_all_libraries(True):
        try:
            nm = lib_disp(lib)
            base = lib_base(nm)
            if base == want:
                exact.append((lib_ver(nm), nm, lib))
            elif want in base:
                partial.append((lib_ver(nm), nm, lib))
        except Exception:
            pass
    pool = exact if exact else partial
    if not pool:
        raise ValueError("Library not installed: " + LIBNAME)
    pool.sort()
    ver, disp, mlib = pool[-1]
    lm_obj.add_library(mlib)
    # Script-added references default to qualified_only=True, which hides
    # unqualified names (R_TRIG vs Standard.R_TRIG) and breaks normal ST.
    # Clear the flag to match the IDE's behavior when adding via UI.
    try:
        for ref in lm_obj.references:
            try:
                nm = str(getattr(ref, "name", ref))
                if lib_base(nm) == want and getattr(ref, "qualified_only", False):
                    ref.qualified_only = False
            except Exception:
                pass
    except Exception:
        pass
    project.save()
    ok("Library added: " + disp)
except Exception as e:
    traceback.print_exc()
    fail(e)`);
}

export function resolvePlaceholder(projectPath: string, appPath: string, placeholderName: string, resolution: string): string {
  return wrap(`PROJECT = ${pyStr(projectPath)}
APP = ${pyStr(appPath)}
PH = ${pyStr(placeholderName)}
RES = ${pyStr(resolution)}
try:
    project = ensure_open(PROJECT)
    app = find_obj(project, APP) if APP else active_app(project)
    container = app if app is not None else project
    lm = container.get_library_manager()
    # Ensure the placeholder exists (device descriptions may pin a library
    # version that is not installed; a redirection fixes the resolution).
    target = None
    for ref in lm.references:
        try:
            if getattr(ref, "is_placeholder", False) and str(getattr(ref, "placeholder_name", "")).lower() == PH.lower():
                target = ref
                break
        except Exception:
            pass
    if target is None:
        # Create the placeholder bound to the installed library matching RES.
        lmgr = getattr(se, "librarymanager", None) or globals().get("librarymanager")
        want = RES.split(",")[0].strip().lower()
        mlib = None
        for lib in lmgr.get_all_libraries(True):
            nm = str(getattr(lib, "displayname", getattr(lib, "name", lib)))
            if nm.split(",")[0].strip().lower() == want:
                mlib = lib
                if nm.strip().lower() == RES.strip().lower():
                    break
        if mlib is None:
            raise ValueError("No installed library matches: " + RES)
        lm.add_placeholder(PH, mlib)
        for ref in lm.references:
            if getattr(ref, "is_placeholder", False) and str(getattr(ref, "placeholder_name", "")).lower() == PH.lower():
                target = ref
                break
    if target is None:
        raise RuntimeError("Placeholder not found/created: " + PH)
    target.set_redirection(RES)
    project.save()
    ok("Placeholder %s redirected to %s" % (PH, RES))
except Exception as e:
    traceback.print_exc()
    fail(e)`);
}

export function build(projectPath: string): string {
  return wrap(`PROJECT = ${pyStr(projectPath)}
try:
    from System import Guid
    project = ensure_open(PROJECT)
    app = active_app(project)
    if app is None:
        raise ValueError("No application to build")
    sysobj = get_system()
    CG = Guid("${BUILD_CATEGORY_GUID}")
    try:
        sysobj.clear_messages(CG)
    except Exception:
        try:
            sysobj.clear_messages()
        except Exception:
            pass
    try:
        app.generate_code()
    except Exception:
        app.build()
    msgs = []
    try:
        msgs = list(sysobj.get_message_objects(CG))
    except Exception:
        try:
            msgs = list(sysobj.get_message_objects())
        except Exception:
            msgs = []
    errs = []
    warns = []
    for m in msgs:
        sev = str(getattr(m, "severity", ""))
        item = {"severity": sev, "text": str(getattr(m, "text", "")), "prefix": str(getattr(m, "prefix", "")), "pos": str(getattr(m, "position_text", ""))}
        low = sev.lower()
        if "error" in low:
            errs.append(item)
        elif "warning" in low:
            warns.append(item)
    emit({"clean": len(errs) == 0, "errorCount": len(errs), "warningCount": len(warns), "errors": errs, "warnings": warns})
    ok("Build complete: %d error(s), %d warning(s)" % (len(errs), len(warns)))
except Exception as e:
    traceback.print_exc()
    fail(e)`);
}

export function listDevices(projectPath: string, filter: string, maxResults: number): string {
  return wrap(`PROJECT = ${pyStr(projectPath)}
FILTER = ${pyStr(filter)}
MAXR = ${String(maxResults)}
try:
    project = ensure_open(PROJECT)
    repo = get_repo()
    # Fetch ALL devices and filter here: the repository's name matching is not
    # a reliable substring search across CODESYS versions. Some signatures
    # "succeed" but return an empty collection (e.g. name=None) — advance the
    # ladder on empty results too, keeping the first NON-empty one.
    devs = None
    args_used = None
    # ("",) is the signature proven to enumerate everything on 3.5 SP22;
    # keep fallbacks for other versions. Advance on empty results too.
    for args in (("",), ("", None), (), (None,), (None, None)):
        try:
            cand = repo.get_all_devices(*args)
            n = 0
            try:
                n = len(cand)
            except Exception:
                cand = list(cand)
                n = len(cand)
            if args_used is None:
                devs = cand
                args_used = repr(args)
            if n > 0:
                devs = cand
                args_used = repr(args)
                break
        except Exception:
            pass
    if devs is None:
        raise RuntimeError("device repository enumeration failed: every get_all_devices signature raised")
    def dev_attr(d, chains):
        # ScriptDeviceDescription.name does not exist on all versions —
        # the display name may live on .device_info instead.
        for chain in chains:
            try:
                v = d
                for a in chain:
                    v = getattr(v, a)
                if v:
                    return str(v)
            except Exception:
                pass
        return ""
    flt = FILTER.lower()
    out = []
    total = 0
    enumerated = 0
    item_errors = 0
    for d in devs:
        enumerated += 1
        try:
            nm = dev_attr(d, (("name",), ("device_info", "name"), ("order_number",)))
            did = d.device_id
            if not nm:
                nm = "type=%s id=%s" % (did.type, did.id)
            if flt and flt not in nm.lower():
                continue
            total += 1
            if len(out) < MAXR:
                vend = dev_attr(d, (("vendor",), ("device_info", "vendor")))
                out.append({"name": nm, "vendor": vend, "type": did.type, "id": str(did.id), "version": str(did.version)})
        except Exception:
            item_errors += 1
    emit({"totalMatches": total, "returned": len(out), "truncated": total > len(out), "enumerated": enumerated, "itemErrors": item_errors, "argsUsed": args_used, "devices": out})
    ok("devices listed (%d of %d, enumerated %d)" % (len(out), total, enumerated))
except Exception as e:
    traceback.print_exc()
    fail(e)`);
}

export function insertDevice(projectPath: string, parentPath: string, name: string, deviceType: number, deviceId: string, version: string, moduleId: string): string {
  return wrap(`PROJECT = ${pyStr(projectPath)}
PARENT = ${pyStr(parentPath)}
NAME = ${pyStr(name)}
DTYPE = ${String(deviceType)}
DID = ${pyStr(deviceId)}
DVER = ${pyStr(version)}
DMOD = ${pyStr(moduleId)}
try:
    project = ensure_open(PROJECT)
    if PARENT:
        target = find_obj(project, PARENT)
        if target is None:
            raise ValueError("Parent not found: " + PARENT)
    else:
        target = project
    if DMOD:
        target.add(NAME, DTYPE, DID, DVER, DMOD)
    else:
        target.add(NAME, DTYPE, DID, DVER)
    project.save()
    ok("Device inserted: " + NAME)
except Exception as e:
    traceback.print_exc()
    fail(e)`);
}

export function getIoConfig(projectPath: string): string {
  return wrap(`PROJECT = ${pyStr(projectPath)}
try:
    project = ensure_open(PROJECT)
    devices = []
    def el_name(el):
        try:
            n = getattr(el, "name", None)
            if n:
                return str(n)
        except Exception:
            pass
        try:
            return el.get_name()
        except Exception:
            return str(el)
    def walk_elements(el, acc, depth):
        # Channels can be nested (compound data elements) — walk recursively.
        if depth > 8:
            return
        try:
            if getattr(el, "is_mappable_io", False):
                m = None
                try:
                    m = el.io_mapping
                except Exception:
                    pass
                var = None
                addr = None
                if m is not None:
                    try:
                        var = m.variable
                    except Exception:
                        pass
                    try:
                        addr = m.manual_iec_address  # returns effective address, auto or manual
                    except Exception:
                        pass
                chan = str(getattr(el, "channel_type", ""))
                acc.append({"name": el_name(el), "direction": chan, "variable": var, "address": addr})
        except Exception:
            pass
        try:
            if getattr(el, "has_sub_elements", False):
                for sub in el:
                    walk_elements(sub, acc, depth + 1)
        except Exception:
            pass
    def collect(o):
        try:
            if getattr(o, "is_device", False):
                did = None
                try:
                    did = o.get_device_identification()
                except Exception:
                    pass
                d = {"name": o.get_name(), "type": (did.type if did else None), "id": (did.id if did else None), "channels": []}
                try:
                    for pset in o.device_parameters:
                        walk_elements(pset, d["channels"], 0)
                except Exception:
                    pass
                # Fieldbus/onboard IO channels usually live under CONNECTORS
                # (host_parameters), not under device_parameters.
                try:
                    for conn in o.connectors:
                        try:
                            for pset in conn.host_parameters:
                                walk_elements(pset, d["channels"], 0)
                        except Exception:
                            pass
                except Exception:
                    pass
                devices.append(d)
        except Exception:
            pass
        try:
            for ch in o.get_children(False):
                collect(ch)
        except Exception:
            pass
    for ch in project.get_children(False):
        collect(ch)
    emit({"count": len(devices), "devices": devices})
    ok("io config read")
except Exception as e:
    traceback.print_exc()
    fail(e)`);
}

export function mapIo(projectPath: string, devicePath: string, channelName: string, variable: string): string {
  return wrap(`PROJECT = ${pyStr(projectPath)}
DEVICE = ${pyStr(devicePath)}
CHANNEL = ${pyStr(channelName)}
VARIABLE = ${pyStr(variable)}
try:
    project = ensure_open(PROJECT)
    dev = find_obj(project, DEVICE)
    if dev is None:
        raise ValueError("Device not found: " + DEVICE)
    def el_name(el):
        try:
            n = getattr(el, "name", None)
            if n:
                return str(n)
        except Exception:
            pass
        try:
            return el.get_name()
        except Exception:
            return str(el)
    seen = []
    def find_channel(el, depth):
        if depth > 8:
            return None
        try:
            if getattr(el, "is_mappable_io", False):
                nm = el_name(el)
                seen.append(nm)
                if nm == CHANNEL:
                    return el
        except Exception:
            pass
        try:
            if getattr(el, "has_sub_elements", False):
                for sub in el:
                    hit = find_channel(sub, depth + 1)
                    if hit is not None:
                        return hit
        except Exception:
            pass
        return None
    target = None
    for pset in dev.device_parameters:
        target = find_channel(pset, 0)
        if target is not None:
            break
    if target is None:
        try:
            for conn in dev.connectors:
                try:
                    for pset in conn.host_parameters:
                        target = find_channel(pset, 0)
                        if target is not None:
                            break
                except Exception:
                    pass
                if target is not None:
                    break
        except Exception:
            pass
    if target is None:
        raise ValueError("Mappable channel not found: " + CHANNEL + ". Available: " + ", ".join(seen[:40]))
    m = target.io_mapping
    if m is None:
        raise ValueError("Channel has no io_mapping: " + CHANNEL)
    m.variable = VARIABLE
    project.save()
    ok("Mapped " + CHANNEL + " -> " + VARIABLE)
except Exception as e:
    traceback.print_exc()
    fail(e)`);
}
