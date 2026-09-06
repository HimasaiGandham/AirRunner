/**
 * AirRunner - Real-Time Hand Gesture Recognition Engine
 * Processes MediaPipe hand landmarks to reliably recognize:
 * - LEFT (Move Left Lane)
 * - RIGHT (Move Right Lane)
 * - JUMP (Upward Hand Swipe / Lift)
 * - SLIDE (Downward Hand Swipe / Drop)
 * - ROLL (Thumb + Index Pinch Trigger)
 * 
 * Includes Exponential Moving Average (EMA) smoothing, edge-triggered debounce,
 * velocity tracking, and configurable cooldown windows.
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

export class GestureRecognizer {
  constructor() {
    this.thresholdX = CONFIG.GESTURES.THRESHOLD_X;
    this.thresholdY = CONFIG.GESTURES.THRESHOLD_Y;
    this.pinchDistance = CONFIG.GESTURES.PINCH_DISTANCE;
    this.cooldownMs = CONFIG.GESTURES.COOLDOWN_MS;
    this.smoothing = CONFIG.GESTURES.SMOOTHING_FACTOR;

    // Position history for smoothing and delta calculation
    this.smoothX = null;
    this.smoothY = null;
    this.anchorX = null;
    this.anchorY = null;

    // Velocity buffer (last 5 frames)
    this.historyBuffer = [];
    this.maxHistory = 5;

    // Pinch state for edge-trigger detection
    this.isPinching = false;
    this.currentPinchDistance = 1.0;

    // Cooldown timer
    this.lastTriggerTime = 0;
    this.lastDetectedGesture = GestureType.NONE;
    this.lastGestureDisplayTime = 0;
  }

  setSensitivity(preset) {
    if (CONFIG.GESTURES.PRESETS[preset]) {
      const p = CONFIG.GESTURES.PRESETS[preset];
      this.thresholdX = p.THRESHOLD_X;
      this.thresholdY = p.THRESHOLD_Y;
      this.pinchDistance = p.PINCH_DISTANCE;
    }
  }

  reset() {
    this.smoothX = null;
    this.smoothY = null;
    this.anchorX = null;
    this.anchorY = null;
    this.historyBuffer = [];
    this.isPinching = false;
    this.lastDetectedGesture = GestureType.NONE;
  }

  /**
   * Main recognition function called each video frame with MediaPipe landmarks.
   * @param {Array} landmarks - 21 3D landmarks from MediaPipe HandLandmarker
   * @returns {Object} Detected gesture and diagnostic telemetry
   */
  processLandmarks(landmarks) {
    const now = performance.now();

    if (!landmarks || landmarks.length < 21) {
      this.reset();
      return {
        gesture: GestureType.NONE,
        smoothX: 0.5,
        smoothY: 0.5,
        pinchDistance: 1.0,
        isPinching: false,
        handDetected: false
      };
    }

    // 1. Key Landmark References
    // Landmark 0: Wrist
    // Landmark 4: Thumb Tip
    // Landmark 8: Index Finger Tip
    // Landmark 5: Index MCP (Knuckle)
    // Landmark 17: Pinky MCP (Knuckle)
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const indexBase = landmarks[5];
    const pinkyBase = landmarks[17];

    // Compute Palm Center for stable positional tracking
    const rawPalmX = (wrist.x + indexBase.x + pinkyBase.x) / 3;
    const rawPalmY = (wrist.y + indexBase.y + pinkyBase.y) / 3;

    // Mirror horizontal coordinate so moving physical hand LEFT yields lower X
    const mirroredX = 1.0 - rawPalmX;
    const mirroredY = rawPalmY;

    // 2. Exponential Moving Average (EMA) Smoothing
    if (this.smoothX === null || this.smoothY === null) {
      this.smoothX = mirroredX;
      this.smoothY = mirroredY;
      this.anchorX = mirroredX;
      this.anchorY = mirroredY;
    } else {
      this.smoothX = this.smoothX * (1 - this.smoothing) + mirroredX * this.smoothing;
      this.smoothY = this.smoothY * (1 - this.smoothing) + mirroredY * this.smoothing;
    }

    // Update historical velocity window
    this.historyBuffer.push({ x: this.smoothX, y: this.smoothY, t: now });
    if (this.historyBuffer.length > this.maxHistory) {
      this.historyBuffer.shift();
    }

    // 3. Pinch Detection for ROLL Gesture
    // 3D Euclidean distance between Thumb Tip (4) and Index Finger Tip (8)
    const dxPinch = thumbTip.x - indexTip.x;
    const dyPinch = thumbTip.y - indexTip.y;
    const dzPinch = (thumbTip.z - indexTip.z) * 1.2;
    this.currentPinchDistance = Math.sqrt(dxPinch * dxPinch + dyPinch * dyPinch + dzPinch * dzPinch);

    let detectedGesture = GestureType.NONE;
    const inCooldown = (now - this.lastTriggerTime) < this.cooldownMs;

    // Edge-triggered Pinch (Roll)
    if (this.currentPinchDistance < this.pinchDistance) {
      if (!this.isPinching && !inCooldown) {
        // Falling edge: Pinch just initiated!
        detectedGesture = GestureType.ROLL;
        this.isPinching = true;
        this.lastTriggerTime = now;
        this.anchorX = this.smoothX;
        this.anchorY = this.smoothY;
      }
    } else if (this.currentPinchDistance > this.pinchDistance * 1.35) {
      // Hysteresis threshold to reset pinch state
      this.isPinching = false;
    }

    // 4. Directional Gestures (LEFT, RIGHT, JUMP, SLIDE)
    if (detectedGesture === GestureType.NONE && !inCooldown) {
      // Calculate velocity vector over history buffer
      if (this.historyBuffer.length >= 3) {
        const oldest = this.historyBuffer[0];
        const latest = this.historyBuffer[this.historyBuffer.length - 1];
        const deltaX = latest.x - oldest.x;
        const deltaY = latest.y - oldest.y;

        // Also check displacement from anchor baseline
        const anchorDeltaX = this.smoothX - this.anchorX;
        const anchorDeltaY = this.smoothY - this.anchorY;

        // Vertical movement takes priority if prominent
        if (Math.abs(deltaY) > Math.abs(deltaX) * 1.15 || Math.abs(anchorDeltaY) > Math.abs(anchorDeltaX) * 1.15) {
          // Upward swipe / lift (JUMP)
          if (deltaY < -this.thresholdY || anchorDeltaY < -this.thresholdY * 1.2) {
            detectedGesture = GestureType.JUMP;
            this.lastTriggerTime = now;
            this.anchorY = this.smoothY;
            this.historyBuffer = [];
          }
          // Downward swipe / drop (SLIDE)
          else if (deltaY > this.thresholdY || anchorDeltaY > this.thresholdY * 1.2) {
            detectedGesture = GestureType.SLIDE;
            this.lastTriggerTime = now;
            this.anchorY = this.smoothY;
            this.historyBuffer = [];
          }
        }

        // Horizontal movement (LEFT / RIGHT)
        if (detectedGesture === GestureType.NONE) {
          // Leftward swipe (LEFT)
          if (deltaX < -this.thresholdX || anchorDeltaX < -this.thresholdX * 1.1) {
            detectedGesture = GestureType.LEFT;
            this.lastTriggerTime = now;
            this.anchorX = this.smoothX;
            this.historyBuffer = [];
          }
          // Rightward swipe (RIGHT)
          else if (deltaX > this.thresholdX || anchorDeltaX > this.thresholdX * 1.1) {
            detectedGesture = GestureType.RIGHT;
            this.lastTriggerTime = now;
            this.anchorX = this.smoothX;
            this.historyBuffer = [];
          }
        }
      }
    }

    // Slowly relax anchor toward smoothed position to accommodate natural postural shift
    this.anchorX = this.anchorX * 0.96 + this.smoothX * 0.04;
    this.anchorY = this.anchorY * 0.96 + this.smoothY * 0.04;

    // Display persistence for UI HUD
    if (detectedGesture !== GestureType.NONE) {
      this.lastDetectedGesture = detectedGesture;
      this.lastGestureDisplayTime = now;
    } else if (now - this.lastGestureDisplayTime > 550) {
      this.lastDetectedGesture = GestureType.NONE;
    }

    return {
      gesture: detectedGesture,
      displayGesture: this.lastDetectedGesture,
      smoothX: this.smoothX,
      smoothY: this.smoothY,
      pinchDistance: this.currentPinchDistance,
      isPinching: this.isPinching,
      handDetected: true
    };
  }
}
