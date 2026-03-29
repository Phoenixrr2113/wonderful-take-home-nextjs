export interface Airport {
  id: number;
  name: string;
  city: string;
  country: string;
  iata: string | null;
  icao: string | null;
  latitude: number;
  longitude: number;
  altitude: number;
  timezone: string;
}

export interface AirportWithDistance extends Airport {
  distance: number;
}
