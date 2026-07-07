// Deterministic safety gate for STREAMED answer text. The doc-20 guarantee is "a forbidden
// string is never displayed"; for a non-streamed answer detectViolations scans the complete text
// before it leaves the function. Streaming must preserve exactly that: every prefix the client
// ever sees has passed the scan.
//
// Mechanism: hold back the last `holdback` chars (a forbidden phrase forming at the frontier is
// never visible), and before releasing any new text, scan the WHOLE would-be-visible prefix.
// A dirty scan freezes the stream permanently — nothing further is emitted, and the pipeline's
// existing resolveSafety/fallback path supplies the canonical (safe) answer in the terminal
// "complete" event. Because every emitted prefix passed the scan and emission stops the moment
// a scan fails, no forbidden string ever reaches the wire. Pure — inject the scan for tests.

export class SafeTextEmitter {
  private full = "";
  private sent = 0;
  private frozen = false;

  /** `clean` returns true when the text passes the safety scan (no violations). */
  constructor(
    private readonly clean: (text: string) => boolean,
    private readonly holdback = 60,
  ) {}

  /** Feed a generation delta; returns the text now safe to emit, or null to emit nothing. */
  push(delta: string): string | null {
    if (this.frozen) return null;
    this.full += delta;
    const cutoff = this.full.length - this.holdback;
    if (cutoff <= this.sent) return null;
    const visible = this.full.slice(0, cutoff);
    if (!this.clean(visible)) {
      this.frozen = true;
      return null;
    }
    const out = this.full.slice(this.sent, cutoff);
    this.sent = cutoff;
    return out;
  }

  /** Generation finished: release the held-back tail iff the complete text scans clean. */
  finalize(): string | null {
    if (this.frozen) return null;
    if (!this.clean(this.full)) {
      this.frozen = true;
      return null;
    }
    const out = this.full.slice(this.sent);
    this.sent = this.full.length;
    return out || null;
  }

  /** True once a scan failed — the stream is permanently silenced. */
  get isFrozen(): boolean {
    return this.frozen;
  }

  /** True if any text was actually emitted (drives the client's skip-reveal decision). */
  get emittedAny(): boolean {
    return this.sent > 0;
  }
}
