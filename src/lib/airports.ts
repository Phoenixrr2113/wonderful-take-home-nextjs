import type { Airport } from "./types";
import data from "../data/airports.json";

export const airports: Airport[] = data as Airport[];

export const airportById: Map<number, Airport> = new Map(
  airports.map((a) => [a.id, a])
);

export const airportsByCountry: Map<string, Airport[]> = new Map();
for (const airport of airports) {
  const list = airportsByCountry.get(airport.country) ?? [];
  list.push(airport);
  airportsByCountry.set(airport.country, list);
}
