import React from 'react';
import { render } from '@testing-library/react';
import WeatherDetails from '../views/WeatherDetails';

jest.mock('../services/WeatherService');

const mockFetchWeather = jest.fn();
jest.mock('../services/WeatherService', () => {
  return {
    fetchWeather: mockFetchWeather,
  };
});

describe('WeatherDetails', () => {
  test('renders without weather data', () => {
    const { queryByText } = render(<WeatherDetails />);
    expect(queryByText(/temperature/i)).not.toBeInTheDocument();
  });

  test('renders temperature with weather data', async () => {
    mockFetchWeather.mockResolvedValue({ main: { temp: 20 } });

    const { getByText, rerender } = render(<WeatherDetails />);
    rerender(<WeatherDetails weather={{ main: { temp: 20 } }} />);

    expect(getByText(/temperature/i)).toBeInTheDocument();
    expect(getByText(/20/i)).toBeInTheDocument();
  });
});