/**
 * Mulberry32 32-bit deterministic Pseudo-Random Number Generator.
 * Guarantees identical output across different browsers, platforms, and devices.
 */
export class PRNG {
  private state: number;

  constructor(seed: number) {
    this.state = (seed | 0) || 123456789;
  }

  /**
   * Generates next float in range [0, 1)
   */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates integer in range [min, max] inclusive
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Generates float in range [min, max)
   */
  nextFloat(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}
