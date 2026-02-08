import React, { useState } from 'react';
import weatherService from '../services/weatherApi';

interface WeatherData {
  name: string;
  main: {
    temp: number;
    humidity: number;
  };
  weather: [{ description: string }];
}

class Weather extends React.Component<{}, { city: string; weather: WeatherData | null; error: string | null }> {
  constructor(props: {}) {
    super(props);
    this.state = {
      city: '',
      weather: null,
      error: null,
    };
  }

  handleCityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ city: e.target.value });
  };

  fetchWeather = async () => {
    try {
      const weatherData = await weatherService.getWeather(this.state.city);
      this.setState({ weather: weatherData, error: null });
    } catch (err) {
      this.setState({ error: 'Error fetching weather data' });
    }
  };

  render() {
    const { city, weather, error } = this.state;

    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <input
          type="text"
          placeholder="Enter city name"
          value={city}
          onChange={this.handleCityChange}
          className="border-2 border-gray-300 p-2 mb-4 rounded"
        />
        <button
          onClick={this.fetchWeather}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Get Weather
        </button>
        {error && <p className="text-red-500 mt-4">{error}</p>}
        {weather && (
          <div className="mt-4">
            <h2 className="text-xl font-bold">Weather in {weather.name}</h2>
            <p>Temperature: {weather.main.temp} °C</p>
            <p>Humidity: {weather.main.humidity}%</p>
            <p>Description: {weather.weather[0].description}</p>
          </div>
        )}
      </div>
    );
  }
}

export default Weather;