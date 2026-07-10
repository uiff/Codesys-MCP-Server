/**
 * detect.ts — best-effort auto-detection of the local CODESYS installation.
 *
 * Path:    scans %ProgramFiles%/CODESYS * for CODESYS/Common/CODESYS.exe and
 *          picks the highest version (by folder-name version sort).
 * Profile: derives the profile name from the installation's
 *          CODESYS/Profiles/<name>.profile.xml file — e.g.
 *          "CODESYS V3.5 SP22 Patch 1.profile.xml" → "CODESYS V3.5 SP22 Patch 1".
 *
 * Explicit CLI flags / env vars always take precedence over detection.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface DetectedInstall {
  codesysPath: string;
  profileName: string | null;
  installDir: string;
}

function versionKey(dirName: string): number[] {
  const m = dirName.match(/(\d+(?:\.\d+)*)/);
  if (!m) return [0];
  return m[1].split('.').map((n) => parseInt(n, 10));
}

function compareVersions(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function detectProfile(installDir: string): string | null {
  const profilesDir = path.join(installDir, 'CODESYS', 'Profiles');
  try {
    const entries = fs.readdirSync(profilesDir);
    const profiles = entries
      .filter((f) => f.toLowerCase().endsWith('.profile.xml'))
      .map((f) => f.replace(/\.profile\.xml$/i, ''));
    if (profiles.length === 0) return null;
    // Multiple profiles are unusual; prefer the highest-version-looking one.
    profiles.sort((x, y) => compareVersions(versionKey(x), versionKey(y)));
    return profiles[profiles.length - 1];
  } catch {
    return null;
  }
}

export function detectCodesys(): DetectedInstall | null {
  const roots = [
    process.env['ProgramFiles'] ?? 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
  ];

  const installs: { dir: string; exe: string; key: number[] }[] = [];
  for (const root of roots) {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!/^codesys[\s\d.]/i.test(entry)) continue;
      const dir = path.join(root, entry);
      const exe = path.join(dir, 'CODESYS', 'Common', 'CODESYS.exe');
      if (fs.existsSync(exe)) {
        installs.push({ dir, exe, key: versionKey(entry) });
      }
    }
  }

  if (installs.length === 0) return null;
  installs.sort((a, b) => compareVersions(a.key, b.key));
  const best = installs[installs.length - 1];
  return {
    codesysPath: best.exe,
    profileName: detectProfile(best.dir),
    installDir: best.dir,
  };
}
