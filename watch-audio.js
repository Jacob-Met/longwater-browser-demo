// Original, short synthesized cues. No audio context exists before explicit opt-in.
const CUES = Object.freeze({
  enabled: [[0, 0.25, 440, 440, 0.08, "sine"]],
  gate: [[0, 0.48, 220, 130.8128, 0.16, "sine"], [0.045, 0.36, 329.6276, 196, 0.07, "sine"]],
  shade: [[0, 0.55, 146.8324, 146.8324, 0.14, "triangle"], [0.08, 0.48, 220, 220, 0.07, "sine"]],
  seed: [[0, 0.2, 329.6276, 329.6276, 0.16, "sine"], [0.075, 0.22, 440, 440, 0.13, "sine"], [0.15, 0.32, 659.2551, 659.2551, 0.12, "sine"]],
  closed: [[0, 0.95, 146.8324, 146.8324, 0.1, "sine"], [0.07, 0.9, 220, 220, 0.09, "sine"], [0.14, 0.88, 293.6648, 293.6648, 0.08, "sine"]],
});

// Also accepts an OfflineAudioContext so the actual signal can be received.
export function renderCue(context, destination, name) {
  if (!Object.hasOwn(CUES, name)) return () => {};
  const voices = [];
  const start = context.currentTime + 0.01;
  for (const [delay, duration, frequency, endFrequency, peak, type] of CUES[name]) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    envelope.gain.value = 0;
    const at = start + delay;
    const end = at + duration;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, end);
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(peak, at + 0.016);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end - 0.016);
    envelope.gain.linearRampToValueAtTime(0, end);
    oscillator.connect(envelope);
    envelope.connect(destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.start(at);
    oscillator.stop(end);
    voices.push({ oscillator, envelope });
  }
  // A new accepted turn replaces the prior cue with a brief release, keeping
  // rapid input from building up many simultaneous notes.
  return () => {
    const now = context.currentTime;
    for (const { oscillator, envelope } of voices) {
      try {
        envelope.gain.cancelScheduledValues(now);
        envelope.gain.setTargetAtTime(0, now, 0.006);
        oscillator.stop(now + 0.03);
      } catch { /* The voice may already have ended. */ }
    }
  };
}

export class WatchAudio {
  constructor(control, status) {
    this.control = control;
    this.status = status;
    this.enabled = false;
    this.readyToPlay = false;
    this.context = null;
    this.output = null;
    this.stopCue = null;
    this.attempt = 0;
    control.addEventListener("change", () => {
      if (control.checked) void this.enable();
      else this.off();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.off();
    });
    window.addEventListener("pagehide", () => this.off());
  }

  ready() {
    this.control.disabled = false;
  }

  async enable() {
    if (this.enabled) return;
    const attempt = ++this.attempt;
    this.enabled = true;
    this.control.checked = true;
    this.status.textContent = "Starting…";
    let timer;
    try {
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Audio) throw new Error("Audio is unavailable.");
      const context = new Audio({ latencyHint: "interactive" });
      this.context = context;
      this.output = context.createGain();
      this.output.gain.value = 0;
      this.output.connect(context.destination);
      await Promise.race([
        context.resume(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Audio did not start.")), 1500); }),
      ]);
      if (attempt !== this.attempt || !this.enabled || document.hidden) return;
      if (context.state !== "running") throw new Error("Audio did not start.");
      this.output.gain.value = 0.35;
      this.readyToPlay = true;
      this.status.textContent = "On";
      context.addEventListener("statechange", () => {
        if (this.context === context && this.readyToPlay && context.state !== "running") {
          this.off("Sound paused. Turn it on to try again.");
        }
      });
      this.stopCue = renderCue(context, this.output, "enabled");
    } catch {
      if (attempt === this.attempt) this.off("Sound unavailable. You can keep playing.");
    } finally {
      clearTimeout(timer);
    }
  }

  play(action, finished = false) {
    if (!this.enabled || !this.context || document.hidden) return;
    // Interrupted or still-starting audio is never queued for later playback.
    if (!this.readyToPlay) return;
    if (this.context.state !== "running") {
      this.off("Sound paused. Turn it on to try again.");
      return;
    }
    try {
      this.stopCue?.();
      this.stopCue = renderCue(this.context, this.output, finished ? "closed" : action);
    } catch {
      this.off("Sound unavailable. You can keep playing.");
    }
  }

  off(message = "Off") {
    ++this.attempt;
    this.enabled = false;
    this.readyToPlay = false;
    this.control.checked = false;
    this.status.textContent = message;
    try {
      this.stopCue?.();
      if (this.output) {
        this.output.gain.value = 0;
        this.output.disconnect();
      }
      if (this.context && this.context.state !== "closed") {
        Promise.resolve(this.context.close()).catch(() => {});
      }
    } catch { /* Audio teardown must not interrupt the watch. */ }
    this.stopCue = null;
    this.output = null;
    this.context = null;
  }
}
