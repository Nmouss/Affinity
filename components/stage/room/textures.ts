import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

// Procedural canvas textures, so the room ships no image assets. Browser-only (needs a canvas).

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable");
  return [canvas, context];
}

function toTexture(canvas: HTMLCanvasElement, repeat: [number, number] = [1, 1]): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 8;
  return texture;
}

/** Deterministic PRNG so the room looks the same on every reload. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Honey-oak planks with staggered joints and grain. One tile covers 4 × 4 ft. */
export function woodFloorTexture(): CanvasTexture {
  const size = 1024;
  const [canvas, ctx] = makeCanvas(size, size);
  const random = mulberry32(7);
  const rows = 8;
  const plank = size / rows;
  for (let row = 0; row < rows; row += 1) {
    let x = -random() * size * 0.5;
    while (x < size) {
      const length = size * (0.45 + random() * 0.5);
      const light = 42 + random() * 10;
      ctx.fillStyle = `hsl(${26 + random() * 6}, ${48 + random() * 10}%, ${light}%)`;
      ctx.fillRect(x, row * plank, length, plank);
      ctx.strokeStyle = `hsla(24, 50%, ${light - 12}%, 0.35)`;
      ctx.lineWidth = 1.5;
      for (let g = 0; g < 7; g += 1) {
        const y = row * plank + 6 + random() * (plank - 12);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + length * 0.3, y + random() * 6 - 3, x + length * 0.6, y + random() * 6 - 3, x + length, y);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(40, 20, 10, 0.55)";
      ctx.fillRect(x, row * plank, 3, plank);
      x += length;
    }
    ctx.fillStyle = "rgba(40, 20, 10, 0.6)";
    ctx.fillRect(0, row * plank, size, 3);
  }
  return toTexture(canvas, [5, 4]);
}

/** Cream wallpaper with soft stripes and a small diamond motif. Walls map one tile per 4 ft. */
export function wallpaperTexture(): CanvasTexture {
  const size = 512;
  const [canvas, ctx] = makeCanvas(size, size);
  ctx.fillStyle = "#e9d6b4";
  ctx.fillRect(0, 0, size, size);
  const stripe = size / 8;
  for (let i = 0; i < 8; i += 2) {
    ctx.fillStyle = "#dfc79f";
    ctx.fillRect(i * stripe, 0, stripe, size);
  }
  ctx.fillStyle = "#c9a878";
  for (let i = 0; i < 8; i += 2) {
    for (let j = 0; j < 8; j += 1) {
      const cx = i * stripe + stripe * 1.5;
      const cy = j * stripe + stripe / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 7);
      ctx.lineTo(cx + 5, cy);
      ctx.lineTo(cx, cy + 7);
      ctx.lineTo(cx - 5, cy);
      ctx.closePath();
      ctx.fill();
    }
  }
  return toTexture(canvas);
}

/** Running-bond bricks for the fireplace surround. */
export function brickTexture(): CanvasTexture {
  const width = 512;
  const height = 512;
  const [canvas, ctx] = makeCanvas(width, height);
  const random = mulberry32(11);
  ctx.fillStyle = "#cbb8a0";
  ctx.fillRect(0, 0, width, height);
  const rows = 12;
  const brickH = height / rows;
  const brickW = width / 4;
  for (let row = 0; row < rows; row += 1) {
    const offset = row % 2 === 0 ? 0 : brickW / 2;
    for (let col = -1; col < 5; col += 1) {
      ctx.fillStyle = `hsl(${10 + random() * 10}, ${45 + random() * 15}%, ${30 + random() * 10}%)`;
      ctx.fillRect(col * brickW + offset + 3, row * brickH + 3, brickW - 6, brickH - 6);
    }
  }
  return toTexture(canvas);
}

/** The council rug: concentric bands, a star medallion, and a scalloped border. */
export function rugTexture(): CanvasTexture {
  const size = 1024;
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;
  const ring = (radius: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(c, c, radius, 0, Math.PI * 2);
    ctx.fill();
  };
  ring(c, "#f1e2c4");
  ring(c * 0.96, "#8e2b2b");
  ring(c * 0.9, "#f1e2c4");
  for (let i = 0; i < 36; i += 1) {
    const angle = (i / 36) * Math.PI * 2;
    ctx.fillStyle = i % 2 === 0 ? "#2f5e4a" : "#c99a3a";
    ctx.beginPath();
    ctx.arc(c + Math.cos(angle) * c * 0.84, c + Math.sin(angle) * c * 0.84, c * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
  ring(c * 0.78, "#2f5e4a");
  ring(c * 0.74, "#a8392f");
  ring(c * 0.5, "#f1e2c4");
  ring(c * 0.46, "#c99a3a");
  ring(c * 0.42, "#8e2b2b");
  ctx.fillStyle = "#f1e2c4";
  ctx.beginPath();
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? c * 0.36 : c * 0.16;
    ctx.lineTo(c + Math.cos(angle) * radius, c + Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fill();
  ring(c * 0.08, "#c99a3a");
  return toTexture(canvas);
}

/** Night sky seen through the window: deep blue gradient with a few stars. */
export function nightSkyTexture(): CanvasTexture {
  const width = 512;
  const height = 512;
  const [canvas, ctx] = makeCanvas(width, height);
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#050b24");
  gradient.addColorStop(0.7, "#132a5c");
  gradient.addColorStop(1, "#2b4a82");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const random = mulberry32(3);
  for (let i = 0; i < 90; i += 1) {
    ctx.fillStyle = `rgba(255, 255, 240, ${0.3 + random() * 0.7})`;
    ctx.fillRect(random() * width, random() * height * 0.7, 1.5, 1.5);
  }
  return toTexture(canvas);
}

/** Soft round sprite for snowflakes. */
export function flakeTexture(): CanvasTexture {
  const size = 64;
  const [canvas, ctx] = makeCanvas(size, size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.8)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return toTexture(canvas);
}
