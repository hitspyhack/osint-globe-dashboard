/**
 * Browser-side sampler for AWS Open Data's Terrarium RGB elevation tiles.
 * The global overview is sampled at zoom 3 (about 20 km/pixel at the equator).
 * Terrarium RGB decodes to metres with (R * 256 + G + B / 256) - 32768.
 */

export const TERRAIN_TILE_URL =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
export const TERRAIN_ATTRIBUTION = "AWS Open Data · Terrarium elevation tiles";
export const TERRAIN_ZOOM = 3;
export const TERRAIN_LONGITUDE_SEGMENTS = 512;
export const TERRAIN_LATITUDE_SEGMENTS = 256;
export const TERRAIN_MAX_EXAGGERATION = 100;

const TILE_SIZE = 256;
const MERCATOR_LIMIT = 85.051_128_78;
const FETCH_CONCURRENCY = 8;

interface RgbTile {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface GlobalTerrainGrid {
  longitudeSegments: number;
  latitudeSegments: number;
  /** One elevation value (metres) for every vertex, row-major north to south. */
  heightsMeters: Float32Array;
  minMeters: number;
  maxMeters: number;
}

export interface TerrainLoadProgress {
  completedTiles: number;
  totalTiles: number;
}

function mercatorPixelY(latitude: number, worldPixels: number): number {
  const clamped = Math.max(-MERCATOR_LIMIT, Math.min(MERCATOR_LIMIT, latitude));
  const radians = (clamped * Math.PI) / 180;
  const normalized = (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2;
  return Math.max(0, Math.min(worldPixels - 1e-6, normalized * worldPixels));
}

function decodeTerrariumPixel(tile: RgbTile, x: number, y: number): number {
  const px = Math.max(0, Math.min(tile.width - 1, x));
  const py = Math.max(0, Math.min(tile.height - 1, y));
  const offset = (py * tile.width + px) * 4;
  return tile.data[offset] * 256 + tile.data[offset + 1] + tile.data[offset + 2] / 256 - 32_768;
}

async function readTileImageData(blob: Blob): Promise<RgbTile> {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot read elevation tile pixels.");

  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
  } else {
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = objectUrl;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Could not decode an elevation tile."));
      });
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      context.drawImage(image, 0, 0);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return { data: pixels.data, width: pixels.width, height: pixels.height };
}

async function fetchTile(
  zoom: number,
  x: number,
  y: number,
  signal: AbortSignal
): Promise<RgbTile> {
  const url = TERRAIN_TILE_URL.replace("{z}", String(zoom))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
  const response = await fetch(url, { mode: "cors", cache: "force-cache", signal });
  if (!response.ok) {
    throw new Error(`Elevation tile ${zoom}/${x}/${y} returned HTTP ${response.status}.`);
  }
  return readTileImageData(await response.blob());
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

/** Load and decode a low-resolution global DEM into a regular lat/lon mesh grid. */
export async function loadGlobalTerrainGrid(
  signal: AbortSignal,
  onProgress?: (progress: TerrainLoadProgress) => void
): Promise<GlobalTerrainGrid> {
  const zoom = TERRAIN_ZOOM;
  const tileCount = 2 ** zoom;
  const worldPixels = tileCount * TILE_SIZE;
  const tilesToLoad = Array.from({ length: tileCount * tileCount }, (_, index) => ({
    x: index % tileCount,
    y: Math.floor(index / tileCount),
  }));
  const tiles = new Map<string, RgbTile>();
  let completedTiles = 0;

  try {
    await runWithConcurrency(tilesToLoad, FETCH_CONCURRENCY, async ({ x, y }) => {
      const tile = await fetchTile(zoom, x, y, signal);
      tiles.set(`${x}/${y}`, tile);
      completedTiles += 1;
      onProgress?.({ completedTiles, totalTiles: tilesToLoad.length });
    });
  } catch (error) {
    if (signal.aborted) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Terrarium DEM could not be read. Check browser network/CORS access. ${message}`
    );
  }

  const getWorldPixel = (pixelX: number, pixelY: number): number => {
    const wrappedX = ((pixelX % worldPixels) + worldPixels) % worldPixels;
    const clampedY = Math.max(0, Math.min(worldPixels - 1, pixelY));
    const tileX = Math.floor(wrappedX / TILE_SIZE);
    const tileY = Math.floor(clampedY / TILE_SIZE);
    const tile = tiles.get(`${tileX}/${tileY}`);
    if (!tile) return 0;
    return decodeTerrariumPixel(tile, wrappedX % TILE_SIZE, clampedY % TILE_SIZE);
  };

  const { longitudeSegments, latitudeSegments } = {
    longitudeSegments: TERRAIN_LONGITUDE_SEGMENTS,
    latitudeSegments: TERRAIN_LATITUDE_SEGMENTS,
  };
  const heightsMeters = new Float32Array((longitudeSegments + 1) * (latitudeSegments + 1));
  let minMeters = Number.POSITIVE_INFINITY;
  let maxMeters = Number.NEGATIVE_INFINITY;

  for (let row = 0; row <= latitudeSegments; row += 1) {
    const latitude = 90 - (row / latitudeSegments) * 180;
    const y = mercatorPixelY(latitude, worldPixels);
    const y0 = Math.floor(y);
    const y1 = Math.min(worldPixels - 1, y0 + 1);
    const fy = y - y0;

    for (let column = 0; column <= longitudeSegments; column += 1) {
      const longitude = -180 + (column / longitudeSegments) * 360;
      const x = ((longitude + 180) / 360) * worldPixels;
      const x0 = Math.floor(x) % worldPixels;
      const x1 = (x0 + 1) % worldPixels;
      const fx = x - Math.floor(x);
      const north = getWorldPixel(x0, y0) * (1 - fx) + getWorldPixel(x1, y0) * fx;
      const south = getWorldPixel(x0, y1) * (1 - fx) + getWorldPixel(x1, y1) * fx;
      const height = north * (1 - fy) + south * fy;
      const index = row * (longitudeSegments + 1) + column;
      heightsMeters[index] = height;
      minMeters = Math.min(minMeters, height);
      maxMeters = Math.max(maxMeters, height);
    }
  }

  return { longitudeSegments, latitudeSegments, heightsMeters, minMeters, maxMeters };
}
