# OSINT Globe Dashboard

3D OSINT globe dashboard with live maritime, aeronautical, terrestrial, satellite, and hazard feeds.

## Features

- 🌍 **3D Globe** (globe.gl + Three.js) with dark OSINT theme
- 🛰️ **Satellite tracking** (ISS via Open Notify API)
- 🌋 **Natural hazards** (earthquakes, wildfires via NASA EONET)
- 🚢 **Maritime data** (AIS - placeholder for free AIS feed)
- ✈️ **Aeronautical data** (ADS-B - placeholder for OpenSky)
- 📹 **Webcams worldwide** (Windy API + OSM Overpass)
- 🗺️ **Bottom expandable menus** for layer toggling
- 📱 **Mobile-first PWA** ready

## Getting Started

```bash
# Install dependencies
npm install

# Copy env example and add your keys (optional)
cp .env.example .env.local

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

- **ISS Position**: [Open Notify](http://open-notify.org/Open-Notify-API/ISS-Location-Now/)
- **Natural Events**: [NASA EONET](https://eonet.gsfc.nasa.gov/api/v2.1/events)
- **Webcams**: [Windy Webcams API](https://www.windy.com/-Webcams-api-webcams-api?webcams-api)
- **ADS-B**: [OpenSky Network](https://opensky-network.org/apidoc) (optional, requires credentials)
- **AIS**: Free AIS feeds (to be integrated)

## License

MIT
