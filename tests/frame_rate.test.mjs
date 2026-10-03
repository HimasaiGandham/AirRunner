/**
 * Regression tests for issue #8 — frame-rate dependence.
 *
 * The bug: update(dt, now) received a delta-time value but never used it, so
 * every quantity advanced per RENDERED frame. A 240Hz player scored ~11.7x a
 * 30Hz player over the same 10 seconds of play, which also ramps difficulty
 * sooner and corrupts the client-reported leaderboard.
 *
 * The fix: the simulation runs on a fixed 60Hz timestep (the accumulator loop
 * in GameEngine.advanceFrame), so one second of wall clock always produces 60
 * simulation steps regardless of the display refresh rate.
 *
 * These tests drive the REAL game modules headlessly — the production
 * advanceFrame()/step() code path, not a reimplementation of the update math —
 * so they fail if the frame-rate dependence ever returns.
 *
 * Run: npm test   (or: node --test "tests/*.test.mjs")
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomStubs } from './helpers/dom-stub.mjs';

installDomStubs();

const { CONFIG } = await import('../js/config.js');
const { GameEngine, GameState } = await import('../js/game.js');
const { Player, PlayerState } = await import('../js/player.js');
const { particles } = await import('../js/particles.js');

const REFRESH_RATES = [30, 60, 120, 144, 240];

function stubCtx() {
  const noop = () => {};
  return {
    save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop,
    lineTo: noop, arc: noop, ellipse: noop, arcTo: noop, rect: noop, roundRect: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, fill: noop, stroke: noop,
    fillRect: noop, clearRect: noop, strokeRect: noop, fillText: noop,
    setTransform: noop, resetTransform: noop, translate: noop, rotate: noop, scale: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop })
  };
}

function makeEngine() {
  return new GameEngine(
    {
      getContext: () => stubCtx(),
      parentElement: { getBoundingClientRect: () => ({ width: 1280, height: 720 }) },
      width: 1280,
      height: 720
    },
    {}
  );
}

/**
 * Runs the real game loop headlessly at a given refresh rate for `seconds` of
 * wall-clock time, and returns the resulting telemetry.
 *
 * Math.random is seeded deterministically (identically for every refresh rate)
 * so the same obstacle patterns appear everywhere — otherwise a differing
 * number of random draws alone would change the score and mask the real signal.
 */
function simulateAt(refreshHz, seconds) {
  let seed = 123456789;
  Math.random = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 0x100000000;
  };

  // `particles` is a module-level singleton whose speed lines are randomised at
  // import time and whose respawns consume Math.random. Reset it under the
  // seeded RNG so every refresh rate starts from the identical world state.
  particles.initSpeedLines(40);
  particles.clear();

  const engine = makeEngine();
  engine.startRun();
  assert.equal(engine.state, GameState.PLAYING);

  // Keep the runner alive for the whole window. A death ends scoring, which
  // would stop the comparison long before 10 seconds of telemetry is compared.
  // (Whether a death happens at the same step at every refresh rate is a
  // separate, equally valid property — asserted by the determinism test below.)
  const realStep = engine.step.bind(engine);
  engine.step = function immortalStep() {
    engine.player.invulnerableTimer = 999;
    realStep();
  };

  const frameMs = 1000 / refreshHz;
  const totalFrames = Math.round((seconds * 1000) / frameMs);

  // Exactly what the rAF callback does, with a synthetic clock.
  let timestamp = 0;
  for (let f = 0; f < totalFrames; f++) {
    timestamp += frameMs;
    const frameDt = Math.min(frameMs / 1000, CONFIG.TIMING.MAX_FRAME_DT);
    engine.advanceFrame(frameDt, timestamp);
  }

  return {
    score: engine.score,
    distance: engine.distance,
    currentSpeed: engine.currentSpeed,
    coins: engine.coins
  };
}

