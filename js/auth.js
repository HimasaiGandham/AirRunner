/**
 * AirRunner Authentication Logic
 * Handles tabs, OTP simulation, password strength analytics,
 * input validation, ambient particle animation, and toast alerts.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Ambient Cyber Background Animation
  initAmbientParticles();

  // 2. Initialize CAPTCHA
  const captcha = new window.CyberCaptcha(
    'captcha-canvas',
    'signin-captcha',
    'btn-refresh-captcha',
    'btn-audio-captcha'
  );

  // 3. Tab Switching Setup
  initTabSwitching();

  // 4. Password Visibility Toggles
  initPasswordToggles();

  // 5. Password Strength Meter & Confirmation
  initPasswordValidation();

  // 6. Email Verification System (OTP)
  initEmailVerification();

  // 7. Form Submissions
  initFormSubmissions(captcha);

  // 8. Forgot Password Modal
  initForgotPasswordModal();
});

/* ===================================================
   Ambient Cyber Canvas Particles
   =================================================== */
function initAmbientParticles() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particles = [];
  const particleCount = Math.min(width > 768 ? 45 : 22, 60);

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      radius: Math.random() * 2 + 1,
      color: Math.random() > 0.6 ? 'rgba(0, 240, 255,' : 'rgba(138, 43, 226,',
      alpha: Math.random() * 0.5 + 0.2
    });
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    // Draw connection lines
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 120) {
          const lineAlpha = (1 - dist / 120) * 0.18;
          ctx.strokeStyle = `rgba(0, 240, 255, ${lineAlpha})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    // Draw particles
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;

      ctx.fillStyle = `${p.color}${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    requestAnimationFrame(animate);
  }

  animate();
}

/* ===================================================
   Tab Switching (Sign In vs Sign Up)
   =================================================== */
function initTabSwitching() {
  const switcher = document.querySelector('.tab-switcher');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.auth-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      // Update button states
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Slide indicator
      switcher.setAttribute('data-active', targetTab);

      // Show panel
      panels.forEach(panel => {
        panel.classList.toggle('active', panel.id === `panel-${targetTab}`);
      });
    });
  });

  // Footer prompt switches
  document.querySelectorAll('[data-switch-to]').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      const target = trigger.getAttribute('data-switch-to');
      const targetBtn = document.querySelector(`.tab-btn[data-tab="${target}"]`);
      if (targetBtn) targetBtn.click();
    });
  });
}

/* ===================================================
   Password Toggles (Show / Hide)
   =================================================== */
function initPasswordToggles() {
  document.querySelectorAll('.toggle-pwd').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      if (!input) return;

      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';

      // Update SVG icon
      btn.innerHTML = isPassword
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    });
  });
}

/* ===================================================
   Password Strength Meter & Live Validation
   =================================================== */
function initPasswordValidation() {
  const pwdInput = document.getElementById('signup-password');
  const confirmInput = document.getElementById('signup-confirm-password');
  const meterWrap = document.querySelector('.strength-meter-wrap');
  const strengthText = document.getElementById('strength-text');
  const matchIndicator = document.getElementById('pwd-match-indicator');

  const checkLength = document.getElementById('req-length');
  const checkUpper = document.getElementById('req-upper');
  const checkNumber = document.getElementById('req-number');
  const checkSymbol = document.getElementById('req-symbol');

  if (!pwdInput) return;

  pwdInput.addEventListener('input', () => {
    const val = pwdInput.value;

    const hasLength = val.length >= 8;
    const hasUpper = /[A-Z]/.test(val) && /[a-z]/.test(val);
    const hasNumber = /[0-9]/.test(val);
    const hasSymbol = /[^A-Za-z0-9]/.test(val);

    // Update criteria UI
    updateCheckItem(checkLength, hasLength);
    updateCheckItem(checkUpper, hasUpper);
    updateCheckItem(checkNumber, hasNumber);
    updateCheckItem(checkSymbol, hasSymbol);

    // Calculate score (0 - 4)
    let score = 0;
    if (val.length > 0) {
      if (hasLength) score++;
      if (hasUpper) score++;
      if (hasNumber) score++;
      if (hasSymbol) score++;
    }

    // Set level in meter
    meterWrap.setAttribute('data-level', score);

    const labels = ['Empty', 'Weak', 'Fair', 'Good', 'Strong'];
    strengthText.textContent = val.length === 0 ? 'None' : labels[score];

    // Check confirmation matching if filled
    checkPasswordMatch();
  });

  if (confirmInput) {
    confirmInput.addEventListener('input', checkPasswordMatch);
  }

  function checkPasswordMatch() {
    if (!confirmInput || !matchIndicator) return;
    const pwd = pwdInput.value;
    const confirm = confirmInput.value;

    if (!confirm) {
      matchIndicator.textContent = '';
      return;
    }

    if (pwd === confirm) {
      matchIndicator.textContent = 'Passwords match';
      matchIndicator.style.color = 'var(--neon-green)';
    } else {
      matchIndicator.textContent = 'Passwords do not match';
      matchIndicator.style.color = 'var(--neon-red)';
    }
  }

  function updateCheckItem(element, isValid) {
    if (!element) return;
    element.classList.toggle('valid', isValid);
    const svg = element.querySelector('svg');
    if (svg) {
      svg.innerHTML = isValid
        ? `<polyline points="20 6 9 17 4 12"></polyline>`
        : `<circle cx="12" cy="12" r="9"></circle>`;
    }
  }
}

