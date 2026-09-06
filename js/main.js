/**
 * AirRunner - Main Application Controller & UI Wiring
 * Orchestrates camera permissions, MediaPipe tracking lifecycle, game states,
 * modal dialogs, settings persistence, and keyboard fallback controls.
 */

import { CONFIG } from './config.js';
import { GameEngine, GameState } from './game.js';
import { HandTracker } from './handTracking.js';
import { audio } from './audio.js';
import { aiCoach } from './aiCoach.js';

// Cross-browser polyfill for CanvasRenderingContext2D.roundRect
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii = 0) {
    if (typeof radii === 'number') radii = [radii, radii, radii, radii];
    const [tl, tr, br, bl] = radii;
    this.moveTo(x + tl, y);
    this.lineTo(x + w - tr, y);
    this.quadraticCurveTo(x + w, y, x + w, y + tr);
    this.lineTo(x + w, y + h - br);
    this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    this.lineTo(x + bl, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - bl);
    this.lineTo(x, y + tl);
    this.quadraticCurveTo(x, y, x + tl, y);
    this.closePath();
    return this;
  };
}

class AirRunnerApp {
  constructor() {
    this.initElements();
    this.initSettings();
    this.initGameEngine();
    this.initHandTracking();
    this.bindEvents();
    this.bindKeyboardControls();
  }

  initElements() {
    // Canvas & Containers
    this.gameCanvas = document.getElementById('game-canvas');
    this.webcamVideo = document.getElementById('webcam-video');
    this.webcamCanvas = document.getElementById('webcam-canvas');
    this.cameraContainer = document.getElementById('camera-container');

    // Screens & Modals
    this.startScreen = document.getElementById('start-screen');
    this.inGameHUD = document.getElementById('in-game-hud');
    this.howToPlayModal = document.getElementById('how-to-play-modal');
    this.settingsModal = document.getElementById('settings-modal');
    this.pauseModal = document.getElementById('pause-modal');
    this.gameOverModal = document.getElementById('game-over-modal');
    this.countdownModal = document.getElementById('countdown-modal');

    // HUD Elements
    this.scoreDisplay = document.getElementById('hud-score');
    this.highScoreDisplay = document.getElementById('hud-high-score');
    this.distanceDisplay = document.getElementById('hud-distance');
    this.speedDisplay = document.getElementById('hud-speed');
    this.coinsDisplay = document.getElementById('hud-coins');
    this.hudGestureDisplay = document.getElementById('hud-current-gesture');

    // Camera Panel Badges
    this.handStatusBadge = document.getElementById('hand-status-badge');
    this.gestureBadge = document.getElementById('gesture-badge');
    this.multiHandNotice = document.getElementById('multi-hand-notice');

    // Game Over Elements
    this.finalScore = document.getElementById('final-score');
    this.finalHighScore = document.getElementById('final-high-score');
    this.finalDistance = document.getElementById('final-distance');
    this.finalCoins = document.getElementById('final-coins');
    this.newRecordBadge = document.getElementById('new-record-badge');
    this.aiCoachText = document.getElementById('ai-coach-text');

    // Countdown Text
    this.countdownText = document.getElementById('countdown-text');

    // Buttons
    this.btnStartGame = document.getElementById('btn-start-game');
    this.btnHowToPlay = document.getElementById('btn-how-to-play');
    this.btnSettings = document.getElementById('btn-settings');
    this.btnPause = document.getElementById('btn-pause');
    this.btnResume = document.getElementById('btn-resume');
    this.btnRestart = document.getElementById('btn-restart');
    this.btnPauseQuit = document.getElementById('btn-pause-quit');
    this.btnPlayAgain = document.getElementById('btn-play-again');
    this.btnGameOverMenu = document.getElementById('btn-game-over-menu');
    this.btnToggleMute = document.getElementById('btn-toggle-mute');
    this.btnToggleCam = document.getElementById('btn-toggle-cam');

    // Settings Inputs
    this.settingSensitivity = document.getElementById('setting-sensitivity');
    this.settingVolume = document.getElementById('setting-volume');
    this.settingSynthMusic = document.getElementById('setting-synth-music');
    this.settingKeyboard = document.getElementById('setting-keyboard');
    this.settingGeminiKey = document.getElementById('setting-gemini-key');
    this.btnSaveSettings = document.getElementById('btn-save-settings');
    this.btnCloseSettings = document.getElementById('btn-close-settings');
    this.btnCloseHowTo = document.getElementById('btn-close-how-to');

    // Practice sandbox element in How To Play
    this.practiceGestureDisplay = document.getElementById('practice-gesture-display');
  }

