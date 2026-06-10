/**
 * VariantRunner — the seam the ABDriver uses to PRODUCE one variant's output for
 * a fixture (design doc → Seams; CONTEXT.md → "Stock CC / lobotomized-CC"). Both
 * arms run at the same version/model/effort/prompt — only the variant (which
 * `cli.js`) differs. It only produces an output; it does NOT pair, score, or judge
 * correctness (those are the driver's, the JudgePort's, and the CorrectnessChecker's).
 *
 * Tests drive it via {@link FakeVariantRunner} (canned outputs); prod will run two
 * version-pinned installs via bench `executeRun` behind this same interface (#138).
 */

/** The two arms the Behavioral A/B benchmark compares (CONTEXT.md — these exact names). */
export type Variant = 'stock' | 'lobotomized';

/** One arm's produced output for a fixture. */
export interface VariantOutput {
  variant: Variant;
  output: string;
}

export interface VariantRunner {
  /** Produce the given variant's output for a fixture prompt. */
  run(fixtureId: string, prompt: string, variant: Variant): Promise<VariantOutput>;
}
