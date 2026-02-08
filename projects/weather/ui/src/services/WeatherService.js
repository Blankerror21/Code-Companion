import axios from 'axios';

const apiKey = process.env.REACT_APP_WEATHER_API_KEY;
const apiUrl = `https://api.openweathermap.org/data/2.5/weather?appid=${apiKey}&q=`;

export const fetchWeatherData = async (location) => {
  try {
    const response = await axios.get(apiUrl + location);
    return response.data;
  } catch (error) {
    console.error('Error fetching weather data:', error);
    throw error;
  }
};