/**
 * FakeNpmReleaseSource — the test double for the NpmReleaseSource seam (design
 * doc → Seams; fake contract: settable latest version + a malformed-response
 * case). It returns a canned {@link NpmLatest} so tests can drive both the happy
 * path (a concrete latest version) and the malformed path (`latest: null`).
 */

import type { NpmLatest, NpmReleaseSource } from './npm-release-source.js';

export class FakeNpmReleaseSource implements NpmReleaseSource {
  private readonly result: NpmLatest;

  constructor(latest: string | null) {
    this.result = { latest };
  }

  /** A source whose registry response was malformed/unusable (latest = null). */
  static malformed(): FakeNpmReleaseSource {
    return new FakeNpmReleaseSource(null);
  }

  fetchLatest(): Promise<NpmLatest> {
    return Promise.resolve(this.result);
  }
}
