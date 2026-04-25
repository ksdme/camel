// ─── Lottie palette remapper ───
// Walks a Lottie JSON and remaps static fill/stroke colors to the Camel sand/teal palette.

// Target palette as normalized RGB [0-1]
// Sand neutrals (HSL → RGB approximations)
const SAND_100: [number, number, number] = [0.925, 0.898, 0.847]; // #ECE5D8
const SAND_500: [number, number, number] = [0.576, 0.529, 0.451]; // #938773
const SAND_800: [number, number, number] = [0.239, 0.196, 0.149]; // #3D3226
const SAND_900: [number, number, number] = [0.165, 0.137, 0.102]; // #2A231A

// Teal accents
const TEAL_100: [number, number, number] = [0.788, 0.929, 0.910]; // #C9EDE8
const TEAL_300: [number, number, number] = [0.498, 0.776, 0.733]; // #7FC6BB
const TEAL_500: [number, number, number] = [0.184, 0.620, 0.561]; // #2F9E8F
const TEAL_600: [number, number, number] = [0.118, 0.478, 0.427]; // #1E7A6D

// Light palette options (alternating for variety)
const LIGHTS: [number, number, number][] = [SAND_100, TEAL_100];
// Mid palette options
const MIDS: [number, number, number][] = [TEAL_500, TEAL_600, TEAL_300];
// Dark palette options
const DARKS: [number, number, number][] = [SAND_800, SAND_900, SAND_500];

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

let colorIndex = 0;

function pickFromBucket(bucket: [number, number, number][]): [number, number, number] {
  const picked = bucket[colorIndex % bucket.length];
  colorIndex++;
  return picked;
}

function remapColor(c: [number, number, number]): [number, number, number] {
  const lum = luminance(c[0], c[1], c[2]);
  if (lum < 0.2) return pickFromBucket(DARKS);
  if (lum < 0.6) return pickFromBucket(MIDS);
  return pickFromBucket(LIGHTS);
}

function hexToRgbNorm(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

function rgbNormToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Check if a Lottie color value is static (array of 3-4 numbers) vs keyframed (array of objects)
function isStaticColor(k: unknown): k is number[] {
  return (
    Array.isArray(k) &&
    k.length >= 3 &&
    typeof k[0] === "number" &&
    typeof k[1] === "number" &&
    typeof k[2] === "number"
  );
}

function walkShapes(shapes: any[]): void {
  if (!Array.isArray(shapes)) return;
  for (const shape of shapes) {
    if (!shape) continue;
    // Fill or stroke
    if ((shape.ty === "fl" || shape.ty === "st") && shape.c && isStaticColor(shape.c.k)) {
      const mapped = remapColor([shape.c.k[0], shape.c.k[1], shape.c.k[2]]);
      shape.c.k[0] = mapped[0];
      shape.c.k[1] = mapped[1];
      shape.c.k[2] = mapped[2];
    }
    // Group
    if (shape.ty === "gr" && shape.it) {
      walkShapes(shape.it);
    }
  }
}

function walkLayers(layers: any[]): void {
  if (!Array.isArray(layers)) return;
  for (const layer of layers) {
    if (!layer) continue;
    // Solid layer
    if (layer.ty === 1 && typeof layer.sc === "string") {
      const rgb = hexToRgbNorm(layer.sc);
      const mapped = remapColor(rgb);
      layer.sc = rgbNormToHex(mapped[0], mapped[1], mapped[2]);
    }
    // Shape layer
    if (layer.shapes) {
      walkShapes(layer.shapes);
    }
  }
}

/**
 * Deep-clones a Lottie JSON and remaps all static fill/stroke colors
 * to the Camel sand/teal palette based on luminance classification.
 */
export function remapLottiePalette(data: any): any {
  if (!data) return data;
  const clone = JSON.parse(JSON.stringify(data));
  colorIndex = 0; // reset per animation for balanced distribution
  if (clone.layers) walkLayers(clone.layers);
  if (clone.assets) {
    for (const asset of clone.assets) {
      if (asset.layers) walkLayers(asset.layers);
    }
  }
  return clone;
}

/**
 * Fisher-Yates shuffle — returns a new shuffled array.
 */
export function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}