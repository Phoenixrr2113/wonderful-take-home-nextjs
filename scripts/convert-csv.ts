import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const csvPath = join(__dirname, "..", "airport-data.csv");
const jsonPath = join(__dirname, "..", "src", "data", "airports.json");

const raw = readFileSync(csvPath, "utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const lines = raw.trim().split("\n");

// Skip header: ID,Airport Name,City,Country,IATA/FAA,ICAO,Latitude,Longitude,Altitude,Timezone
const airports = [];

for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  if (row.length < 10) continue;

  airports.push({
    id: parseInt(row[0], 10),
    name: row[1],
    city: row[2],
    country: row[3],
    iata: row[4] !== "" && row[4] !== "\\N" ? row[4] : null,
    icao: row[5] !== "" && row[5] !== "\\N" ? row[5] : null,
    latitude: parseFloat(row[6]),
    longitude: parseFloat(row[7]),
    altitude: parseInt(row[8], 10),
    timezone: row[9],
  });
}

writeFileSync(jsonPath, JSON.stringify(airports));
console.log(`Converted ${airports.length} airports to ${jsonPath}`);

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}
