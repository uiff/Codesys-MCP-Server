# codesys-auto-mcp

**An independent [Model Context Protocol](https://modelcontextprotocol.io) server for CODESYS V3** — lets AI agents (Claude Desktop, Claude Code, Cursor, …) create CODESYS projects, insert controllers and IO cards, generate Structured Text code, wire tasks, and compile with **structured error read-back**.

No IDE plugin required: the server drives CODESYS headless via its official Scripting Engine (`CODESYS.exe --profile … --noUI --runscript …`).

## Requirements

- **Windows** (CODESYS V3 is Windows-only)
- **CODESYS V3.5** (tested with 3.5 SP22) installed **with the Scripting Engine component** (included in a default installation)
- **Node.js ≥ 18**

## Installation

```bash
git clone https://github.com/uiff/Codesys-MCP-Server.git
cd Codesys-MCP-Server
npm install        # also compiles (prepare script)
npm run test:smoke # protocol self-test, no CODESYS needed
```

## Configuration

The server **auto-detects** the newest CODESYS installation under `%ProgramFiles%` and derives the profile name from `<install>\CODESYS\Profiles\*.profile.xml`. Zero-config works for standard installs.

Overrides (flag > environment variable > auto-detection):

| Flag | Env var | Meaning |
|---|---|---|
| `--codesys-path` | `CODESYS_PATH` | Full path to `CODESYS.exe` |
| `--codesys-profile` | `CODESYS_PROFILE` | Profile name, e.g. `CODESYS V3.5 SP22 Patch 1` (shown in the CODESYS title bar) |
| `--timeout` | `CODESYS_TIMEOUT` | Per-call timeout in ms (default 240000) |

### Claude Desktop / Claude Code / Cursor (stdio)

```json
{
  "mcpServers": {
    "codesys": {
      "command": "node",
      "args": ["C:/path/to/codesys-auto-mcp/dist/bin.js"]
    }
  }
}
```

Add flags to `args` only if auto-detection doesn't fit your setup.

## Tools (21)

| Group | Tools |
|---|---|
| Project | `codesys_create_project` · `codesys_open_project` · `codesys_save_project` · `codesys_browse_tree` |
| Code | `codesys_create_pou` · `codesys_set_pou_code` · `codesys_get_pou_code` · `codesys_create_gvl` · `codesys_create_dut` (struct/enum) |
| Task | `codesys_create_task` · `codesys_add_program_to_task` |
| Libraries | `codesys_add_library` (add `Standard` before `R_TRIG`/`TON`/`TP`) · `codesys_resolve_placeholder` (fix a device-pinned lib version) |
| Build | `codesys_build` — returns `{ clean, errorCount, errors[], warnings[] }` from the CODESYS Build message store |
| Device/IO | `codesys_list_devices` · `codesys_insert_device` (accepts version `*` = newest installed) · `codesys_get_io_config` · `codesys_map_io` |
| Knowledge base | `codesys_list_patterns` · `codesys_get_pattern` · `codesys_catalog_devices` |

### What makes it reliable

- **Structured build gate.** CODESYS `build()` returns nothing — naive automation reports success on broken code. This server clears the Build message category (`{97F48D64-A2A3-4856-B640-75C046E37EA9}`), compiles, and returns typed errors/warnings, enabling a generate → build → fix loop.
- **Serialized execution.** Tool calls are queued so only one CODESYS process ever touches a project at a time.
- **Cold-start handling.** The first CODESYS launch is slow; the server retries once on timeout, then subsequent calls hit the warm instance.
- **Pattern library.** Ships verified IEC 61131-3 function blocks (with acceptance-test headers) that agents instantiate instead of free-forming logic — e.g. `FB_ConveyorSegment` (edge-triggered timed stop, `TP`-based) and `FB_DebounceDI`.

## Typical agent flow (conveyor example)

1. `codesys_create_project`
2. `codesys_list_devices` filter `"CODESYS Control Win"` → `codesys_insert_device` (type 4096, id `0000 0001`)
3. `codesys_add_library` `"Standard"` (script-created projects reference no libraries)
4. `codesys_get_pattern` `FB_ConveyorSegment` → `codesys_create_pou` + `codesys_set_pou_code`
5. `codesys_create_gvl` `GVL_IO` → `codesys_create_pou` `PLC_PRG`
6. `codesys_create_task` + `codesys_add_program_to_task`
7. `codesys_build` → must return `clean: true`
8. `codesys_get_io_config` → `codesys_map_io` (bind channels to `GVL_IO.*`)

`test/e2e.mjs` runs exactly this pipeline against your local CODESYS — it is the
release gate and passes end-to-end (16 steps, clean build) on CODESYS 3.5 SP22.

### Version quirks this server absorbs (so agents don't have to)

- CODESYS's CLI rejects standard Windows argv quoting: `--profile="Name With Spaces"` must be value-quoted; the server composes the command line itself.
- `ScriptDeviceDescription.name` doesn't exist on newer versions — device names are resolved via `device_info.name`.
- IronPython's `json` crashes on non-ASCII (®, umlauts); all output is entity-escaped before serialization.
- Script-added library references default to `qualified_only`, hiding `R_TRIG`/`TP` behind the namespace; the server clears the flag like the IDE does.
- `get_all_devices` has ambiguous overloads; some "succeed" with empty results.

## Testing

```bash
npm run test:smoke   # MCP handshake + tools list + KB tool (no CODESYS)
node test/e2e.mjs    # full live pipeline against the local CODESYS (minutes)
```

## Troubleshooting

- **First call times out** → cold start; the call is retried automatically. If your machine is slow, raise `--timeout`.
- **"Could not locate a CODESYS installation"** → pass `--codesys-path` and `--codesys-profile` explicitly.
- **Profile errors from CODESYS** → the profile name must match exactly; check `<install>\CODESYS\Profiles\*.profile.xml` or the CODESYS title bar.
- **A stale CODESYS instance holds the profile** → close CODESYS windows / check Task Manager for `CODESYS.exe`.

## Security notes

This server launches `CODESYS.exe` with generated scripts and full user permissions: it can create/modify project files anywhere the user can write. Run it only with MCP clients you trust, and treat project paths passed by an agent as you would treat any file-write. It performs **no** PLC downloads to physical hardware.

## Safety notice (PLC code)

Generated IEC 61131-3 code is engineering assistance, **not** certified functional-safety logic. Personnel-protection functions (e-stop, guards, light curtains) belong on safety-rated hardware with certified PLCopen Safety function blocks and must be validated by a qualified engineer.

## Known limitations

- **Vendor-locked IO editors.** Some vendors route their IO modules through a proprietary GUI editor with no scripting hook. Example: **Weidmüller u-control M-series** — u-remote cards on the integrated `System_Bus` cannot be added by *any* script (CODESYS itself replies *"add the device in the Device Manager editor of the System-Bus device"*). The card must be inserted once in the IDE; everything else (controller, code, tasks, libraries, build — and `map_io` afterwards) is automated. Standard drivers (EtherCAT/Modbus/CANopen/Profinet) accept scripted `insert_device`.
- **IO variable binding** (`map_io`) uses the documented ScriptEngine API incl. connector traversal but has not been exercised against physical IO hardware yet.
- **No online download** to a PLC — this server builds/validates projects; downloading is a manual, deliberate step in the IDE.

## Example: complete heat-pump controller

**[examples/heatpump/](examples/heatpump/)** contains a full heat-pump control application — heat curve, DHW priority, compressor anti-short-cycle protection, pump pre/post sequencing, backup-heater bivalence, safety interlocks, and a 7-state machine — as:

- a **ready-built `.project`** you can open directly in CODESYS, and
- the **ST sources + `generate.mjs`**, which regenerates and builds the whole project through this server in one run (`node examples/heatpump/generate.mjs` → ends with `"clean":true`).

## Status / Roadmap

- ✅ Project, code, library, task, and build tools — **verified end-to-end against CODESYS 3.5 SP22** (see `test/e2e.mjs`: project → Control Win V3 → Standard lib → ST code → task → clean build)
- ✅ Device listing/insertion — verified live (1686-device repository enumerated; controller insert works)
- ⚠️ IO mapping (`codesys_map_io`) uses the documented ScriptEngine API incl. connector traversal, but hasn't been exercised against physical IO hardware yet
- 🔜 Online/simulation testing (login, force values, read outputs)
- 🔜 Pattern-library CI self-tests against a real CODESYS build

## Contributing

Issues and pull requests are welcome! Especially valuable:

- **Version quirk reports** — CODESYS service packs and vendor packages differ; if a tool misbehaves on your setup, open an issue with the CODESYS version, profile name, and the tool's error output.
- **Pattern library additions** (`kb/patterns/*.st`) — reusable, verified IEC 61131-3 function blocks with an acceptance-test header.
- **Device catalog entries** (`kb/catalog/`) — confirmed DeviceID triples for controllers and IO cards.

Before submitting: `npm run build && npm run test:smoke` must pass; if you have CODESYS installed, `node test/e2e.mjs` is the full gate.

## License

MIT
