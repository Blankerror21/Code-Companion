import React, { useState } from 'react';
import WeatherService from './WeatherService';

const WeatherSearch: React.FC = () => {
  const [city, setCity] = useState('');
  const [weatherData, setWeatherData] = useState(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await WeatherService.getWeather(city);
      setWeatherData(data);
      setError(null);
    } catch (err) {
      setError('Error fetching weather data');
    }
  };

  return (
    <div className='weather-search'>
      <h2>Search for Weather</h2>
      <form onSubmit={handleSearch}>
        <input
          type='text'
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder='Enter city name'
        />
        <button type='submit'>Search</button>
      </form>
      {error && <p className='error'>{error}</p>}
      {weatherData && (
        <div>
          <h3>{weatherData.name} Weather</h3>
          <p>Temperature: {(weatherData.main.temp - 273.15).toFixed(2)} °C</p>
          <p>Weather: {weatherData.weather[0].description}</p>
        </div>
      )}
    </div>
  );
};

export default WeatherSearch;