/**
 * NpmReleaseSource — the seam supplying the latest published
 * `@anthropic-ai/claude-code` version to ReleaseDetector (design doc → Seams;
 * CONTEXT.md → "Release adoption"). It only reports what npm says is latest; it
 * does NOT decide whether that warrants a proposal (that is ReleaseDetector's
 * pure `decide`) nor publish anything (that is IssuePublisher).
 *
 * Tests drive it via {@link FakeNpmReleaseSource}; prod will query the npm
 * registry behind this same interface.
 */

/**
 * What the registry reports as the latest version. A malformed/unavailable
 * response is represented as `latest: null` rather than thrown, so the detector
 * can decline to propose instead of crashing into a false proposal (issue #6
 * edge case: malformed npm response).
 */
export interface NpmLatest {
  /** The latest published version string, or null if the response was unusable. */
  latest: string | null;
}

export interface NpmReleaseSource {
  /** Report the latest published CC version (or null on a malformed response). */
  fetchLatest(): Promise<NpmLatest>;
}
