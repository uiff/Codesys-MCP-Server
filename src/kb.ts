/**
 * kb.ts — the built-in knowledge base: reusable ST pattern library + device
 * catalog, bundled inside the package (kb/ next to dist/). This is the "smart"
 * layer: the agent instantiates verified patterns instead of free-forming code.
 */

import * as fs from 'fs';
import * as path from 'path';

const KB_DIR = path.join(__dirname, '..', 'kb');

export interface PatternInfo {
  name: string;
  file: string;
  summary: string;
}

function firstComment(content: string): string {
  const block = content.match(/\(\*([\s\S]*?)\*\)/);
  if (block) {
    const lines = block[1].split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0) return lines[0];
  }
  const first = content.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
  return first ?? '';
}

export function listPatterns(): PatternInfo[] {
  const dir = path.join(KB_DIR, 'patterns');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.st'))
    .map((f) => {
      const content = fs.readFileSync(path.join(dir, f), 'utf-8');
      return { name: f.replace(/\.st$/, ''), file: f, summary: firstComment(content) };
    });
}

export function getPattern(name: string): string | null {
  const dir = path.join(KB_DIR, 'patterns');
  const fileName = name.endsWith('.st') ? name : `${name}.st`;
  const file = path.join(dir, path.basename(fileName));
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf-8');
}

export function catalogDevices(): unknown {
  const file = path.join(KB_DIR, 'catalog', 'device-catalog.json');
  if (!fs.existsSync(file)) return { note: 'device catalog not found' };
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    return { error: `catalog parse failed: ${(e as Error).message}` };
  }
}
