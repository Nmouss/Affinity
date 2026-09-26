import { CanvasTexture, SRGBColorSpace } from "three";

// In-world text drawn on a canvas with the system font: nothing is fetched (unlike troika), and
// unlike drei's Html it needs no extra React root. Redraw only when the text changes.

export interface TextLabel {
  texture: CanvasTexture;
  /** Width / height of the texture, for sizing the plane it is drawn on. */
  aspect: number;
  draw(text: string): void;
}

export function createTextLabel(width = 1024, height = 128): TextLabel {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;

  return {
    texture,
    aspect: width / height,
    draw(text) {
      if (!context) return;
      context.clearRect(0, 0, width, height);
      context.font = `600 ${Math.round(height * 0.42)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      const pillWidth = Math.min(width, context.measureText(text).width + height);
      const x = (width - pillWidth) / 2;
      context.fillStyle = "rgba(18, 13, 11, 0.72)";
      context.beginPath();
      context.roundRect(x, height * 0.1, pillWidth, height * 0.8, height * 0.4);
      context.fill();
      context.fillStyle = "#fff4d6";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(text, width / 2, height / 2 + 2);
      texture.needsUpdate = true;
    },
  };
}
