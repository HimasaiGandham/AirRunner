# ⚡ AIRRUNNER

> **Move Your Hand. Control the Game. No Controller Required.**

AirRunner is a touchless 3D endless-runner for desktop browsers. You steer a runner down a neon track with hand gestures that Google MediaPipe reads from your webcam. Pilots sign in, and every run is saved to a shared leaderboard.

---

## 🧭 How It Fits Together

```
login.html ──► portal.html ──► index.html (game)
     │              │                │
     └──────────────┴────── FastAPI (server/app.py) ─── MongoDB
```

1. **Sign up / sign in** on `login.html`. The API returns a login token (valid for 1 hour) that the browser keeps in `localStorage`.
2. **Portal** (`portal.html`) lists the games and shows the leaderboard: each pilot's best run.
3. **Game** (`index.html`) sends you back to sign-in if your session is missing or expired. When a run ends, its score is posted to the API.

Webcam frames never leave the browser. Hand tracking runs locally with WebAssembly/WebGL. The server stores only your account (name, Gamer ID, email, bcrypt password hash) and your run results.

---

## 🕹️ Controls

### Hand gestures

| Hand Gesture | Direction / Motion | In-Game Action | Mechanics |
| :--- | :--- | :--- | :--- |
| **Move Hand Up** | Swift upward swipe / lift | **JUMP** | Vaults over low laser hurdles |
| **Move Hand Down** | Swift downward swipe / drop | **SLIDE** | Crouches under hovering plasma beams |
| **Move Hand Left** | Shift hand towards physical left | **MOVE LEFT** | Transitions into left lane smoothly |
| **Move Hand Right** | Shift hand towards physical right | **MOVE RIGHT** | Transitions into right lane smoothly |
| **Thumb + Index Pinch** | Bring tips of thumb (4) and index (8) together | **ROLL** | Transforms runner into an energy sphere to pass void rings |

### Keyboard

| Keys | Action |
| :--- | :--- |
| ← / A | Move left |
| → / D | Move right |
| ↑ / W / Space | Jump |
| ↓ / S | Slide |
| Shift / R / Z | Roll |
| P / Esc | Pause |

Keyboard controls are on by default (**Settings → Keyboard Fallback**). If there's no camera, or camera permission is denied, the game starts in keyboard mode and tells you why. With Keyboard Fallback turned off, the game needs a working camera.

---

## ✨ Features

- **Touchless control**: MediaPipe HandLandmarker runs in the browser at 30–60 FPS.
- **Pseudo-3D canvas engine**: vanishing-point projection, smooth lane switching, shadows and scrolling scanlines.
- **4 obstacle types**, each needing a different move:
  1. *Low Laser Hurdle*: jump.
  2. *High Plasma Arch*: slide.
  3. *Solid Quantum Monolith*: switch lanes.
  4. *Void Singularity Ring*: roll.
- **Coins** in trails and jump arcs for bonus score.
- **Procedural audio**: every sound effect and the synthwave beat are generated with the Web Audio API. No audio files.
- **AI coach** after each run: an offline grader gives a rank (S/A/B/C/D) and a tip based on what hit you. With a Gemini API key it writes a personalized debrief instead.
- **Practice sandbox** in *How To Play* to try gestures before a run.
- **Accounts and leaderboard**: sign-in with hashed passwords, and each pilot's best run on the portal.

The menus and sign-in pages use a clean, light layout; the game track keeps its neon look.

---

## 🛠️ Technology Stack

- **Frontend**: HTML, CSS, vanilla JavaScript (ES modules). No build step.
- **Game engine**: HTML5 Canvas 2D with perspective projection and pooled particles.
- **Computer vision**: Google MediaPipe HandLandmarker (`@mediapipe/tasks-vision@0.10.0`, loaded from jsDelivr).
- **Audio**: Web Audio API (oscillators, biquad filters, synthesized drums).
- **Backend**: FastAPI, PyJWT, bcrypt.
- **Database**: MongoDB via PyMongo.
- **AI coach**: rule-based grader, plus the optional Google Gemini API.

---

## 📂 Project Structure

```
AirRunner/
├── index.html              # Game: canvas, HUD, menus and modals
├── login.html              # Sign up / sign in
├── portal.html             # Game portal and leaderboard
├── frontbasic.html         # Diagnostic feed: raw camera + landmark tracking (linked from the start screen)
├── style.css               # Game styles
├── css/auth.css            # Sign-in page styles
├── js/
│   ├── session.js          # API address, login session storage, fetch helper
│   ├── auth.js             # Sign-in / sign-up form
│   ├── config.js           # Tunables: gesture thresholds, physics, speeds, Gemini model
│   ├── handTracking.js     # MediaPipe lifecycle, camera stream, skeleton overlay
│   ├── gestures.js         # Gesture recognition (jump, slide, left, right, pinch)
│   ├── audio.js            # Procedural Web Audio sound effects and music
│   ├── particles.js        # Pooled canvas particle effects
│   ├── player.js           # Player rendering and state machine
│   ├── obstacles.js        # Obstacle and coin spawning, collisions
│   ├── game.js             # Game loop, states, perspective rendering
│   ├── aiCoach.js          # Post-run grading and optional Gemini debrief
│   └── main.js             # Bootstrap: sign-in check, UI wiring, keyboard controls, score upload
├── server/
│   ├── app.py              # FastAPI app: accounts, scores, leaderboard
│   ├── test_app.py         # API tests (in-memory mongomock, no MongoDB needed)
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   └── .env.example
├── airrunner_stage1.py     # Early desktop prototype: OpenCV hand tracking
├── airrunner_stage2.py     # Early desktop prototype: gestures pressed as arrow keys via PyAutoGUI
└── hand_landmarker.task    # MediaPipe model, used if the remote model fails to load
```

