const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Basic health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'AirRunner backend is running' });
});

// Placeholder route for Gemini AI Coach proxy
app.post('/api/ai-coach', (req, res) => {
  // In a real implementation, this would call the Gemini API
  // hiding the API key from the frontend
  const { performanceData } = req.body;
  res.json({ feedback: 'Good run! Keep your hand steady.', data: performanceData });
});

// Placeholder route for highscores
app.get('/api/highscores', (req, res) => {
  res.json([
    { name: 'Maverick', score: 9500 },
    { name: 'Goose', score: 8200 }
  ]);
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
