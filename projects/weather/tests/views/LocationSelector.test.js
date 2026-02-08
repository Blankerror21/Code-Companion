import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import LocationSelector from '../views/LocationSelector';

jest.mock('../services/WeatherService');

const mockFetchWeather = jest.fn();
jest.mock('../services/WeatherService', () => {
  return {
    fetchWeather: mockFetchWeather,
  };
});

describe('LocationSelector', () => {
  test('renders location input field', () => {
    const { getByLabelText } = render(<LocationSelector />);
    expect(getByLabelText(/location/i)).toBeInTheDocument();
  });

  test('calls fetchWeather on form submission', async () => {
    mockFetchWeather.mockResolvedValue({ main: { temp: 20 } });

    const { getByLabelText, getByText } = render(<LocationSelector />);
    fireEvent.change(getByLabelText(/location/i), { target: { value: 'London' } });
    fireEvent.click(getByText(/submit/i));

    expect(mockFetchWeather).toHaveBeenCalledWith('London');
  });
});