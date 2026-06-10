/**
 * Rng — the seam the ABDriver uses for per-pair presentation-order randomization
 * (design doc → Invariants: "order-randomized per pair (kills position bias)").
 * Injected so a run is reproducible under a fixed seed: same seed → same order →
 * same captured judge calls.
 *
 * {@link SeededRng} is the deterministic mulberry32 implementation used in both
 * tests and prod; the port stays narrow (a single coin flip is all the driver needs)
 * so a different source could be substituted without touching the driver.
 */

export interface Rng {
  /** A fair coin flip — true/false with equal probability, deterministic under the seed. */
  bool(): boolean;
}

/**
 * A small, dependency-free deterministic PRNG (mulberry32). Two instances seeded
 * identically yield identical sequences — that reproducibility is the point, not
 * cryptographic strength.
 */
export class SeededRng implements Rng {
  private state: number;

  constructor(seed: number) {
    // Keep the seed in 32-bit unsigned space; mulberry32 advances from there.
    this.state = seed >>> 0;
  }

  private next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  bool(): boolean {
    return this.next() < 0.5;
  }
}
