/**
 * AirRunner - MediaPipe Hand Tracking Lifecycle & Video Manager
 * Connects webcam stream with MediaPipe HandLandmarker, renders real-time
 * hand skeletons with neon overlay, and feeds landmarks to the GestureRecognizer.
 */

import { CONFIG } from './config.js';
import { GestureRecognizer, GestureType } from './gestures.js';

// MediaPipe 21 Hand Bone Connections
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [5, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [9, 13], [13, 14], [14, 15], [15, 16],// Ring
  [13, 17], [17, 18], [18, 19], [19, 20],// Pinky
  [0, 17]                               // Palm Base
];

export class HandTracker {
  constructor(videoElement, canvasElement) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');

    this.recognizer = new GestureRecognizer();
    this.handLandmarker = null;
    this.stream = null;

    this.isTracking = false;
    this.isModelLoaded = false;
    this.lastVideoTime = -1;
    this.animationFrameId = null;

    // Callbacks
    this.onGesture = null;
    this.onHandStatus = null;
    this.onTelemetry = null;
    this.onError = null;
  }

  /**
   * Initializes MediaPipe HandLandmarker with fallback mechanisms
   */
  async loadModel() {
    if (this.isModelLoaded) return true;

    try {
      // Dynamic import of MediaPipe Tasks Vision
      const visionModule = await import(CONFIG.MEDIAPIPE.TASKS_VISION_CDN);
      const { FilesetResolver, HandLandmarker } = visionModule;

      const vision = await FilesetResolver.forVisionTasks(CONFIG.MEDIAPIPE.WASM_PATH);

      // Attempt 1: Remote model with GPU delegate
      try {
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: CONFIG.MEDIAPIPE.MODEL_REMOTE_URL,
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.55,
          minTrackingConfidence: 0.55
        });
      } catch (gpuErr) {
        console.warn("GPU delegate failed, attempting CPU delegate or local model...", gpuErr);
        // Attempt 2: Fallback to local model with CPU delegate
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: CONFIG.MEDIAPIPE.MODEL_LOCAL_PATH,
            delegate: 'CPU'
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
      }

      this.isModelLoaded = true;
      return true;
    } catch (err) {
      console.error("Failed to load MediaPipe HandLandmarker:", err);
      if (this.onError) {
        this.onError(`MediaPipe Init Error: ${err.message || err}`);
      }
      return false;
    }
  }

  /**
   * Requests webcam access and begins video stream
   */
  async startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = "Webcam API not supported in this browser. Please use Chrome, Edge, or Firefox.";
      if (this.onError) this.onError(msg);
      throw new Error(msg);
    }

    try {
      // Preferred constraints: 640x480 for ultra-fast processing
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
          frameRate: { ideal: 30 }
        },
        audio: false
      });
    } catch (idealErr) {
      console.warn("Ideal video constraints failed, trying basic stream...", idealErr);
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (fallbackErr) {
        let msg = "Could not access webcam.";
        if (fallbackErr.name === 'NotAllowedError' || fallbackErr.name === 'PermissionDeniedError') {
          msg = "Webcam access was denied. Please allow camera permissions in your browser address bar.";
        } else if (fallbackErr.name === 'NotFoundError' || fallbackErr.name === 'DevicesNotFoundError') {
          msg = "No webcam device detected on your system.";
        }
        if (this.onError) this.onError(msg);
        throw fallbackErr;
      }
    }

    this.video.srcObject = this.stream;
    
    return new Promise((resolve) => {
      this.video.onloadedmetadata = async () => {
        await this.video.play();
        this.isTracking = true;
        this.startDetectionLoop();
        resolve(true);
      };
    });
  }

  /**
   * Main Frame Processing Loop
   */
  startDetectionLoop() {
    const processFrame = (timestamp) => {
      if (!this.isTracking) return;

      if (this.canvas.width !== this.video.videoWidth || this.canvas.height !== this.video.videoHeight) {
        this.canvas.width = this.video.videoWidth || 640;
        this.canvas.height = this.video.videoHeight || 480;
      }

      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      if (this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime && this.handLandmarker) {
        this.lastVideoTime = this.video.currentTime;

        try {
          const results = this.handLandmarker.detectForVideo(this.video, performance.now());
          
          if (results.landmarks && results.landmarks.length > 0) {
            const landmarks = results.landmarks[0]; // Primary hand
            const telemetry = this.recognizer.processLandmarks(landmarks);

            // Draw futuristic skeleton overlay
            this.drawSkeleton(landmarks, telemetry);

            if (this.onHandStatus) this.onHandStatus(true, results.landmarks.length > 1);
            if (this.onTelemetry) this.onTelemetry(telemetry);

            if (telemetry.gesture !== GestureType.NONE && this.onGesture) {
              this.onGesture(telemetry.gesture);
            }
          } else {
            const telemetry = this.recognizer.processLandmarks(null);
            if (this.onHandStatus) this.onHandStatus(false, false);
            if (this.onTelemetry) this.onTelemetry(telemetry);
          }
        } catch (detectionErr) {
          console.warn("Detection frame error:", detectionErr);
        }
      }

      this.animationFrameId = requestAnimationFrame(processFrame);
    };

    this.animationFrameId = requestAnimationFrame(processFrame);
  }

  /**
   * Renders high-visibility cyber skeleton on top of the webcam feed
   */
  drawSkeleton(landmarks, telemetry) {
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.ctx.save();
    // Video is mirrored via CSS scaleX(-1), so we mirror the canvas coordinate space
    this.ctx.translate(w, 0);
    this.ctx.scale(-1, 1);

    // 1. Draw Bone Connections
    this.ctx.strokeStyle = telemetry.isPinching ? '#00ff88' : '#00f0ff';
    this.ctx.lineWidth = 3.5;
    this.ctx.shadowColor = telemetry.isPinching ? '#00ff88' : '#00f0ff';
    this.ctx.shadowBlur = 8;

    for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
      const p1 = landmarks[startIdx];
      const p2 = landmarks[endIdx];
      this.ctx.beginPath();
      this.ctx.moveTo(p1.x * w, p1.y * h);
      this.ctx.lineTo(p2.x * w, p2.y * h);
      this.ctx.stroke();
    }

    // 2. Draw Landmark Joints
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      const x = lm.x * w;
      const y = lm.y * h;

      // Special highlight for thumb tip (4) and index tip (8)
      if (i === 4 || i === 8) {
        this.ctx.fillStyle = telemetry.isPinching ? '#00ff88' : '#ffe600';
        this.ctx.shadowColor = telemetry.isPinching ? '#00ff88' : '#ffe600';
        this.ctx.shadowBlur = 14;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 7, 0, Math.PI * 2);
        this.ctx.fill();
      } else {
        this.ctx.fillStyle = '#ff0055';
        this.ctx.shadowColor = '#ff0055';
        this.ctx.shadowBlur = 6;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 4, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    // 3. Pinch line connecting thumb and index
    const thumb = landmarks[4];
    const index = landmarks[8];
    this.ctx.strokeStyle = telemetry.isPinching ? '#00ff88' : 'rgba(255, 230, 0, 0.4)';
    this.ctx.lineWidth = telemetry.isPinching ? 4 : 1.5;
    this.ctx.beginPath();
    this.ctx.moveTo(thumb.x * w, thumb.y * h);
    this.ctx.lineTo(index.x * w, index.y * h);
    this.ctx.stroke();

    this.ctx.restore();
  }

  stop() {
    this.isTracking = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
