# OSINT Globe Dashboard

3D OSINT globe dashboard with live maritime, aeronautical, terrestrial, satellite, and hazard feeds.

## Features

- 🌍 **3D Globe** (globe.gl + Three.js) with dark OSINT theme
- 🛰️ **Satellite tracking** (ISS via Open Notify + CelesTrak TLE catalog)
- 🌋 **Natural hazards** (earthquakes, wildfires via NASA EONET)
- 🚢 **Maritime data** (AIS - adapter ready for licensed provider)
- ✈️ **Aeronautical data** (ADS-B via OpenSky Network)
- 📹 **Webcams worldwide** (Windy API + OSM Overpass)
- 🔍 **Location search** (Nominatim geocoding)
- 🗺️ **Bottom expandable menus** for layer toggling
- 📱 **Mobile-first PWA** ready

## Getting Started

```bash
# Install dependencies
npm install

# Copy env example and add your keys
cp .env.example .env.local
```

### Required API Keys (optional but recommended)

| Service | Key | Get it from |
|---------|-----|-------------|
| Windy Webcams | `WINDY_WEBCAMS_API_KEY` | [Windy API](https://www.windy.com/-Webcams-api-webcams-api?webcams-api) |
| OpenSky Network | `OPENSKY_USERNAME`, `OPENSKY_PASSWORD` | [OpenSky](https://opensky-network.org/apidoc) |

Without these keys, the app will still run but some layers will be empty or limited.

```bash
# Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deploy

### Vercel

```bash
npm install -g vercel
vercel --prod
```

Set your environment variables in the Vercel dashboard.

### Netlify

```bash
npm run build
netlify deploy --prod --dir=.next
```

## Project Structure

```
osint-globe-dashboard/
├── app/
│   ├── api/
│   │   ├── webcams/
│   │   │   ├── windy/route.ts
│   │   │   └── osm/route.ts
│   │   ├── aviation/route.ts
│   │   ├── maritime/route.ts
│   │   └── satellites/route.ts
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── GlobeCanvas.tsx
│   └── BottomMenu.tsx
├── hooks/
│   └── useGlobeData.ts
├── types/
│   └── index.ts
├── package.json
├── next.config.mjs
├── tsconfig.json
└── README.md
```

## Data Sources

| Layer | Source | Auth | Update |
|-------|--------|------|--------|
| ISS Position | [Open Notify](http://open-notify.org/Open-Notify-API/ISS-Location-Now/) | None | 5s |
| Earthquakes | [NASA EONET](https://eonet.gsfc.nasa.gov/api/v2.1/events) | None | On load |
| Wildfires/Volcanoes | [NASA EONET](https://eonet.gsfc.nasa.gov/api/v2.1/events) | None | On load |
| Webcams (Windy) | [Windy Webcams API](https://www.windy.com/-Webcams-api-webcams-api?webcams-api) | API key | On load |
| Webcams (OSM) | [Overpass API](https://overpass-api.de/) | None | On load |
| Aviation (ADS-B) | [OpenSky Network](https://opensky-network.org/apidoc) | Free account | 30s |
| Maritime (AIS) | Adapter (configure licensed provider) | - | - |
| Satellites (TLE) | [CelesTrak](https://celestrak.org/) | None | 1h |
| Geocoding | [Nominatim](https://nominatim.org/) | None (rate limited) | On search |

## Layer Details

### 1. Webcams Worldwide
- **Windy API**: ~65k webcams globally with live preview images and timelapse
- **OSM Overpass**: Community-mapped webcams with `webcam` or `contact:webcam` tags
- Click a webcam marker to open a preview panel with embed player or snapshot

### 2. Maritime (AIS)
- Currently returns empty (adapter boundary)
- Integrate a licensed AIS provider (e.g., Spire, MarineTraffic, exactEarth)
- Vessels render as amber points with MMSI/name labels

### 3. Aeronautical (ADS-B)
- OpenSky Network free tier (requires username/password)
- Shows up to 1000 aircraft with callsign, altitude, velocity
- Renders as purple points with altitude-based height

### 4. Satellites (TLE)
- CelesTrak catalogs: space stations, Starlink, weather satellites
- Up to 250 satellites per group
- Renders as green points (future: propagate TLE for real-time positions)

### 5. Search Bar
- Nominatim geocoding (OSM)
- Typeahead with 5 results max
- Auto-pans globe to selected location

## License

MIT
