// WeatherDetails.js
import React from 'react';

const WeatherDetails = ({ weather }) => {
  if (!weather) return <div>No weather data available</div>;

  return (
    <div>
      <h2>{weather.location}</h2>
      <p>Temperature: {weather.temperature}°C</p>
      <p>Condition: {weather.condition}</p>
    </div>
  );
};

export default WeatherDetails;