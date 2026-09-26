"use client";

import { OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Leva } from "leva";
import { Component, type MutableRefObject, type ReactNode, Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { CharacterModel } from "@/components/sprites/CharacterModel";
import { MODEL_HEIGHT, characterForLook } from "@/components/sprites/characterPose";
import { Furniture, Rug } from "@/components/stage/room/Furniture";
import { Hearth } from "@/components/stage/room/Hearth";
import { Lighting } from "@/components/stage/room/Lighting";
import { RoomShell } from "@/components/stage/room/RoomShell";
import { usePeople, useRoster, useRosterHydration } from "@/lib/people/roster";
import { BLANK_LOOK } from "@/lib/people/starters";
import { COUNCIL_RING } from "@/lib/stage/layout";
import type { Product } from "@/lib/mission/services/contracts";
import type { CharacterLook } from "@/types/character";
import type { FamilyProfile } from "@/types/domain";
import type { SpriteMood } from "@/types/stage";
import { SpriteLabel } from "./SpriteLabel";

// The mission scene is the Hearth living room: the same shell, fire, rug, and furniture as the
// council stage, with the shoppers drawn as People Maker characters around a coffee table on the
// rug. Everything here is presentational: it draws what the mission state says (cart, selection,
// comparison) and reports clicks back. 1 world unit = 1 ft, as in lib/stage/layout.ts.

/** Product stand-ins. Engine catalogs may omit modelUrl; these keep the table populated offline. */
export const MODEL_URLS = ["/models/press.glb", "/models/lantern.glb", "/models/stove.glb", "/models/cooler.glb", "/models/mug.glb"];

export function modelFor(product: Product | null | undefined): string | undefined {
  if (!product) return undefined;
  if (product.modelUrl) return product.modelUrl;
  const name = product.name.toLowerCase();
  if (/press|brewer|pump/.test(name)) return "/models/press.glb";
  if (/mug|cup/.test(name)) return "/models/mug.glb";
  if (/lantern|light/.test(name)) return "/models/lantern.glb";
  if (/cooler/.test(name)) return "/models/cooler.glb";
  if (/stove|burner/.test(name)) return "/models/stove.glb";
  return undefined;
}

export function preloadModels() {
  MODEL_URLS.forEach((url) => useGLTF.preload(url));
}

export interface SceneShopper {
  id: string;
  name: string;
  color: string;
  reaction?: string;
}

export interface MissionTableProps {
  categories: { id: string; label: string; total: number; productIds: string[] }[];
  featured: Product | null;
  compare: [Product, Product] | null;
  shoppers: SceneShopper[];
  activeCategory: string | null;
  /** Turntable yaw in radians, driven by keyboard buttons or Leap. */
  yawRef: MutableRefObject<number>;
  inspect: boolean;
  reducedMotion: boolean;
  onSelectCategory: (id: string) => void;
  onSelectProduct: (id: string) => void;
}

const [CX, , CZ] = COUNCIL_RING.center;
const TABLE = { radius: 2.3, top: 1.5 } as const;
/** The product GLBs are authored in meters; the room is in feet. */
const M_TO_FT = 3.28;
const SEAT_RADIUS = 4.4;

class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Gltf({ url, scale = 1 }: { url: string; scale?: number }) {
  const { scene } = useGLTF(url);
  const copy = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={copy} scale={scale} />;
}

/** Local GLB with a procedural stand-in while loading or after a failure. */
function Model({ url, fallback, scale }: { url?: string; fallback: ReactNode; scale?: number }) {
  if (!url) return <>{fallback}</>;
  return (
    <ModelBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <Gltf url={url} scale={scale} />
      </Suspense>
    </ModelBoundary>
  );
}

const FallbackProduct = ({ color = "#9aa3ad", size = 1 }: { color?: string; size?: number }) => (
  <mesh position={[0, 0.4 * size, 0]} castShadow>
    <cylinderGeometry args={[0.22 * size, 0.26 * size, 0.8 * size, 24]} />
    <meshStandardMaterial color={color} metalness={0.4} roughness={0.4} />
  </mesh>
);

/** A round wooden coffee table on the council rug, in the room's low-poly furniture style. */
function CoffeeTable() {
  return (
    <group position={[CX, 0, CZ]}>
      <mesh position-y={TABLE.top - 0.09} castShadow receiveShadow>
        <cylinderGeometry args={[TABLE.radius, TABLE.radius, 0.18, 64]} />
        <meshStandardMaterial color="#8a5a36" roughness={0.6} />
      </mesh>
      <mesh position-y={TABLE.top - 0.2}>
        <cylinderGeometry args={[TABLE.radius - 0.1, TABLE.radius - 0.1, 0.06, 64]} />
        <meshStandardMaterial color="#5a3a24" roughness={0.7} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        return (
          <mesh key={i} position={[Math.cos(a) * (TABLE.radius - 0.45), (TABLE.top - 0.2) / 2, Math.sin(a) * (TABLE.radius - 0.45)]}>
            <cylinderGeometry args={[0.1, 0.08, TABLE.top - 0.2, 10]} />
            <meshStandardMaterial color="#3a2616" />
          </mesh>
        );
      })}
    </group>
  );
}

