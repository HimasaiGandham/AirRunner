/**
 * AirRunner - AI Coach & Performance Analysis Engine
 * Evaluates runner telemetry, reaction timings, and gesture mastery.
 * Provides instant tactical debriefs via an intelligent heuristic system,
 * with optional Google Gemini AI generative analysis if an API key is provided.
 * 100% failsafe — zero runtime dependencies.
 */

import { CONFIG } from './config.js';

export class AICoach {
  constructor() {
    this.geminiApiKey = localStorage.getItem(CONFIG.STORAGE.GEMINI_KEY) || '';
  }

  setApiKey(key) {
    this.geminiApiKey = (key || '').trim();
    if (this.geminiApiKey) {
      localStorage.setItem(CONFIG.STORAGE.GEMINI_KEY, this.geminiApiKey);
    } else {
      localStorage.removeItem(CONFIG.STORAGE.GEMINI_KEY);
    }
  }

  getApiKey() {
    return this.geminiApiKey;
  }

  /**
   * Evaluates telemetry and returns structured feedback
   */
  async generateDebrief(telemetry) {
    const { score, distance, coins, maxSpeed, gestureStats, causeOfDeath } = telemetry;

    // 1. Calculate Reflex Rank
    let rank = 'D';
    let title = 'Rookie Cadet';
    let color = '#94a3b8';

    if (score >= 6000 || distance >= 2200) {
      rank = 'S';
      title = 'Cyber Phantom';
      color = '#ffe600'; // Gold
    } else if (score >= 3500 || distance >= 1400) {
      rank = 'A';
      title = 'Velocity Master';
      color = '#00f0ff'; // Neon Cyan
    } else if (score >= 1800 || distance >= 750) {
      rank = 'B';
      title = 'Neon Strider';
      color = '#00ff88'; // Electric Green
    } else if (score >= 600 || distance >= 250) {
      rank = 'C';
      title = 'Motion Runner';
      color = '#a855f7'; // Purple
    }

    // 2. Generate Built-in Heuristic Analysis (Instant & Offline)
    const heuristicFeedback = this.buildHeuristicAdvice(telemetry, rank, title);

    // 3. Optional Gemini Generative AI Call if API Key exists
    if (this.geminiApiKey && navigator.onLine) {
      try {
        const geminiAdvice = await this.callGeminiAPI(telemetry, rank, title);
        if (geminiAdvice) {
          return {
            rank,
            title,
            color,
            summary: geminiAdvice,
            isAiGenerated: true
          };
        }
      } catch (err) {
        console.warn("Gemini API call failed, falling back to heuristic coach:", err);
      }
    }

    return {
      rank,
      title,
      color,
      summary: heuristicFeedback,
      isAiGenerated: false
    };
  }

  /**
   * Generates intelligent, contextual coaching advice based on play metrics
   */
  buildHeuristicAdvice(telemetry, rank, title) {
    const { distance, coins, gestureStats, causeOfDeath } = telemetry;
    const tips = [];

    // Cause of death analysis
    if (causeOfDeath === 'BARRIER_LOW') {
      tips.push("Fatal collision with a low laser hurdle. Lift your hand earlier into an upward swipe to clear hurdles with room to spare.");
    } else if (causeOfDeath === 'BARRIER_HIGH') {
      tips.push("Caught by the high plasma arch. Make a decisive downward hand flick to slide underneath the beam.");
    } else if (causeOfDeath === 'WALL_SOLID') {
      tips.push("Direct impact with a solid quantum monolith. Solid walls cannot be vaulted or ducked — shift your hand left or right into an open lane.");
    } else if (causeOfDeath === 'VOID_RING') {
      tips.push("Crushed against a void containment ring. Pinch your thumb and index finger together to trigger the roll ball.");
    }

    // Action variety analysis
    const totalGestures = (gestureStats.jumps || 0) + (gestureStats.slides || 0) + 
                         (gestureStats.rolls || 0) + (gestureStats.laneSwitches || 0);

    if (coins < (distance / 40)) {
      tips.push("Coin acquisition efficiency was low. Many coins hover over low hurdles — jump in their path to boost your multiplier!");
    }

    if ((gestureStats.rolls || 0) === 0 && distance > 500) {
      tips.push("You haven't practiced the Pinch Roll yet. Bring your thumb tip and index finger tip together to roll through tight spaces.");
    }

    // Encouraging conclusion
    const conclusions = {
      'S': "Flawless neural synchronization. You are running at peak kinetic efficiency!",
      'A': "Exceptional motion precision! Keep your hand centered in the neutral zone for even faster lane shifts.",
      'B': "Solid reflex speed. Focus on anticipating upcoming obstacle sequences from further down the track.",
      'C': "Good initial run! Relax your hand and make deliberate, crisp directional gestures.",
      'D': "Warmup run complete. Ensure your webcam has good lighting and keep your hand within the tracking box."
    };

    const advice = tips.length > 0 ? tips[0] : "Maintain rhythm and scan ahead for safe lanes!";
    return `${advice} ${conclusions[rank] || ''}`;
  }

  /**
   * Optional Gemini 1.5/2.0 API call for generative coaching debrief
   */
  async callGeminiAPI(telemetry, rank, title) {
    const prompt = `You are the Cyber Coach for the touchless web game AirRunner.
The player just finished a run. Here is their telemetry:
- Rank: ${rank} (${title})
- Score: ${telemetry.score}
- Distance: ${telemetry.distance}m
- Coins: ${telemetry.coins}
- Fatal Obstacle: ${telemetry.causeOfDeath || 'Track Boundary'}
- Gestures Used: Jumps: ${telemetry.gestureStats.jumps || 0}, Slides: ${telemetry.gestureStats.slides || 0}, Rolls: ${telemetry.gestureStats.rolls || 0}, Lane Shifts: ${telemetry.gestureStats.laneSwitches || 0}

Give a 2-sentence cyberpunk tactical debrief directly to the player. Be encouraging, charismatic, and provide 1 specific tip based on how they crashed. Keep it under 50 words.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.geminiApiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 100, temperature: 0.7 }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API returned status ${response.status}`);
    }

    const data = await response.json();
    if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
      return data.candidates[0].content.parts[0].text.trim();
    }
    return null;
  }
}

export const aiCoach = new AICoach();