  initSettings() {
    const saved = localStorage.getItem(CONFIG.STORAGE.SETTINGS);
    this.settings = saved ? JSON.parse(saved) : {
      sensitivity: 'NORMAL',
      volume: 70,
      synthMusic: true,
      keyboardFallback: true
    };

    // Apply settings
    this.settingSensitivity.value = this.settings.sensitivity;
    this.settingVolume.value = this.settings.volume;
    this.settingSynthMusic.checked = this.settings.synthMusic;
    this.settingKeyboard.checked = this.settings.keyboardFallback;
    this.settingGeminiKey.value = aiCoach.getApiKey();

    audio.setVolume(this.settings.volume / 100);
    CONFIG.AUDIO.SYNTH_BASS_ENABLED = this.settings.synthMusic;
  }

  saveSettings() {
    this.settings = {
      sensitivity: this.settingSensitivity.value,
      volume: parseInt(this.settingVolume.value, 10),
      synthMusic: this.settingSynthMusic.checked,
      keyboardFallback: this.settingKeyboard.checked
    };

    localStorage.setItem(CONFIG.STORAGE.SETTINGS, JSON.stringify(this.settings));
    aiCoach.setApiKey(this.settingGeminiKey.value);

    // Apply
    if (this.tracker) {
      this.tracker.recognizer.setSensitivity(this.settings.sensitivity);
    }
    audio.setVolume(this.settings.volume / 100);
    CONFIG.AUDIO.SYNTH_BASS_ENABLED = this.settings.synthMusic;
    if (!this.settings.synthMusic) {
      audio.stopSynthMusic();
    } else if (this.game.state === GameState.PLAYING) {
      audio.startSynthMusic();
    }

    this.settingsModal.classList.add('hidden');
    this.showToast('Settings saved successfully!');
  }

  initGameEngine() {
    this.game = new GameEngine(this.gameCanvas, {
      score: this.scoreDisplay,
      highScore: this.highScoreDisplay,
      distance: this.distanceDisplay,
      speed: this.speedDisplay,
      coins: this.coinsDisplay,
      countdownModal: this.countdownModal,
      countdownText: this.countdownText,
      gameOverModal: this.gameOverModal,
      finalScore: this.finalScore,
      finalHighScore: this.finalHighScore,
      finalDistance: this.finalDistance,
      finalCoins: this.finalCoins,
      newRecordBadge: this.newRecordBadge,
      aiCoachText: this.aiCoachText,
      pauseModal: this.pauseModal
    });

    this.game.startLoop();
  }

  initHandTracking() {
    this.tracker = new HandTracker(this.webcamVideo, this.webcamCanvas);
    this.tracker.recognizer.setSensitivity(this.settings.sensitivity);

    // Bind Gesture Dispatcher
    this.tracker.onGesture = (gesture) => {
      this.handleGestureAction(gesture);
    };

    // Update Live Badges
    this.tracker.onHandStatus = (detected, multiHands) => {
      if (detected) {
        this.handStatusBadge.innerText = 'Hand detected ✓';
        this.handStatusBadge.className = 'status-badge detected';
      } else {
        this.handStatusBadge.innerText = 'No hand detected';
        this.handStatusBadge.className = 'status-badge not-detected';
      }

      if (this.multiHandNotice) {
        this.multiHandNotice.style.display = multiHands ? 'block' : 'none';
      }
    };

    this.tracker.onTelemetry = (telemetry) => {
      const g = telemetry.displayGesture || 'NONE';
      this.gestureBadge.innerText = `Gesture: ${g}`;
      this.hudGestureDisplay.innerText = g;

      if (g !== 'NONE') {
        this.gestureBadge.classList.add('active');
        this.hudGestureDisplay.classList.add('active');
      } else {
        this.gestureBadge.classList.remove('active');
        this.hudGestureDisplay.classList.remove('active');
      }

      // Practice box feedback in How To Play modal
      if (this.practiceGestureDisplay) {
        this.practiceGestureDisplay.innerText = g;
        if (g !== 'NONE') {
          this.practiceGestureDisplay.className = 'practice-tag active-tag';
        } else {
          this.practiceGestureDisplay.className = 'practice-tag';
        }
      }
    };

    this.tracker.onError = (errMsg) => {
      this.showToast(errMsg, true);
    };
  }

  handleGestureAction(gesture) {
    switch (gesture) {
      case 'LEFT':
        this.game.triggerLeft();
        break;
      case 'RIGHT':
        this.game.triggerRight();
        break;
      case 'JUMP':
        this.game.triggerJump();
        break;
      case 'SLIDE':
        this.game.triggerSlide();
        break;
      case 'ROLL':
        this.game.triggerRoll();
        break;
    }
  }

