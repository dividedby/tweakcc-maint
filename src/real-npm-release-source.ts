/**
 * RealNpmReleaseSource — the production NpmReleaseSource adapter (design doc →
 * Seams). It queries the npm registry's dist-tags endpoint for
 * `@anthropic-ai/claude-code` and reports `latest`. A malformed/unavailable
 * response is reported as `latest: null` (never thrown), so ReleaseDetector
 * declines to propose rather than crashing into a false proposal — exactly the
 * contract FakeNpmReleaseSource fakes (npm-release-source.ts).
 *
 * The HTTP call is the single seam that makes this "real"; the wiring test never
 * touches it (it injects FakeNpmReleaseSource). First real query is the cron
 * slice (#199).
 */

import type { NpmLatest, NpmReleaseSource } from './npm-release-source.js';

const PACKAGE = '@anthropic-ai/claude-code';
const DIST_TAGS_URL = `https://registry.npmjs.org/-/package/${PACKAGE}/dist-tags`;

export class RealNpmReleaseSource implements NpmReleaseSource {
  constructor(private readonly url: string = DIST_TAGS_URL) {}

  async fetchLatest(): Promise<NpmLatest> {
    try {
      const res = await fetch(this.url);
      if (!res.ok) return { latest: null };
      const tags = (await res.json()) as unknown;
      const latest =
        tags !== null && typeof tags === 'object' && typeof (tags as Record<string, unknown>).latest === 'string'
          ? ((tags as Record<string, unknown>).latest as string)
          : null;
      return { latest };
    } catch {
      // Network/parse failure is a malformed response, not a crash — decline to propose.
      return { latest: null };
    }
  }
}
