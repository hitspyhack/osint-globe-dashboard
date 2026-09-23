export interface DataPoint {
  lat: number;
  lng: number;
  name?: string;
  size?: number;
  color?: string;
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
