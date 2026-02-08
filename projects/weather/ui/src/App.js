// App.js
import React, { useState } from 'react';
import LocationSelector from './views/LocationSelector';
import WeatherDetails from './views/WeatherDetails';

const App = () => {
  const [selectedLocation, setSelectedLocation] = useState('');
  const [weatherData, setWeatherData] = useState(null);

  const handleLocationSelect = (location) => {
    setSelectedLocation(location);
    import { fetchWeatherData } from './services/WeatherService';

    fetchWeatherData(location)
      .then(data => setWeatherData(data))
      .catch(error => console.error('Failed to fetch weather data:', error));
  };

  return (
    <div>
      <h1>Weather App</h1>
      <LocationSelector onSelect={handleLocationSelect} />
      {weatherData && <WeatherDetails weather={weatherData} />}
    </div>
  );
};

export default App;