const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

// Настройки за поддържане на отворени връзки (keepAlive) за по-бърза мрежова работа
const httpAgent = new (require('http').Agent)({ keepAlive: true });
const httpsAgent = new (require('https').Agent)({ keepAlive: true });

const axiosInstance = axios.create({
  timeout: 6000,
  httpAgent,
  httpsAgent,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});

// Помощна функция за пресмятане на времето със закъснение (HH:MM + минути)
function addMinutesToTime(timeStr, minutesToAdd) {
  if (!timeStr || !timeStr.includes(':')) return timeStr;
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return timeStr;

  const date = new Date();
  date.setHours(hours, minutes + minutesToAdd, 0);

  const newH = String(date.getHours()).padStart(2, '0');
  const newM = String(date.getMinutes()).padStart(2, '0');
  return `${newH}:${newM}`;
}

// Начален маршрут за проверка
app.get('/', (req, res) => {
  res.send('BDZ Fast Proxy с маршрути, закъснения и търсене работи успешно!');
});

// 1. Съществуващ маршрут за табло на станция (пристигащи / заминаващи с маршрути и закъснения)
app.get('/api/bdz/:station/:type', async (req, res) => {
  const { station, type } = req.params;
  const targetUrl = `https://live.bdz.bg/bg/${station}/${type}`;

  try {
    const response = await axiosInstance.get(targetUrl);
    const $ = cheerio.load(response.data);
    const items = $('.timetableItem').toArray();

    // Паралелна обработка на всички влакове едновременно с Promise.all за максимална бързина
    const trainPromises = items.map(async (el) => {
      const trainName = $(el).find('[data-toggle="tooltip"]').text().trim();
      const stationName = $(el).find('.text-uppercase strong').text().trim();
      const scheduledTime = $(el).find('.col-3.col-lg-2').text().replace(/\s+/g, ' ').trim();
      const delay = parseInt($(el).attr('data-delay') || '0', 10);
      const trainNumber = $(el).attr('data-train') || '';

      if (!trainName) return null;

      let route = [];
      if (trainNumber) {
        try {
          const routeUrl = `https://live.bdz.bg/bg/train/${trainNumber}`;
          const routeRes = await axiosInstance.get(routeUrl);
          const $route = cheerio.load(routeRes.data);

          $route('.table tbody tr, .timetableItem').each((_, row) => {
            const stopStation = $route(row).find('.station-name, strong, .col-6').first().text().trim();
            const arrival = $route(row).find('.arrival-time, .col-3').first().text().trim();
            const departure = $route(row).find('.departure-time, .col-3').last().text().trim();

            if (stopStation) {
              const arrTime = arrival || scheduledTime;
              const depTime = departure || scheduledTime;
              route.push({
                station: stopStation,
                scheduledArrival: arrTime,
                actualArrival: addMinutesToTime(arrTime, delay),
                scheduledDeparture: depTime,
                actualDeparture: addMinutesToTime(depTime, delay)
              });
            }
          });
        } catch (e) {
          // Ако отделна заявка за маршрут се забави или върне грешка, продължаваме напред
        }
      }

      return {
        trainNumber,
        train: trainName,
        station: stationName,
        scheduledTime,
        actualTime: addMinutesToTime(scheduledTime, delay),
        delayMinutes: delay,
        route
      };
    });

    const results = await Promise.all(trainPromises);
    const trains = results.filter(Boolean);

    res.json({
      station,
      type,
      count: trains.length,
      trains
    });

  } catch (error) {
    res.status(500).json({
      error: 'Грешка при извличане на данните',
      details: error.message
    });
  }
});

// 2. Нов маршрут: Търсене на връзки между две гари
// Пример: /api/bdz-search?from=vraca&to=sofia&date=2026-11-06
app.get('/api/bdz-search', async (req, res) => {
  const { from, to, date } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'Моля, посочете начална (from) и крайна (to) гара.' });
  }

  const searchUrl = `https://razpisanie.bdz.bg/bg/${from}/${to}`;

  try {
    const response = await axiosInstance.get(searchUrl, {
      params: { date: date || '' }
    });

    const $ = cheerio.load(response.data);
    const connections = [];

    $('.schedule-row, .timetableItem, tr').each((_, el) => {
      const trainName = $(el).find('.train-type, .col-6').first().text().trim();
      const depTime = $(el).find('.departure-time, .col-3').first().text().trim();
      const arrTime = $(el).find('.arrival-time, .col-3').last().text().trim();
      const duration = $(el).find('.duration').text().trim();

      if (depTime && arrTime) {
        connections.push({
          train: trainName || 'Влак',
          departureStation: from,
          departureTime: depTime,
          arrivalStation: to,
          arrivalTime: arrTime,
          duration: duration || 'Н/Д'
        });
      }
    });

    res.json({
      from,
      to,
      date: date || 'Днес',
      count: connections.length,
      results: connections
    });

  } catch (error) {
    res.status(500).json({
      error: 'Грешка при търсене на маршрута',
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy сървърът работи на порт ${PORT}`));