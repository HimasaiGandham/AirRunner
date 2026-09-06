document.addEventListener('DOMContentLoaded', () => {
  let isLoginMode = false;
  
  const authTitle = document.getElementById('auth-title');
  const authForm = document.getElementById('auth-form');
  const submitBtn = document.getElementById('submit-btn');
  const toggleLink = document.getElementById('toggle-link');
  const toggleText = document.getElementById('toggle-text');
  
  // Fields that are hidden in Login mode
  const groupName = document.getElementById('group-name');
  const groupGamerId = document.getElementById('group-gamerId');
  
  // OTP Modal Elements
  const otpModal = document.getElementById('otp-modal');
  const otpForm = document.getElementById('otp-form');
  const otpError = document.getElementById('otp-error');
  
  let currentEmail = '';

  const API_URL = 'http://localhost:3000/api/auth'; // Ensure backend is running here

  // Toggle Mode (Signup vs Sign In)
  toggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    
    if (isLoginMode) {
      // Switch to Login
      authTitle.innerHTML = 'Sign In <span class="highlight">to continue your journey</span>';
      submitBtn.innerText = 'Sign In';
      toggleText.innerHTML = 'New here? <a href="#" id="toggle-link">Sign Up</a>';
      
      groupName.style.display = 'none';
      groupGamerId.style.display = 'none';
      
      document.getElementById('pilotName').required = false;
      document.getElementById('gamerId').required = false;
    } else {
      // Switch to Signup
      authTitle.innerHTML = 'Sign Up <span class="highlight">to unleash the gamer within you!</span>';
      submitBtn.innerText = 'Sign Up';
      toggleText.innerHTML = 'Already have an account? <a href="#" id="toggle-link">Sign In</a>';
      
      groupName.style.display = 'block';
      groupGamerId.style.display = 'block';
      
      document.getElementById('pilotName').required = true;
      document.getElementById('gamerId').required = true;
    }
    
    // Reattach listener to the newly created toggle link
    document.getElementById('toggle-link').addEventListener('click', arguments.callee);
  });

  // Handle Auth Submit
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    currentEmail = email; // Store for OTP step

    const payload = { email, password };
    
    if (!isLoginMode) {
      payload.pilotName = document.getElementById('pilotName').value;
      payload.gamerId = document.getElementById('gamerId').value;
    }

    try {
      const endpoint = isLoginMode ? '/login' : '/signup';
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        alert(data.error || 'Authentication failed');
        return;
      }
      
      // Success! Show OTP Modal
      console.log(data.message);
      otpModal.classList.add('active');
      
    } catch (error) {
      console.error('Error during auth:', error);
      alert('Cannot connect to the server. Is it running?');
    }
  });

  // Handle OTP Submit
  otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const otp = document.getElementById('otp-code').value;
    
    try {
      const res = await fetch(`${API_URL}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentEmail, otp })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        otpError.innerText = data.error || 'Invalid OTP';
        return;
      }
      
      // Verification Successful!
      otpError.innerText = '';
      
      // Save Token and user data
      localStorage.setItem('airrunner_token', data.token);
      localStorage.setItem('airrunner_pilotName', data.pilotName);
      localStorage.setItem('airrunner_gamerId', data.gamerId);
      
      // Redirect to Game Portal
      window.location.href = 'portal.html';
      
    } catch (error) {
      console.error('Error during OTP verification:', error);
      otpError.innerText = 'Cannot connect to server to verify OTP.';
    }
  });
});
