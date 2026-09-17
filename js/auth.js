import { api, getSession, saveSession } from './session.js';

// Already signed in: redirect directly to the pilot portal
if (getSession()) {
  window.location.replace('portal.html');
}

// DOM Elements
const banner = document.getElementById('status-banner');

// Cards
const signinCard = document.getElementById('signin-card');
const signupCard = document.getElementById('signup-card');
const forgotCard = document.getElementById('forgot-card');

// Forms
const signinForm = document.getElementById('signin-form');
const signupStep1Form = document.getElementById('signup-form-step1');
const signupStep2Form = document.getElementById('signup-form-step2');
const signupStep3Form = document.getElementById('signup-form-step3');
const forgotStep1Form = document.getElementById('forgot-form-step1');
const forgotStep2Form = document.getElementById('forgot-form-step2');

// View navigation triggers
const toSignupBtn = document.getElementById('to-signup-btn');
const toSigninBtn = document.getElementById('to-signin-btn');
const toForgotLink = document.getElementById('to-forgot-link');
const backToSigninBtn = document.getElementById('back-to-signin-btn');
const backStep1Btn = document.getElementById('btn-back-step1');

// Signup Stepper Elements
const stepIndicator1 = document.getElementById('step-indicator-1');
const stepIndicator2 = document.getElementById('step-indicator-2');
const stepIndicator3 = document.getElementById('step-indicator-3');
const stepLine1 = document.getElementById('step-line-1');
const stepLine2 = document.getElementById('step-line-2');
const signupStep1Pane = document.getElementById('signup-step-1');
const signupStep2Pane = document.getElementById('signup-step-2');
const signupStep3Pane = document.getElementById('signup-step-3');

// Signup State
const signupState = {
  pilotName: '',
  gamerId: '',
  email: '',
  otp: '',
  timerInterval: null
};

// Forgot Password State
const forgotState = {
  identifier: '',
  otp: ''
};

// ---------------------------------------------------------
// Helper: Show notifications
// ---------------------------------------------------------
function showBanner(message, type = 'error') {
  banner.textContent = message;
  banner.className = `status-banner ${type}`;
  banner.style.display = 'flex';
  banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideBanner() {
  banner.style.display = 'none';
  banner.textContent = '';
}

// ---------------------------------------------------------
// Navigation between main views: 'signin' | 'signup' | 'forgot'
// ---------------------------------------------------------
function showView(viewName) {
  hideBanner();
  signinCard.style.display = 'none';
  signupCard.style.display = 'none';
  forgotCard.style.display = 'none';

  if (viewName === 'signin') {
    signinCard.style.display = 'block';
    const idInput = document.getElementById('loginGamerId');
    if (idInput) idInput.focus();
  } else if (viewName === 'signup') {
    signupCard.style.display = 'block';
    setSignupStep(1);
    const nameInput = document.getElementById('signupPilotName');
    if (nameInput) nameInput.focus();
  } else if (viewName === 'forgot') {
    forgotCard.style.display = 'block';
    document.getElementById('forgot-step-1').style.display = 'block';
    document.getElementById('forgot-step-2').style.display = 'none';
    const forgotInput = document.getElementById('forgotIdentifier');
    if (forgotInput) {
      forgotInput.value = '';
      forgotInput.focus();
    }
  }
}

// ---------------------------------------------------------
// Signup Multi-Step Wizard Handlers
// ---------------------------------------------------------
function setSignupStep(step) {
  hideBanner();
  signupStep1Pane.style.display = 'none';
  signupStep2Pane.style.display = 'none';
  signupStep3Pane.style.display = 'none';

  stepIndicator1.className = 'step-item';
  stepIndicator2.className = 'step-item';
  stepIndicator3.className = 'step-item';
  stepLine1.className = 'step-line';
  stepLine2.className = 'step-line';

  if (step === 1) {
    signupStep1Pane.style.display = 'block';
    stepIndicator1.className = 'step-item active';
  } else if (step === 2) {
    signupStep2Pane.style.display = 'block';
    stepIndicator1.className = 'step-item completed';
    stepLine1.className = 'step-line completed';
    stepIndicator2.className = 'step-item active';
    const otpInput = document.getElementById('signupOtpCode');
    if (otpInput) {
      otpInput.value = '';
      otpInput.focus();
    }
  } else if (step === 3) {
    signupStep3Pane.style.display = 'block';
    stepIndicator1.className = 'step-item completed';
    stepLine1.className = 'step-line completed';
    stepIndicator2.className = 'step-item completed';
    stepLine2.className = 'step-line completed';
    stepIndicator3.className = 'step-item active';
    const pwdInput = document.getElementById('signupPassword');
    if (pwdInput) pwdInput.focus();
  }
}

function startOtpTimer(duration = 60) {
  clearInterval(signupState.timerInterval);
  const timerText = document.getElementById('signup-timer-text');
  const timerSpan = document.getElementById('signup-timer');
  const resendBtn = document.getElementById('btn-resend-signup-otp');

  let remaining = duration;
  timerText.style.display = 'inline';
  resendBtn.style.display = 'none';
  timerSpan.textContent = `${remaining}s`;

  signupState.timerInterval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(signupState.timerInterval);
      timerText.style.display = 'none';
      resendBtn.style.display = 'inline';
    } else {
      timerSpan.textContent = `${remaining}s`;
    }
  }, 1000);
}