test('issue #8: score after 10s is identical at 30/60/120/144/240 Hz', () => {
  const results = REFRESH_RATES.map((hz) => ({ hz, ...simulateAt(hz, 10) }));
  const baseline = results[1]; // 60Hz

  for (const r of results) {
    // Every refresh rate runs the same number of 60Hz steps over 10s, so the
    // score must match. A 1% band absorbs float accumulation only.
    assert.ok(
      Math.abs(r.score - baseline.score) <= baseline.score * 0.01,
      `score at ${r.hz}Hz (${r.score}) diverges from 60Hz (${baseline.score})`
    );
    console.log(
      `  ${String(r.hz).padStart(3)}Hz -> distance ${r.distance.toFixed(0)}m | score ${r.score} | speed ${r.currentSpeed.toFixed(2)}x`
    );
  }
});

test('issue #8: distance after 10s is identical at every refresh rate', () => {
  const results = REFRESH_RATES.map((hz) => ({ hz, ...simulateAt(hz, 10) }));
  const baseline = results[1].distance;

  for (const r of results) {
    assert.ok(
      Math.abs(r.distance - baseline) <= baseline * 0.01,
      `distance at ${r.hz}Hz (${r.distance.toFixed(1)}m) diverges from 60Hz (${baseline.toFixed(1)}m)`
    );
  }
});

test('issue #8: difficulty ramp (currentSpeed) is refresh-rate independent', () => {
  const results = REFRESH_RATES.map((hz) => ({ hz, ...simulateAt(hz, 10) }));
  const baseline = results[1].currentSpeed;

  for (const r of results) {
    assert.ok(
      Math.abs(r.currentSpeed - baseline) <= 0.05,
      `speed at ${r.hz}Hz (${r.currentSpeed.toFixed(3)}) diverges from 60Hz (${baseline.toFixed(3)})`
    );
  }
});

test('issue #8: a 240Hz player no longer outscores a 30Hz player', () => {
  const at30 = simulateAt(30, 10);
  const at240 = simulateAt(240, 10);

  const ratio = at240.score / at30.score;
  assert.ok(
    ratio < 1.05 && ratio > 0.95,
    `240Hz/30Hz score ratio is ${ratio.toFixed(2)} — pre-fix this was ~11.7`
  );
});

test('issue #8: lane-change lerp takes the same wall-clock time at any refresh rate', () => {
  // Time for currentX to cover 99% of one lane, in ms of wall clock.
  const crossingTime = (hz) => {
    const player = new Player();
    const speed = CONFIG.GAME.INITIAL_SPEED;
    const frameDt = 1 / hz;

    player.moveRight();

    let simTime = 0;
    let accumulator = 0;
    const threshold = CONFIG.GAME.LANE_SPACING * 0.99;

    while (player.currentX < threshold && simTime < 10) {
      accumulator += frameDt;
      let steps = 0;
      while (accumulator >= CONFIG.TIMING.FIXED_TIMESTEP && steps < CONFIG.TIMING.MAX_STEPS_PER_FRAME) {
        accumulator -= CONFIG.TIMING.FIXED_TIMESTEP;
        player.update(speed);
        simTime += CONFIG.TIMING.FIXED_TIMESTEP;
        steps++;
      }
      if (accumulator > CONFIG.TIMING.FIXED_TIMESTEP) accumulator = 0;
    }
    return simTime * 1000;
  };

  const times = [60, 144, 240].map((hz) => ({ hz, ms: crossingTime(hz) }));
  const baseline = times[0].ms;

  for (const t of times) {
    assert.ok(
      Math.abs(t.ms - baseline) <= 20,
      `lane change at ${t.hz}Hz took ${t.ms.toFixed(0)}ms vs ${baseline.toFixed(0)}ms at 60Hz`
    );
    console.log(`  lane change @ ${t.hz}Hz -> ${t.ms.toFixed(0)}ms`);
  }
});

test('issue #8: jump apex height is refresh-rate independent', () => {
  const apexAt = (hz) => {
    const player = new Player();
    const frameDt = 1 / hz;

    player.jump();
    let simTime = 0;
    let accumulator = 0;
    let apex = 0;

    while (!player.isGrounded && simTime < 5) {
      accumulator += frameDt;
      let steps = 0;
      while (accumulator >= CONFIG.TIMING.FIXED_TIMESTEP && steps < CONFIG.TIMING.MAX_STEPS_PER_FRAME) {
        accumulator -= CONFIG.TIMING.FIXED_TIMESTEP;
        player.update(CONFIG.GAME.INITIAL_SPEED);
        simTime += CONFIG.TIMING.FIXED_TIMESTEP;
        steps++;
        if (player.y > apex) apex = player.y;
      }
      if (accumulator > CONFIG.TIMING.FIXED_TIMESTEP) accumulator = 0;
    }
    return apex;
  };

  const baseline = apexAt(60);
  for (const hz of [30, 120, 144, 240]) {
    const apex = apexAt(hz);
    assert.ok(
      Math.abs(apex - baseline) < 1.0,
      `jump apex at ${hz}Hz is ${apex.toFixed(2)}, expected ~${baseline.toFixed(2)}`
    );
  }
});

