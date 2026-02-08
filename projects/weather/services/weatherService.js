const axios = require('axios');

class WeatherService {
  async getCurrentWeather(city) {
    const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=YOUR_API_KEY&units=metric`);
    return response.data;
  }

  async getForecast(city, days) {
    const response = await axios.get(`https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=YOUR_API_KEY&units=metric&cnt=${days}`);
    return response.data;
  }
}

module.exports = new WeatherService();