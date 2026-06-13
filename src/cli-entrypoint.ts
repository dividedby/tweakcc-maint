import { realpathSync } from 'node:fs';
import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Returns true when the module at `url` is the Node process entry point.
 * Pass `import.meta.url` from the calling module.
 * Uses `realpathSync` so symlinked entry points resolve correctly.
 */
export function isEntryPoint(url: string): boolean {
  const entry = argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === fileURLToPath(url);
  } catch {
    return false;
  }
}
