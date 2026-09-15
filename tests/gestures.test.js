// Gesture recognition tests. Run with `npm test` (Node.js 20+, nothing to install).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GestureRecognizer } from '../js/gestures.js';

const FRAME_MS = 1000 / 30;

// 21 landmarks with the palm at (x, y) as the player sees it (mirrored). Thumb and index tips are apart unless pinching.
function hand(x, y, pinching = false) {
  const rawX = 1 - x;
  const points = Array.from({ length: 21 }, () => ({ x: rawX, y, z: 0 }));
  const gap = pinching ? 0.01 : 0.1;
  points[4] = { x: rawX - gap, y, z: 0 };
  points[8] = { x: rawX + gap, y, z: 0 };
  return points;
}

const ramp = (from, to, frames) => Array.from({ length: frames }, (_, i) => from + ((to - from) * (i + 1)) / frames);
const hold = (value, frames) => Array(frames).fill(value);
const horizontal = (xs) => xs.map((x) => hand(x, 0.5));
const vertical = (ys) => ys.map((y) => hand(0.5, y));

/** Feeds frames (landmarks, or null for "no hand") at 30fps and returns the gestures that fired. */
function play(frames, recognizer = new GestureRecognizer()) {
  const fired = [];
  frames.forEach((landmarks, i) => {
    const { gesture } = recognizer.processLandmarks(landmarks, 1000 + i * FRAME_MS);
    if (gesture !== 'NONE') fired.push(gesture);
  });
  return fired;
}

test('swiping left and returning to center moves one lane, not back again', () => {
  const frames = horizontal([...hold(0.5, 10), ...ramp(0.5, 0.3, 5), ...hold(0.3, 12), ...ramp(0.3, 0.5, 5), ...hold(0.5, 15)]);
  assert.deepEqual(play(frames), ['LEFT']);
});

test('lifting the hand and lowering it back jumps without sliding', () => {
  const frames = vertical([...hold(0.5, 10), ...ramp(0.5, 0.25, 5), ...hold(0.25, 12), ...ramp(0.25, 0.5, 5), ...hold(0.5, 15)]);
  assert.deepEqual(play(frames), ['JUMP']);
});

test('lowering the hand below the box and pausing slides', () => {
  const frames = vertical([...hold(0.5, 10), ...ramp(0.5, 0.78, 5), ...hold(0.78, 12), ...ramp(0.78, 0.5, 5), ...hold(0.5, 15)]);
  assert.deepEqual(play(frames), ['SLIDE']);
});

test('a hand dropping out of the bottom of the frame does not slide', () => {
  for (const dropFrames of [6, 12]) {
    const frames = [...vertical([...hold(0.5, 10), ...ramp(0.5, 1.0, dropFrames)]), null, null];
    assert.deepEqual(play(frames), [], `drop over ${dropFrames} frames`);
  }
});

test('returning to center re-arms, so two swipes move two lanes', () => {
  const out = [...ramp(0.5, 0.3, 5), ...hold(0.3, 8)];
  const back = [...ramp(0.3, 0.5, 5), ...hold(0.5, 8)];
  assert.deepEqual(play(horizontal([...hold(0.5, 10), ...out, ...back, ...out, ...back])), ['LEFT', 'LEFT']);
});

test('holding the hand outside the box fires only once', () => {
  const frames = horizontal([...hold(0.5, 10), ...ramp(0.5, 0.75, 5), ...hold(0.75, 60)]);
  assert.deepEqual(play(frames), ['RIGHT']);
});

test('wobbling on the edge of the box fires at most once', () => {
  const frames = horizontal([...hold(0.5, 10), ...Array.from({ length: 60 }, (_, i) => (i % 2 ? 0.585 : 0.615))]);
  assert.ok(play(frames).length <= 1);
});

test('a still hand with landmark jitter fires nothing', () => {
  let seed = 7;
  const noise = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647 - 0.5) * 0.03;
  };
  const frames = Array.from({ length: 90 }, () => hand(0.5 + noise(), 0.5 + noise()));
  assert.deepEqual(play(frames), []);
});

test('a hand entering from the side does not fire', () => {
  const frames = [null, ...horizontal([...hold(0.2, 5), ...ramp(0.2, 0.5, 8), ...hold(0.5, 10)])];
  assert.deepEqual(play(frames), []);
});

test('a brief tracking dropout mid-swipe still moves', () => {
  const frames = horizontal([...hold(0.5, 10), ...ramp(0.5, 0.3, 5), ...hold(0.3, 12)]);
  frames[11] = null;
  frames[12] = null;
  assert.deepEqual(play(frames), ['LEFT']);
});

test('a hand lost for longer than the reset time starts over disarmed', () => {
  const frames = [...horizontal(hold(0.5, 10)), ...hold(null, 10), ...horizontal(hold(0.3, 10))];
  assert.deepEqual(play(frames), []);
});

test('drifting out of the box while pinching rolls without also changing lanes', () => {
  const pinchedDrift = [...ramp(0.5, 0.3, 5), ...hold(0.3, 12)].map((x) => hand(x, 0.5, true));
  const releaseOutside = hold(hand(0.3, 0.5), 10);
  const thenRealMove = horizontal([...ramp(0.3, 0.5, 5), ...hold(0.5, 8), ...ramp(0.5, 0.3, 5), ...hold(0.3, 8)]);
  const frames = [...horizontal(hold(0.5, 10)), ...pinchedDrift, ...releaseOutside, ...thenRealMove];
  assert.deepEqual(play(frames), ['ROLL', 'LEFT']);
});

test('pinching rolls once per pinch', () => {
  const open = hand(0.5, 0.5);
  const closed = hand(0.5, 0.5, true);
  const frames = [...hold(open, 5), ...hold(closed, 10), ...hold(open, 10), ...hold(closed, 10)];
  assert.deepEqual(play(frames), ['ROLL', 'ROLL']);
});

test('sensitivity presets scale the box', () => {
  const frames = horizontal([...hold(0.5, 10), ...ramp(0.5, 0.61, 5), ...hold(0.61, 15)]);
  const high = new GestureRecognizer();
  high.setSensitivity('HIGH');
  const low = new GestureRecognizer();
  low.setSensitivity('LOW');

  assert.deepEqual(play(frames, high), ['RIGHT']);
  assert.deepEqual(play(frames, low), []);
});
