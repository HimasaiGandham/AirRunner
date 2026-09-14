import { api, getSession, saveSession } from './session.js';

// Already signed in: go straight to the portal
if (getSession()) window.location.replace('portal.html');

const MODES = {
  signup: {
    title: 'Sign Up <span class="highlight">to unleash the gamer within you!</span>',
    button: 'Sign Up',
    prompt: 'Already have an account?',
    link: 'Sign In',
    endpoint: '/auth/signup'
  },
  login: {
    title: 'Sign In <span class="highlight">to continue your journey</span>',
    button: 'Sign In',
    prompt: 'New here?',
    link: 'Sign Up',
    endpoint: '/auth/login'
  }
};

const $ = (id) => document.getElementById(id);
const signupOnlyInputs = [$('pilotName'), $('gamerId')];
const passwordInput = $('password');
const submitBtn = $('submit-btn');
const errorMsg = $('auth-error');
let mode = 'signup';

function render() {
  const m = MODES[mode];
  const isLogin = mode === 'login';

  $('auth-title').innerHTML = m.title;
  submitBtn.textContent = m.button;
  $('toggle-prompt').textContent = m.prompt;
  $('toggle-link').textContent = m.link;

  for (const input of signupOnlyInputs) {
    input.disabled = isLogin; // disabled fields are skipped by form validation
    input.closest('.input-group').hidden = isLogin;
  }
  passwordInput.minLength = isLogin ? 0 : 8;
  passwordInput.autocomplete = isLogin ? 'current-password' : 'new-password';
  errorMsg.textContent = '';
}

$('toggle-link').addEventListener('click', (e) => {
  e.preventDefault();
  mode = mode === 'signup' ? 'login' : 'signup';
  render();
});

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = { email: $('email').value, password: passwordInput.value };
  if (mode === 'signup') {
    body.pilotName = $('pilotName').value;
    body.gamerId = $('gamerId').value;
  }

  submitBtn.disabled = true;
  errorMsg.textContent = '';
  try {
    saveSession(await api(MODES[mode].endpoint, { method: 'POST', body }));
    window.location.href = 'portal.html';
  } catch (err) {
    errorMsg.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
  }
});

render();
