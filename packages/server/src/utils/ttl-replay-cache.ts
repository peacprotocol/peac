export class TTLReplayCache {
  private readonly ttlMs: number;
  private readonly maxSize: number;
  private readonly map = new Map<string, number>();

  constructor(opts: { ttlMs?: number; maxSize?: number } = {}) {
    this.ttlMs = opts.ttlMs ?? 10 * 60 * 1000; // 10m
    this.maxSize = opts.maxSize ?? 10_000;
  }

  has(id: string): boolean {
    this.sweep();
    const t = this.map.get(id);
    return !!t && Date.now() - t < this.ttlMs;
  }

  add(id: string): void {
    this.sweep();
    if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest) this.map.delete(oldest);
    }
    this.map.set(id, Date.now());
  }

  private sweep(): void {
    const now = Date.now();
    for (const [k, t] of this.map) {
      if (now - t >= this.ttlMs) this.map.delete(k);
    }
  }

  getStats() {
    return {
      size: this.map.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
    };
  }
}
