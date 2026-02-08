import axios from 'axios';

interface WeatherResponse {
  name: string;
  main: {
    temp: number;
    humidity: number;
    feels_like: number;
  };
  weather: Array<{
    description: string;
    icon: string;
  }>;
  wind: {
    speed: number;
  };
}

interface ForecastResponse {
  list: Array<{
    dt_txt: string;
    main: {
      temp_max: number;
      temp_min: number;
      humidity: number;
    };
    weather: Array<{
      description: string;
      icon: string;
    }>;
  }>;
}

export class WeatherService {
  private apiKey = import.meta.env.VITE_OPENWEATHERMAP_API_KEY || 'your-api-key-here';
  
  constructor() {
    this.setupAxios();
  }

  private setupAxios() {
    axios.defaults.baseURL = 'https://api.openweathermap.org/data/2.5/';
    axios.defaults.headers.common['Content-Type'] = 'application/json';
  }

  async getCurrentWeather(city: string): Promise<WeatherResponse | null> {
    try {
      const response = await axios.get<WeatherResponse>(`weather`, {
        params: {
          q: city,
          appid: this.apiKey,
          units: 'metric',
          lang: 'en'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error fetching current weather:', error);
      throw new Error(`Failed to fetch weather for ${city}`);
    }
  }

  async getForecast(city: string): Promise<ForecastResponse | null> {
    try {
      const response = await axios.get<ForecastResponse>(`forecast`, {
        params: {
          q: city,
          appid: this.apiKey,
          units: 'metric',
          lang: 'en'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error fetching forecast:', error);
      throw new Error(`Failed to fetch forecast for ${city}`);
    }
  }

  private parseWeatherData(data: any): WeatherResponse | null {
    if (!data || !data.main || !data.weather || data.cod !== 200) {
      return null;
    }
    
    const weather: WeatherResponse = {
      name: data.name,
      main: {
        temp: Math.round(data.main.temp),
        humidity: data.main.humidity,
        feels_like: Math.round(data.main.feels_like)
      },
      wind: {
        speed: data.wind.speed
      },
      weather: data.weather.map((w: any) => ({
        description: w.description,
        icon: w.icon
      }))
    };
    
    return weather;
  }

  private parseForecastData(data: any): ForecastResponse | null {
    if (!data || !data.list || data.cod !== '200') {
      return null;
    }
    
    const forecast: ForecastResponse = {
      list: data.list.map((item: any) => ({
        dt_txt: item.dt_txt,
        main: {
          temp_max: Math.round(item.main.temp_max),
          temp_min: Math.round(item.main.temp_min),
          humidity: item.main.humidity
        },
        weather: item.weather.map((w: any) => ({
          description: w.description,
          icon: w.icon
        }))
      }))
    };
    
    return forecast;
  }
}