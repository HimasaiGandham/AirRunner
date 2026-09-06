/**
 * AirRunner - Core Game Engine & Perspective Canvas Renderer
 * Controls game states (START, COUNTDOWN, PLAYING, PAUSED, GAME OVER),
 * forward-scrolling 3D perspective track, progressive difficulty,
 * collision handling, and HUD synchronization.
 */

import { CONFIG } from './config.js';
import { Player, PlayerState } from './player.js';
import { ObstacleManager } from './obstacles.js';
import { particles } from './particles.js';
import { audio } from './audio.js';
import { aiCoach } from './aiCoach.js';

export const GameState = {
  START: 'START',
  COUNTDOWN: 'COUNTDOWN',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAMEOVER: 'GAMEOVER'
};

export class GameEngine {
  constructor(canvasElement, hudElements) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.hud = hudElements;

    this.player = new Player();
    this.obstacles = new ObstacleManager();

    this.state = GameState.START;
    this.score = 0;
    this.highScore = parseInt(localStorage.getItem(CONFIG.STORAGE.HIGH_SCORE) || '0', 10);
    this.distance = 0;
    this.coins = 0;
    this.currentSpeed = CONFIG.GAME.INITIAL_SPEED;
    this.speedMultiplier = 1.0;

    // Track scroll offset for perspective road markings
    this.trackScroll = 0;

    // Countdown state
    this.countdownTimer = 3;
    this.lastCountdownUpdate = 0;

    // Telemetry tracking for AI debrief
    this.gestureStats = {
      jumps: 0,
      slides: 0,
      rolls: 0,
      laneSwitches: 0
    };
    this.fatalObstacle = null;

    // Animation loop
    this.lastFrameTime = performance.now();
    this.animationId = null;

