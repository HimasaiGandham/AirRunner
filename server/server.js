const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
require('dotenv').config();

const User = require('../database/models/User');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey_replace_in_prod';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/airrunner';

app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB Database'))
  .catch(err => console.error('MongoDB connection error:', err));

// Nodemailer Config (Ethereal Fake SMTP for testing)
let transporter;
nodemailer.createTestAccount().then(account => {
  transporter = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: { user: account.user, pass: account.pass }
  });
  console.log('Ethereal Email initialized for local testing.');
}).catch(err => console.error('Failed to create test email account', err));

// Helper: Generate 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'AirRunner backend is running' });
});

// Auth Routes

// 1. SIGNUP
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { pilotName, gamerId, email, password } = req.body;
    
    let user = await User.findOne({ $or: [{ email }, { gamerId }] });
    if (user) {
      return res.status(400).json({ error: 'User with this email or Gamer ID already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60000); // 10 mins

    user = new User({
      pilotName,
      gamerId,
      email,
      passwordHash,
      otp,
      otpExpiresAt
    });

    await user.save();

    // Send OTP via email
    if (transporter) {
      let info = await transporter.sendMail({
        from: '"AirRunner Game Portal" <no-reply@airrunner.net>',
        to: email,
        subject: 'Your AirRunner Verification OTP',
        text: `Welcome, ${pilotName}! Your OTP is: ${otp}`,
        html: `<b>Welcome, ${pilotName}!</b><br>Your OTP is: <b>${otp}</b>`
      });
      console.log('OTP Email sent! Preview URL: %s', nodemailer.getTestMessageUrl(info));
    }

    res.json({ message: 'Signup successful. Please check your email for the OTP.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error during signup.' });
  }
});

// 2. LOGIN
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid credentials.' });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials.' });

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiresAt = new Date(Date.now() + 10 * 60000);
    user.isVerified = false; // Require OTP every login based on requirements
    await user.save();

    if (transporter) {
      let info = await transporter.sendMail({
        from: '"AirRunner Game Portal" <no-reply@airrunner.net>',
        to: email,
        subject: 'Your AirRunner Login OTP',
        text: `Your login OTP is: ${otp}`,
        html: `Your login OTP is: <b>${otp}</b>`
      });
      console.log('OTP Email sent! Preview URL: %s', nodemailer.getTestMessageUrl(info));
    }

    res.json({ message: 'OTP sent to your email.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// 3. VERIFY OTP
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'User not found.' });

    if (user.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP.' });
    }

    if (user.otpExpiresAt < new Date()) {
      return res.status(400).json({ error: 'OTP has expired.' });
    }

    // OTP Valid
    user.isVerified = true;
    user.otp = null;
    user.otpExpiresAt = null;
    await user.save();

    const token = jwt.sign({ id: user._id, gamerId: user.gamerId }, JWT_SECRET, { expiresIn: '1h' });
    
    res.json({ message: 'Verification successful', token, pilotName: user.pilotName, gamerId: user.gamerId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error during OTP verification.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
