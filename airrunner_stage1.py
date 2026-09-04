import cv2
import time
import os
import urllib.request
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# Auto-download the MediaPipe model file required for Python 3.13 / MediaPipe 1.0+
MODEL_PATH = "hand_landmarker.task"
MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"

if not os.path.exists(MODEL_PATH):
    print("Downloading hand tracking model file (hand_landmarker.task)...")
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    print("Model downloaded successfully!")

# Initialize HandLandmarker detector
base_options = python.BaseOptions(model_asset_path=MODEL_PATH)
options = vision.HandLandmarkerOptions(
    base_options=base_options,
    num_hands=1,
    min_hand_detection_confidence=0.7,
    min_tracking_confidence=0.7
)
detector = vision.HandLandmarker.create_from_options(options)

# Hand joint connections for skeleton rendering
HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),        # Thumb
    (0, 5), (5, 6), (6, 7), (7, 8),        # Index finger
    (5, 9), (9, 10), (10, 11), (11, 12),    # Middle finger
    (9, 13), (13, 14), (14, 15), (15, 16),  # Ring finger
    (13, 17), (17, 18), (18, 19), (19, 20), # Pinky finger
    (0, 17)                                # Palm base
]

cap = cv2.VideoCapture(0)
prev_time = 0

print("AirRunner Stage 1 Active (Python 3.13). Press 'q' to exit.")

while cap.isOpened():
    success, frame = cap.read()
    if not success:
        continue

    # Mirror frame horizontally
    frame = cv2.flip(frame, 1)
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

    # Detect landmarks
    detection_result = detector.detect(mp_image)

    hand_detected = "NO"
    landmark_count = 0

    if detection_result.hand_landmarks:
        hand_detected = "YES"
        hand_landmarks = detection_result.hand_landmarks[0]
        landmark_count = len(hand_landmarks)

        h, w, _ = frame.shape
        points = [(int(lm.x * w), int(lm.y * h)) for lm in hand_landmarks]

        # Draw skeleton connections
        for p1, p2 in HAND_CONNECTIONS:
            cv2.line(frame, points[p1], points[p2], (0, 255, 0), 2)

        # Draw joint points
        for pt in points:
            cv2.circle(frame, pt, 5, (0, 0, 255), -1)

    # Calculate FPS
    curr_time = time.time()
    fps = int(1 / (curr_time - prev_time)) if (curr_time - prev_time) > 0 else 0
    prev_time = curr_time

    # Draw HUD Box
    cv2.rectangle(frame, (10, 10), (320, 110), (20, 20, 20), -1)
    cv2.rectangle(frame, (10, 10), (320, 110), (255, 240, 0), 1)

    # Display HUD Metrics
    cv2.putText(frame, f"Hand Detected: {hand_detected}", (20, 35),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 100) if hand_detected == "YES" else (0, 0, 255), 2)
    cv2.putText(frame, f"Landmarks: {landmark_count}", (20, 65),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 240, 0), 2)
    cv2.putText(frame, f"Pipeline FPS: {fps}", (20, 95),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 240, 0), 2)

    # Render window
    cv2.imshow('AirRunner - Stage 1 (Python 3.13)', frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()