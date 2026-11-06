const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

// Прокси маршрут: /api/bdz/:station/:type (напр. /api/bdz/vraca/arrivals)
app.get('/api/bdz/:station/:type', async (req, res) => {
  const { station, type } = req.params; // station: vraca, sofia... type: arrivals, departures
  
  const targetUrl = `https://live.bdz.bg/bg/${station}/${type}`;

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const trains = [];

    $('.timetableItem').each((i, el) => {
      const trainName = $(el).find('[data-toggle="tooltip"]').text().trim();
      const stationName = $(el).find('.text-uppercase strong').text().trim();
      const time = $(el).find('.col-3.col-lg-2').text().replace(/\s+/g, ' ').trim();
      const delay = $(el).attr('data-delay') || '0';

      if (trainName) {
        trains.push({
          train: trainName,
          station: stationName,
          time: time,
          delayMinutes: parseInt(delay, 10)
        });
      }
    });

    res.json({
      station: station,
      type: type,
      count: trains.length,
      trains: trains
    });

  } catch (error) {
    res.status(500).json({ error: 'Грешка при извличане на данните от БДЖ', details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy сървърът работи на порт ${PORT}`));