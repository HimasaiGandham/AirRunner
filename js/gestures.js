/**
 * AirRunner - Real-Time Hand Gesture Recognition Engine
 * Turns MediaPipe hand landmarks into game actions:
 * - LEFT / RIGHT / JUMP / SLIDE: move the palm out of the neutral box
 * - ROLL: pinch thumb and index fingertips together
 *
 * Each move fires once when the palm leaves the box and re-arms only after the palm
 * comes back inside, so bringing the hand back to center never counts as a second gesture.
 */

import { CONFIG } from './config.js';

export const GestureType = {
  NONE: 'NONE',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  JUMP: 'JUMP',
  SLIDE: 'SLIDE',
  ROLL: 'ROLL'
};

// Where the palm is relative to the neutral box
export const Zone = {
  CENTER: 'CENTER',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  UP: 'UP',
  DOWN: 'DOWN'
};

const GESTURE_FOR_ZONE = {
  [Zone.LEFT]: GestureType.LEFT,
  [Zone.RIGHT]: GestureType.RIGHT,
  [Zone.UP]: GestureType.JUMP,
  [Zone.DOWN]: GestureType.SLIDE
};

export class GestureRecognizer {
  constructor() {
    this.boxScale = 1;
    this.pinchDistance = CONFIG.GESTURES.PINCH_DISTANCE;
    this.cooldownMs = CONFIG.GESTURES.COOLDOWN_MS;
    this.smoothing = CONFIG.GESTURES.SMOOTHING_FACTOR;

    this.currentPinchDistance = 1.0;
    this.lastTriggerTime = -Infinity;
    this.lastGestureDisplayTime = 0;
    this.reset();
  }

  setSensitivity(preset) {
    const p = CONFIG.GESTURES.PRESETS[preset];
    if (p) {
      this.boxScale = p.BOX_SCALE;
      this.pinchDistance = p.PINCH_DISTANCE;
    }
  }

  /**
   * Clears per-hand state once the hand has been out of view for a while. The next hand starts
   * disarmed, so a hand entering the frame from the side doesn't fire a move.
   */
  reset() {
    this.smoothX = null;
    this.smoothY = null;
    this.armed = false;
    this.zone = Zone.CENTER;
    this.prevRawY = null;
    this.prevTime = null;
    this.lastSeenTime = null;
    this.isPinching = false;
    this.lastDetectedGesture = GestureType.NONE;
  }

  /** Neutral box center and half-sizes, in mirrored camera coordinates (0..1), scaled by the sensitivity preset. */
  getBox() {
    const { X_MIN, X_MAX, Y_MIN, Y_MAX } = CONFIG.GESTURES.NEUTRAL_BOX;
    return {
      cx: (X_MIN + X_MAX) / 2,
      cy: (Y_MIN + Y_MAX) / 2,
      halfW: ((X_MAX - X_MIN) / 2) * this.boxScale,
      halfH: ((Y_MAX - Y_MIN) / 2) * this.boxScale
    };
  }

  /**
   * Returns the palm's zone and its reach: distance from the box center in box half-sizes
   * (<= 1 is inside). When outside, the axis with the larger overshoot picks the zone.
   */
  zoneOf(x, y) {
    const { cx, cy, halfW, halfH } = this.getBox();
    const dx = (x - cx) / halfW;
    const dy = (y - cy) / halfH;
    const reach = Math.max(Math.abs(dx), Math.abs(dy));

    if (reach <= 1) return { zone: Zone.CENTER, reach };
    if (Math.abs(dy) >= Math.abs(dx)) return { zone: dy < 0 ? Zone.UP : Zone.DOWN, reach };
    return { zone: dx < 0 ? Zone.LEFT : Zone.RIGHT, reach };
  }

  /**
   * LEFT, RIGHT and JUMP fire as soon as the palm leaves the box. A palm below the box may just be
   * a hand dropping out of view, so SLIDE waits until it stops moving down, and never fires at the bottom edge.
   */
  // ponytail: speed heuristic; a hand lowered very slowly out of view still slides. Tune SLIDE_STOP_SPEED / EDGE_MARGIN on a real webcam.
  confirmExit(zone, rawY, now) {
    if (zone !== Zone.DOWN) return true;
    if (rawY > 1 - CONFIG.GESTURES.EDGE_MARGIN || this.prevTime === null || now <= this.prevTime) return false;
    const downSpeed = (rawY - this.prevRawY) / ((now - this.prevTime) / 1000);
    return downSpeed < CONFIG.GESTURES.SLIDE_STOP_SPEED;
  }