/* ===================================================
   Email Verification System (OTP Simulation)
   =================================================== */
let generatedOtp = null;
let isEmailVerified = false;
let otpCountdownTimer = null;

function initEmailVerification() {
  const btnVerifyEmail = document.getElementById('btn-verify-email');
  const emailInput = document.getElementById('signup-email');
  const otpModal = document.getElementById('otp-modal');
  const modalCloseBtn = document.getElementById('btn-close-otp');
  const btnSubmitOtp = document.getElementById('btn-submit-otp');
  const resendBtn = document.getElementById('btn-resend-otp');
  const timerSpan = document.getElementById('otp-timer');
  const targetEmailSpan = document.getElementById('otp-target-email');
  const emailStatusBadge = document.getElementById('email-status-badge');
  const otpInputs = document.querySelectorAll('.otp-digit');

  if (!btnVerifyEmail || !emailInput) return;

  // Click Send / Verify Email
  btnVerifyEmail.addEventListener('click', () => {
    const email = emailInput.value.trim();
    if (!email || !validateEmailFormat(email)) {
      showToast('Please enter a valid email address first.', 'error');
      triggerShake(emailInput.parentElement);
      emailInput.focus();
      return;
    }

    if (isEmailVerified) {
      showToast('This email is already verified!', 'info');
      return;
    }

    openOtpModal(email);
  });

  // Modal close handlers
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', () => {
      closeOtpModal();
    });
  }

  if (otpModal) {
    otpModal.addEventListener('click', (e) => {
      if (e.target === otpModal) closeOtpModal();
    });
  }

  // Resend OTP handler
  if (resendBtn) {
    resendBtn.addEventListener('click', () => {
      if (resendBtn.disabled) return;
      const email = emailInput.value.trim();
      openOtpModal(email);
    });
  }

  // 6-digit OTP input mechanics
  otpInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/[^0-9]/g, '');
      e.target.value = val;

      if (val && index < otpInputs.length - 1) {
        otpInputs[index + 1].focus();
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && index > 0) {
        otpInputs[index - 1].focus();
      }
      if (e.key === 'Enter') {
        btnSubmitOtp.click();
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim();
      if (/^\d{6}$/.test(pasteData)) {
        pasteData.split('').forEach((char, i) => {
          if (otpInputs[i]) otpInputs[i].value = char;
        });
        otpInputs[5].focus();
      }
    });
  });

  // Submit OTP Verification
  if (btnSubmitOtp) {
    btnSubmitOtp.addEventListener('click', () => {
      const enteredOtp = Array.from(otpInputs).map(inp => inp.value).join('');

      if (enteredOtp.length !== 6) {
        showToast('Please enter the complete 6-digit verification code.', 'error');
        triggerShake(document.querySelector('.otp-inputs'));
        return;
      }

      if (enteredOtp === generatedOtp) {
        // Success
        isEmailVerified = true;
        closeOtpModal();

        // Update UI
        emailStatusBadge.className = 'status-badge verified';
        emailStatusBadge.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Verified
        `;
        btnVerifyEmail.textContent = 'Verified ✓';
        btnVerifyEmail.disabled = true;
        btnVerifyEmail.style.background = 'rgba(0, 255, 136, 0.15)';
        btnVerifyEmail.style.borderColor = 'var(--neon-green)';
        btnVerifyEmail.style.color = 'var(--neon-green)';
        emailInput.readOnly = true;

        showToast('Email successfully verified!', 'success');
      } else {
        showToast('Invalid verification code. Please check and try again.', 'error');
        triggerShake(document.querySelector('.otp-inputs'));
      }
    });
  }

  function openOtpModal(email) {
    // Generate 6 digit code
    generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    targetEmailSpan.textContent = email;

    // Reset digit inputs
    otpInputs.forEach(i => (i.value = ''));
    otpModal.classList.add('open');
    setTimeout(() => otpInputs[0].focus(), 150);

    // Start 60s countdown timer
    startCountdown(60);

    // Realistic Simulation Toast with the OTP Code for testing convenience
    showToast(`Verification Code for ${email}: [ ${generatedOtp} ]`, 'info', 10000);
  }

  function closeOtpModal() {
    otpModal.classList.remove('open');
    if (otpCountdownTimer) clearInterval(otpCountdownTimer);
  }

  function startCountdown(seconds) {
    if (otpCountdownTimer) clearInterval(otpCountdownTimer);
    let remaining = seconds;
    resendBtn.disabled = true;
    timerSpan.textContent = `(${remaining}s)`;

    otpCountdownTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(otpCountdownTimer);
        timerSpan.textContent = '';
        resendBtn.disabled = false;
      } else {
        timerSpan.textContent = `(${remaining}s)`;
      }
    }, 1000);
  }
}

/* ===================================================
   Form Submissions (Sign In & Sign Up)
   =================================================== */
function initFormSubmissions(captcha) {
  const formSignIn = document.getElementById('form-signin');
  const formSignUp = document.getElementById('form-signup');

  // Sign In Handling
  if (formSignIn) {
    formSignIn.addEventListener('submit', (e) => {
      e.preventDefault();

      const usernameInput = document.getElementById('signin-username');
      const passwordInput = document.getElementById('signin-password');
      const captchaInput = document.getElementById('signin-captcha');
      const submitBtn = document.getElementById('btn-submit-signin');

      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();

      if (!username) {
        showToast('Please enter your username or email.', 'error');
        triggerShake(usernameInput.parentElement);
        usernameInput.focus();
        return;
      }

      if (!password) {
        showToast('Please enter your password.', 'error');
        triggerShake(passwordInput.parentElement);
        passwordInput.focus();
        return;
      }

      // Validate CAPTCHA
      if (!captcha.validate()) {
        showToast('Invalid CAPTCHA security code. Please try again.', 'error');
        triggerShake(document.querySelector('.captcha-container'));
        captcha.generate();
        captchaInput.focus();
        return;
      }

      // Success animation & mock auth
      submitBtn.classList.add('loading');
      setTimeout(() => {
        submitBtn.classList.remove('loading');
        showToast(`Welcome back, Agent ${username}! Authenticated successfully.`, 'success');

        // Offer launch to game/tracker
        setTimeout(() => {
          showAuthSuccessDialog(username, 'Sign In');
        }, 800);
      }, 1200);
    });
  }

  // Sign Up Handling
  if (formSignUp) {
    formSignUp.addEventListener('submit', (e) => {
      e.preventDefault();

      const firstName = document.getElementById('signup-firstname').value.trim();
      const middleName = document.getElementById('signup-middlename').value.trim();
      const lastName = document.getElementById('signup-lastname').value.trim();
      const email = document.getElementById('signup-email').value.trim();
      const password = document.getElementById('signup-password').value;
      const confirmPassword = document.getElementById('signup-confirm-password').value;
      const termsCheck = document.getElementById('signup-terms');
      const submitBtn = document.getElementById('btn-submit-signup');

      // Validations
      if (!firstName) {
        showToast('Please enter your first name.', 'error');
        triggerShake(document.getElementById('signup-firstname').parentElement);
        return;
      }

      if (!lastName) {
        showToast('Please enter your last name.', 'error');
        triggerShake(document.getElementById('signup-lastname').parentElement);
        return;
      }

      if (!email || !validateEmailFormat(email)) {
        showToast('Please enter a valid email address.', 'error');
        triggerShake(document.getElementById('signup-email').parentElement);
        return;
      }

      if (!isEmailVerified) {
        showToast('Please verify your email address with the OTP verification code first.', 'error');
        triggerShake(document.getElementById('btn-verify-email'));
        return;
      }

      if (password.length < 8) {
        showToast('Password must be at least 8 characters long.', 'error');
        triggerShake(document.getElementById('signup-password').parentElement);
        return;
      }

      if (password !== confirmPassword) {
        showToast('Passwords do not match.', 'error');
        triggerShake(document.getElementById('signup-confirm-password').parentElement);
        return;
      }

      if (!termsCheck.checked) {
        showToast('You must agree to the Terms of Service to create an account.', 'error');
        triggerShake(termsCheck.closest('.custom-checkbox'));
        return;
      }

      // Success animation
      submitBtn.classList.add('loading');
      setTimeout(() => {
        submitBtn.classList.remove('loading');
        const fullName = middleName ? `${firstName} ${middleName} ${lastName}` : `${firstName} ${lastName}`;
        showToast(`Account created successfully for ${fullName}!`, 'success');

        // Store mock session & prompt to launch
        setTimeout(() => {
          showAuthSuccessDialog(firstName, 'Sign Up');
        }, 800);
      }, 1400);
    });
  }
}

/* ===================================================
   Forgot Password Modal
   =================================================== */
function initForgotPasswordModal() {
  const modal = document.getElementById('forgot-modal');
  const trigger = document.getElementById('btn-forgot-password');
  const closeBtn = document.getElementById('btn-close-forgot');
  const sendBtn = document.getElementById('btn-send-reset');
  const resetEmail = document.getElementById('reset-email');

  if (!modal || !trigger) return;

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    modal.classList.add('open');
    if (resetEmail) {
      resetEmail.value = '';
      setTimeout(() => resetEmail.focus(), 150);
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => modal.classList.remove('open'));
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      const email = resetEmail.value.trim();
      if (!email || !validateEmailFormat(email)) {
        showToast('Please enter a valid account email.', 'error');
        triggerShake(resetEmail.parentElement);
        return;
      }

      showToast(`Password reset link sent to ${email} (Simulation Mode).`, 'success');
      modal.classList.remove('open');
    });
  }
}

/* ===================================================
   Auth Success Transition Dialog
   =================================================== */
function showAuthSuccessDialog(userName, type) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.style.zIndex = '99999';
  modal.innerHTML = `
    <div class="otp-card" style="border-color: var(--neon-green); box-shadow: 0 0 40px rgba(0, 255, 136, 0.3);">
      <div class="otp-icon-wrap" style="border-color: var(--neon-green); color: var(--neon-green); background: rgba(0, 255, 136, 0.1);">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      </div>
      <h3 class="otp-title" style="color: #fff;">${type === 'Sign Up' ? 'Account Created!' : 'Access Granted!'}</h3>
      <p class="otp-subtitle" style="margin-bottom: 24px;">
        Welcome to <strong>AirRunner</strong>, <span style="color: var(--accent-cyan);">${userName}</span>. Your neural session is now authenticated.
      </p>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <a href="frontbasic.html" class="cyber-submit-btn" style="text-decoration: none;">
          Launch AirRunner Core
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </a>
        <button id="btn-stay-here" class="cyber-submit-btn" style="background: rgba(255, 255, 255, 0.08); box-shadow: none; border: 1px solid rgba(255, 255, 255, 0.15);">
          Stay on Auth Portal
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#btn-stay-here').addEventListener('click', () => {
    modal.remove();
  });
}

/* ===================================================
   Helpers: Toasts, Shakes, Regex
   =================================================== */
function showToast(message, type = 'info', duration = 5000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconSvg = {
    success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
    error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
    info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
  }[type];

  const titles = {
    success: 'System Verified',
    error: 'Security Alert',
    info: 'System Dispatch'
  }[type];

  toast.innerHTML = `
    <div class="toast-icon">${iconSvg}</div>
    <div class="toast-content">
      <div class="toast-title">${titles}</div>
      <div class="toast-msg">${message}</div>
    </div>
    <button class="toast-dismiss">&times;</button>
  `;

  container.appendChild(toast);

  toast.querySelector('.toast-dismiss').addEventListener('click', () => {
    removeToast(toast);
  });

  setTimeout(() => {
    removeToast(toast);
  }, duration);
}

function removeToast(toast) {
  toast.style.opacity = '0';
  toast.style.transform = 'translateX(100%)';
  setTimeout(() => toast.remove(), 300);
}

function triggerShake(element) {
  if (!element) return;
  element.classList.remove('shake');
  void element.offsetWidth; // force reflow
  element.classList.add('shake');
}

function validateEmailFormat(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