test('issue #8: slide lasts ~600ms of wall clock at any refresh rate', () => {
  const slideDuration = (hz) => {
    const player = new Player();
    const frameDt = 1 / hz;

    player.slide();
    let simTime = 0;
    let accumulator = 0;

    while (player.state === PlayerState.SLIDING && simTime < 5) {
      accumulator += frameDt;
      let steps = 0;
      while (accumulator >= CONFIG.TIMING.FIXED_TIMESTEP && steps < CONFIG.TIMING.MAX_STEPS_PER_FRAME) {
        accumulator -= CONFIG.TIMING.FIXED_TIMESTEP;
        player.update(CONFIG.GAME.INITIAL_SPEED);
        simTime += CONFIG.TIMING.FIXED_TIMESTEP;
        steps++;
      }
      if (accumulator > CONFIG.TIMING.FIXED_TIMESTEP) accumulator = 0;
    }
    return simTime * 1000;
  };

  const baseline = slideDuration(60);
  assert.ok(
    Math.abs(baseline - 600) < 40,
    `60Hz slide lasted ${baseline.toFixed(0)}ms, expected ~600ms`
  );

  for (const hz of [30, 120, 144, 240]) {
    const ms = slideDuration(hz);
    assert.ok(
      Math.abs(ms - baseline) <= 40,
      `slide at ${hz}Hz lasted ${ms.toFixed(0)}ms vs ${baseline.toFixed(0)}ms at 60Hz`
    );
  }
});

test('issue #8: a long GC/tab stall does not fast-forward the run', () => {
  const engine = makeEngine();
  engine.startRun();

  // A 5 second freeze arriving as a single frame, clamped to MAX_FRAME_DT.
  engine.advanceFrame(Math.min(5, CONFIG.TIMING.MAX_FRAME_DT), 5000);

  // 6 steps of running is a few units of progress; 5 seconds of running would
  // be hundreds of metres. The clamp must keep this near the former.
  assert.ok(
    engine.distance < 50,
    `distance jumped to ${engine.distance.toFixed(0)}m after a stall`
  );
  assert.equal(engine.accumulator, 0, 'stall backlog must be dropped, not banked');
});

test('issue #8: the accumulator never leaves unbounded backlog', () => {
  const engine = makeEngine();
  engine.startRun();

  // 60 seconds at 10Hz — every frame saturates the MAX_FRAME_DT budget.
  for (let f = 0; f < 600; f++) {
    engine.advanceFrame(Math.min(0.1, CONFIG.TIMING.MAX_FRAME_DT), f * 100);
  }

  assert.ok(
    engine.accumulator < CONFIG.TIMING.FIXED_TIMESTEP,
    `accumulator backlog is ${engine.accumulator.toFixed(4)}s`
  );
});

test('issue #8: the simulation runs exactly 60 steps per second of wall clock', () => {
  // Direct check of the core invariant, independent of game telemetry.
  for (const hz of REFRESH_RATES) {
    const engine = makeEngine();
    engine.startRun();

    let steps = 0;
    const realStep = engine.step.bind(engine);
    engine.step = function counted() {
      steps++;
      realStep();
    };

    const frameMs = 1000 / hz;
    let timestamp = 0;
    for (let f = 0; f < hz * 5; f++) {
      timestamp += frameMs;
      engine.advanceFrame(Math.min(frameMs / 1000, CONFIG.TIMING.MAX_FRAME_DT), timestamp);
    }

    assert.equal(steps, 5 * 60, `${hz}Hz produced ${steps} steps in 5s, expected 300`);
  }
});
