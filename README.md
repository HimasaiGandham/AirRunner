# ⚡ AIRRUNNER

> **Move Your Hand. Control the Game. No Controller Required.**

AirRunner is an open-source, touchless 3D endless-runner game running natively in modern desktop browsers. Players navigate a high-speed cyberpunk runway entirely through real-time hand gestures captured via their webcam using Google MediaPipe Hands computer vision.

---

## 🎮 Core Interaction Concept

The core philosophy behind AirRunner eliminates physical input devices:

$$\text{Physical Hand Movement} \xrightarrow{\text{Webcam}} \text{MediaPipe 21 Landmark Detection} \xrightarrow{\text{Gesture Engine}} \text{Game Action} \xrightarrow{\text{Canvas}} \text{Instant 60 FPS Response}$$

No keyboards, mice, touchscreens, or gamepads are required for full gameplay.

---

## 🕹️ Gesture Controls

| Hand Gesture | Direction / Motion | In-Game Action | Mechanics |
| :--- | :--- | :--- | :--- |
| **Move Hand Up** | Swift upward swipe / lift | **JUMP** | Vaults over low laser hurdles |
| **Move Hand Down** | Swift downward swipe / drop | **SLIDE** | Crouches under hovering plasma beams |
| **Move Hand Left** | Shift hand towards physical left | **MOVE LEFT** | Transitions into left lane smoothly |
| **Move Hand Right** | Shift hand towards physical right | **MOVE RIGHT** | Transitions into right lane smoothly |
| **Thumb + Index Pinch** | Bring tips of thumb (4) and index (8) together | **ROLL** | Transforms runner into an energy sphere to pass void rings |

*(Optional accessibility fallback: Arrow Keys / WASD / Space / Shift are supported and can be toggled in Settings).*

---

## ✨ Features

- **Real-Time Touchless Vision Control**: Runs at 30–60 FPS using client-side WebAssembly & WebGL.
- **Pseudo-3D Perspective Canvas Engine**: Vanishing-point projection with dynamic scaling, smooth lane-switching interpolation, animated shadows, and scrolling cyber scanlines.
- **4 Distinct Obstacle Classes**:
  1. *Low Laser Hurdle* – Requires Jump.
  2. *High Plasma Arch* – Requires Slide.
  3. *Solid Quantum Monolith* – Requires Lane Switch.
  4. *Void Singularity Ring* – Requires Roll.
- **Collectible Quantum Coins**: Generates bonus score trails and arched jump sequences.
- **Procedural Web Audio Engine**: Pure Web Audio API synthesized sound effects and dynamic synthwave basslines with zero external MP3 file dependencies.
- **Intelligent AI Cyber Coach**:
  - Automatically analyzes post-run telemetry: reflex grade ($S/A/B/C/D$), gesture reaction timing, and fatal collision causes.
  - Generates instant heuristic coaching debriefs offline.
  - Optional Google Gemini API integration for personalized generative debriefs.
- **Live Interactive Practice Sandbox**: Test and calibrate gestures inside the *How To Play* modal before initiating a run.
- **Local Resilience & Privacy**: Fully zero-data-leakage client-side processing. Includes pre-cached local `hand_landmarker.task` fallback.

---

## 🛠️ Technology Stack

- **Frontend Core**: HTML5, Vanilla CSS3 (Custom Glassmorphic Neon Design System), Vanilla JavaScript (ES Modules).
- **Game Engine**: HTML5 Canvas with 3D perspective projection and object-pooled particle systems.
- **Computer Vision**: Google MediaPipe HandLandmarker (`@mediapipe/tasks-vision`).
- **Audio**: Web Audio API (`AudioContext`, synthetic oscillators, biquad filters, procedural drum synthesis).
- **AI Intelligence**: Google Gemini API (Optional generative debrief) + Rule-based heuristic reflex grader.

---

## 📂 Project Structure

```
AirRunner/
├── index.html              # Main game layout, HUD, overlays, and modals
├── style.css               # Futuristic cyberpunk design system & responsive layout
├── js/
│   ├── config.js           # Central configuration: gesture thresholds, physics, speeds
│   ├── handTracking.js     # MediaPipe HandLandmarker lifecycle, camera stream & skeleton overlay
│   ├── gestures.js         # Real-time gesture recognition (Jump, Slide, Left, Right, Pinch)
│   ├── audio.js            # Procedural Web Audio synthesizer (SFX & dynamic synth beat)
│   ├── particles.js        # High-performance object-pooled canvas particle FX
│   ├── player.js           # 3D player rendering, state machine, and vector cyber-suit
│   ├── obstacles.js        # Procedural 3D obstacle generation, coins, and collision detection
│   ├── game.js             # Core game loop, state management, and perspective rendering
│   ├── aiCoach.js          # Telemetry analysis and optional Gemini AI coach
│   └── main.js             # Application bootstrap, UI modal events, and controller wiring
├── hand_landmarker.task    # Offline pre-cached MediaPipe vision model
└── README.md               # Complete project documentation
```

---

## 🚀 How to Run Locally

Because MediaPipe uses modern WebAssembly, WebGL, and browser camera access APIs (`navigator.mediaDevices.getUserMedia`), modern browsers require the game to be served over `http://localhost` or `https://` (not raw `file://`).

### Option 1: Python (Built-in)
```bash
# In the AirRunner directory:
python -m http.server 8080
```
Open your browser and navigate to:
```
http://localhost:8080
```

### Option 2: Node.js / npx
```bash
# Using npx serve:
npx -y serve .
```

### Option 3: VS Code / IDE Live Server
- Open the project folder in VS Code or your IDE.
- Click **"Go Live"** using the Live Server extension.

---

## 📹 Webcam Permissions & Privacy

