/**
 * pyscript.ts — helpers to build IronPython (Python 2.7) payloads safely.
 *
 * String literals: pyStr() emits a properly escaped Python double-quoted string.
 * Code blocks (ST source, which may contain quotes/newlines) are passed as
 * base64 to sidestep all escaping issues and decoded inside the script.
 */

export function pyStr(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n');
  return `"${escaped}"`;
}

export function b64(value: string): string {
  return Buffer.from(value, 'utf-8').toString('base64');
}

/** Shared Python preamble: imports + engine helpers used by every script. */
export const PREAMBLE = `# -*- coding: utf-8 -*-
import sys, os, re, json, base64, traceback
import scriptengine as se

JS = "###JSON_START###"
JE = "###JSON_END###"

def _ascii_safe(s):
    # IronPython's json chokes on non-ASCII text (tries s.decode('utf-8') via
    # the system codepage). Pre-encode to pure ASCII with readable entities,
    # e.g. u"\\xae" -> "&#174;". Applies to device names (®), German
    # build messages (umlauts), etc.
    try:
        return s.encode("ascii", "xmlcharrefreplace")
    except Exception:
        try:
            return repr(s)
        except Exception:
            return "?"

def _clean(obj):
    if isinstance(obj, dict):
        return dict((_clean(k), _clean(v)) for k, v in obj.items())
    if isinstance(obj, (list, tuple)):
        return [_clean(x) for x in obj]
    if isinstance(obj, basestring):
        return _ascii_safe(obj)
    return obj

def emit(obj):
    sys.stdout.write(JS + json.dumps(_clean(obj)) + JE + "\\n")

def ok(msg):
    print("SCRIPT_SUCCESS: " + str(msg))

def fail(msg):
    print("SCRIPT_ERROR: " + str(msg))

def get_system():
    s = getattr(se, "system", None)
    if s is not None:
        return s
    return system  # injected global fallback

def get_repo():
    r = getattr(se, "device_repository", None)
    if r is not None:
        return r
    return device_repository  # injected global fallback

def dec(b64text):
    if not b64text:
        return None
    return base64.b64decode(b64text).decode("utf-8")

def ensure_open(project_path):
    if not os.path.isabs(project_path):
        raise ValueError("projectFilePath must be an ABSOLUTE path (got: %r). Relative paths would resolve inside the CODESYS installation directory." % project_path)
    try:
        pr = se.projects.primary
        if pr and os.path.normcase(os.path.abspath(pr.path)) == os.path.normcase(os.path.abspath(project_path)):
            return pr
    except Exception:
        pass
    flags = se.VersionUpdateFlags.NoUpdates | se.VersionUpdateFlags.SilentMode
    return se.projects.open(project_path, update_flags=flags)

def find_obj(root, full):
    parts = [p for p in re.split(r"[\\\\./]+", full) if p]
    node = root
    for part in parts:
        found = None
        try:
            for ch in node.get_children(False):
                try:
                    if ch.get_name() == part:
                        found = ch
                        break
                except Exception:
                    pass
        except Exception:
            pass
        if found is None:
            try:
                res = node.find(part, True)
                if res:
                    found = res[0]
            except Exception:
                pass
        if found is None:
            return None
        node = found
    return node

def active_app(project):
    try:
        a = project.active_application
        if a:
            return a
    except Exception:
        pass
    try:
        for ch in project.get_children(True):
            if getattr(ch, "is_application", False):
                return ch
    except Exception:
        pass
    return None
`;

/** Wraps a body (which should define its own try/except) with the preamble. */
export function wrap(body: string): string {
  return `${PREAMBLE}\n${body}\n`;
}
