/**
 * server.ts — the independent CODESYS MCP server (stdio transport).
 * Registers project/POU/task/build/device/IO tools plus knowledge-base tools.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { runScriptWithRetry, CodesysConfig, ScriptResult } from './interop';
import * as scripts from './scripts';
import * as kb from './kb';

export interface ServerConfig {
  codesysPath: string;
  profileName: string;
  timeoutMs: number;
}

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

function fmt(r: ScriptResult): ToolResult {
  const parts: string[] = [];
  if (r.timedOut) {
    parts.push('TIMEOUT: CODESYS did not respond within the configured timeout (cold-start calls are retried automatically). If this persists, raise --timeout / CODESYS_TIMEOUT and check Task Manager for stuck CODESYS.exe processes.');
  }
  parts.push(r.success ? (r.output || 'OK') : `ERROR:\n${r.output}`);
  if (r.data !== undefined) {
    parts.push(`DATA:\n${JSON.stringify(r.data, null, 2)}`);
  }
  return { content: [{ type: 'text', text: parts.join('\n\n') }], isError: !r.success };
}

function text(value: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text: value }], isError };
}

export async function startMcpServer(config: ServerConfig): Promise<void> {
  const cfg: CodesysConfig = {
    codesysPath: config.codesysPath,
    profileName: config.profileName,
    timeoutMs: config.timeoutMs,
  };

  const server = new McpServer({
    name: 'codesys-auto-mcp',
    version: '0.1.0',
  });

  // Loosely-typed registration wrapper. Passing zod raw shapes straight into
  // the SDK's generic registerTool across ~19 tools triggers TS2589
  // ("excessively deep type instantiation"). This wrapper keeps the exact
  // runtime behavior while cutting the compile-time generic inference.
  const reg = server.registerTool.bind(server) as unknown as (
    name: string,
    config: Record<string, unknown>,
    handler: (args: any) => Promise<ToolResult> | ToolResult,
  ) => void;

  const rw = false;   // readOnlyHint default for mutating tools
  const openWorld = { openWorldHint: true };

  // ---------------- Project ----------------
  reg(
    'codesys_create_project',
    {
      title: 'Create CODESYS project',
      description: 'Creates a new empty CODESYS project at the given .project path. Add a controller afterwards with codesys_insert_device (e.g. CODESYS Control Win V3).',
      inputSchema: { projectFilePath: z.string().describe('Absolute path ending in .project, e.g. C:/Projects/My.project') },
      annotations: { readOnlyHint: rw, destructiveHint: true, idempotentHint: false, ...openWorld },
    },
    async ({ projectFilePath }) => fmt(await runScriptWithRetry(scripts.createProject(projectFilePath), cfg)),
  );

  reg(
    'codesys_open_project',
    {
      title: 'Open CODESYS project',
      description: 'Opens an existing .project file (silently, no version updates).',
      inputSchema: { projectFilePath: z.string() },
      annotations: { readOnlyHint: true, ...openWorld },
    },
    async ({ projectFilePath }) => fmt(await runScriptWithRetry(scripts.openProject(projectFilePath), cfg)),
  );

  reg(
    'codesys_save_project',
    {
      title: 'Save CODESYS project',
      description: 'Saves the given (open) project to disk.',
      inputSchema: { projectFilePath: z.string() },
      annotations: { readOnlyHint: rw, idempotentHint: true, ...openWorld },
    },
    async ({ projectFilePath }) => fmt(await runScriptWithRetry(scripts.saveProject(projectFilePath), cfg)),
  );

  reg(
    'codesys_browse_tree',
    {
      title: 'Browse project tree',
      description: 'Returns the object tree (name/type/path) as JSON. Use rootPath (dot- or slash-separated, e.g. "Device.Plc Logic.Application") to scope, empty for the whole project.',
      inputSchema: {
        projectFilePath: z.string(),
        rootPath: z.string().default('').describe('Sub-path to start from, or empty for the whole project'),
        maxDepth: z.number().int().min(1).max(20).default(6),
      },
      annotations: { readOnlyHint: true, ...openWorld },
    },
    async ({ projectFilePath, rootPath, maxDepth }) => fmt(await runScriptWithRetry(scripts.browseTree(projectFilePath, rootPath, maxDepth), cfg)),
  );

  // ---------------- POU / code ----------------
  reg(
    'codesys_create_pou',
    {
      title: 'Create POU',
      description: 'Creates a Program, FunctionBlock, or Function under parentPath (e.g. "Device.Plc Logic.Application"). Language defaults to Structured Text. For pouType "Function", returnType is required (e.g. "BOOL").',
      inputSchema: {
        projectFilePath: z.string(),
        parentPath: z.string().describe('Dot/slash path to the container, e.g. Device.Plc Logic.Application'),
        name: z.string().describe('Valid IEC identifier'),
        pouType: z.enum(['Program', 'FunctionBlock', 'Function']),
        returnType: z.string().default('').describe('IEC return type — required for pouType "Function" (e.g. "BOOL", "INT"), ignored otherwise'),
      },
      annotations: { readOnlyHint: rw, ...openWorld },
    },
    async ({ projectFilePath, parentPath, name, pouType, returnType }) => fmt(await runScriptWithRetry(scripts.createPou(projectFilePath, parentPath, name, pouType, returnType), cfg)),
  );

  reg(
    'codesys_set_pou_code',
    {
      title: 'Set POU code',
      description: 'Sets the declaration (VAR...END_VAR header) and/or implementation (body) of a POU/Method/Property. Omit a part to leave it unchanged. Declaration should NOT include the trailing END_FUNCTION_BLOCK/END_PROGRAM.',
      inputSchema: {
        projectFilePath: z.string(),
        pouPath: z.string().describe('Dot/slash path to the POU, e.g. Device.Plc Logic.Application.PLC_PRG'),
        declaration: z.string().optional().describe('Declaration part (header + VAR blocks)'),
        implementation: z.string().optional().describe('Implementation body (ST statements)'),
      },
      annotations: { readOnlyHint: rw, ...openWorld },
    },
    async ({ projectFilePath, pouPath, declaration, implementation }) => fmt(await runScriptWithRetry(scripts.setPouCode(projectFilePath, pouPath, declaration, implementation), cfg)),
  );

  reg(
    'codesys_get_pou_code',
    {
      title: 'Get POU code',
      description: 'Reads the declaration and implementation of a POU/Method/Property as JSON.',
      inputSchema: { projectFilePath: z.string(), pouPath: z.string() },
      annotations: { readOnlyHint: true, ...openWorld },
    },
    async ({ projectFilePath, pouPath }) => fmt(await runScriptWithRetry(scripts.getPouCode(projectFilePath, pouPath), cfg)),
  );

  reg(
    'codesys_create_gvl',
    {
      title: 'Create GVL',
      description: 'Creates a Global Variable List under parentPath and optionally sets its declaration (VAR_GLOBAL...END_VAR).',
      inputSchema: {
        projectFilePath: z.string(),
        parentPath: z.string(),
        name: z.string(),
        declaration: z.string().optional(),
      },
      annotations: { readOnlyHint: rw, ...openWorld },
    },
    async ({ projectFilePath, parentPath, name, declaration }) => fmt(await runScriptWithRetry(scripts.createGvl(projectFilePath, parentPath, name, declaration), cfg)),
  );

  // ---------------- Task ----------------
  reg(
    'codesys_create_task',
    {
      title: 'Create cyclic task',
      description: 'Creates (or reuses) the Task Configuration on the application and adds a cyclic task with the given interval/unit/priority. interval/unit/priority are strings (e.g. "10", "ms", "10").',
      inputSchema: {
        projectFilePath: z.string(),
        applicationPath: z.string().default('').describe('Path to the Application, or empty to use the active one'),
        name: z.string().default('MainTask'),
        interval: z.string().regex(/^\d+$/, 'interval must be a positive integer string, e.g. "10"').default('10'),
        unit: z.string().default('ms').describe('Interval unit, typically "ms"'),
        priority: z.string().regex(/^\d+$/, 'priority must be an integer string 0..31, e.g. "10"').default('10'),
      },
      annotations: { readOnlyHint: rw, ...openWorld },
    },
    async ({ projectFilePath, applicationPath, name, interval, unit, priority }) => fmt(await runScriptWithRetry(scripts.createTask(projectFilePath, applicationPath, name, interval, unit, priority), cfg)),
  );

  reg(
    'codesys_add_program_to_task',
    {
      title: 'Add program call to task',
      description: 'Adds a Program POU (by name) to a task\'s call list. taskPath is the dot/slash path, e.g. "Device.Plc Logic.Application.Task Configuration.MainTask".',
      inputSchema: {
        projectFilePath: z.string(),
        taskPath: z.string(),
        programName: z.string(),
      },
      annotations: { readOnlyHint: rw, ...openWorld },
    },
    async ({ projectFilePath, taskPath, programName }) => fmt(await runScriptWithRetry(scripts.addProgramToTask(projectFilePath, taskPath, programName), cfg)),
  );

  reg(
    'codesys_add_library',
    {
      title: 'Add library reference',
      description: 'Adds an installed library (by display name, e.g. "Standard") to the application\'s library manager. Note: script-created projects have NO library references — add "Standard" before using R_TRIG/TON/TP etc.',
      inputSchema: {
        projectFilePath: z.string(),
        applicationPath: z.string().default('').describe('Path to the Application, or empty for the active one'),
        libraryName: z.string().describe('Library display name, e.g. "Standard"'),
      },
      annotations: { readOnlyHint: rw, ...openWorld },
    },
    async ({ projectFilePath, applicationPath, libraryName }) => fmt(await runScriptWithRetry(scripts.addLibrary(projectFilePath, applicationPath, libraryName), cfg)),
  );

  reg(
    'codesys_resolve_placeholder',
    {
      title: 'Resolve library placeholder',
      description: 'Creates/redirects a library placeholder to an installed library version. Needed when a device description pins a system library version that is not installed (symptom: "Identifier \'<LibName>\' not defined" at build with pos None). Example: placeholderName "CmpAsyncMgr", resolution "CmpAsyncMgr, 3.5.21.0 (System)".',
      inputSchema: {
        projectFilePath: z.string(),
        applicationPath: z.string().default('').describe('Path to the Application, or empty for the active one'),
        placeholderName: z.string().describe('Placeholder name, e.g. "CmpAsyncMgr"'),
        resolution: z.string().describe('Full display name of the installed library, e.g. "CmpAsyncMgr, 3.5.21.0 (System)"'),
      },
      annotations: { readOnlyHint: rw, ...openWorld },
    },
    async ({ projectFilePath, applicationPath, placeholderName, resolution }) => fmt(await runScriptWithRetry(scripts.resolvePlaceholder(projectFilePath, applicationPath, placeholderName, resolution), cfg)),
  );

  // ---------------- Build (structured error collection) ----------------
  reg(
    'codesys_build',
    {
      title: 'Build & collect errors',
      description: 'Generates code for the active application and returns compile errors/warnings as structured JSON (clean/errorCount/warningCount/errors[]/warnings[]), read from the CODESYS Build message category. "clean": true means zero errors. Use this as the gate in a generate-fix loop.',
      inputSchema: { projectFilePath: z.string() },
      annotations: { readOnlyHint: true, idempotentHint: true, ...openWorld },
    },
    async ({ projectFilePath }) => fmt(await runScriptWithRetry(scripts.build(projectFilePath), cfg)),
  );

  // ---------------- Device / IO (experimental — verify on live IDE) ----------------
  reg(
    'codesys_list_devices',
    {
      title: 'List installable devices',
      description: 'Enumerates the local CODESYS Device Repository, returning name/vendor and the DeviceID triple (type,id,version) needed by codesys_insert_device. Filter by a substring of the device name (recommended — the repository can hold thousands of entries); results are capped at maxResults with a truncated flag.',
      inputSchema: { projectFilePath: z.string(), filter: z.string().default(''), maxResults: z.number().int().min(1).max(500).default(100) },
      annotations: { readOnlyHint: true, ...openWorld },
    },
    async ({ projectFilePath, filter, maxResults }) => fmt(await runScriptWithRetry(scripts.listDevices(projectFilePath, filter, maxResults), cfg)),
  );

  reg(
    'codesys_insert_device',
    {
      title: 'Insert device / IO card',
      description: 'Adds a device by DeviceID. With empty parentPath it adds a top-level controller (e.g. CODESYS Control Win V3: type 4096, id "0000 0001"); with a parentPath it plugs a child device / IO card under that node. Use codesys_list_devices to get exact triples.',
      inputSchema: {
        projectFilePath: z.string(),
        parentPath: z.string().default('').describe('Empty = top-level controller; otherwise the node to plug under'),
        name: z.string(),
        deviceType: z.number().int(),
        deviceId: z.string().describe('Hex id like "0000 0001"'),
        version: z.string().default('*').describe('Version string, or "*" for latest'),
        moduleId: z.string().default('').describe('Optional module id for modular IO'),
      },
      annotations: { readOnlyHint: rw, ...openWorld },
    },
    async ({ projectFilePath, parentPath, name, deviceType, deviceId, version, moduleId }) => fmt(await runScriptWithRetry(scripts.insertDevice(projectFilePath, parentPath, name, deviceType, deviceId, version, moduleId), cfg)),
  );

  reg(
    'codesys_get_io_config',
    {
      title: 'Get device & IO configuration',
      description: 'Returns the device tree with mappable IO channels and their current variable mappings, as JSON.',
      inputSchema: { projectFilePath: z.string() },
      annotations: { readOnlyHint: true, ...openWorld },
    },
    async ({ projectFilePath }) => fmt(await runScriptWithRetry(scripts.getIoConfig(projectFilePath), cfg)),
  );

  reg(
    'codesys_map_io',
    {
      title: 'Map IO channel to variable',
      description: 'Binds a mappable IO channel (by name, from codesys_get_io_config) to an IEC variable. An unqualified name creates a new variable; a qualified expression (e.g. GVL_IO.xSensor1) binds an existing one.',
      inputSchema: {
        projectFilePath: z.string(),
        devicePath: z.string(),
        channelName: z.string(),
        variable: z.string(),
      },
      annotations: { readOnlyHint: rw, ...openWorld },
    },
    async ({ projectFilePath, devicePath, channelName, variable }) => fmt(await runScriptWithRetry(scripts.mapIo(projectFilePath, devicePath, channelName, variable), cfg)),
  );

  // ---------------- Knowledge base (no CODESYS needed) ----------------
  reg(
    'codesys_list_patterns',
    {
      title: 'List ST patterns',
      description: 'Lists the built-in, verified Structured Text function-block patterns (name + one-line summary). Instantiate these instead of writing FBs from scratch.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => text(JSON.stringify(kb.listPatterns(), null, 2)),
  );

  reg(
    'codesys_get_pattern',
    {
      title: 'Get ST pattern source',
      description: 'Returns the full Structured Text source of a built-in pattern (e.g. "FB_ConveyorSegment"), including its acceptance-test header.',
      inputSchema: { name: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ name }) => {
      const src = kb.getPattern(name);
      return src ? text(src) : text(`Pattern not found: ${name}. Use codesys_list_patterns.`, true);
    },
  );

  reg(
    'codesys_catalog_devices',
    {
      title: 'Known device catalog',
      description: 'Returns the curated device catalog (controllers, fieldbus masters, IO cards) with known DeviceID triples. Verify against the live repository with codesys_list_devices before inserting.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => text(JSON.stringify(kb.catalogDevices(), null, 2)),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('codesys-auto-mcp connected (stdio).');
}