// ---------------------------------------------------------
// View Switching Triggers
// ---------------------------------------------------------
toSignupBtn?.addEventListener('click', () => showView('signup'));
toSigninBtn?.addEventListener('click', () => showView('signin'));
toForgotLink?.addEventListener('click', (e) => {
  e.preventDefault();
  showView('forgot');
});
backToSigninBtn?.addEventListener('click', () => showView('signin'));
backStep1Btn?.addEventListener('click', () => setSignupStep(1));

// Password Visibility Toggles
document.querySelectorAll('.btn-toggle-eye').forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetId = btn.getAttribute('data-target');
    const input = document.getElementById(targetId);
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = '🔒';
    } else {
      input.type = 'password';
      btn.textContent = '👁️';
    }
  });
});

// =========================================================
// 1. SIGN IN SUBMISSION
// =========================================================
signinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideBanner();

  const gamerIdInput = document.getElementById('loginGamerId');
  const passwordInput = document.getElementById('loginPassword');
  const submitBtn = document.getElementById('btn-signin-submit');

  const gamerId = gamerIdInput.value.trim();
  const password = passwordInput.value;

  if (!gamerId || !password) {
    showBanner('Please enter both your Gamer ID and password.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.firstElementChild.textContent = 'Verifying credentials...';

  try {
    const session = await api('/auth/login', {
      method: 'POST',
      body: { gamerId, password }
    });
    saveSession(session);
    showBanner('Authentication successful! Launching cockpit...', 'success');
    window.location.href = 'portal.html';
  } catch (err) {
    showBanner(err.message || 'Invalid Gamer ID or password.');
    passwordInput.value = '';
    passwordInput.focus();
  } finally {
    submitBtn.disabled = false;
    submitBtn.firstElementChild.textContent = 'Launch Cockpit';
  }
});