function Turntable({ yawRef, reducedMotion, children }: { yawRef: MutableRefObject<number>; reducedMotion: boolean; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!group.current) return;
    const target = yawRef.current;
    group.current.rotation.y = reducedMotion ? target : THREE.MathUtils.damp(group.current.rotation.y, target, 8, dt);
  });
  return <group ref={group}>{children}</group>;
}

/** Category tiles around the table edge; they rise in one after another when the bundle changes. */
function CategoryBlock({ index, count, label, total, active, reducedMotion, onSelect }: {
  index: number; count: number; label: string; total: number; active: boolean; reducedMotion: boolean; onSelect: () => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const born = useRef<number | null>(null);
  // Fanned around the camera side of the table, leaving the center for the inspected product.
  const angle = Math.PI / 2 + ((index + 0.5) / Math.max(1, count) - 0.5) * Math.PI * 1.35;
  const x = CX + Math.cos(angle) * (TABLE.radius - 0.4);
  const z = CZ + Math.sin(angle) * (TABLE.radius - 0.4);
  // Alternate label heights so neighbouring tiles never print over each other.
  const labelY = index % 2 ? 0.75 : 0.35;
  useFrame(({ clock }) => {
    if (!ref.current) return;
    if (born.current === null) born.current = clock.elapsedTime + index * 0.15;
    const t = reducedMotion ? 1 : THREE.MathUtils.clamp((clock.elapsedTime - born.current) / 0.5, 0, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    ref.current.scale.setScalar(Math.max(0.001, eased));
    ref.current.position.y = TABLE.top + 0.08 + (active ? 0.08 : 0) + (1 - eased) * 0.6;
  });
  return (
    <mesh
      ref={ref}
      position={[x, TABLE.top + 0.08, z]}
      rotation-y={-angle + Math.PI / 2}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <boxGeometry args={[0.55, 0.16, 0.34]} />
      <meshStandardMaterial color={active ? "#d9913b" : "#3f6b52"} roughness={0.6} />
      <SpriteLabel lines={[`${label} $${total}`]} position={[0, labelY, 0]} lineHeight={0.02} background={active ? "rgba(217,145,59,0.95)" : "rgba(20,23,27,0.85)"} />
    </mesh>
  );
}

function profileFor(shopper: SceneShopper): FamilyProfile {
  return { id: shopper.id, name: shopper.name, relationship: "shopper", look: "", colors: [shopper.color], personality: [], loves: [], avoids: [], houseRules: [] };
}

/** A shopper standing behind the table, facing it, with their name and the engine's reason above. */
function Seat({ shopper, look, position, labelLift }: { shopper: SceneShopper; look: CharacterLook; position: [number, number, number]; labelLift: number }) {
  const profile = useMemo(() => profileFor(shopper), [shopper]);
  const mood = useRef<SpriteMood>("idle");
  mood.current = shopper.reaction ? "happy" : "idle";
  const gaze = useRef({ x: 0, y: -0.2 });
  const height = MODEL_HEIGHT * characterForLook(look, shopper.id).scale;
  const yaw = Math.atan2(CX - position[0], CZ - position[2]);
  return (
    <group position={position}>
      <group rotation-y={yaw}>
        <CharacterModel profile={profile} mood={mood} gaze={gaze} look={look} />
      </group>
      <SpriteLabel
        lines={shopper.reaction ? [shopper.name, shopper.reaction] : [shopper.name]}
        position={[0, height + 0.7 + labelLift, 0]}
        lineHeight={0.021}
        background="rgba(255,253,248,0.95)"
        color="#22262b"
        bold
        maxWidthPx={560}
      />
    </group>
  );
}

/**
 * Looks come from the People Maker roster when a saved person shares the shopper's name (so Maya is
 * the Maya from the living room); anyone else gets the plain starter look in their seat color.
 */
function useShopperLooks(shoppers: SceneShopper[]): CharacterLook[] {
  useRosterHydration();
  const people = usePeople();
  const looks = useRoster((s) => s.looks);
  return useMemo(
    () =>
      shoppers.map((s) => {
        const bare = s.name.replace(/\s*\(you\)$/, "").trim().toLowerCase();
        const person = people.find((p) => p.name.trim().toLowerCase() === bare);
        const saved = person ? looks[person.id] : undefined;
        return saved ?? { ...BLANK_LOOK, bodyColor: s.color, accessory: { ...BLANK_LOOK.accessory, color: s.color } };
      }),
    [shoppers, people, looks],
  );
}

/** Seats spread around the far side of the table so nobody stands between the camera and the cart. */
function seatPositions(count: number): [number, number, number][] {
  const span = Math.min(0.95 * Math.max(0, count - 1), 2.8);
  return Array.from({ length: count }, (_, i) => {
    const a = count === 1 ? 0 : -span / 2 + (span * i) / (count - 1);
    return [CX + Math.sin(a) * SEAT_RADIUS, 0, CZ - Math.cos(a) * SEAT_RADIUS];
  });
}

const OVERVIEW = { position: new THREE.Vector3(CX, 8.6, CZ + 10.5), target: new THREE.Vector3(CX, 2.0, CZ - 0.4) };
const CLOSE_UP = { position: new THREE.Vector3(CX, TABLE.top + 2.4, CZ + 3.6), target: new THREE.Vector3(CX, TABLE.top + 0.6, CZ) };

function CameraRig({ inspect, reducedMotion }: { inspect: boolean; reducedMotion: boolean }) {
  const { camera } = useThree();
  const last = useRef<boolean | null>(null);
  const settling = useRef(0);
  useFrame((_, dt) => {
    // Glide only when the mode changes, so OrbitControls keeps the user's view the rest of the time.
    if (last.current !== inspect) {
      last.current = inspect;
      settling.current = reducedMotion ? 0.001 : 1.2;
    }
    if (settling.current <= 0) return;
    settling.current -= dt;
    const goal = inspect ? CLOSE_UP : OVERVIEW;
    if (reducedMotion || settling.current <= 0) camera.position.copy(goal.position);
    else camera.position.lerp(goal.position, 1 - Math.exp(-5 * dt));
    camera.lookAt(goal.target);
  });
  return null;
}

export default function MissionRoom(props: MissionTableProps) {
  const { categories, featured, compare, shoppers, activeCategory, yawRef, inspect, reducedMotion } = props;
  const seated = shoppers.slice(0, 6);
  const looks = useShopperLooks(seated);
  const seats = seatPositions(seated.length);
  return (
    <>
      <Leva hidden />
      <Canvas
        className="scene-canvas"
        shadows
        dpr={[1, 1.5]}
        camera={{ position: OVERVIEW.position.toArray(), fov: 42, near: 0.1, far: 200 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ camera }) => camera.lookAt(OVERVIEW.target)}
      >
        <Suspense fallback={null}>
          <Lighting />
          <RoomShell />
          <Hearth />
          <Rug />
          <Furniture />
          <pointLight position={[CX, 5.5, CZ + 1]} intensity={18} distance={14} color="#ffd9a8" />
        </Suspense>
        <CameraRig inspect={inspect} reducedMotion={reducedMotion} />
        <OrbitControls
          enabled={!inspect}
          enablePan={false}
          minDistance={4}
          maxDistance={16}
          minPolarAngle={0.35}
          maxPolarAngle={1.3}
          target={OVERVIEW.target.toArray()}
        />

        <CoffeeTable />

        {/* Center: the product under inspection, rotated by mouse/keyboard/Leap. */}
        <group position={[CX, TABLE.top, CZ + (compare ? -0.5 : 0)]}>
          <Turntable yawRef={yawRef} reducedMotion={reducedMotion}>
            {featured && (
              <group onClick={(e) => (e.stopPropagation(), props.onSelectProduct(featured.id))}>
                <Model key={featured.id} url={modelFor(featured)} fallback={<FallbackProduct size={1.8} />} scale={2.6 * M_TO_FT} />
              </group>
            )}
          </Turntable>
        </group>

        {/* Comparison tray: two products at the front of the table. */}
        {compare && (
          <group position={[CX, TABLE.top, CZ + 1.1]}>
            {compare.map((p, i) => (
              <group key={p.id} position={[i * 1.0 - 0.5, 0, 0]} onClick={(e) => (e.stopPropagation(), props.onSelectProduct(p.id))}>
                <Model url={modelFor(p)} fallback={<FallbackProduct color={i ? "#c98b4a" : "#9aa3ad"} />} scale={0.8 * M_TO_FT} />
                <SpriteLabel lines={[`${p.name} · $${p.price}`]} position={[0, 1.3, 0]} lineHeight={0.022} />
              </group>
            ))}
          </group>
        )}

        {categories.map((c, i) => (
          <CategoryBlock
            key={c.id}
            index={i}
            count={categories.length}
            label={c.label}
            total={c.total}
            active={activeCategory === c.id}
            reducedMotion={reducedMotion}
            onSelect={() => props.onSelectCategory(c.id)}
          />
        ))}

        <Suspense fallback={null}>
          {seated.map((s, i) => (
            <Seat key={s.id} shopper={s} look={looks[i]!} position={seats[i]!} labelLift={i % 2 ? 0.9 : 0} />
          ))}
        </Suspense>
      </Canvas>
    </>
  );
}
