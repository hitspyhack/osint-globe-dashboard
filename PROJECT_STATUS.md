# OSINT Globe Dashboard - Project Status

**Last Updated:** September 23, 2026  
**Version:** 0.2.0  
**Status:** ✅ Functional - Ready for Testing

---

## 🎯 Project Overview

3D OSINT globe dashboard with live maritime, aeronautical, terrestrial, satellite, and hazard feeds built with Next.js 15, React 19, and globe.gl.

**Repository:** [hitspyhack/osint-globe-dashboard](https://github.com/hitspyhack/osint-globe-dashboard)

---

## ✅ Completed Features

### Core Functionality
- [x] 3D Globe with globe.gl (dynamic import, client-side only)
- [x] Dark OSINT theme with custom CSS variables
- [x] Auto-rotating globe with user controls
- [x] Responsive design (mobile-first PWA ready)

### Live Data Layers
- [x] **ISS Tracker** - Real-time position (5s updates) with fallback
- [x] **Earthquakes** - NASA EONET API (7 days historical)
- [x] **Wildfires/Volcanoes** - NASA EONET API (30 days historical)
- [x] **Webcams Worldwide** - Windy API + OSM Overpass (300 max)
- [x] **Maritime (AIS)** - Adapter pattern ready (Spire, MarineTraffic)
- [x] **Aeronautical (ADS-B)** - OpenSky Network integration
- [x] **Satellites (TLE)** - CelesTrak catalog with real-time propagation (satellite.js v5)

### UI Components
- [x] Bottom expandable menu with layer toggles
- [x] Location search bar (Nominatim geocoding)
- [x] Timeline scrubber (7 days, 0.5x-5x speed)
- [x] Webcam preview panel with embed support
- [x] Loading state with "Loading globe..." overlay

### Technical Features
- [x] Dynamic imports for client-side only libraries
- [x] Error handling and fallbacks for all APIs
- [x] TypeScript strict mode
- [x] PWA manifest + service worker (offline support)
- [x] Hydration error fixes (suppressHydrationWarning)

---

## 🔧 Known Issues & Workarounds

### Resolved Issues
1. ✅ SSR `window is not defined` - Fixed with dynamic imports
2. ✅ `globe.gl` module access - Fixed with `import("globe.gl").default`
3. ✅ DOM initialization timing - Fixed with `requestAnimationFrame`
4. ✅ Globe instance validation - Added null checks before `.controls()`
5. ✅ `satellite.js` v5 API - Changed from `satrec()` to `Satrec.create()`
6. ✅ Next.js destructuring bug - Changed `useState(null)` to `useState()`
7. ✅ ISS API failures - Added fallback position generator
8. ✅ EONET parseEvents scope - Fixed closure with `eventTitle` property

---

## 📁 Project Structure

```
osint-globe-dashboard/
├── app/
│   ├── api/
│   │   ├── webcams/
│   │   │   ├── windy/route.ts      # Windy Webcams API adapter
│   │   │   └── osm/route.ts        # OSM Overpass webcam scraper
│   │   ├── aviation/route.ts       # OpenSky ADS-B data
│   │   ├── maritime/route.ts       # AIS provider adapter (Spire, MarineTraffic)
│   │   └── satellites/route.ts     # CelesTrak TLE catalog
│   ├── layout.tsx                  # PWA meta tags, viewport
│   ├── page.tsx                    # Main page with search + timeline
│   └── globals.css                 # OSINT dark theme CSS
├── components/
│   ├── GlobeCanvas.tsx             # 3D globe with all layers
│   ├── BottomMenu.tsx              # Layer toggle menu
│   └── TimelineScrubber.tsx        # Historical timeline control
├── hooks/
│   └── useGlobeData.ts             # Unified data fetching hook
├── lib/
│   └── satellite-propagation.ts    # TLE propagation with satellite.js v5
├── types/
│   └── index.ts                    # TypeScript interfaces
├── public/
│   ├── manifest.json               # PWA manifest
│   └── sw.js                       # Service worker (cache-first)
├── package.json
├── next.config.mjs
├── tsconfig.json
├── .env.example
└── README.md
```

---

## 🚀 Getting Started (Resume Guide)

### Prerequisites
- Node.js 20+
- npm or yarn
- GitHub account

### Quick Start

```bash
# 1. Clone repository
git clone https://github.com/hitspyhack/osint-globe-dashboard.git
cd osint-globe-dashboard

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env.local

# Edit .env.local and add:
# WINDY_WEBCAMS_API_KEY=your_key_here
# OPENSKY_USERNAME=your_username
# OPENSKY_PASSWORD=your_password
# SPIRE_API_KEY=your_key (optional, for AIS)
# MARINETRAFFIC_API_KEY=your_key (optional)

# 4. Run development server
npm run dev

# 5. Open browser
# http://localhost:3000
```

### Build for Production

```bash
# Build
npm run build

# Start production server
npm start

# Or deploy to Vercel
vercel --prod

# Or deploy to Netlify
netlify deploy --prod --dir=.next
```

---

## 🔑 API Keys Required

| Service | Key | Get From | Status |
|---------|-----|----------|--------|
| Windy Webcams | `WINDY_WEBCAMS_API_KEY` | [Windy API](https://www.windy.com/-Webcams-api-webcams-api) | Required for webcams |
| OpenSky | `OPENSKY_USERNAME`, `OPENSKY_PASSWORD` | [OpenSky](https://opensky-network.org/apidoc) | Required for aviation |
| Spire Maritime | `SPIRE_API_KEY` | [Spire](https://spire.com/maritime/) | Optional (AIS layer) |
| MarineTraffic | `MARINETRAFFIC_API_KEY` | [MarineTraffic](https://www.marinetraffic.com/en/data/apis) | Optional (AIS layer) |

**No key required:**
- ISS (Open Notify - free)
- Earthquakes/Wildfires (NASA EONET - free)
- Satellites (CelesTrak - free)
- Geocoding (Nominatim - free, rate limited)

---

## 📊 Layer Status

| Layer | Status | Update Frequency | Auth Required |
|-------|--------|------------------|---------------|
| ISS | ✅ Live | 5 seconds | No |
| Earthquakes | ✅ Live | On load | No |
| Wildfires | ✅ Live | On load | No |
| Webcams | ✅ Live | On load | Windy key |
| Maritime (AIS) | ⚠️ Adapter | 30 seconds | Licensed provider |
| Aviation (ADS-B) | ✅ Live | 30 seconds | OpenSky account |
| Satellites (TLE) | ✅ Propagated | Real-time | No |
| Search | ✅ Live | On type | No |
| Timeline | ✅ Historical | Variable | No |

---

## 🐛 Troubleshooting

### Common Issues

**"window is not defined"**
- ✅ Fixed: Dynamic imports for globe.gl

**"Globe(...).globeEl is not a function"**
- ✅ Fixed: Using `import("globe.gl").default`

**"Cannot set properties of undefined (setting 'innerHTML')"**
- ✅ Fixed: `requestAnimationFrame` after DOM paint

**"Cannot set properties of undefined (setting 'autoRotate')"**
- ✅ Fixed: Null checks before `instance.controls()`

**"satrec is not a function"**
- ✅ Fixed: Using `Satrec.create()` for satellite.js v5

**"e is not defined" in parseEvents**
- ✅ Fixed: Using `eventTitle` property pattern

---

## 🎯 Next Steps (Backlog)

### High Priority
1. [ ] Test all layers with real API keys
2. [ ] Deploy to Vercel/Netlify
3. [ ] Test PWA installation on iOS/Android
4. [ ] Add webcam clustering for performance
5. [ ] Integrate real AIS provider (Spire or MarineTraffic)

### Medium Priority
6. [ ] Add TLE propagation for real-time satellite positions
7. [ ] Implement heatmap for earthquake/wildfire density
8. [ ] Add country/region filters
9. [ ] Add timeline historical data for all layers
10. [ ] Add export/screenshot functionality

### Low Priority
11. [ ] Add more satellite catalogs (military, GPS, etc.)
12. [ ] Integrate weather layers (wind, clouds, precipitation)
13. [ ] Add user bookmarks/favorites system
14. [ ] Add shareable URLs with state
15. [ ] Add dark/light theme toggle

---

## 📝 Development Notes

### Key Decisions

1. **Dynamic Imports** - `globe.gl` and `satellite.js` must be client-side only
2. **Request Animation Frame** - Ensures DOM is painted before globe initialization
3. **Fallback Positions** - ISS uses approximate orbit if API fails
4. **Adapter Pattern** - AIS providers can be swapped without code changes
5. **TypeScript Strict** - All types defined in `types/index.ts`

### Code Style

- Functional components with hooks
- TypeScript strict mode
- ESLint + Prettier (to be added)
- Error boundaries for graceful degradation
- Console warnings (not errors) for expected failures

---

## 📞 Contact

**Developer:** Ricardo Ferreira  
**GitHub:** [@hitspyhack](https://github.com/hitspyhack)  
**Location:** Setúbal, Portugal  

---

## 📄 License

MIT License - See LICENSE file for details

---

**Ready to resume?** Just run:

```bash
git pull
npm install
npm run dev
```

And check this file for context! 🚀
