const axios = require('axios');
const WeatherService = require('../services/weather_service');

jest.mock('axios');

describe('WeatherService', () => {
  test('fetches weather data successfully', async () => {
    const mockData = { main: { temp: 20 } };
    axios.get.mockResolvedValue({ data: mockData });

    const result = await WeatherService.fetchWeather('London');
    expect(axios.get).toHaveBeenCalledWith(expect.stringMatching(/London/));
    expect(result).toEqual(mockData);
  });

  test('handles API errors', async () => {
    axios.get.mockRejectedValue(new Error('API error'));

    try {
      await WeatherService.fetchWeather('London');
    } catch (error) {
      expect(error.message).toBe('API error');
    }
  });
});