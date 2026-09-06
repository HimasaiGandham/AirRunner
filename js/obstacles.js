/**
 * AirRunner - Obstacles & Collectibles Engine
 * Procedurally generates 3D perspective obstacles and collectibles.
 * Features 4 distinct obstacle classes requiring different physical gestures:
 * 1. Low Barrier (Requires Jump)
 * 2. High Arch (Requires Slide)
 * 3. Solid Wall (Requires Lane Switch)
 * 4. Void Ring (Requires Roll)
 * Plus Collectible Cyber Coins in lane trails and jump arcs.
 */

import { CONFIG } from './config.js';
import { audio } from './audio.js';
import { particles } from './particles.js';

export const ObstacleType = {
  BARRIER_LOW: 'BARRIER_LOW',   // Must Jump
  BARRIER_HIGH: 'BARRIER_HIGH', // Must Slide
  WALL_SOLID: 'WALL_SOLID',     // Must Switch Lanes
  VOID_RING: 'VOID_RING',       // Must Roll
  COIN: 'COIN'                  // Collectible
};

export class ObstacleManager {
  constructor() {
    this.obstacles = [];
    this.spawnTimer = 0;
    this.coinAngle = 0;
  }

  reset() {
    this.obstacles = [];
    this.spawnTimer = 40; // Initial calm period
  }