// =========================================================
// 2. SIGN UP: STEP 1 (Gamer Info -> Request OTP)
// =========================================================
signupStep1Form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideBanner();

  const pilotName = document.getElementById('signupPilotName').value.trim();
  const gamerId = document.getElementById('signupGamerId').value.trim();
  const email = document.getElementById('signupEmail').value.trim().toLowerCase();
  const submitBtn = document.getElementById('btn-request-signup-otp');

  if (gamerId.length < 3) {
    showBanner('Gamer ID must be at least 3 characters long.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.firstElementChild.textContent = 'Sending Verification Code...';

  try {
    const res = await api('/auth/signup/request-otp', {
      method: 'POST',
      body: { pilotName, gamerId, email }
    });

    signupState.pilotName = pilotName;
    signupState.gamerId = gamerId;
    signupState.email = email;

    document.getElementById('display-signup-email').textContent = email;
    setSignupStep(2);
    startOtpTimer(60);
    showBanner(res.message || `Verification code sent to ${email}`, 'success');
  } catch (err) {
    showBanner(err.message || 'Failed to send verification code.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.firstElementChild.textContent = 'Send Verification Code';
  }
});

// Resend OTP in Step 2
document.getElementById('btn-resend-signup-otp')?.addEventListener('click', async () => {
  hideBanner();
  const resendBtn = document.getElementById('btn-resend-signup-otp');
  resendBtn.disabled = true;
  resendBtn.textContent = 'Sending...';

  try {
    const res = await api('/auth/signup/request-otp', {
      method: 'POST',
      body: {
        pilotName: signupState.pilotName,
        gamerId: signupState.gamerId,
        email: signupState.email
      }
    });
    startOtpTimer(60);
    showBanner(res.message || `New code sent to ${signupState.email}`, 'success');
  } catch (err) {
    showBanner(err.message || 'Failed to resend code.');
    resendBtn.style.display = 'inline';
  } finally {
    resendBtn.disabled = false;
    resendBtn.textContent = 'Resend OTP';
  }
});

// =========================================================
// 2. SIGN UP: STEP 2 (Verify OTP)
// =========================================================
signupStep2Form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideBanner();

  const otpInput = document.getElementById('signupOtpCode');
  const otp = otpInput.value.trim();
  const submitBtn = document.getElementById('btn-verify-signup-otp');

  if (otp.length !== 6 || !/^\d+$/.test(otp)) {
    showBanner('Please enter a valid 6-digit numeric verification code.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.firstElementChild.textContent = 'Verifying...';

  try {
    await api('/auth/signup/verify-otp', {
      method: 'POST',
      body: { email: signupState.email, otp }
    });

    signupState.otp = otp;
    setSignupStep(3);
    showBanner('Email verified! Now choose your password.', 'success');
  } catch (err) {
    showBanner(err.message || 'Invalid or expired verification code.');
    otpInput.focus();
  } finally {
    submitBtn.disabled = false;
    submitBtn.firstElementChild.textContent = 'Verify OTP';
  }
});

// =========================================================
// 2. SIGN UP: STEP 3 (Set Password & Complete Registration)
// =========================================================
signupStep3Form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideBanner();

  const password = document.getElementById('signupPassword').value;
  const confirmPassword = document.getElementById('signupConfirmPassword').value;
  const submitBtn = document.getElementById('btn-complete-signup');

  if (password.length < 8) {
    showBanner('Password must be at least 8 characters long.');
    return;
  }

  if (password !== confirmPassword) {
    showBanner('Passwords do not match. Please re-enter.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.firstElementChild.textContent = 'Creating Pilot Account...';

  try {
    const session = await api('/auth/signup/complete', {
      method: 'POST',
      body: {
        pilotName: signupState.pilotName,
        gamerId: signupState.gamerId,
        email: signupState.email,
        otp: signupState.otp,
        password,
        confirmPassword
      }
    });

    saveSession(session);
    showBanner('Account created! Entering cockpit...', 'success');
    clearInterval(signupState.timerInterval);
    setTimeout(() => {
      window.location.href = 'portal.html';
    }, 400);
  } catch (err) {
    showBanner(err.message || 'Could not complete registration.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.firstElementChild.textContent = 'Complete Registration & Enter Dashboard';
  }
});

// =========================================================
// 3. FORGOT PASSWORD: STEP 1 (Request OTP)
// =========================================================
forgotStep1Form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideBanner();

  const identifier = document.getElementById('forgotIdentifier').value.trim();
  const submitBtn = document.getElementById('btn-forgot-request-otp');

  if (!identifier) {
    showBanner('Please enter your Gamer ID or registered email.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.firstElementChild.textContent = 'Locating account...';

  try {
    const res = await api('/auth/forgot-password/request-otp', {
      method: 'POST',
      body: { identifier }
    });

    // The server never says whether the account exists, or what its email address is
    forgotState.identifier = identifier;
    document.getElementById('display-forgot-target').textContent = 'your registered email';
    document.getElementById('forgot-step-1').style.display = 'none';
    document.getElementById('forgot-step-2').style.display = 'block';
    document.getElementById('forgotOtpCode').focus();
    showBanner(res.message || 'Reset code sent to your email inbox.', 'success');
  } catch (err) {
    showBanner(err.message || 'Account not found.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.firstElementChild.textContent = 'Send Reset Code';
  }
});

// =========================================================
// 3. FORGOT PASSWORD: STEP 2 (Verify OTP & Reset Password)
// =========================================================
forgotStep2Form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideBanner();

  const otp = document.getElementById('forgotOtpCode').value.trim();
  const password = document.getElementById('forgotNewPassword').value;
  const confirmPassword = document.getElementById('forgotConfirmPassword').value;
  const submitBtn = document.getElementById('btn-forgot-submit-reset');

  if (otp.length !== 6) {
    showBanner('Please enter the 6-digit reset code from your email.');
    return;
  }

  if (password.length < 8) {
    showBanner('New password must be at least 8 characters long.');
    return;
  }

  if (password !== confirmPassword) {
    showBanner('Passwords do not match.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.firstElementChild.textContent = 'Resetting password...';

  try {
    const res = await api('/auth/forgot-password/reset', {
      method: 'POST',
      body: {
        identifier: forgotState.identifier,
        otp,
        password,
        confirmPassword
      }
    });

    showBanner(res.message || 'Password reset successfully! Please sign in.', 'success');
    setTimeout(() => {
      showView('signin');
      const idInput = document.getElementById('loginGamerId');
      if (idInput && signupState.gamerId) idInput.value = signupState.gamerId;
    }, 1200);
  } catch (err) {
    showBanner(err.message || 'Failed to reset password.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.firstElementChild.textContent = 'Reset Password & Sign In';
  }
});

// Initialize default view (Sign In)
showView('signin');
