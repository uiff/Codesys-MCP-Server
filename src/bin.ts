#!/usr/bin/env node
/**
 * bin.ts — CLI entry. Resolves the CODESYS executable path and profile name
 * (explicit flag > environment variable > auto-detection), then starts the
 * stdio MCP server.
 */

import { program } from 'commander';
import { startMcpServer } from './server.js';
import { detectCodesys } from './detect.js';

let version = '0.1.0';
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  version = require('../package.json').version;
} catch {
  /* ignore */
}

program
  .name('codesys-auto-mcp')
  .description('Independent Model Context Protocol server for CODESYS V3 automation')
  .version(version)
  .option('-p, --codesys-path <path>', 'Full path to CODESYS.exe (default: auto-detect newest install)')
  .option('-f, --codesys-profile <profile>', 'CODESYS profile name (default: auto-detect from the installation)')
  .option('-t, --timeout <ms>', 'Per-call timeout in milliseconds (first launch is a slow cold start)', '240000')
  .parse(process.argv);

const opts = program.opts();

const detected = detectCodesys();

const codesysPath: string | undefined =
  (opts.codesysPath as string | undefined)?.trim() ||
  process.env.CODESYS_PATH?.trim() ||
  detected?.codesysPath;

const profileName: string | undefined =
  (opts.codesysProfile as string | undefined)?.trim() ||
  process.env.CODESYS_PROFILE?.trim() ||
  detected?.profileName ||
  undefined;

if (!codesysPath || !profileName) {
  console.error('ERROR: Could not locate a CODESYS installation.');
  console.error('  Searched: %ProgramFiles%\\CODESYS *\\CODESYS\\Common\\CODESYS.exe');
  console.error('  Fix: pass --codesys-path "C:\\...\\CODESYS.exe" and --codesys-profile "CODESYS V3.5 SPxx ..."');
  console.error('       (the profile name is the file name in <install>\\CODESYS\\Profiles\\*.profile.xml,');
  console.error('        also shown in the CODESYS title bar), or set CODESYS_PATH / CODESYS_PROFILE env vars.');
  process.exit(1);
}

const rawTimeout = parseInt(String(opts.timeout ?? process.env.CODESYS_TIMEOUT ?? '240000'), 10);
if (!Number.isFinite(rawTimeout) || rawTimeout <= 0) {
  console.error(`WARNING: invalid --timeout value (${opts.timeout}); using default 240000 ms.`);
}
const config = {
  codesysPath,
  profileName,
  timeoutMs: Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 240000,
};

console.error('========================================');
console.error(`codesys-auto-mcp v${version}`);
console.error(`  CODESYS: ${config.codesysPath}${detected && config.codesysPath === detected.codesysPath ? ' (auto-detected)' : ''}`);
console.error(`  Profile: ${config.profileName}${detected && config.profileName === detected.profileName ? ' (auto-detected)' : ''}`);
console.error(`  Timeout: ${config.timeoutMs} ms per call`);
console.error('========================================');

startMcpServer(config).catch((error) => {
  console.error('FATAL: server startup failed:', error);
  process.exit(1);
});
