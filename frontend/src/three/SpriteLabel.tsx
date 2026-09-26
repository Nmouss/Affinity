import { useEffect, useMemo } from "react";
import * as THREE from "three";

// Text drawn to a canvas texture on a sprite. drei's <Html> mounts a separate React root per label,
// which throws unmount-race errors under React 19 when the canvas unmounts; a sprite has no DOM.

interface Props {
  lines: string[];
  position: [number, number, number];
  /** Height of one line of text as a fraction of view height (labels keep a constant screen size). */
  lineHeight?: number;
  background?: string;
  color?: string;
  bold?: boolean;
  maxWidthPx?: number;
}

const PX = 48;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

export function SpriteLabel({ lines, position, lineHeight = 0.024, background = "rgba(20,23,27,0.88)", color = "#ffffff", bold, maxWidthPx = 520 }: Props) {
  const key = lines.join("\n");
  const { texture, aspect, rows } = useMemo(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return { texture: null, aspect: 1, rows: 1 };
    const font = (weight: string) => `${weight} ${PX}px Inter, system-ui, sans-serif`;
    ctx.font = font("600");
    const wrapped = lines.flatMap((l, i) => wrap(ctx, l, maxWidthPx).map((text) => ({ text, first: i === 0 })));
    const width = Math.min(maxWidthPx, Math.max(...wrapped.map((w) => ctx.measureText(w.text).width))) + PX;
    const height = wrapped.length * PX * 1.25 + PX * 0.5;
    canvas.width = Math.ceil(width);
    canvas.height = Math.ceil(height);
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, PX * 0.4);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    wrapped.forEach((w, i) => {
      ctx.font = font(w.first && bold ? "800" : "500");
      ctx.fillStyle = color;
      ctx.fillText(w.text, canvas.width / 2, PX * 0.25 + PX * 1.25 * (i + 0.5));
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return { texture: tex, aspect: canvas.width / canvas.height, rows: wrapped.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, background, color, bold, maxWidthPx]);

  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;
  const h = lineHeight * (rows * 1.25 + 0.5);
  return (
    <sprite position={position} scale={[h * aspect, h, 1]} renderOrder={10}>
      <spriteMaterial map={texture} transparent depthTest={false} sizeAttenuation={false} />
    </sprite>
  );
}
