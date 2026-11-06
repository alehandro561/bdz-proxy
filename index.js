const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/api/bdz', async (req, res) => {
  try {
    const response = await axios.get('https://live.bdz.bg/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Грешка при връзката с БДЖ', details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy сървърът работи на порт ${PORT}`));