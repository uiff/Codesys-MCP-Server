/**
 * interop.ts — headless CODESYS ScriptEngine bridge.
 *
 * Independent of any in-IDE plugin: we launch CODESYS.exe directly with
 *   --profile=<name> --noUI --runscript=<tempfile.py>
 * and read structured results back from stdout (a JSON block delimited by
 * ###JSON_START###/###JSON_END###) plus SCRIPT_SUCCESS / SCRIPT_ERROR markers.
 *
 * Windows notes (learned from the reference toolkit):
 *  - Use shell:false + an argv array so paths/profiles with spaces are passed
 *    verbatim (no shell quoting bugs like "'C:\Program' is not recognized").
 *  - Prepend the CODESYS dir to PATH so the engine's internal python launch works.
 *  - The first launch is a cold start (can exceed 60 s); the timeout is generous
 *    and configurable, and callers may retry once on timeout.
 */

import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export const JSON_START = '###JSON_START###';
export const JSON_END = '###JSON_END###';
const SUCCESS_MARKER = 'SCRIPT_SUCCESS';
const ERROR_MARKER = 'SCRIPT_ERROR';

export interface CodesysConfig {
  codesysPath: string;
  profileName: string;
  timeoutMs: number;
}

export interface ScriptResult {
  success: boolean;
  output: string;
  data?: unknown;
  timedOut: boolean;
}

let counter = 0;

// All CODESYS launches are serialized through this queue: two concurrent tool
// calls must never run two CODESYS.exe instances against the same .project
// file (lock contention / corruption). Failures don't break the chain.
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

export async function runScript(script: string, cfg: CodesysConfig): Promise<ScriptResult> {
  return serialize(() => runScriptUnqueued(script, cfg));
}

async function runScriptUnqueued(script: string, cfg: CodesysConfig): Promise<ScriptResult> {
  if (!cfg.codesysPath) throw new Error('CODESYS executable path was not provided.');
  if (!cfg.profileName) throw new Error('CODESYS profile name was not provided.');
  if (!fs.existsSync(cfg.codesysPath)) {
    throw new Error(`CODESYS executable not found at: ${cfg.codesysPath}`);
  }

  counter += 1;
  const tempFile = path.join(os.tmpdir(), `cauto_${process.pid}_${counter}.py`);
  // UTF-8 (no BOM) to match the "# -*- coding: utf-8 -*-" header in the
  // generated script — required for non-ASCII project paths (umlauts etc.).
  await writeFile(tempFile, script.replace(/\r\n/g, '\n'), 'utf8');

  const codesysDir = path.dirname(cfg.codesysPath);
  const env = { ...process.env } as NodeJS.ProcessEnv;
  // Windows env vars are case-insensitive, but a spread object is not: the
  // key may be "Path". Update the existing key instead of adding a second one.
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  env[pathKey] = `${codesysDir}${path.delimiter}${env[pathKey] ?? ''}`;

  try {
    const spawnResult = await new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>((resolve) => {
      // CODESYS's CLI parser requires the exact form --profile="Name With
      // Spaces" (quotes around the VALUE). Standard Windows argv quoting
      // ("--profile=Name With Spaces" around the whole argument) is rejected
      // with: 'you must specify a profile using --profile="profile name"'.
      // So we compose the command line ourselves and run through the shell.
      const commandLine = `"${cfg.codesysPath}" --profile="${cfg.profileName}" --noUI --runscript="${tempFile}"`;
      const child = spawn(commandLine, [], {
        windowsHide: true,
        cwd: codesysDir,
        env,
        shell: true,
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // StringDecoder-backed decoding: multi-byte UTF-8 sequences split
      // across pipe chunks are reassembled correctly.
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');

      const killTree = () => {
        // shell:true means child.pid is the shell — kill the whole tree so
        // the CODESYS.exe underneath dies too.
        if (child.pid) {
          try { spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }); } catch { /* ignore */ }
        }
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
      };

      const timer = setTimeout(() => {
        timedOut = true;
        killTree();
      }, cfg.timeoutMs);

      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (e) => {
        clearTimeout(timer);
        resolve({ code: 1, stdout, stderr: `${stderr}\nSPAWN ERROR: ${e.message}`, timedOut });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr, timedOut });
      });
    });

    const combined = `${spawnResult.stdout}\n${spawnResult.stderr}`;
    let success: boolean;
    if (spawnResult.timedOut) {
      success = false;
    } else if (combined.includes(ERROR_MARKER)) {
      success = false;
    } else if (combined.includes(SUCCESS_MARKER)) {
      success = true;
    } else {
      success = spawnResult.code === 0;
    }

    let data: unknown;
    const s = spawnResult.stdout.indexOf(JSON_START);
    const e = spawnResult.stdout.indexOf(JSON_END);
    if (s >= 0 && e > s) {
      const raw = spawnResult.stdout.slice(s + JSON_START.length, e).trim();
      try { data = JSON.parse(raw); } catch { /* leave undefined */ }
    }

    const output = success
      ? spawnResult.stdout.trim()
      : `${spawnResult.stderr}\n${spawnResult.stdout}`.trim();

    return { success, output, data, timedOut: spawnResult.timedOut };
  } finally {
    try { await unlink(tempFile); } catch { /* ignore */ }
  }
}

// True once any call has completed successfully — i.e. CODESYS is "warm".
let everSucceeded = false;

/**
 * Runs a script, retrying ONCE if the first attempt times out AND no call has
 * ever succeeded (cold-start case). After warm-up, a timeout is NOT retried:
 * the script may have partially executed, and blindly re-running a mutating
 * operation could double-apply it.
 */
export async function runScriptWithRetry(script: string, cfg: CodesysConfig): Promise<ScriptResult> {
  const first = await runScript(script, cfg);
  if (first.success) everSucceeded = true;
  if (first.timedOut && !everSucceeded) {
    const second = await runScript(script, cfg);
    if (second.success) everSucceeded = true;
    return second;
  }
  return first;
}
