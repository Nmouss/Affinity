"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { PLAZA } from "./formation";

// The Mii-Plaza-style floor: rotated square tiles laid out in concentric rings, brightening toward
// the center, on a disc big enough to fill the frame past the side rails. Generated once as a
// canvas texture (no image assets) so it stays crisp at any resolution.

const FLOOR_MARGIN = 6;
const TEXTURE_SIZE = 2048;

const GAP_OUTER = new THREE.Color("#d9cfbd");
const GAP_INNER = new THREE.Color("#f0e9db");
const TILE_OUTER = new THREE.Color("#f2ede1");
const TILE_INNER = new THREE.Color("#ffffff");
const scratchColor = new THREE.Color();

function ringColors(t: number): { gap: string; tile: string } {
  scratchColor.copy(GAP_OUTER).lerp(GAP_INNER, t);
  const gap = `#${scratchColor.getHexString()}`;
  scratchColor.copy(TILE_OUTER).lerp(TILE_INNER, t);
  const tile = `#${scratchColor.getHexString()}`;
  return { gap, tile };
}

/** Draws the tiled floor once onto a canvas: concentric rings of rotated ("diamond") squares, each
 * ring a little brighter than the last as it nears the center. */
function buildFloorCanvas(): HTMLCanvasElement {
  const size = TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2;
  const ringWidth = size / 30;
  const ringCount = Math.ceil(maxR / ringWidth);

  ctx.fillStyle = ringColors(0).gap;
  ctx.fillRect(0, 0, size, size);

  for (let ring = 0; ring < ringCount; ring += 1) {
    const rInner = ring * ringWidth;
    const rOuter = Math.min(maxR, rInner + ringWidth);
    const rMid = (rInner + rOuter) / 2;
    const centerT = 1 - ring / ringCount;
    const { gap, tile } = ringColors(centerT);

    ctx.fillStyle = gap;
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
    ctx.arc(cx, cy, rInner, 0, Math.PI * 2, true);
    ctx.fill("evenodd");

    const circumference = Math.PI * 2 * Math.max(1, rMid);
    const tileCount = Math.max(8, Math.round(circumference / (ringWidth * 0.95)));
    const angleStep = (Math.PI * 2) / tileCount;
    const phase = (ring % 2) * (angleStep / 2);
    const tileSize = ringWidth * 0.8;

    for (let i = 0; i < tileCount; i += 1) {
      const angle = i * angleStep + phase;
      const x = cx + Math.cos(angle) * rMid;
      const y = cy + Math.sin(angle) * rMid;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle + Math.PI / 4);
      ctx.fillStyle = tile;
      ctx.globalAlpha = 0.94 + Math.random() * 0.06;
      ctx.fillRect(-tileSize / 2, -tileSize / 2, tileSize, tileSize);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  return canvas;
}

export function PlazaFloor() {
  const texture = useMemo(() => {
    const canvas = buildFloorCanvas();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }, []);

  useEffect(() => () => texture.dispose(), [texture]);

  const discRadius = PLAZA.radius + FLOOR_MARGIN;

  return (
    <group>
      <color attach="background" args={["#efe7d8"]} />
      <hemisphereLight args={["#fff7e8", "#ded1ba", 0.95]} />
      <ambientLight intensity={0.3} />
      <directionalLight position={[6, 11, 5]} intensity={0.5} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[discRadius, 96]} />
        <meshStandardMaterial map={texture} roughness={0.92} metalness={0} />
      </mesh>
    </group>
  );
}
