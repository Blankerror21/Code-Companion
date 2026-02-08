const express = require('express');

const app = express();

// Middleware for JSON parsing, CORS, and serving static files
app.use(express.json());
app.use(cors());
app.use(express.static('public')); // Assuming a public directory is created with static files

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});