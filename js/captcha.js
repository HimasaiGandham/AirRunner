/**
 * AirRunner - Cyber Canvas CAPTCHA Engine
 * Generates an interactive, distorted alphanumeric verification image
 * with noise lines, character rotation, and optional audio speech readout.
 */

class CyberCaptcha {
  constructor(canvasId, inputId, refreshBtnId, audioBtnId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.input = document.getElementById(inputId);
    this.refreshBtn = document.getElementById(refreshBtnId);
    this.audioBtn = document.getElementById(audioBtnId);
    this.currentCode = '';
    
    // Characters excluding ambiguous ones like 0, O, I, l, 1
    this.chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
    this.colors = ['#00f0ff', '#ff007f', '#00ff88', '#ffb800', '#9d4edd', '#ffffff'];

    this.init();
  }

  init() {
    if (!this.canvas) return;

    // Set resolution
    this.canvas.width = 220;
    this.canvas.height = 60;

    this.generate();

    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', () => {
        this.refreshBtn.classList.add('rotating');
        this.generate();
        setTimeout(() => this.refreshBtn.classList.remove('rotating'), 600);
      });
    }

    if (this.audioBtn) {
      this.audioBtn.addEventListener('click', () => {
        this.speakCode();
      });
    }
  }

  generate() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Generate 5-6 character string
    this.currentCode = '';
    const length = 5;
    for (let i = 0; i < length; i++) {
      const idx = Math.floor(Math.random() * this.chars.length);
      this.currentCode += this.chars.charAt(idx);
    }

    // Clear background
    ctx.clearRect(0, 0, width, height);
    
    // Background gradient with tech grid feel
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#06080d');
    bgGrad.addColorStop(0.5, '#0e1422');
    bgGrad.addColorStop(1, '#080c14');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Subtle background mesh lines
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.12)';
    for (let x = 0; x < width; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 14) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw random noise dots
    for (let i = 0; i < 45; i++) {
      ctx.fillStyle = this.colors[Math.floor(Math.random() * this.colors.length)] + '40';
      ctx.beginPath();
      ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 2 + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw background distortion curves
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, Math.random() * height);
      ctx.bezierCurveTo(
        width * 0.3, Math.random() * height,
        width * 0.7, Math.random() * height,
        width, Math.random() * height
      );
      ctx.strokeStyle = this.colors[i % this.colors.length] + '55';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Draw each character with rotation, scale, and cyber font
    const charSpacing = (width - 40) / length;
    const fonts = ['Space Grotesk', 'Courier New', 'Arial', 'Verdana', 'Trebuchet MS'];

    for (let i = 0; i < length; i++) {
      const char = this.currentCode[i];
      const fontName = fonts[Math.floor(Math.random() * fonts.length)];
      const fontSize = Math.floor(Math.random() * 8) + 26; // 26 - 34px
      ctx.font = `bold ${fontSize}px "${fontName}", sans-serif`;

      const color = this.colors[Math.floor(Math.random() * this.colors.length)];
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;

      const x = 20 + i * charSpacing + Math.random() * 6;
      const y = height / 2 + Math.random() * 8 + 4;
      const angle = (Math.random() - 0.5) * 0.5; // -15 to +15 deg

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillText(char, 0, 0);
      ctx.restore();
    }

    // Reset shadow
    ctx.shadowBlur = 0;

    // Draw foreground distortion cross-cut lines
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * 20, Math.random() * height);
      ctx.lineTo(width - Math.random() * 20, Math.random() * height);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Clear previous input value if any
    if (this.input) {
      this.input.value = '';
    }
  }

  validate() {
    if (!this.input) return false;
    const userInput = this.input.value.trim();
    if (!userInput) return false;
    // Case-insensitive comparison for smoother user experience
    return userInput.toLowerCase() === this.currentCode.toLowerCase();
  }

  speakCode() {
    if (!('speechSynthesis' in window)) {
      alert('Audio synthesis is not supported on this browser.');
      return;
    }
    window.speechSynthesis.cancel();
    // Spell each character clearly
    const spaced = this.currentCode.split('').join('. ');
    const utterance = new SpeechSynthesisUtterance(`Captcha characters are: ${spaced}`);
    utterance.rate = 0.85;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }
}

// Export for global access
window.CyberCaptcha = CyberCaptcha;
