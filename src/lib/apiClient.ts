// API Client untuk backend isensair
// Base URL: https://isensair-backend.onrender.com

const API_BASE = "https://isensair-backend.onrender.com";

// perform fetch with simple retry/backoff to handle sleeping API
async function fetchWithRetry(input: RequestInfo, init?: RequestInit, retries = 5, backoff = 1000): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(input, init);
      if (!res.ok && [502, 503, 504].includes(res.status) && attempt < retries) {
        // server not ready yet, fallthrough to retry
      } else {
        return res;
      }
    } catch (err) {
      if (attempt >= retries) throw err;
    }
    attempt++;
    await new Promise((r) => setTimeout(r, backoff * attempt));
  }
}

// cache internal untuk daftar lokasi yang didukung
let cachedLocations: string[] | null = null;

/**
 * Ambil daftar lokasi yang didukung dari backend
 * Endpoint root: GET / -> { status: "ok", locations: ["semantan", "kechau"] }
 */
export async function fetchSupportedLocations(): Promise<string[]> {
  if (cachedLocations) return cachedLocations;
  const url = `${API_BASE}/`;
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch supported locations: ${res.status}`);
  }
  const json = await res.json();
  const locs: string[] = json.locations || [];
  cachedLocations = locs.map((l) => l.toLowerCase());
  return cachedLocations;
}

/**
 * Validasi lokasi, pastikan sudah didukung oleh backend.
 * akan fetch daftar kalau belum ada.
 */
export async function validateLocation(location: string) {
  if (!location) {
    throw new Error("Location parameter is required");
  }
  const norm = location.toLowerCase();
  const locs = await fetchSupportedLocations();
  if (!locs.includes(norm)) {
    throw new Error(`Unsupported location: ${location}`);
  }
}

export interface SensorRecord {
  [key: string]: any;
  timestamp?: string;
  device_id?: string;
}

/**
 * Response type untuk /latest endpoint
 */
export interface LatestResponse {
  location: string;
  file: string;
  latest: SensorRecord;
}

/**
 * Response type untuk /by-date-range endpoint
 */
export interface DateRangeResponse {
  location: string;
  start: string;
  end: string;
  files_used: string[];
  total_rows: number;
  data: SensorRecord[];
}

/**
 * Fetch latest sensor data dari lokasi tertentu
 * Endpoint: GET /latest?location={location}
 * Returns: LatestResponse dengan single sensor record di property 'latest'
 * Fields will be normalized: timestamp -> Timestamp
 */
export async function fetchLatestData(location: string): Promise<SensorRecord | null> {
  try {
    await validateLocation(location);

    const url = new URL(`${API_BASE}/latest`);
    url.searchParams.append("location", location);

    console.log("Fetching latest data from:", url.toString());

    const response = await fetchWithRetry(url.toString());
    
    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 404) {
        // no latest data
        return null;
      }
      console.error(`API Error ${response.status}:`, errorText);
      throw new Error(`Failed to fetch latest data: ${response.status} - ${errorText}`);
    }
    
    const data: LatestResponse = await response.json();
    const record = data.latest || null;
    
    // Normalize field names: timestamp -> Timestamp
    if (record) {
      if (record.timestamp && !record.Timestamp) {
        record.Timestamp = record.timestamp;
      }
    }
    
    return record;
  } catch (error: any) {
    if (error.message && error.message.includes("Unsupported location")) {
      // let caller handle
    } else {
      console.error("Error fetching latest data:", error);
    }
    throw error;
  }
}

/**
 * Fetch sensor data dalam range tanggal
 * Endpoint: GET /by-date-range?location={location}&start={start}&end={end}
 * Date format: YYYY-MM-DD
 * Returns: DateRangeResponse dengan array sensor records di property 'data'
 * Fields will be normalized: timestamp -> Timestamp
 */
export async function fetchDataByDateRange(
  location: string,
  startDate: string,
  endDate: string
): Promise<SensorRecord[]> {
  try {
    await validateLocation(location);

    const url = new URL(`${API_BASE}/by-date-range`);
    url.searchParams.append("location", location);
    url.searchParams.append("start", startDate);
    url.searchParams.append("end", endDate);

    console.log("Fetching data from:", url.toString());

    const response = await fetchWithRetry(url.toString());
    
    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 404) {
        // empty range -> return []
        return [];
      }
      console.error(`API Error ${response.status}:`, errorText);
      throw new Error(`Failed to fetch data by date range: ${response.status} - ${errorText}`);
    }
    
    const data: DateRangeResponse = await response.json();
    const records = data.data || [];
    
    // Normalize field names: timestamp -> Timestamp for all records
    records.forEach((record) => {
      if (record.timestamp && !record.Timestamp) {
        record.Timestamp = record.timestamp;
      }
    });
    
    console.log(`Fetched ${records.length} records from backend`);
    return records;
  } catch (error: any) {
    if (error.message && error.message.includes("Unsupported location")) {
      // caller already handles
    } else {
      console.error("Error fetching data by date range:", error);
    }
    throw error;
  }
}
