export interface DataPoint {
  lat: number;
  lng: number;
  name?: string;
  size?: number;
  color?: string;
  altitude?: number;
  url?: string;
  embedUrl?: string;
  imageUrl?: string;
}

export interface LayerConfig {
  id: string;
  name: string;
  icon: string;
  enabled: boolean;
  color: string;
}

export interface OSINTEvent {
  id: string;
  title: string;
  category: string;
  lat: number;
  lng: number;
  timestamp: string;
  source: string;
}

export interface Webcam {
  id: string;
  lat: number;
  lng: number;
  title: string;
  imageUrl?: string;
  embedUrl?: string;
  source: "windy" | "osm";
}

export interface Vessel {
  mmsi: string;
  name: string;
  lat: number;
  lng: number;
  speed?: number;
  course?: number;
  type?: string;
}

export interface Aircraft {
  icao24: string;
  callsign: string;
  lat: number;
  lng: number;
  altitude?: number;
  velocity?: number;
  trueTrack?: number;
}

export interface Satellite {
  name: string;
  noradId?: number;
  lat?: number;
  lng?: number;
  altitude?: number;
  tle?: string;
  epoch?: string;
}

export interface SatellitePropagated extends Satellite {
  lat: number;
  lng: number;
  altitude: number;
  velocity?: number;
  footprint?: number;
}

export interface TimelineState {
  startDate: string;
  endDate: string;
  currentDate: string;
  playing: boolean;
  speed: number;
}
