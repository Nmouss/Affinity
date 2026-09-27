"use client";

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Html, RoundedBox, useGLTF, useTexture } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Box3, Color, SRGBColorSpace, Vector3, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { TIMING, easeOutBack, progress } from "@/components/stage/tree/timing";
import { PEDESTAL_RADIUS, PEDESTAL_TOP_Y } from "@/lib/product/layout";
import { isSafeImageUrl, pickProductMedia, type ProductMedia } from "@/lib/product/media";
import { emitGesture } from "@/lib/stage/bus";
import type { Vec3 } from "@/lib/stage/layout";
import { useStage } from "@/lib/stage/store";
import { registerTarget } from "@/lib/stage/targets";
import type { CatalogItem } from "@/types/domain";
import type { TargetId } from "@/types/stage";
import { MediaBoundary } from "./MediaBoundary";
import styles from "./product.module.css";

// A toy-like display pedestal for one gift product, in the Plaza palette. The product on top is a
// remote GLB when the merchant supplied one, else the product image on a rounded card, else a
// procedural gift box with the name. Every step down is automatic (error or timeout), so a broken
// model never blocks the council or the approval.

/** Products are fit into a cube this big (ft) on top of the pedestal. */
export const FIT_SIZE = 1.6;
/** A model that hasn't finished loading by then steps down to the image. */
export const MODEL_TIMEOUT_MS = 8000;
const TURNTABLE_RAD_PER_S = 0.35;

const IVORY = "#f4f1e6";
const RIM = "#6f7470";
const GLOW = new Color("#ffd180").multiplyScalar(2.2);
const BOX_COLORS = ["#e0312b", "#2464c9", "#1f9e4a", "#8a4bc9", "#f47a20", "#ff8fcf"];

function fitScale(box: Box3): number {
  const size = box.getSize(new Vector3());
  const largest = Math.max(size.x, size.y, size.z);
  return largest > 0 ? FIT_SIZE / largest : 1;
}

/** A merchant GLB scaled into the fit cube and set on the pedestal top, centered. */
function GlbProduct({ url, onReady }: { url: string; onReady: () => void }) {
  // Draco off (its decoder is fetched from a CDN), matching GlbTree.
  const { scene } = useGLTF(url, false);
  const { model, scale, offset } = useMemo(() => {
    const model = scene.clone(true);
    const box = new Box3().setFromObject(model);
    const scale = fitScale(box);
    const center = box.getCenter(new Vector3());
    return { model, scale, offset: [-center.x * scale, -box.min.y * scale, -center.z * scale] as Vec3 };
  }, [scene]);
  useLayoutEffect(onReady, [model, onReady]);
  return (
    <group position={offset} scale={scale}>
      <primitive object={model} />
    </group>
  );
}

/** The product photo on a rounded ivory card, sized to the image's aspect inside the fit cube. */
function ImageProduct({ url, onReady }: { url: string; onReady: () => void }) {
  const texture = useTexture(url);
  const { width, height } = useMemo(() => {
    texture.colorSpace = SRGBColorSpace;
    const image = texture.image as { width?: number; height?: number } | undefined;
    const aspect = image?.width && image?.height ? image.width / image.height : 1;
    const span = FIT_SIZE * 0.92;
    return aspect >= 1 ? { width: span, height: span / aspect } : { width: span * aspect, height: span };
  }, [texture]);
  useLayoutEffect(onReady, [texture, onReady]);
  return (
    <group position-y={height / 2 + 0.08}>
      <RoundedBox args={[width + 0.16, height + 0.16, 0.08]} radius={0.05} smoothness={4}>
        <meshStandardMaterial color={IVORY} roughness={0.85} />
      </RoundedBox>
      <mesh position-z={0.045}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** A wrapped gift box; the named fallback when there is neither a model nor a usable image. */
export function CardProduct({ index }: { index: number }) {
  const color = BOX_COLORS[index % BOX_COLORS.length] ?? BOX_COLORS[0]!;
  const size = FIT_SIZE * 0.62;
  return (
    <group position-y={size / 2}>
      <RoundedBox args={[size, size * 0.85, size]} radius={0.06} smoothness={4}>
        <meshStandardMaterial color={color} roughness={0.7} />
      </RoundedBox>
      <mesh>
        <boxGeometry args={[size * 0.18, size * 0.86, size + 0.02]} />
        <meshStandardMaterial color={IVORY} roughness={0.6} />
      </mesh>
      <mesh>
        <boxGeometry args={[size + 0.02, size * 0.86, size * 0.18]} />
        <meshStandardMaterial color={IVORY} roughness={0.6} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * size * 0.16, size * 0.52, 0]} rotation-z={side * 0.5}>
          <sphereGeometry args={[size * 0.14, 12, 10]} />
          <meshStandardMaterial color={IVORY} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/** Slow-spinning peach ring while a remote asset streams in. */
function LoadingRing() {
  const ring = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (ring.current) ring.current.rotation.y += delta * 2.2;
  });
  return (
    <group position-y={0.6}>
      <mesh ref={ring} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.45, 0.06, 10, 32]} />
        <meshBasicMaterial color={GLOW} toneMapped={false} />
      </mesh>
      <Html center position-y={0.5} distanceFactor={12} zIndexRange={[20, 5]}>
        <div className={styles.loading}>Loading…</div>
      </Html>
    </group>
  );
}

/**
 * The step-down chain for an item: model (if any) → image (product image or model preview) → card.
 * Pure so the pedestal's escalation is easy to follow.
 */
