/**
 * AirRunner - Player Character Entity & State Machine
 * Renders an original futuristic neon Cyber Runner in pseudo-3D perspective.
 * Features smooth lane interpolation, jumping arcs, sliding crouches,
 * holographic roll spheres, and impact animations.
 */

import { CONFIG } from './config.js';
import { audio } from './audio.js';
import { particles } from './particles.js';

export const PlayerState = {
  RUNNING: 'RUNNING',
  JUMPING: 'JUMPING',
  SLIDING: 'SLIDING',
  ROLLING: 'ROLLING',
  HIT: 'HIT',
  FALLEN: 'FALLEN'
};

export class Player {
  constructor() {
    this.reset();
  }

  reset() {
    this.targetLane = 0; // -1 (Left), 0 (Center), 1 (Right)
    this.currentX = 0;   // Interpolated world X position
    this.laneWidth = CONFIG.GAME.LANE_SPACING;

    this.y = 0;          // Altitude above track (0 = ground)
    this.vy = 0;         // Vertical velocity
    this.isGrounded = true;

    this.state = PlayerState.RUNNING;
    this.stateTimer = 0; // Frame countdown for timed actions (slide, roll, hit)

    this.runCycle = 0;   // Running animation cycle
    this.tilt = 0;       // Banking angle during lane switch (-0.25 to 0.25 rad)
    this.rollAngle = 0;  // Rotation angle for roll maneuver

    this.invulnerableTimer = 0;
  }

  moveLeft() {
    if (this.state === PlayerState.HIT || this.state === PlayerState.FALLEN) return false;
    if (this.targetLane > -1) {
      this.targetLane--;
      audio.playLaneChange(-1);
      return true;
    }
    return false;
  }

  moveRight() {
    if (this.state === PlayerState.HIT || this.state === PlayerState.FALLEN) return false;
    if (this.targetLane < 1) {
      this.targetLane++;
      audio.playLaneChange(1);
      return true;
    }
    return false;
  }

  jump() {
    if (this.state === PlayerState.HIT || this.state === PlayerState.FALLEN) return false;
    if (this.isGrounded && this.state !== PlayerState.JUMPING) {
      this.vy = CONFIG.GAME.JUMP_VELOCITY;
      this.isGrounded = false;
      this.state = PlayerState.JUMPING;
      audio.playJump();
      return true;
    }
    return false;
  }

  slide() {
    if (this.state === PlayerState.HIT || this.state === PlayerState.FALLEN) return false;
    if (this.isGrounded && this.state !== PlayerState.SLIDING) {
      this.state = PlayerState.SLIDING;
      this.stateTimer = CONFIG.GAME.SLIDE_DURATION_FRAMES;
      audio.playSlide();
      return true;
    }
    return false;
  }

  roll() {
    if (this.state === PlayerState.HIT || this.state === PlayerState.FALLEN) return false;
    if (this.state !== PlayerState.ROLLING) {
      this.state = PlayerState.ROLLING;
      this.stateTimer = CONFIG.GAME.ROLL_DURATION_FRAMES;
      audio.playRoll();
      return true;
    }
    return false;
  }

  hit() {
    this.state = PlayerState.HIT;
    this.stateTimer = 40;
    this.invulnerableTimer = 60;
    audio.playCollision();
  }

  update(currentSpeed) {
    // 1. Smooth Lane Interpolation (Lerp)
    const targetWorldX = this.targetLane * this.laneWidth;
    const dx = targetWorldX - this.currentX;
    this.currentX += dx * CONFIG.GAME.LANE_CHANGE_LERP;

    // Banking tilt based on horizontal velocity
    const targetTilt = (dx / this.laneWidth) * 0.35;
    this.tilt += (targetTilt - this.tilt) * 0.22;

    // 2. Vertical Jump Physics
    if (!this.isGrounded) {
      this.vy -= CONFIG.GAME.GRAVITY;
      this.y += this.vy;

      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.isGrounded = true;
        if (this.state === PlayerState.JUMPING) {
          this.state = PlayerState.RUNNING;
          particles.spawnJump(this.currentScreenX, this.currentGroundY);
        }
      }
    }