    // Bindings
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
  }

  handleResize() {
    const container = this.canvas.parentElement;
    const rect = container ? container.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
    
    // Support high-DPI displays
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;

    this.width = rect.width;
    this.height = rect.height;

    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
  }

  startCountdown() {
    this.state = GameState.COUNTDOWN;
    this.countdownTimer = 3;
    this.lastCountdownUpdate = performance.now();
    audio.playCountdownTick(false);

    if (this.hud.countdownModal) {
      this.hud.countdownModal.classList.remove('hidden');
      this.hud.countdownText.innerText = '3';
    }
  }

  startRun() {
    this.state = GameState.PLAYING;
    this.score = 0;
    this.distance = 0;
    this.coins = 0;
    this.currentSpeed = CONFIG.GAME.INITIAL_SPEED;
    this.speedMultiplier = 1.0;
    this.trackScroll = 0;
    this.fatalObstacle = null;
    this.gestureStats = { jumps: 0, slides: 0, rolls: 0, laneSwitches: 0 };

    this.player.reset();
    this.obstacles.reset();
    particles.clear();

    if (this.hud.countdownModal) {
      this.hud.countdownModal.classList.add('hidden');
    }
    if (this.hud.gameOverModal) {
      this.hud.gameOverModal.classList.add('hidden');
    }

    audio.playStart();
    audio.startSynthMusic();
  }

  pause() {
    if (this.state === GameState.PLAYING) {
      this.state = GameState.PAUSED;
      audio.stopSynthMusic();
      if (this.hud.pauseModal) {
        this.hud.pauseModal.classList.remove('hidden');
      }
    }
  }

  resume() {
    if (this.state === GameState.PAUSED) {
      this.state = GameState.PLAYING;
      audio.startSynthMusic();
      if (this.hud.pauseModal) {
        this.hud.pauseModal.classList.add('hidden');
      }
    }
  }

  async gameOver(cause) {
    this.state = GameState.GAMEOVER;
    this.fatalObstacle = cause;
    this.player.hit();
    audio.stopSynthMusic();
    audio.playGameOver();

    // Check High Score
    let isNewHigh = false;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem(CONFIG.STORAGE.HIGH_SCORE, this.highScore.toString());
      isNewHigh = true;
    }

    // Populate Game Over HUD
    if (this.hud.finalScore) this.hud.finalScore.innerText = this.score.toString().padStart(6, '0');
    if (this.hud.finalHighScore) this.hud.finalHighScore.innerText = this.highScore.toString().padStart(6, '0');
    if (this.hud.finalDistance) this.hud.finalDistance.innerText = `${Math.floor(this.distance)}m`;
    if (this.hud.finalCoins) this.hud.finalCoins.innerText = this.coins.toString();
    if (this.hud.newRecordBadge) {
      this.hud.newRecordBadge.style.display = isNewHigh ? 'inline-block' : 'none';
    }

    // Trigger AI Coach Analysis
    if (this.hud.aiCoachText) {
      this.hud.aiCoachText.innerHTML = '<span class="loading-pulse">Analyzing neural telemetry...</span>';
    }
    if (this.hud.gameOverModal) {
      this.hud.gameOverModal.classList.remove('hidden');
    }

    const debrief = await aiCoach.generateDebrief({
      score: this.score,
      distance: Math.floor(this.distance),
      coins: this.coins,
      maxSpeed: this.currentSpeed.toFixed(1),
      gestureStats: this.gestureStats,
      causeOfDeath: this.fatalObstacle
    });

    if (this.hud.aiCoachText) {
      this.hud.aiCoachText.innerHTML = `
        <div class="coach-header" style="border-left: 3px solid ${debrief.color}">
          <span class="coach-rank" style="color: ${debrief.color}">[RANK ${debrief.rank}] ${debrief.title}</span>
          ${debrief.isAiGenerated ? '<span class="ai-badge">Gemini AI</span>' : '<span class="ai-badge neural">Cyber Neural</span>'}
        </div>
        <p class="coach-body">${debrief.summary}</p>
      `;
    }
  }

  // --- GESTURE & INPUT DISPATCHERS ---

  triggerLeft() {
    if (this.state === GameState.PLAYING) {
      if (this.player.moveLeft()) {
        this.gestureStats.laneSwitches++;
      }
    }
  }

  triggerRight() {
    if (this.state === GameState.PLAYING) {
      if (this.player.moveRight()) {
        this.gestureStats.laneSwitches++;
      }
    }
  }

  triggerJump() {
    if (this.state === GameState.PLAYING) {
      if (this.player.jump()) {
        this.gestureStats.jumps++;
      }
    }
  }

  triggerSlide() {
    if (this.state === GameState.PLAYING) {
      if (this.player.slide()) {
        this.gestureStats.slides++;
      }
    }
  }

  triggerRoll() {
    if (this.state === GameState.PLAYING) {
      if (this.player.roll()) {
        this.gestureStats.rolls++;
      }
    }
  }

  /**
   * Main Game Loop
   */
  startLoop() {
    const loop = (timestamp) => {
      const dt = Math.min((timestamp - this.lastFrameTime) / 1000, 0.1);
      this.lastFrameTime = timestamp;

      this.update(dt, timestamp);
      this.render();

      this.animationId = requestAnimationFrame(loop);
    };

    this.animationId = requestAnimationFrame(loop);
  }

  update(dt, now) {
    // 1. Countdown Logic
    if (this.state === GameState.COUNTDOWN) {
      if (now - this.lastCountdownUpdate >= 900) {
        this.countdownTimer--;
        this.lastCountdownUpdate = now;

        if (this.countdownTimer > 0) {
          audio.playCountdownTick(false);
          if (this.hud.countdownText) this.hud.countdownText.innerText = this.countdownTimer.toString();
        } else if (this.countdownTimer === 0) {
          audio.playCountdownTick(true);
          if (this.hud.countdownText) this.hud.countdownText.innerText = 'RUN!';
        } else {
          this.startRun();
        }
      }
      return;
    }

    if (this.state !== GameState.PLAYING && this.state !== GameState.GAMEOVER) {
      return;
    }

    // 2. Speed and Progression Scaling
    if (this.state === GameState.PLAYING) {
      this.distance += (this.currentSpeed * 0.05);
      this.score += Math.round(this.currentSpeed * 0.1);

      // Gradual acceleration
      this.currentSpeed = Math.min(
        CONFIG.GAME.MAX_SPEED,
        CONFIG.GAME.INITIAL_SPEED + this.distance * CONFIG.GAME.SPEED_ACCELERATION
      );
      this.speedMultiplier = (this.currentSpeed / CONFIG.GAME.INITIAL_SPEED);
      audio.updateMusicTempo(this.speedMultiplier);

      // Scrolling background lines
      this.trackScroll = (this.trackScroll + this.currentSpeed) % 180;
    }

    // 3. Entity Updates
    this.player.update(this.currentSpeed);

    if (this.state === GameState.PLAYING) {
      this.obstacles.update(
        this.currentSpeed,
        this.player,
        (pts) => { this.score += pts; },
        () => { this.coins++; },
        (cause) => { this.gameOver(cause); }
      );
    }

    // 4. Update HUD
    this.updateHUD();
  }

  updateHUD() {
    if (this.hud.score) this.hud.score.innerText = this.score.toString().padStart(6, '0');
    if (this.hud.highScore) this.hud.highScore.innerText = this.highScore.toString().padStart(6, '0');
    if (this.hud.distance) this.hud.distance.innerText = `${Math.floor(this.distance).toString().padStart(4, '0')}m`;
    if (this.hud.speed) this.hud.speed.innerText = `${this.speedMultiplier.toFixed(1)}x`;
    if (this.hud.coins) this.hud.coins.innerText = this.coins.toString();
  }

  /**
   * Perspective Canvas Rendering
   */
  render() {
    const w = this.width;
    const h = this.height;
    const centerX = w / 2;
    const horizonY = h * CONFIG.GAME.PERSPECTIVE.HORIZON_Y_RATIO;

    this.ctx.clearRect(0, 0, w, h);

    // 1. Cyber Sky Gradient & Synthwave Horizon
    this.drawSkyAndHorizon(centerX, horizonY, w, h);

    // 2. 3D Perspective Cyber Runway & Lane Markings
    this.drawTrack(centerX, horizonY, w, h);

    // 3. Obstacles & Collectibles (Z-sorted)
    this.obstacles.draw(this.ctx, centerX, horizonY);

    // 4. Player Character
    this.player.draw(this.ctx, centerX, horizonY);

    // 5. 3D Speed Warp Lines & Particle FX
    particles.updateAndDraw(this.ctx, w, h, this.currentSpeed, horizonY);
  }

  /**
   * Synthwave Horizon & City Skyline
   */
  drawSkyAndHorizon(centerX, horizonY, w, h) {
    // Sky gradient
    const skyGrad = this.ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, '#040508');
    skyGrad.addColorStop(0.65, '#0d0d26');
    skyGrad.addColorStop(1, '#270e3c');

    this.ctx.fillStyle = skyGrad;
    this.ctx.fillRect(0, 0, w, horizonY);

    // Distant Neon Sun on Horizon
    const sunRadius = Math.min(90, w * 0.08);
    const sunGrad = this.ctx.createRadialGradient(centerX, horizonY, 5, centerX, horizonY, sunRadius);
    sunGrad.addColorStop(0, '#ff0077');
    sunGrad.addColorStop(0.6, '#ffe600');
    sunGrad.addColorStop(1, 'rgba(255, 0, 119, 0)');

    this.ctx.fillStyle = sunGrad;
    this.ctx.beginPath();
    this.ctx.arc(centerX, horizonY, sunRadius, Math.PI, 0);
    this.ctx.fill();

    // Skyline Silhouettes
    this.ctx.fillStyle = '#070814';
    const buildingWidths = [45, 60, 35, 75, 50, 40, 80, 55, 45, 65, 50, 70];
    const buildingHeights = [55, 95, 40, 110, 70, 85, 120, 65, 80, 105, 60, 90];
    let bX = 0;
    let bIdx = 0;

    while (bX < w) {
      const bw = buildingWidths[bIdx % buildingWidths.length];
      const bh = buildingHeights[bIdx % buildingHeights.length];
      this.ctx.fillRect(bX, horizonY - bh, bw, bh);

      // Cyber Tower Beacon
      if (bh > 80) {
        this.ctx.fillStyle = '#00f0ff';
        this.ctx.fillRect(bX + bw / 2 - 1, horizonY - bh - 6, 2, 6);
        this.ctx.fillStyle = '#070814';
      }

      bX += bw + 8;
      bIdx++;
    }

    // Horizon Glow Line
    this.ctx.strokeStyle = '#00f0ff';
    this.ctx.shadowColor = '#00f0ff';
    this.ctx.shadowBlur = 15;
    this.ctx.lineWidth = 2.5;
    this.ctx.beginPath();
    this.ctx.moveTo(0, horizonY);
    this.ctx.lineTo(w, horizonY);
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
  }

  /**
   * 3D Perspective Road Track
   */
  drawTrack(centerX, horizonY, w, h) {
    const focalLength = CONFIG.GAME.PERSPECTIVE.FOCAL_LENGTH;
    const cameraHeight = CONFIG.GAME.PERSPECTIVE.CAMERA_HEIGHT;
    const laneSpacing = CONFIG.GAME.LANE_SPACING;
    const trackWidth = laneSpacing * 3.6;

    // Track Ground Gradient
    const groundGrad = this.ctx.createLinearGradient(0, horizonY, 0, h);
    groundGrad.addColorStop(0, '#0a0d18');
    groundGrad.addColorStop(0.5, '#070a14');
    groundGrad.addColorStop(1, '#03050a');

    this.ctx.fillStyle = groundGrad;
    this.ctx.fillRect(0, horizonY, w, h - horizonY);

    // 1. Perspective Grid & Lane Lines
    const lanes = [-1.5, -0.5, 0.5, 1.5]; // 4 lane separator boundaries
    const maxZ = 1300;
    const minZ = 15;

    // Longitudinal Lane Lines
    for (const laneRatio of lanes) {
      const worldX = laneRatio * laneSpacing;

      // Far point
      const scaleFar = focalLength / (maxZ + focalLength);
      const xFar = centerX + worldX * scaleFar;
      const yFar = horizonY + cameraHeight * scaleFar;

      // Near point
      const scaleNear = focalLength / (minZ + focalLength);
      const xNear = centerX + worldX * scaleNear;
      const yNear = horizonY + cameraHeight * scaleNear;

      this.ctx.strokeStyle = (laneRatio === -1.5 || laneRatio === 1.5) ? '#00f0ff' : 'rgba(0, 240, 255, 0.35)';
      this.ctx.lineWidth = (laneRatio === -1.5 || laneRatio === 1.5) ? 3.5 : 2.0;
      this.ctx.shadowColor = '#00f0ff';
      this.ctx.shadowBlur = (laneRatio === -1.5 || laneRatio === 1.5) ? 10 : 0;

      this.ctx.beginPath();
      this.ctx.moveTo(xFar, yFar);
      this.ctx.lineTo(xNear, yNear);
      this.ctx.stroke();
    }

    // 2. Transverse Scrolling Cross-Lines (Perspective Moving Dashes)
    const lineSpacing = 160;
    const offset = this.trackScroll;

    for (let z = minZ + offset; z < maxZ; z += lineSpacing) {
      const scale = focalLength / (z + focalLength);
      const groundY = horizonY + cameraHeight * scale;
      const halfW = (trackWidth / 2) * scale;

      const alpha = Math.max(0, 1 - (z / maxZ)) * 0.45;
      this.ctx.strokeStyle = `rgba(0, 240, 255, ${alpha})`;
      this.ctx.lineWidth = Math.max(1, 3.5 * scale);
      this.ctx.shadowBlur = 0;

      this.ctx.beginPath();
      this.ctx.moveTo(centerX - halfW, groundY);
      this.ctx.lineTo(centerX + halfW, groundY);
      this.ctx.stroke();
    }
  }

  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    audio.stopSynthMusic();
  }
}
