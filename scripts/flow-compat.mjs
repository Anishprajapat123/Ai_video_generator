import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function patchFlowSource(source) {
  const marker = '// Studio compatibility: leave an open Agent session before using the composer.';
  if (source.includes(marker)) return source;
  const anchor = /(await ensureProjectGrid\(page\);\r?\n)(\s*)(const agent = page\.getByRole\("button", \{ name: "Agent", exact: true \}\);)/;
  if (!anchor.test(source)) throw new Error('Unsupported Flow connector version. Compatibility patch was not applied.');
  return source.replace(anchor, (_match, before, indent, after) => `${before}${indent}${marker}\n${indent}await closeAgentSession(page);\n${indent}${after}`);
}

export async function applyFlowCompatibility(directory) {
  for (const relative of ['src/flow.ts', 'dist/flow.js']) {
    const target = path.join(directory, relative);
    const source = await readFile(target, 'utf8');
    const patched = patchFlowSource(source);
    if (patched !== source) await writeFile(target, patched);
  }
}
