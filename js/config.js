/**
 * AirRunner - Central Configuration & Constants
 * Defines thresholds for gesture recognition, game physics, obstacle generation,
 * audio settings, and local storage keys.
 */

export const CONFIG = {
  // Gesture Recognition Calibration
  GESTURES: {
    // Horizontal movement threshold (fraction of normalized video width)
    THRESHOLD_X: 0.065,
    
    // Vertical movement threshold for jump (up) and slide (down)
    THRESHOLD_Y: 0.075,
    
    // 3D Euclidean distance between thumb tip and index finger tip for Pinch (Roll)
    PINCH_DISTANCE: 0.070,
    
    // Minimum cooldown (ms) between gesture activations to prevent erratic double-triggering
    COOLDOWN_MS: 240,
    
    // Exponential Moving Average smoothing factor (0 = frozen, 1 = raw instant input)
    SMOOTHING_FACTOR: 0.38,

    // Neutral zone boundaries (fraction of normalized camera dimensions)
    NEUTRAL_BOX: {
      X_MIN: 0.35,
      X_MAX: 0.65,
      Y_MIN: 0.35,
      Y_MAX: 0.65
    },

    // Sensitivity presets
    PRESETS: {
      LOW: { THRESHOLD_X: 0.090, THRESHOLD_Y: 0.095, PINCH_DISTANCE: 0.055 },
      NORMAL: { THRESHOLD_X: 0.065, THRESHOLD_Y: 0.075, PINCH_DISTANCE: 0.070 },
      HIGH: { THRESHOLD_X: 0.045, THRESHOLD_Y: 0.055, PINCH_DISTANCE: 0.080 }
    }
  },

  // Game Engine & World Physics
  GAME: {
    VIRTUAL_WIDTH: 1280,
    VIRTUAL_HEIGHT: 720,
    
    // Three lanes: LEFT (-1), CENTER (0), RIGHT (+1)
    LANES: [-1, 0, 1],
    LANE_SPACING: 260, // World units between lane centers
    LANE_CHANGE_LERP: 0.18, // Speed of smooth lane-switching interpolation
    
    // Speed progression
    INITIAL_SPEED: 12.0,
    MAX_SPEED: 32.0,
    SPEED_ACCELERATION: 0.0035, // Added to speed per meter ran
    
    // Player physics
    GRAVITY: 0.82,
    JUMP_VELOCITY: 16.5,
    SLIDE_DURATION_FRAMES: 36, // ~600ms at 60fps
    ROLL_DURATION_FRAMES: 32,  // ~530ms at 60fps
    
    // 3D Perspective Projection
    PERSPECTIVE: {
      HORIZON_Y_RATIO: 0.36, // Vanishing point height (36% from top)
      FOCAL_LENGTH: 320,     // Projection scale
      CAMERA_HEIGHT: 180,    // Camera elevation above track
      SPAWN_Z: 1400,         // Z depth where obstacles and coins spawn
      PLAYER_Z: 90,          // Z position of player character
      DESPAWN_Z: -50         // Obstacle passes behind camera
    },

    // Obstacle spawning parameters
    OBSTACLES: {
      MIN_SPAWN_INTERVAL: 42, // Frames between obstacle spawns at max speed
      MAX_SPAWN_INTERVAL: 88, // Frames at starting speed
      COIN_CHANCE: 0.65       // Probability of coin trails spawning
    }
  },

  // Audio Engine Configuration
  AUDIO: {
    MASTER_VOLUME: 0.7,
    SFX_VOLUME: 0.8,
    MUSIC_VOLUME: 0.45,
    SYNTH_BASS_ENABLED: true
  },

  // Storage Keys
  STORAGE: {
    HIGH_SCORE: 'airrunner_high_score',
    SETTINGS: 'airrunner_settings_v1',
    GEMINI_KEY: 'airrunner_gemini_key'
  },

  // MediaPipe Assets
  MEDIAPIPE: {
    TASKS_VISION_CDN: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0',
    WASM_PATH: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm',
    MODEL_REMOTE_URL: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    MODEL_LOCAL_PATH: './hand_landmarker.task'
  }
};