  bindEvents() {
    // Start Game Button
    this.btnStartGame.addEventListener('click', async () => {
      audio.init();
      audio.playStart();
      this.btnStartGame.disabled = true;
      this.btnStartGame.innerText = 'INITIALIZING CAMERA...';

      try {
        await this.tracker.loadModel();
        await this.tracker.startCamera();

        this.startScreen.classList.add('hidden');
        this.inGameHUD.classList.remove('hidden');
        this.cameraContainer.classList.remove('hidden');

        this.game.startCountdown();
      } catch (err) {
        console.error("Camera startup error:", err);
        this.btnStartGame.disabled = false;
        this.btnStartGame.innerText = 'START GAME';
        this.showToast("Webcam access required. Please allow camera permissions.", true);
      }
    });

    // How To Play
    this.btnHowToPlay.addEventListener('click', async () => {
      audio.init();
      this.howToPlayModal.classList.remove('hidden');
      // If camera is not running, pre-load so user can test gestures in sandbox
      if (!this.tracker.isTracking) {
        try {
          await this.tracker.loadModel();
          await this.tracker.startCamera();
          this.cameraContainer.classList.remove('hidden');
        } catch (e) {
          console.log("Practice camera skipped until start:", e);
        }
      }
    });

    this.btnCloseHowTo.addEventListener('click', () => {
      this.howToPlayModal.classList.add('hidden');
    });

    // Settings
    this.btnSettings.addEventListener('click', () => {
      audio.init();
      this.settingsModal.classList.remove('hidden');
    });

    this.btnSaveSettings.addEventListener('click', () => {
      this.saveSettings();
    });

    this.btnCloseSettings.addEventListener('click', () => {
      this.settingsModal.classList.add('hidden');
    });

    // Pause Controls
    this.btnPause.addEventListener('click', () => {
      this.game.pause();
    });

    this.btnResume.addEventListener('click', () => {
      this.game.resume();
    });

    this.btnRestart.addEventListener('click', () => {
      this.pauseModal.classList.add('hidden');
      this.game.startCountdown();
    });

    this.btnPauseQuit.addEventListener('click', () => {
      this.pauseModal.classList.add('hidden');
      this.inGameHUD.classList.add('hidden');
      this.startScreen.classList.remove('hidden');
      this.game.state = GameState.START;
      this.btnStartGame.disabled = false;
      this.btnStartGame.innerText = 'START GAME';
    });

    // Game Over Controls
    this.btnPlayAgain.addEventListener('click', () => {
      this.gameOverModal.classList.add('hidden');
      this.game.startCountdown();
    });

    this.btnGameOverMenu.addEventListener('click', () => {
      this.gameOverModal.classList.add('hidden');
      this.inGameHUD.classList.add('hidden');
      this.startScreen.classList.remove('hidden');
      this.game.state = GameState.START;
      this.btnStartGame.disabled = false;
      this.btnStartGame.innerText = 'START GAME';
    });

    // Mute Toggle
    this.btnToggleMute.addEventListener('click', () => {
      audio.isMuted = !audio.isMuted;
      audio.setMuted(audio.isMuted);
      this.btnToggleMute.innerText = audio.isMuted ? '🔇' : '🔊';
    });

    // Camera Minimize Toggle
    this.btnToggleCam.addEventListener('click', () => {
      this.cameraContainer.classList.toggle('minimized');
      this.btnToggleCam.innerText = this.cameraContainer.classList.contains('minimized') ? '▲' : '▼';
    });
  }

  bindKeyboardControls() {
    window.addEventListener('keydown', (e) => {
      if (!this.settings.keyboardFallback) return;

      const key = e.key.toLowerCase();

      // Pause toggle
      if (key === 'p' || key === 'escape') {
        if (this.game.state === GameState.PLAYING) {
          this.game.pause();
        } else if (this.game.state === GameState.PAUSED) {
          this.game.resume();
        }
        return;
      }

      if (this.game.state !== GameState.PLAYING) return;

      switch (key) {
        case 'arrowleft':
        case 'a':
          e.preventDefault();
          this.game.triggerLeft();
          this.hudGestureDisplay.innerText = 'LEFT (KEY)';
          break;
        case 'arrowright':
        case 'd':
          e.preventDefault();
          this.game.triggerRight();
          this.hudGestureDisplay.innerText = 'RIGHT (KEY)';
          break;
        case 'arrowup':
        case 'w':
        case ' ':
          e.preventDefault();
          this.game.triggerJump();
          this.hudGestureDisplay.innerText = 'JUMP (KEY)';
          break;
        case 'arrowdown':
        case 's':
          e.preventDefault();
          this.game.triggerSlide();
          this.hudGestureDisplay.innerText = 'SLIDE (KEY)';
          break;
        case 'shift':
        case 'r':
        case 'z':
          e.preventDefault();
          this.game.triggerRoll();
          this.hudGestureDisplay.innerText = 'ROLL (KEY)';
          break;
      }
    });
  }

  showToast(message, isError = false) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      document.body.appendChild(toast);
    }
    toast.className = isError ? 'toast error' : 'toast info';
    toast.innerText = message;
    toast.classList.add('visible');

    setTimeout(() => {
      toast.classList.remove('visible');
    }, 3800);
  }
}

// Bootstrap once DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  new AirRunnerApp();
});
