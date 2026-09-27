"use client";

import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Box3, CylinderGeometry, MeshStandardMaterial, Vector3, type Group } from "three";
import type { CatalogItem, ProductModel3d } from "@/types/domain";
import { registerTarget } from "@/lib/stage/targets";
import { CENTERPIECE_TIMING, easeOutBack, progress } from "./growAnimation";

// One riser per bundle slot, holding a small stack of neutral item props. Adult-toned, no toy shapes.
// When Shopify supplies a real 3D model for an item, it renders in place of the plain cube.

const RISER_RADIUS = 0.55;
const RISER_HEIGHT = 0.18;
const ITEM_GAP = 0.5;
const MODEL_TARGET_SIZE = 0.4;

let riserGeometry: CylinderGeometry | undefined;
function sharedRiserGeometry(): CylinderGeometry {
  riserGeometry ??= new CylinderGeometry(RISER_RADIUS, RISER_RADIUS * 1.08, RISER_HEIGHT, 24);
  return riserGeometry;
}

const materials = new Map<string, MeshStandardMaterial>();
function slotMaterial(color: string): MeshStandardMaterial {
  let material = materials.get(color);
  if (!material) {
    material = new MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.15 });
    materials.set(color, material);
  }
  return material;
}

/** Deterministic, low-saturation palette so any backend-generated slot name reads as adult/neutral. */
const PALETTE = ["#8f9bb3", "#a68a64", "#7c9885", "#9b8aa6", "#b3906f", "#7b98a6"];

function colorForSlot(slot: string): string {
  let hash = 0;
  for (let i = 0; i < slot.length; i += 1) hash = (hash * 31 + slot.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

const LOADABLE_FORMATS = /gltf|glb/i;

/** The first model source drei's GLTFLoader can actually load, if any. */
function loadableModelUrl(models3d: ProductModel3d[] | undefined): string | null {
  for (const model of models3d ?? []) {
    const source = model.sources.find((candidate) => LOADABLE_FORMATS.test(candidate.format) || LOADABLE_FORMATS.test(candidate.mimeType));
    if (source) return source.url;
  }
  return null;
}

/** Loads a Shopify-hosted glTF/GLB, rescaled to a small, uniform size and floor-offset within the group. */
function Model3d({ url }: { url: string }) {
  const { scene } = useGLTF(url);

  const model = useMemo(() => {
    const clone = scene.clone(true);
    const box = new Box3().setFromObject(clone);
    const size = new Vector3();
    box.getSize(size);
    const largest = Math.max(size.x, size.y, size.z, 0.001);
    const scale = MODEL_TARGET_SIZE / largest;
    clone.scale.setScalar(scale);
    const scaledBox = new Box3().setFromObject(clone);
    clone.position.y -= scaledBox.min.y;
    return clone;
  }, [scene]);

  return <primitive object={model} />;
}

function CubeFallback({ slotColor }: { slotColor: string }) {
  return (
    <mesh material={slotMaterial(slotColor)}>
      <boxGeometry args={[0.34, 0.34, 0.34]} />
    </mesh>
  );
}

/** A broken/unreachable model URL falls back to the cube instead of crashing the stage. */
class Model3dBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function ItemProp({ item, index, slotColor }: { item: CatalogItem; index: number; slotColor: string }) {
  const ref = useRef<Group>(null);
  const shownAt = useRef(performance.now());
  const modelUrl = item.has3dModel ? loadableModelUrl(item.models3d) : null;

  useEffect(() => {
    const group = ref.current;
    if (!group) return;
    return registerTarget(`item:${item.id}`, group, 0.4);
  }, [item.id]);

  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    const t = easeOutBack(progress(performance.now(), shownAt.current, CENTERPIECE_TIMING.grow));
    group.scale.setScalar(Math.max(0.001, t));
  });

  return (
    <group ref={ref} position={[0, RISER_HEIGHT / 2 + 0.22 + index * ITEM_GAP, 0]}>
      {modelUrl ? (
        <Model3dBoundary fallback={<CubeFallback slotColor={slotColor} />}>
          <Suspense fallback={<CubeFallback slotColor={slotColor} />}>
            <Model3d url={modelUrl} />
          </Suspense>
        </Model3dBoundary>
      ) : (
        <CubeFallback slotColor={slotColor} />
      )}
    </group>
  );
}

export function SlotPedestal({
  slot,
  items,
  position,
}: {
  slot: string;
  items: readonly CatalogItem[];
  position: [number, number];
}) {
  const color = useMemo(() => colorForSlot(slot), [slot]);
  const [x, z] = position;

  return (
    <group position={[x, 0, z]}>
      <mesh geometry={sharedRiserGeometry()} material={slotMaterial(color)} position={[0, RISER_HEIGHT / 2, 0]} />
      {items.map((item, index) => (
        <ItemProp key={item.id} item={item} index={index} slotColor={color} />
      ))}
    </group>
  );
}