1. When you click **START GAME**, your browser will display a permission prompt asking for access to your camera.
2. Click **Allow**.
3. **Privacy Assurance**: All video processing and hand tracking occurs 100% locally in your browser's memory using client-side WebAssembly/WebGL. No video feeds or images are ever uploaded to any server.
4. You can minimize or hide the camera preview using the camera header toggle button during gameplay.

---

## 🧠 How Gesture Recognition Works

MediaPipe extracts 21 three-dimensional landmarks for each detected hand:

- **Wrist**: Landmark 0
- **Thumb**: Landmarks 1, 2, 3, 4 (Tip)
- **Index Finger**: Landmarks 5, 6, 7, 8 (Tip)
- **Middle Finger**: Landmarks 9, 10, 11, 12 (Tip)
- **Ring Finger**: Landmarks 13, 14, 15, 16 (Tip)
- **Pinky Finger**: Landmarks 17, 18, 19, 20 (Tip)

### 1. Palm Center & Coordinate Normalization
The palm center is calculated as:
$$\text{PalmX} = \frac{x_0 + x_5 + x_{17}}{3}, \quad \text{PalmY} = \frac{y_0 + y_5 + y_{17}}{3}$$
To ensure intuitive control with a mirrored camera feed:
$$\text{MirroredX} = 1.0 - \text{PalmX}$$
Moving your physical hand left moves the character left; moving right moves right.

### 2. Exponential Moving Average (EMA) Smoothing
To eliminate camera jitter:
$$\text{SmoothX}_t = \text{SmoothX}_{t-1} \cdot (1 - \alpha) + \text{MirroredX}_t \cdot \alpha$$
*(where $\alpha = \text{SMOOTHING\_FACTOR} = 0.38$)*.

### 3. Jump and Slide Detection
Velocity is computed across a sliding window of historical frames.
- If $\Delta Y < -\text{THRESHOLD\_Y}$: Upward hand movement detected $\rightarrow$ **JUMP**.
- If $\Delta Y > +\text{THRESHOLD\_Y}$: Downward hand movement detected $\rightarrow$ **SLIDE**.

### 4. Horizontal Lane Switching
- If $\Delta X < -\text{THRESHOLD\_X}$: Leftward movement detected $\rightarrow$ **MOVE LEFT**.
- If $\Delta X > +\text{THRESHOLD\_X}$: Rightward movement detected $\rightarrow$ **MOVE RIGHT**.

### 5. Roll (Pinch Detection)
The 3D Euclidean distance between the Thumb Tip (4) and Index Finger Tip (8) is calculated:
$$D_{\text{pinch}} = \sqrt{(x_4 - x_8)^2 + (y_4 - y_8)^2 + ((z_4 - z_8) \cdot 1.2)^2}$$
When $D_{\text{pinch}} < \text{PINCH\_DISTANCE}$ (0.070), an edge-triggered pinch event triggers **ROLL**. Hysteresis prevents rapid bouncing.

---

## ⚙️ Developer Guide: Customizing Parameters

All calibration constants reside in [`js/config.js`](file:///d:/AirRunner/js/config.js):

### Adjusting Gesture Sensitivity
```javascript
CONFIG.GESTURES.THRESHOLD_X = 0.065; // Lower for more sensitive horizontal swipes
CONFIG.GESTURES.THRESHOLD_Y = 0.075; // Lower for more sensitive Jump/Slide
CONFIG.GESTURES.PINCH_DISTANCE = 0.070; // Distance between thumb and index tips
CONFIG.GESTURES.COOLDOWN_MS = 240; // Cooldown between gesture activations
```

### Adjusting Game Speed & Acceleration
```javascript
CONFIG.GAME.INITIAL_SPEED = 12.0;       // Starting speed
CONFIG.GAME.MAX_SPEED = 32.0;           // Maximum terminal velocity
CONFIG.GAME.SPEED_ACCELERATION = 0.0035; // Acceleration per meter
```

### Adding New Obstacles
In [`js/obstacles.js`](file:///d:/AirRunner/js/obstacles.js), define a new obstacle type in `ObstacleType`, add it to `spawnPattern()`, and specify its drawing and collision requirements in `checkInteraction()`.

---

## 🤖 Integrating Google Gemini AI

AirRunner includes a built-in neural heuristic coach that functions completely offline without any API key.

To activate Google Gemini Generative AI debriefs:
1. Obtain a free Gemini API key from [Google AI Studio](https://aistudio.google.com/).
2. Open AirRunner and click **SETTINGS**.
3. Paste your key into the **Gemini AI API Key** field and click **SAVE CHANGES**.
4. After any run, the Game Over screen will deliver an AI-generated debrief directly analyzing your specific telemetry and reflexes.

---

## 🔧 Troubleshooting

- **Camera not starting**: Ensure your browser has permission to access the webcam. Check the address bar lock/camera icon.
- **Running via `file:///`**: Modern browsers block webcam and WebAssembly modules over `file:///`. Use a local development server like `python -m http.server 8080` or `npx serve .`.
- **High latency / Low FPS**: Close other applications using the webcam. Ensure hardware acceleration is enabled in your browser settings (`chrome://settings/system`).

---

## 🔮 Future Enhancements

- **Additional Gestures**:
  - Two-finger peace sign for a Turbo Boost.
  - Open palm forward push for a Kinetic Shield.
- **Multiplayer Mode**: Split-screen or WebRTC peer-to-peer motion racing.
- **Adaptive AI Difficulty**: Dynamic obstacle generation matching player reaction times.
- **Mobile Camera Support**: WebRTC / mobile browser touchless adaptation.
- **Global Leaderboards**: Cloud-synced high scores with gesture telemetry verification.

---

## 📄 License
This project is open-source and created for educational and experimental computer vision and game development purposes.