  /**
   * Main recognition function, called once per camera frame.
   * @param {Array|null} landmarks - 21 3D landmarks from MediaPipe HandLandmarker, or null when no hand is visible
   * @param {number} now - frame time in ms (injectable for tests)
   * @returns {Object} Detected gesture and diagnostic telemetry
   */
  processLandmarks(landmarks, now = performance.now()) {
    if (!landmarks || landmarks.length < 21) {
      // A dropped frame or two (motion blur mid-swipe) keeps the hand's state; only a longer loss resets it
      if (this.lastSeenTime === null || now - this.lastSeenTime > CONFIG.GESTURES.LOST_HAND_RESET_MS) this.reset();
      return {
        gesture: GestureType.NONE,
        smoothX: 0.5,
        smoothY: 0.5,
        pinchDistance: 1.0,
        isPinching: false,
        handDetected: false,
        zone: Zone.CENTER,
        armed: false
      };
    }

    this.lastSeenTime = now;

    // Key landmarks: 0 wrist, 4 thumb tip, 5 index knuckle, 8 index tip, 17 pinky knuckle
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexBase = landmarks[5];
    const indexTip = landmarks[8];
    const pinkyBase = landmarks[17];

    // Palm center stays steady while the fingers move. X is mirrored so moving your hand left lowers it.
    const rawX = 1 - (wrist.x + indexBase.x + pinkyBase.x) / 3;
    const rawY = (wrist.y + indexBase.y + pinkyBase.y) / 3;

    // Exponential moving average smooths landmark jitter
    if (this.smoothX === null) {
      this.smoothX = rawX;
      this.smoothY = rawY;
    } else {
      this.smoothX += (rawX - this.smoothX) * this.smoothing;
      this.smoothY += (rawY - this.smoothY) * this.smoothing;
    }

    let gesture = GestureType.NONE;
    const inCooldown = now - this.lastTriggerTime < this.cooldownMs;

    // ROLL: 3D thumb-to-index distance. Fires once as the fingertips close; they must open
    // past 1.35x the pinch distance before it can fire again.
    const dxPinch = thumbTip.x - indexTip.x;
    const dyPinch = thumbTip.y - indexTip.y;
    const dzPinch = (thumbTip.z - indexTip.z) * 1.2;
    this.currentPinchDistance = Math.sqrt(dxPinch * dxPinch + dyPinch * dyPinch + dzPinch * dzPinch);

    if (this.currentPinchDistance < this.pinchDistance) {
      if (!this.isPinching && !inCooldown) {
        gesture = GestureType.ROLL;
        this.isPinching = true;
      }
    } else if (this.currentPinchDistance > this.pinchDistance * 1.35) {
      this.isPinching = false;
    }

    // LEFT / RIGHT / JUMP / SLIDE: fire once on leaving the box, re-arm once well back inside
    const { zone, reach } = this.zoneOf(this.smoothX, this.smoothY);
    this.zone = zone;

    if (!this.armed) {
      // Re-arming inside a smaller box keeps jitter on the box edge from firing repeatedly
      if (reach <= CONFIG.GESTURES.REARM_RATIO) this.armed = true;
    } else if (zone !== Zone.CENTER) {
      if (this.isPinching) {
        // The wrist often drifts while pinching; that isn't a move, so the palm must come back first
        this.armed = false;
      } else if (!inCooldown && this.confirmExit(zone, rawY, now)) {
        gesture = GESTURE_FOR_ZONE[zone];
        this.armed = false;
      }
    }

    this.prevRawY = rawY;
    this.prevTime = now;

    // Keep the last gesture on the HUD briefly so it's readable
    if (gesture !== GestureType.NONE) {
      this.lastTriggerTime = now;
      this.lastDetectedGesture = gesture;
      this.lastGestureDisplayTime = now;
    } else if (now - this.lastGestureDisplayTime > 550) {
      this.lastDetectedGesture = GestureType.NONE;
    }

    return {
      gesture,
      displayGesture: this.lastDetectedGesture,
      smoothX: this.smoothX,
      smoothY: this.smoothY,
      pinchDistance: this.currentPinchDistance,
      isPinching: this.isPinching,
      handDetected: true,
      zone,
      armed: this.armed
    };
  }
}