export function mediaChain(item: CatalogItem): ProductMedia[] {
  const first = pickProductMedia(item);
  const chain: ProductMedia[] = [first];
  if (first.kind === "model") {
    const image = isSafeImageUrl(item.imageUrl) ? item.imageUrl : first.previewImageUrl;
    if (image) chain.push({ kind: "image", url: image });
  }
  if (chain[chain.length - 1]!.kind !== "card") chain.push({ kind: "card" });
  return chain;
}

function ProductMediaView({ item, index }: { item: CatalogItem; index: number }) {
  const chain = useMemo(() => mediaChain(item), [item]);
  const [level, setLevel] = useState(0);
  const [ready, setReady] = useState(false);
  const media = chain[Math.min(level, chain.length - 1)]!;
  const stepDown = () => setLevel((current) => Math.min(current + 1, chain.length - 1));

  // A model that never resolves (slow CDN, blocked request) steps down instead of spinning forever.
  useEffect(() => {
    if (media.kind !== "model" || ready) return;
    const timer = window.setTimeout(stepDown, MODEL_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [media, ready]);

  if (media.kind === "card") return <CardProduct index={index} />;
  const key = `${media.kind}:${media.url}`;
  return (
    <MediaBoundary resetKey={key} fallback={null} onError={stepDown}>
      <Suspense fallback={<LoadingRing />}>
        {media.kind === "model" ? (
          <GlbProduct key={key} url={media.url} onReady={() => setReady(true)} />
        ) : (
          <ImageProduct key={key} url={media.url} onReady={() => setReady(true)} />
        )}
      </Suspense>
    </MediaBoundary>
  );
}

function money(value: number, currency?: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  } catch {
    return `$${value}`;
  }
}

export interface ProductPedestalProps {
  item: CatalogItem;
  position: Vec3;
  index: number;
  /** Highlighted after a pinch/click (or the ProductPanel's Inspect). */
  focused: boolean;
}

/** One pedestal with its product, name chip, hand target, and hover/focus glow. */
export function ProductPedestal({ item, position, index, focused }: ProductPedestalProps) {
  const root = useRef<Group>(null);
  const anchor = useRef<Group>(null);
  const turntable = useRef<Group>(null);
  const glowRing = useRef<Mesh>(null);
  const [mountedAt] = useState(() => performance.now());
  const targetId: TargetId = `item:${item.id}`;

  useEffect(() => (anchor.current ? registerTarget(targetId, anchor.current, 0.95) : undefined), [targetId]);

  useFrame((_, delta) => {
    const now = performance.now();
    const grow = easeOutBack(progress(now, mountedAt, TIMING.treeGrow), 1.3);
    root.current?.scale.setScalar(Math.max(0.001, grow));
    if (turntable.current) turntable.current.rotation.y += delta * TURNTABLE_RAD_PER_S;
    if (glowRing.current) {
      const hovered = useStage.getState().hand.hoverTarget === targetId;
      const goal = focused ? 0.75 : hovered ? 0.5 : 0;
      const material = glowRing.current.material as MeshBasicMaterial;
      material.opacity += (goal - material.opacity) * Math.min(1, delta * 8);
    }
  });

  // Mouse and touch work without Leap: clicking pinch-taps the item; hovering marks it the way the
  // keyboard's hover cycle does, but only while no tracked hand owns the hover target.
  const onClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    emitGesture({ type: "pinchTap", target: targetId });
  };
  const onPointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const { hand, setHand } = useStage.getState();
    if (hand.present || hand.hoverTarget === targetId) return;
    setHand({ hoverTarget: targetId });
    emitGesture({ type: "hover", target: targetId });
  };
  const onPointerOut = () => {
    const { hand, setHand } = useStage.getState();
    if (hand.present || hand.hoverTarget !== targetId) return;
    setHand({ hoverTarget: null });
    emitGesture({ type: "hover", target: null });
  };

  return (
    <group ref={root} position={position}>
      <mesh position-y={PEDESTAL_TOP_Y / 2} onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
        <cylinderGeometry args={[PEDESTAL_RADIUS, PEDESTAL_RADIUS * 1.1, PEDESTAL_TOP_Y, 36]} />
        <meshStandardMaterial color={IVORY} roughness={0.8} />
      </mesh>
      <mesh position-y={PEDESTAL_TOP_Y} rotation-x={Math.PI / 2}>
        <torusGeometry args={[PEDESTAL_RADIUS, 0.05, 10, 48]} />
        <meshStandardMaterial color={RIM} roughness={0.7} />
      </mesh>
      <mesh ref={glowRing} position-y={0.02} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[PEDESTAL_RADIUS * 1.15, PEDESTAL_RADIUS * 1.4, 48]} />
        <meshBasicMaterial color={GLOW} transparent opacity={0} toneMapped={false} depthWrite={false} />
      </mesh>
      <group ref={turntable} position-y={PEDESTAL_TOP_Y}>
        <ProductMediaView item={item} index={index} />
      </group>
      <group ref={anchor} position-y={PEDESTAL_TOP_Y + FIT_SIZE * 0.45} />
      <Html center position-y={PEDESTAL_TOP_Y + FIT_SIZE + 0.5} distanceFactor={12} zIndexRange={[20, 5]}>
        <div className={focused ? `${styles.chip} ${styles.chipFocused}` : styles.chip}>
          <span className={styles.name}>{item.name}</span>
          <span className={styles.price}>{money(item.price, item.currency)}</span>
        </div>
      </Html>
    </group>
  );
}
