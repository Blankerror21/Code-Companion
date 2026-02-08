const express = require('express');
const cors = require('cors');

const app = express();
cors(app);

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});