  update(currentSpeed, player, onScoreIncrease, onCoinCollect, onCollision) {
    this.coinAngle += 0.08;

    // 1. Spawning Logic
    this.spawnTimer--;
    if (this.spawnTimer <= 0) {
      this.spawnPattern(currentSpeed);
      // Spawn interval decreases smoothly as speed increases
      const speedRatio = (currentSpeed - CONFIG.GAME.INITIAL_SPEED) / (CONFIG.GAME.MAX_SPEED - CONFIG.GAME.INITIAL_SPEED);
      const interval = CONFIG.GAME.OBSTACLES.MAX_SPAWN_INTERVAL - 
        speedRatio * (CONFIG.GAME.OBSTACLES.MAX_SPAWN_INTERVAL - CONFIG.GAME.OBSTACLES.MIN_SPAWN_INTERVAL);
      this.spawnTimer = Math.max(CONFIG.GAME.OBSTACLES.MIN_SPAWN_INTERVAL, Math.round(interval));
    }

    // 2. Update Obstacle Positions & Collision Detection
    const playerZ = CONFIG.GAME.PERSPECTIVE.PLAYER_Z;
    const hitZWindow = 35; // Depth range in which collisions trigger

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obj = this.obstacles[i];
      obj.z -= currentSpeed;

      // Check collision when object crosses player's Z plane
      if (!obj.collected && Math.abs(obj.z - playerZ) < hitZWindow) {
        this.checkInteraction(obj, player, onScoreIncrease, onCoinCollect, onCollision);
      }

      // Despawn once behind camera
      if (obj.z < CONFIG.GAME.PERSPECTIVE.DESPAWN_Z) {
        this.obstacles.splice(i, 1);
      }
    }
  }

  /**
   * Spawns structured patterns ensuring fair, solvable gameplay
   */
  spawnPattern(currentSpeed) {
    const lanes = [-1, 0, 1];
    const roll = Math.random();

    // Pattern 1: Low hurdle with a coin arc over it (JUMP prompt)
    if (roll < 0.28) {
      const lane = lanes[Math.floor(Math.random() * lanes.length)];
      this.obstacles.push({
        type: ObstacleType.BARRIER_LOW,
        lane: lane,
        z: CONFIG.GAME.PERSPECTIVE.SPAWN_Z,
        collected: false
      });
      // Arc of 3 coins over the hurdle
      this.obstacles.push(
        { type: ObstacleType.COIN, lane: lane, z: CONFIG.GAME.PERSPECTIVE.SPAWN_Z - 60, y: 30, collected: false },
        { type: ObstacleType.COIN, lane: lane, z: CONFIG.GAME.PERSPECTIVE.SPAWN_Z, y: 75, collected: false },
        { type: ObstacleType.COIN, lane: lane, z: CONFIG.GAME.PERSPECTIVE.SPAWN_Z + 60, y: 30, collected: false }
      );
    }
    // Pattern 2: High plasma beam (SLIDE prompt)
    else if (roll < 0.52) {
      const lane = lanes[Math.floor(Math.random() * lanes.length)];
      this.obstacles.push({
        type: ObstacleType.BARRIER_HIGH,
        lane: lane,
        z: CONFIG.GAME.PERSPECTIVE.SPAWN_Z,
        collected: false
      });
      // Coins on the ground directly under the slide arch
      this.obstacles.push(
        { type: ObstacleType.COIN, lane: lane, z: CONFIG.GAME.PERSPECTIVE.SPAWN_Z, y: 0, collected: false }
      );
    }
    // Pattern 3: Void Ring (ROLL prompt)
    else if (roll < 0.74) {
      const lane = lanes[Math.floor(Math.random() * lanes.length)];
      this.obstacles.push({
        type: ObstacleType.VOID_RING,
        lane: lane,
        z: CONFIG.GAME.PERSPECTIVE.SPAWN_Z,
        collected: false
      });
      this.obstacles.push(
        { type: ObstacleType.COIN, lane: lane, z: CONFIG.GAME.PERSPECTIVE.SPAWN_Z, y: 0, collected: false }
      );
    }
    // Pattern 4: Solid Wall blocking 1 or 2 lanes (MOVE LEFT / RIGHT prompt)
    else {
      // Pick 1 or 2 lanes to block, leaving at least 1 open
      const openLane = lanes[Math.floor(Math.random() * lanes.length)];
      const blockedLanes = lanes.filter(l => l !== openLane);
      
      // If higher speed, block 2 lanes; otherwise block 1 lane
      const numToBlock = currentSpeed > 22 && Math.random() > 0.4 ? 2 : 1;
      for (let i = 0; i < numToBlock; i++) {
        this.obstacles.push({
          type: ObstacleType.WALL_SOLID,
          lane: blockedLanes[i],
          z: CONFIG.GAME.PERSPECTIVE.SPAWN_Z,
          collected: false
        });
      }
      // Trail of coins leading through the safe lane
      for (let c = 0; c < 3; c++) {
        this.obstacles.push({
          type: ObstacleType.COIN,
          lane: openLane,
          z: CONFIG.GAME.PERSPECTIVE.SPAWN_Z + c * 50,
          y: 0,
          collected: false
        });
      }
    }
  }

  /**
   * Collision and interaction resolution
   */
  checkInteraction(obj, player, onScoreIncrease, onCoinCollect, onCollision) {
    const hitbox = player.getHitbox();
    const laneDist = Math.abs(obj.lane - hitbox.lane);

    // 1. Collectible Coins
    if (obj.type === ObstacleType.COIN) {
      if (laneDist < 0.5) {
        const coinY = obj.y || 0;
        // Check vertical reach
        if (Math.abs(player.y - coinY) < 55) {
          obj.collected = true;
          audio.playCoin();
          particles.spawnCoin(obj.screenX, obj.screenY);
          onCoinCollect();
          onScoreIncrease(100);
        }
      }
      return;
    }

    // 2. Obstacle Collisions
    if (laneDist < 0.5) {
      let isSafe = false;

      switch (obj.type) {
        case ObstacleType.BARRIER_LOW:
          // Player is safe if high enough in the air (JUMP)
          if (player.y >= 38) {
            isSafe = true;
            onScoreIncrease(25); // Bonus for clearing hurdle
          }
          break;

        case ObstacleType.BARRIER_HIGH:
          // Player is safe if crouched in slide (SLIDE)
          if (player.state === 'SLIDING') {
            isSafe = true;
            onScoreIncrease(25);
          }
          break;

        case ObstacleType.VOID_RING:
          // Player is safe if spinning in roll ball (ROLL)
          if (player.state === 'ROLLING') {
            isSafe = true;
            onScoreIncrease(50);
          }
          break;

        case ObstacleType.WALL_SOLID:
          // Cannot jump or slide through a solid wall; must be in another lane
          isSafe = false;
          break;
      }

      if (!isSafe && player.invulnerableTimer <= 0) {
        particles.spawnCollision(player.currentScreenX, player.currentScreenY);
        onCollision(obj.type);
      }
    }
  }

  /**
   * Renders all active obstacles sorted by Z-distance (painter's algorithm)
   */
  draw(ctx, centerX, horizonY) {
    const focalLength = CONFIG.GAME.PERSPECTIVE.FOCAL_LENGTH;
    const cameraHeight = CONFIG.GAME.PERSPECTIVE.CAMERA_HEIGHT;
    const laneSpacing = CONFIG.GAME.LANE_SPACING;

    // Sort far to near
    this.obstacles.sort((a, b) => b.z - a.z);

    for (const obj of this.obstacles) {
      if (obj.collected) continue;

      const scale = focalLength / (obj.z + focalLength);
      if (scale <= 0) continue;

      const worldX = obj.lane * laneSpacing;
      const screenX = centerX + worldX * scale;
      const groundY = horizonY + cameraHeight * scale;
      const yOffset = (obj.y || 0) * scale;
      const screenY = groundY - yOffset;

      // Save projected coordinates for particles / interactions
      obj.screenX = screenX;
      obj.screenY = screenY;

      ctx.save();
      ctx.translate(screenX, screenY);

      switch (obj.type) {
        case ObstacleType.BARRIER_LOW:
          this.drawLowBarrier(ctx, scale);
          break;
        case ObstacleType.BARRIER_HIGH:
          this.drawHighBarrier(ctx, scale);
          break;
        case ObstacleType.WALL_SOLID:
          this.drawSolidWall(ctx, scale);
          break;
        case ObstacleType.VOID_RING:
          this.drawVoidRing(ctx, scale);
          break;
        case ObstacleType.COIN:
          this.drawCoin(ctx, scale);
          break;
      }

      ctx.restore();
    }
  }

  /**
   * 1. Low Laser Hurdle (JUMP)
   */
  drawLowBarrier(ctx, scale) {
    const w = 150 * scale;
    const h = 38 * scale;

    // Glowing Neon Bar
    ctx.fillStyle = 'rgba(255, 0, 85, 0.85)';
    ctx.strokeStyle = '#ff0055';
    ctx.shadowColor = '#ff0055';
    ctx.shadowBlur = 15;
    ctx.lineWidth = 3 * scale;

    ctx.beginPath();
    ctx.roundRect(-w / 2, -h, w, h, 6 * scale);
    ctx.fill();
    ctx.stroke();

    // Side Support Posts
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2 * scale;

    ctx.fillRect(-w / 2 - 8 * scale, -h - 10 * scale, 12 * scale, h + 10 * scale);
    ctx.strokeRect(-w / 2 - 8 * scale, -h - 10 * scale, 12 * scale, h + 10 * scale);

    ctx.fillRect(w / 2 - 4 * scale, -h - 10 * scale, 12 * scale, h + 10 * scale);
    ctx.strokeRect(w / 2 - 4 * scale, -h - 10 * scale, 12 * scale, h + 10 * scale);

    // "JUMP" holographic micro-label
    if (scale > 0.35) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(11 * scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('▲ JUMP ▲', 0, -h / 2 + 4 * scale);
    }
  }

  /**
   * 2. High Plasma Arch (SLIDE)
   */
  drawHighBarrier(ctx, scale) {
    const w = 170 * scale;
    const h = 42 * scale;
    const elevation = 70 * scale; // Clearance underneath for sliding

    // High Hovering Laser Beam
    ctx.fillStyle = 'rgba(255, 170, 0, 0.9)';
    ctx.strokeStyle = '#ffe600';
    ctx.shadowColor = '#ffaa00';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 3.5 * scale;

    ctx.beginPath();
    ctx.roundRect(-w / 2, -elevation - h, w, h, 8 * scale);
    ctx.fill();
    ctx.stroke();

    // Archway Pylons Extending to Floor
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -elevation - h);
    ctx.lineTo(-w / 2, 0);
    ctx.moveTo(w / 2, -elevation - h);
    ctx.lineTo(w / 2, 0);
    ctx.stroke();

    // "SLIDE" holographic label
    if (scale > 0.35) {
      ctx.fillStyle = '#000000';
      ctx.font = `bold ${Math.round(11 * scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('▼ SLIDE ▼', 0, -elevation - h / 2 + 4 * scale);
    }
  }

  /**
   * 3. Solid Quantum Wall (MOVE LEFT / RIGHT)
   */
  drawSolidWall(ctx, scale) {
    const w = 175 * scale;
    const h = 145 * scale;

    // Massive Cyber Monolith
    const grad = ctx.createLinearGradient(0, -h, 0, 0);
    grad.addColorStop(0, '#1e1b4b');
    grad.addColorStop(1, '#090d16');

    ctx.fillStyle = grad;
    ctx.strokeStyle = '#6366f1';
    ctx.shadowColor = '#6366f1';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 3.5 * scale;

    ctx.beginPath();
    ctx.roundRect(-w / 2, -h, w, h, 10 * scale);
    ctx.fill();
    ctx.stroke();

    // Hazard Cross Pattern
    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 2.5 * scale;
    ctx.beginPath();
    ctx.moveTo(-w * 0.38, -h * 0.85);
    ctx.lineTo(w * 0.38, -h * 0.15);
    ctx.moveTo(w * 0.38, -h * 0.85);
    ctx.lineTo(-w * 0.38, -h * 0.15);
    ctx.stroke();

    // Pulsing Warning Center
    ctx.fillStyle = '#ff0055';
    ctx.shadowColor = '#ff0055';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, -h / 2, 14 * scale, 0, Math.PI * 2);
    ctx.fill();

    if (scale > 0.35) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(10 * scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('EVADE', 0, -h / 2 + 4 * scale);
    }
  }

  /**
   * 4. Void Ring (ROLL)
   */
  drawVoidRing(ctx, scale) {
    const radius = 55 * scale;
    const centerElevation = 45 * scale;

    ctx.save();
    ctx.translate(0, -centerElevation);

    // Glowing Neon Hoop
    ctx.strokeStyle = '#00ff88';
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 20;
    ctx.lineWidth = 5 * scale;

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Internal Quantum Core Field
    ctx.fillStyle = 'rgba(0, 255, 136, 0.15)';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.85, 0, Math.PI * 2);
    ctx.fill();

    if (scale > 0.35) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(10 * scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('⟳ ROLL ⟳', 0, 4 * scale);
    }

    ctx.restore();
  }

  /**
   * 5. Collectible Cyber Coin
   */
  drawCoin(ctx, scale) {
    const radius = 18 * scale;
    const widthFactor = Math.abs(Math.cos(this.coinAngle));

    // Outer Spinning Gold Rim
    ctx.fillStyle = '#ffe600';
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = '#ffe600';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2 * scale;

    ctx.beginPath();
    ctx.ellipse(0, -18 * scale, Math.max(2, radius * widthFactor), radius, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Center Quantum Star
    if (widthFactor > 0.4) {
      ctx.fillStyle = '#ff9900';
      ctx.beginPath();
      ctx.ellipse(0, -18 * scale, radius * 0.45 * widthFactor, radius * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
