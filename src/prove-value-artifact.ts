/**
 * prove-value-artifact — the thin sink that persists a {@link ProveValueResult} as a
 * machine-readable artifact ALONGSIDE the Adoption record (#214, Phase 2). The artifact is
 * version-keyed JSON, written so a prepared leaf PR can reattach the fork's value evidence
 * (CONTEXT.md → "Behavioral A/B benchmark", "Adoption record").
 *
 * The pure distillation is {@link buildProveValueResult} in prove-value-result.ts; this module
 * owns ONLY the fs boundary, injected ({@link ArtifactFsSeam}) exactly like provision-variants'
 * fs seam so a test writes no real file. {@link proveValueArtifactPath} is pure so callers and
 * #215 agree on where the artifact lives without touching the disk.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProveValueResult } from './prove-value-result.js';

/** The narrow fs surface the artifact sink needs — injected so tests run no real fs. */
export interface ArtifactFsSeam {
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  writeFileSync(path: string, data: string): void;
}

const REAL_FS: ArtifactFsSeam = {
  mkdirSync: (p, o) => void mkdirSync(p, o),
  writeFileSync: (p, d) => writeFileSync(p, d),
};

export interface WriteProveValueArtifactOptions {
  /** The dir the version-keyed artifact lands in. */
  dir: string;
  /** The fs boundary; defaults to real `node:fs`. */
  fs?: ArtifactFsSeam;
}

/** The version-keyed artifact path. PURE — callers and #215 agree without touching disk. */
export function proveValueArtifactPath(dir: string, ccVersion: string): string {
  return join(dir, `prove-value-${ccVersion}.json`);
}

/**
 * Persist the prove-value result as pretty JSON to its version-keyed path, creating the dir
 * if needed. Returns the written path so the caller can surface it as the leaf-PR attachment.
 */
export function writeProveValueArtifact(
  result: ProveValueResult,
  options: WriteProveValueArtifactOptions,
): string {
  const fs = options.fs ?? REAL_FS;
  const path = proveValueArtifactPath(options.dir, result.ccVersion);
  fs.mkdirSync(options.dir, { recursive: true });
  fs.writeFileSync(path, JSON.stringify(result, null, 2));
  return path;
}