    // 3. Timed State Counters
    if (this.state === PlayerState.SLIDING) {
      this.stateTimer--;
      if (Math.random() < 0.6) {
        particles.spawnSlide(this.currentScreenX, this.currentGroundY);
      }
      if (this.stateTimer <= 0) {
        this.state = this.isGrounded ? PlayerState.RUNNING : PlayerState.JUMPING;
      }
    } else if (this.state === PlayerState.ROLLING) {
      this.stateTimer--;
      this.rollAngle += 0.35;
      if (this.stateTimer % 3 === 0) {
        particles.spawnRoll(this.currentScreenX, this.currentScreenY);
      }
      if (this.stateTimer <= 0) {
        this.state = this.isGrounded ? PlayerState.RUNNING : PlayerState.JUMPING;
      }
    } else if (this.state === PlayerState.HIT) {
      this.stateTimer--;
      if (this.stateTimer <= 0) {
        this.state = PlayerState.FALLEN;
      }
    }

    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer--;
    }

    // 4. Stride animation speed
    this.runCycle += 0.22 * (currentSpeed / CONFIG.GAME.INITIAL_SPEED);
  }

  /**
   * Returns current 3D collision bounding volume
   */
  getHitbox() {
    let height = 75;
    let yBottom = this.y;

    if (this.state === PlayerState.SLIDING) {
      height = 25; // low clearance
    } else if (this.state === PlayerState.ROLLING) {
      height = 35; // compact sphere
    }

    return {
      lane: this.targetLane,
      worldX: this.currentX,
      yBottom: yBottom,
      yTop: yBottom + height,
      state: this.state
    };
  }

  /**
   * Render the player at its projected position
   */
  draw(ctx, centerX, horizonY) {
    const focalLength = CONFIG.GAME.PERSPECTIVE.FOCAL_LENGTH;
    const playerZ = CONFIG.GAME.PERSPECTIVE.PLAYER_Z;
    const cameraHeight = CONFIG.GAME.PERSPECTIVE.CAMERA_HEIGHT;

    // Perspective projection
    const scale = focalLength / (playerZ + focalLength);
    const screenX = centerX + this.currentX * scale;
    const groundY = horizonY + cameraHeight * scale;
    const screenY = groundY - this.y * scale;

    this.currentScreenX = screenX;
    this.currentScreenY = screenY;
    this.currentGroundY = groundY;

    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(this.tilt);

    // Invulnerability blink
    if (this.invulnerableTimer > 0 && Math.floor(this.invulnerableTimer / 4) % 2 === 0) {
      ctx.globalAlpha = 0.4;
    }

    // 1. Ground Shadow (stays on ground regardless of jump height)
    ctx.save();
    ctx.translate(0, (groundY - screenY));
    const shadowScale = Math.max(0.2, 1 - (this.y / 240));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 36 * scale * shadowScale, 14 * scale * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Subtle neon reflection on track floor
    ctx.fillStyle = this.state === PlayerState.ROLLING ? 'rgba(0, 255, 136, 0.18)' : 'rgba(0, 240, 255, 0.14)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 48 * scale * shadowScale, 18 * scale * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Draw Character Based On Current State
    if (this.state === PlayerState.ROLLING) {
      this.drawRollingSphere(ctx, scale);
    } else if (this.state === PlayerState.SLIDING) {
      this.drawSlidingRunner(ctx, scale);
    } else {
      this.drawUprightRunner(ctx, scale);
    }

    ctx.restore();
  }

  /**
   * Standard Running / Jumping Cyber Runner
   */
  drawUprightRunner(ctx, scale) {
    const bob = Math.sin(this.runCycle) * (this.isGrounded ? 4 : 1);
    const legPhase = Math.sin(this.runCycle);

    // Thruster Jet Exhaust
    ctx.save();
    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 14;
    const thrusterFlame = 14 + Math.random() * 8;
    ctx.beginPath();
    ctx.moveTo(-12 * scale, (-20 + bob) * scale);
    ctx.lineTo(-6 * scale, (-20 + bob + thrusterFlame) * scale);
    ctx.lineTo(0, (-20 + bob) * scale);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, (-20 + bob) * scale);
    ctx.lineTo(6 * scale, (-20 + bob + thrusterFlame) * scale);
    ctx.lineTo(12 * scale, (-20 + bob) * scale);
    ctx.fill();
    ctx.restore();

    // Torso / Jetpack Body
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2.5 * scale;
    ctx.beginPath();
    ctx.roundRect((-18 * scale), ((-58 + bob) * scale), (36 * scale), (42 * scale), 8 * scale);
    ctx.fill();
    ctx.stroke();

    // Glowing Cyber Chestplate
    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, (-52 + bob) * scale);
    ctx.lineTo(8 * scale, (-40 + bob) * scale);
    ctx.lineTo(-8 * scale, (-40 + bob) * scale);
    ctx.closePath();
    ctx.fill();

    // Cyber Visor / Helmet
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(0, (-68 + bob) * scale, 15 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Visor Glass Glow
    ctx.fillStyle = '#00ffcc';
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect((-10 * scale), ((-72 + bob) * scale), (20 * scale), (8 * scale), 4 * scale);
    ctx.fill();

    // Cyber Limbs (Animated in 3D perspective)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3.5 * scale;
    ctx.lineCap = 'round';

    // Left Leg
    ctx.beginPath();
    ctx.moveTo(-10 * scale, (-16 + bob) * scale);
    ctx.lineTo(-12 * scale, (-6 + bob + legPhase * 8) * scale);
    ctx.lineTo(-10 * scale, (legPhase * 10) * scale);
    ctx.stroke();

    // Right Leg
    ctx.beginPath();
    ctx.moveTo(10 * scale, (-16 + bob) * scale);
    ctx.lineTo(12 * scale, (-6 + bob - legPhase * 8) * scale);
    ctx.lineTo(10 * scale, (-legPhase * 10) * scale);
    ctx.stroke();
  }

  /**
   * Sliding Crouch Mode
   */
  drawSlidingRunner(ctx, scale) {
    ctx.save();
    // Low aerodynamic streamlined body
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 2.5 * scale;

    ctx.beginPath();
    ctx.ellipse(0, -14 * scale, 34 * scale, 14 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Visor glow
    ctx.fillStyle = '#ffaa00';
    ctx.shadowColor = '#ffaa00';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.ellipse(14 * scale, -16 * scale, 8 * scale, 4 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sliding thruster sparks
    ctx.fillStyle = '#ff3366';
    ctx.beginPath();
    ctx.arc(-26 * scale, -12 * scale, 6 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Holographic Rolling Sphere Mode
   */
  drawRollingSphere(ctx, scale) {
    ctx.save();
    ctx.rotate(this.rollAngle);

    const radius = 26 * scale;

    // Glowing Inner Energy Core
    const grad = ctx.createRadialGradient(0, 0, 2 * scale, 0, 0, radius);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, '#00ff88');
    grad.addColorStop(1, 'rgba(0, 255, 136, 0.1)');

    ctx.fillStyle = grad;
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    // Rotating Outer Armor Plates
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 3.5 * scale;
    ctx.shadowBlur = 10;

    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.05, angle + 0.15, angle + (Math.PI / 2) - 0.15);
      ctx.stroke();
    }

    ctx.restore();
  }
}
