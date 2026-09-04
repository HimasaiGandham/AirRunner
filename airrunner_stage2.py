import cv2
import time
import os
import urllib.request
import pyautogui
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# Optimize PyAutoGUI speed
pyautogui.PAUSE = 0.001
pyautogui.FAILSAFE = False

# Auto-download model if missing
MODEL_PATH = "hand_landmarker.task"
MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"

if not os.path.exists(MODEL_PATH):
    print("Downloading model file...")
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)

base_options = python.BaseOptions(model_asset_path=MODEL_PATH)
options = vision.HandLandmarkerOptions(
    base_options=base_options,
    num_hands=1,
    min_hand_detection_confidence=0.6,
    min_tracking_confidence=0.6
)
detector = vision.HandLandmarker.create_from_options(options)

# Force lower camera resolution for fast execution (High FPS)
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

prev_time = 0
last_action_time = 0
COOLDOWN_SEC = 0.15  # Ultra-fast response cooldown

print("AirRunner High-Speed Mode Active. Press 'q' to exit.")

while cap.isOpened():
    success, frame = cap.read()
    if not success:
        continue

    frame = cv2.flip(frame, 1)
    h, w, _ = frame.shape
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

    # Smaller Neutral Box = Faster Gesture Activation
    x_min, x_max = int(w * 0.40), int(w * 0.60)
    y_min, y_max = int(h * 0.38), int(h * 0.62)

    detection_result = detector.detect(mp_image)
    action = "NEUTRAL"
    current_time = time.time()

    if detection_result.hand_landmarks:
        hand_landmarks = detection_result.hand_landmarks[0]
        
        # Track Thumb (4) and Index (8)
        tx, ty = int(hand_landmarks[4].x * w), int(hand_landmarks[4].y * h)
        ix, iy = int(hand_landmarks[8].x * w), int(hand_landmarks[8].y * h)

        # Midpoint
        cx, cy = (tx + ix) // 2, (ty + iy) // 2

        # Draw fast lightweight overlay
        cv2.circle(frame, (cx, cy), 8, (0, 255, 255), -1)

        # Instant Directional Logic
        if current_time - last_action_time > COOLDOWN_SEC:
            if cy < y_min:
                action = "JUMP"
                pyautogui.press('up')
                last_action_time = current_time
            elif cy > y_max:
                action = "CROUCH"
                pyautogui.press('down')
                last_action_time = current_time
            elif cx < x_min:
                action = "LEFT"
                pyautogui.press('left')
                last_action_time = current_time
            elif cx > x_max:
                action = "RIGHT"
                pyautogui.press('right')
                last_action_time = current_time

    # Performance FPS tracking
    fps = int(1 / (current_time - prev_time)) if (current_time - prev_time) > 0 else 0
    prev_time = current_time

    # Visual indicators
    box_color = (0, 255, 0) if action == "NEUTRAL" else (0, 0, 255)
    cv2.rectangle(frame, (x_min, y_min), (x_max, y_max), box_color, 2)
    cv2.putText(frame, f"Action: {action} | FPS: {fps}", (15, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

    cv2.imshow('AirRunner High-Speed Control', frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()