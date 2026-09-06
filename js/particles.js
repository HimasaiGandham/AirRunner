/**
 * AirRunner - Particle FX Engine
 * High-performance, object-pooled canvas particle system for jump bursts,
 * slide sparks, roll energy rings, coin sparkles, collision explosions,
 * and 3D warp speed lines.
 */

class Particle {
  constructor() {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.size = 3;
    this.color = '#00f0ff';
    this.alpha = 1.0;
    this.decay = 0.03;
    this.type = 'spark'; // 'spark', 'ring', 'glow', 'speedline'
    this.rotation = 0;
    this.vRot = 0;
  }

  init(x, y, z, vx, vy, vz, size, color, decay, type = 'spark') {
    this.active = true;
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = vx;
    this.vy = vy;
    this.vz = vz;
    this.size = size;
    this.color = color;
    this.alpha = 1.0;
    this.decay = decay;
    this.type = type;
    this.rotation = Math.random() * Math.PI * 2;
    this.vRot = (Math.random() - 0.5) * 0.2;
  }

  update() {
    if (!this.active) return false;

    this.x += this.vx;
    this.y += this.vy;
    this.z += this.vz;
    this.rotation += this.vRot;
    this.alpha -= this.decay;

    if (this.type === 'spark') {
      this.vy += 0.25; // gravity
      this.size *= 0.96;
    } else if (this.type === 'ring') {
      this.size += 2.8; // expanding ring
    }

    if (this.alpha <= 0.02 || this.size <= 0.5) {
      this.active = false;
      return false;
    }
    return true;
  }

  draw(ctx) {
    if (!this.active || this.alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, this.alpha));

    if (this.type === 'spark') {
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'ring') {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.size, this.size * 0.45, this.rotation, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.type === 'glow') {
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

class ParticleManager {
  constructor(poolSize = 400) {
    this.pool = Array.from({ length: poolSize }, () => new Particle());
    this.speedLines = [];
    this.initSpeedLines(40);
  }

  getFreeParticle() {
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) return this.pool[i];
    }
    return null;
  }

  initSpeedLines(count) {
    this.speedLines = [];
    for (let i = 0; i < count; i++) {
      this.speedLines.push({
        x: (Math.random() - 0.5) * 1200,
        y: (Math.random() - 0.5) * 600,
        z: Math.random() * 1500,
        length: 80 + Math.random() * 120,
        speed: 25 + Math.random() * 15
      });
    }
  }

  spawnJump(x, y) {
    for (let i = 0; i < 18; i++) {
      const p = this.getFreeParticle();
      if (!p) break;
      const angle = (Math.random() * Math.PI) + Math.PI; // downward burst
      const speed = 2 + Math.random() * 6;
      p.init(
        x + (Math.random() - 0.5) * 30,
        y,
        0,
        Math.cos(angle) * speed * 0.7,
        -Math.sin(angle) * speed,
        0,
        3.5 + Math.random() * 2.5,
        Math.random() > 0.4 ? '#00f0ff' : '#00ffff',
        0.035 + Math.random() * 0.02,
        'spark'
      );
    }
  }

  spawnSlide(x, y) {
    for (let i = 0; i < 7; i++) {
      const p = this.getFreeParticle();
      if (!p) break;
      const vx = (Math.random() - 0.5) * 9;
      const vy = -(1 + Math.random() * 3.5);
      p.init(
        x + (Math.random() - 0.5) * 40,
        y + 10,
        0,
        vx,
        vy,
        0,
        2.5 + Math.random() * 2,
        Math.random() > 0.3 ? '#ffaa00' : '#ff3366',
        0.05 + Math.random() * 0.03,
        'spark'
      );
    }
  }

  spawnRoll(x, y) {
    const ring = this.getFreeParticle();
    if (ring) {
      ring.init(x, y, 0, 0, 0, 0, 15, '#00ff88', 0.045, 'ring');
    }

    for (let i = 0; i < 8; i++) {
      const p = this.getFreeParticle();
      if (!p) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 4;
      p.init(
        x,
        y,
        0,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        0,
        3.5,
        '#00ffcc',
        0.04,
        'spark'
      );
    }
  }

  spawnCoin(x, y) {
    for (let i = 0; i < 24; i++) {
      const p = this.getFreeParticle();
      if (!p) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 6.5;
      p.init(
        x,
        y,
        0,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed - 1.5,
        0,
        4.0 + Math.random() * 2.5,
        Math.random() > 0.3 ? '#ffe600' : '#ffffff',
        0.03 + Math.random() * 0.02,
        'spark'
      );
    }
  }

  spawnCollision(x, y) {
    // Large shockwave
    const ring1 = this.getFreeParticle();
    if (ring1) ring1.init(x, y, 0, 0, 0, 0, 20, '#ff0055', 0.03, 'ring');

    const ring2 = this.getFreeParticle();
    if (ring2) ring2.init(x, y, 0, 0, 0, 0, 10, '#00f0ff', 0.04, 'ring');

    // Massive spark burst
    for (let i = 0; i < 45; i++) {
      const p = this.getFreeParticle();
      if (!p) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 11;
      p.init(
        x,
        y,
        0,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed - 2,
        0,
        4.5 + Math.random() * 3,
        Math.random() > 0.5 ? '#ff0055' : (Math.random() > 0.5 ? '#ffaa00' : '#ffffff'),
        0.025 + Math.random() * 0.025,
        'spark'
      );
    }
  }

  updateAndDraw(ctx, width, height, currentSpeed, horizonY) {
    // 1. Draw 3D Speed Warp Lines
    ctx.save();
    ctx.strokeStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 6;
    const centerX = width / 2;

    for (let i = 0; i < this.speedLines.length; i++) {
      const line = this.speedLines[i];
      line.z -= (line.speed + currentSpeed * 0.8);

      if (line.z <= 20) {
        line.z = 1400;
        line.x = (Math.random() - 0.5) * 1400;
        line.y = (Math.random() - 0.5) * 800;
      }

      const scale1 = 280 / (line.z + 280);
      const scale2 = 280 / (line.z + line.length + 280);

      const sx1 = centerX + line.x * scale1;
      const sy1 = horizonY + line.y * scale1;
      const sx2 = centerX + line.x * scale2;
      const sy2 = horizonY + line.y * scale2;

      const alpha = Math.min(0.7, (1 - line.z / 1400) * (currentSpeed / 20));
      if (alpha > 0.05) {
        ctx.globalAlpha = alpha;
        ctx.lineWidth = Math.max(1, 2.5 * scale1);
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();
      }
    }
    ctx.restore();

    // 2. Update and Draw active 2D/pseudo-3D particles
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (p.active) {
        p.update();
        p.draw(ctx);
      }
    }
  }

  clear() {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].active = false;
    }
  }
}

export const particles = new ParticleManager();