---

## 🚀 Running Locally

### Prerequisites

- **Python 3.10+**
- **MongoDB**, either a local [Community Server](https://www.mongodb.com/try/download/community), `docker run -d -p 27017:27017 mongo`, or a MongoDB Atlas connection string
- **A webcam**, optional: keyboard play works without one
- **Internet access**, because MediaPipe's runtime loads from jsDelivr

### 1. Start the API

```bash
cd server
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env            # macOS/Linux: cp .env.example .env
```

Edit `server/.env`:

- `JWT_SECRET`: set it to a long random string. Generate one with `python -c "import secrets; print(secrets.token_hex(32))"`.
- `MONGO_URI`: change it if MongoDB isn't at `mongodb://localhost:27017`.

Then run:

```bash
uvicorn app:app --port 8000
```

The server won't start if `JWT_SECRET` is empty or if it can't reach MongoDB within 5 seconds.

### 2. Serve the frontend

In a second terminal, from the repository root:

```bash
python -m http.server 8080
```

Open **http://localhost:8080/login.html**, create an account, and press **Play Now**.

Serve the files over `http://localhost` rather than opening them directly: browsers block the camera and WebAssembly on `file://` pages. The frontend calls the API at `http://localhost:8000`. If you run the API elsewhere, change `API_BASE` in [`js/session.js`](js/session.js).

### 3. Run the tests

```bash
cd server
pip install -r requirements-dev.txt
pytest
```

---

## 🔌 API

| Method | Path | Auth | Input | Response |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/health` | – | – | `{"status": "ok"}` |
| POST | `/api/auth/signup` | – | `pilotName` (3–40 chars), `gamerId` (3–30 chars), `email`, `password` (8+ chars, max 72 bytes) | `201 {token, pilotName, gamerId}`; `409` if the email or Gamer ID is taken |
| POST | `/api/auth/login` | – | `email`, `password` | `{token, pilotName, gamerId}`; `401` on bad credentials |
| POST | `/api/scores` | `Authorization: Bearer <token>` | `score`, `distance`, `coinsCollected` (whole numbers ≥ 0) | `201`; `401` if the token is missing or expired |
| GET | `/api/leaderboard` | – | `?limit=` (1–50, default 10) | `[{gamerId, score, distance}]`, each pilot's best run, highest first |

Emails are stored in lowercase. Email and Gamer ID are unique, enforced by MongoDB indexes the server creates on startup. Invalid input returns `422` with a list of field errors.

> Scores come from the browser, so a determined player could submit a fake one. Server-side run verification is listed under future work.

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
Velocity is computed across a sliding window of recent frames.
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

All calibration constants live in [`js/config.js`](js/config.js).

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
In [`js/obstacles.js`](js/obstacles.js), define a new obstacle type in `ObstacleType`, add it to `spawnPattern()`, and specify its drawing and collision requirements in `checkInteraction()`.

---

## 🤖 Google Gemini Coach (Optional)

The built-in coach works offline with no key. To get generated debriefs instead:

1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/).
2. In AirRunner, open **SETTINGS**, paste the key into **Gemini AI API Key**, and click **SAVE CHANGES**.
3. After each run, the Game Over screen shows a debrief written from your run's stats.

The key is stored in this browser's `localStorage` and sent only to Google's API, so anyone using the same browser profile can read it. The model is set by `CONFIG.AI.GEMINI_MODEL`. The default `gemini-flash-latest` alias follows Google's current Flash model, so it survives model retirements. If the call fails, the offline coach is used.

---

## 🔧 Troubleshooting

- **"Cannot reach the AirRunner server"**: start the API (`uvicorn app:app --port 8000` in `server/`) and check that `API_BASE` in `js/session.js` matches.
- **API won't start: `JWT_SECRET is not set`**: create `server/.env` from `.env.example` and fill in `JWT_SECRET`.
- **API won't start: `ServerSelectionTimeoutError`**: MongoDB isn't running or `MONGO_URI` is wrong.
- **Sent back to the sign-in page**: sessions last one hour. Sign in again.
- **Camera not starting**: check the camera icon in the address bar and allow access. You can still play with the keyboard meanwhile.
- **"Hand tracking failed to load"**: MediaPipe loads from `cdn.jsdelivr.net`, so check your internet connection. Keyboard play still works.
- **Blank page or camera blocked on `file:///`**: serve the folder with `python -m http.server 8080`.
- **High latency / low FPS**: close other apps using the webcam and turn on hardware acceleration (`chrome://settings/system`).

---

## 🧪 Early Prototypes

`airrunner_stage1.py` and `airrunner_stage2.py` are the desktop experiments the web game grew from. Stage 1 shows OpenCV hand tracking; Stage 2 turns gestures into arrow-key presses with PyAutoGUI, so it controls whatever window has focus. They aren't used by the web game. To try them:

```bash
pip install opencv-python mediapipe pyautogui
python airrunner_stage1.py
```

---

## 🔮 Future Enhancements

- **Additional Gestures**:
  - Two-finger peace sign for a Turbo Boost.
  - Open palm forward push for a Kinetic Shield.
- **Multiplayer Mode**: Split-screen or WebRTC peer-to-peer motion racing.
- **Adaptive AI Difficulty**: Dynamic obstacle generation matching player reaction times.
- **Mobile Camera Support**: Touchless play in mobile browsers.
- **Verified Scores**: Server-side checks on submitted runs using gesture telemetry.

---

## 📄 License
This project is open-source and created for educational and experimental computer vision and game development purposes.
