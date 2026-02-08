const express = require('express');
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.get('/', (req, res) => {
  res.send('Hello Express!');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});