// src/lib/sounds.ts
// ============================================================
// Tiny Web Audio utility for the order-confirmed chime.
// Uses the native AudioContext API — no external dependencies.
// Silently no-ops if the browser doesn't support AudioContext
// or if the user hasn't interacted yet (autoplay policy).
// ============================================================

/**
 * Play a short two-tone "ding" chime to confirm an order.
 * High tone (880 Hz) fades into a lower tone (660 Hz) over ~300 ms.
 */
export function playOrderSound(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioCtx) return;

    const ctx = new AudioCtx();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";

    // Pitch: start bright, fall to a warm resolved note
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.18);

    // Volume: quick attack, gentle decay
    gain.gain.setValueAtTime(0.0001, ctx.currentTime); // avoid click on start
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);

    // Release the AudioContext after playback to avoid resource leaks
    osc.onended = () => {
      ctx.close().catch(() => {});
    };
  } catch {
    // Silently swallow: autoplay blocked, API unavailable, etc.
  }
}
