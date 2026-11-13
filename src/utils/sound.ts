class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.08, delay = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + delay;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  playCardFlip() {
    this.playTone(320, 0.1, 'triangle', 0.06, 0);
    this.playTone(480, 0.12, 'triangle', 0.05, 0.05);
  }

  playNightStart() {
    this.playTone(220, 0.45, 'sine', 0.07, 0);
    this.playTone(164.81, 0.65, 'sine', 0.06, 0.18);
  }

  playDayStart() {
    this.playTone(392, 0.25, 'triangle', 0.06, 0);
    this.playTone(523.25, 0.35, 'triangle', 0.06, 0.12);
  }

  playVote() {
    this.playTone(440, 0.08, 'sine', 0.05, 0);
  }

  playElimination() {
    this.playTone(146.83, 0.35, 'sawtooth', 0.05, 0);
    this.playTone(110, 0.5, 'triangle', 0.07, 0.12);
  }

  playDefense() {
    this.playTone(349.23, 0.14, 'triangle', 0.06, 0);
    this.playTone(440, 0.18, 'triangle', 0.06, 0.08);
  }

  playMicToggle(on: boolean) {
    if (on) {
      this.playTone(523.25, 0.08, 'sine', 0.05, 0);
      this.playTone(659.25, 0.1, 'sine', 0.05, 0.06);
    } else {
      this.playTone(440, 0.08, 'sine', 0.04, 0);
      this.playTone(329.63, 0.1, 'sine', 0.04, 0.06);
    }
  }

  playVictory() {
    this.playTone(392, 0.2, 'triangle', 0.07, 0);
    this.playTone(493.88, 0.2, 'triangle', 0.07, 0.14);
    this.playTone(587.33, 0.4, 'triangle', 0.08, 0.28);
  }
}

export const soundFx = new SoundEngine();
