import axios from 'axios';

const WeatherService = {
  async getWeather(city: string) {
    const apiKey = process.env.REACT_APP_WEATHER_API_KEY;
    if (!apiKey) {
      throw new Error('API key not found in environment variables');
    }

    const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}`);
    return response.data;
  },
};

export default WeatherService;