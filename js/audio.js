/**
 * AirRunner - Procedural Web Audio Engine
 * Generates all sound effects and dynamic cyber synthwave beats directly
 * using the HTML5 Web Audio API. Zero external audio file dependencies.
 */

import { CONFIG } from './config.js';

class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.isMuted = false;
    this.isInitialized = false;

    // Music sequencer state
    this.musicInterval = null;
    this.step = 0;
    this.musicTempo = 118; // BPM
    this.isPlayingMusic = false;

    // Pentatonic frequencies for coin arpeggios
    this.coinFreqs = [1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0];
    this.coinIndex = 0;
  }

  /**
   * Initializes the AudioContext upon user gesture
   */
  init() {
    if (this.isInitialized) return;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass();

      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(CONFIG.AUDIO.MASTER_VOLUME, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // SFX Bus
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(CONFIG.AUDIO.SFX_VOLUME, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      // Music Bus
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(CONFIG.AUDIO.MUSIC_VOLUME, this.ctx.currentTime);
      this.musicGain.connect(this.masterGain);

      this.isInitialized = true;
    } catch (e) {
      console.warn("Web Audio API not supported or blocked:", e);
    }
  }

  ensureContext() {
    if (!this.isInitialized) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setMuted(muted) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(
        muted ? 0 : CONFIG.AUDIO.MASTER_VOLUME,
        this.ctx.currentTime
      );
    }
  }

  setVolume(vol) {
    if (this.masterGain && this.ctx && !this.isMuted) {
      this.masterGain.gain.setValueAtTime(Math.max(0, Math.min(1, vol)), this.ctx.currentTime);
    }
  }

  /**
   * Jump Sound: Upward resonant pitch sweep + high-frequency puff
   */
  playJump() {
    this.ensureContext();
    if (this.isMuted || !this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(620, t + 0.18);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.22);
  }

  /**
   * Slide Sound: Filtered noise friction sweep
   */
  playSlide() {
    this.ensureContext();
    if (this.isMuted || !this.ctx) return;

    const t = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.25;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, t);
    filter.frequency.exponentialRampToValueAtTime(320, t + 0.25);
    filter.Q.value = 3.0;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    noise.start(t);
    noise.stop(t + 0.25);
  }

  /**
   * Roll Sound: Resonant cycloid whoosh
   */
  playRoll() {
    this.ensureContext();
    if (this.isMuted || !this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.linearRampToValueAtTime(440, t + 0.12);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.28);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.28);
  }

  /**
   * Lane Change: Gentle spatial air sweep
   */
  playLaneChange(direction = 0) {
    this.ensureContext();
    if (this.isMuted || !this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(480, t + 0.08);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    // Stereo panning if supported
    if (this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(direction * 0.6, t);
      osc.connect(gain);
      gain.connect(panner);
      panner.connect(this.sfxGain);
    } else {
      osc.connect(gain);
      gain.connect(this.sfxGain);
    }

    osc.start(t);
    osc.stop(t + 0.09);
  }

  /**
   * Coin Pickup: Brilliant crystalline chime
   */
  playCoin() {
    this.ensureContext();
    if (this.isMuted || !this.ctx) return;

    const t = this.ctx.currentTime;
    const freq = this.coinFreqs[this.coinIndex % this.coinFreqs.length];
    this.coinIndex++;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.setValueAtTime(freq * 1.5, t + 0.04);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.25);
  }

  /**
   * Collision Impact: Deep bass crunch + noise blast
   */
  playCollision() {
    this.ensureContext();
    if (this.isMuted || !this.ctx) return;

    const t = this.ctx.currentTime;

    // Low rumble oscillator
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + 0.4);

    oscGain.gain.setValueAtTime(0.6, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.4);

    // Noise explosion
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.35);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + 0.35);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.55, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);
    noise.start(t);
    noise.stop(t + 0.35);
  }

  /**
   * Countdown Beep (Tick vs GO)
   */
  playCountdownTick(isFinal = false) {
    this.ensureContext();
    if (this.isMuted || !this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isFinal ? 880 : 440, t);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (isFinal ? 0.35 : 0.15));

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + (isFinal ? 0.35 : 0.15));
  }

  /**
   * Game Start Jingle
   */
  playStart() {
    this.ensureContext();
    if (this.isMuted || !this.ctx) return;

    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    const t = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      const noteTime = t + idx * 0.08;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.3, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.28);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(noteTime);
      osc.stop(noteTime + 0.28);
    });
  }

  /**
   * Game Over Jingle
   */
  playGameOver() {
    this.ensureContext();
    if (this.isMuted || !this.ctx) return;

    const notes = [392.0, 369.99, 329.63, 277.18]; // G4, F#4, E4, C#4
    const t = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      const noteTime = t + idx * 0.14;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.25, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.32);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(noteTime);
      osc.stop(noteTime + 0.32);
    });
  }

  /**
   * Dynamic Cyber Synthwave Bass Engine
   * Procedurally generates a cyberpunk bass groove synchronized with game speed
   */
  startSynthMusic() {
    if (this.isPlayingMusic || !CONFIG.AUDIO.SYNTH_BASS_ENABLED) return;
    this.ensureContext();
    this.isPlayingMusic = true;
    this.step = 0;

    // 16-step bassline pattern (Notes: A1, A1, C2, E2, D2, A1...)
    const bassNotes = [55, 55, 110, 55, 65.4, 55, 82.4, 55, 73.4, 55, 110, 55, 65.4, 55, 55, 82.4];
    const stepDuration = 60 / (this.musicTempo * 4); // 16th notes

    const tick = () => {
      if (!this.isPlayingMusic || !this.ctx) return;

      const t = this.ctx.currentTime;
      const freq = bassNotes[this.step % bassNotes.length];

      if (freq > 0 && !this.isMuted) {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(380, t);
        filter.frequency.exponentialRampToValueAtTime(120, t + stepDuration * 0.85);

        gain.gain.setValueAtTime(0.22, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + stepDuration * 0.9);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);

        osc.start(t);
        osc.stop(t + stepDuration * 0.9);
      }

      this.step++;
      const nextDelay = (60 / (this.musicTempo * 4)) * 1000;
      this.musicInterval = setTimeout(tick, nextDelay);
    };

    tick();
  }

  updateMusicTempo(speedMultiplier) {
    this.musicTempo = Math.min(156, 118 * Math.sqrt(speedMultiplier));
  }

  stopSynthMusic() {
    this.isPlayingMusic = false;
    if (this.musicInterval) {
      clearTimeout(this.musicInterval);
      this.musicInterval = null;
    }
  }
}

export const audio = new AudioManager();
