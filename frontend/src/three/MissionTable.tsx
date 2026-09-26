import { OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, type ReactNode, Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Product } from "../services/contracts";
import { SpriteLabel } from "./SpriteLabel";

// Cabin planning table. Everything here is presentational: it draws what the state says (cart,
// selection, comparison) and reports clicks back. Models are local GLBs preloaded at startup; any
// model that fails to load falls back to a simple mesh so the scene never blanks during judging.

export const MODEL_URLS = ["/models/table.glb", "/models/press.glb", "/models/lantern.glb", "/models/stove.glb", "/models/cooler.glb", "/models/mug.glb"];

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
  yawRef: React.MutableRefObject<number>;
  inspect: boolean;
  reducedMotion: boolean;
  onSelectCategory: (id: string) => void;
  onSelectProduct: (id: string) => void;
}

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

const FallbackProduct = ({ color = "#9aa3ad" }: { color?: string }) => (
  <mesh position={[0, 0.12, 0]} castShadow>
    <cylinderGeometry args={[0.07, 0.08, 0.24, 24]} />
    <meshStandardMaterial color={color} metalness={0.4} roughness={0.4} />
  </mesh>
);

const FallbackTable = () => (
  <group>
    <mesh position={[0, 0.725, 0]} receiveShadow>
      <cylinderGeometry args={[0.8, 0.8, 0.05, 64]} />
      <meshStandardMaterial color="#9c6b43" roughness={0.7} />
    </mesh>
    <mesh position={[0, 0.36, 0]}>
      <cylinderGeometry args={[0.08, 0.12, 0.7, 24]} />
      <meshStandardMaterial color="#6e4a2e" />
    </mesh>
  </group>
);

const TABLE_TOP = 0.75;

function Turntable({ yawRef, reducedMotion, children }: { yawRef: React.MutableRefObject<number>; reducedMotion: boolean; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!group.current) return;
    const target = yawRef.current;
    group.current.rotation.y = reducedMotion ? target : THREE.MathUtils.damp(group.current.rotation.y, target, 8, dt);
  });
  return <group ref={group}>{children}</group>;
}

/** Category blocks around the cart center; they rise in one after another when the bundle changes. */
function CategoryBlock({ index, count, label, total, active, reducedMotion, onSelect }: {
  index: number; count: number; label: string; total: number; active: boolean; reducedMotion: boolean; onSelect: () => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const born = useRef<number | null>(null);
  // Evenly around the table, starting front-left, leaving the center for the inspected product.
  const angle = Math.PI * 0.75 + (index / Math.max(1, count)) * Math.PI * 2;
  const x = Math.cos(angle) * 0.56;
  const z = Math.sin(angle) * 0.5;
  useFrame(({ clock }) => {
    if (!ref.current) return;
    if (born.current === null) born.current = clock.elapsedTime + index * 0.15;
    const t = reducedMotion ? 1 : THREE.MathUtils.clamp((clock.elapsedTime - born.current) / 0.5, 0, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    ref.current.scale.setScalar(Math.max(0.001, eased));
    ref.current.position.y = TABLE_TOP + 0.03 + (active ? 0.03 : 0) + (1 - eased) * 0.2;
  });
  return (
    <mesh
      ref={ref}
      position={[x, TABLE_TOP + 0.03, z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <boxGeometry args={[0.16, 0.05, 0.1]} />
      <meshStandardMaterial color={active ? "#d9913b" : "#3f6b52"} roughness={0.6} />
      <SpriteLabel lines={[`${label} $${total}`]} position={[0, 0.1, 0]} lineHeight={0.024} background={active ? "rgba(217,145,59,0.95)" : "rgba(20,23,27,0.85)"} />
    </mesh>
  );
}

function Seat({ shopper, position }: { shopper: SceneShopper; position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.0, 0]}>
        <sphereGeometry args={[0.09, 24, 16]} />
        <meshStandardMaterial color={shopper.color} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.06, 0.1, 0.18, 16]} />
        <meshStandardMaterial color={shopper.color} roughness={0.6} />
      </mesh>
      <SpriteLabel
        lines={shopper.reaction ? [shopper.name, shopper.reaction] : [shopper.name]}
        position={[0, 1.3, 0]}
        lineHeight={0.026}
        background="rgba(255,253,248,0.95)"
        color="#22262b"
        bold
        maxWidthPx={560}
      />
    </group>
  );
}

const SEATS: [number, number, number][] = [[-0.95, 0, -0.75], [0.95, 0, -0.75], [-0.95, 0, 0.6], [0.95, 0, 0.6]];

function CameraRig({ inspect, reducedMotion }: { inspect: boolean; reducedMotion: boolean }) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const goal = inspect ? target.set(0, 1.15, 0.7) : target.set(0, 2.1, 2.2);
    if (reducedMotion) camera.position.copy(goal);
    else camera.position.lerp(goal, 1 - Math.exp(-4 * dt));
    camera.lookAt(0, inspect ? 0.85 : 0.72, 0);
  });
  return null;
}

export default function MissionTable(props: MissionTableProps) {
  const { categories, featured, compare, shoppers, activeCategory, yawRef, inspect, reducedMotion } = props;
  return (
    <Canvas
      className="scene-canvas"
      dpr={[1, 1.75]}
      camera={{ position: [0, 2.1, 2.2], fov: 44 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => gl.setClearColor("#1b1f24")}
    >
      <hemisphereLight args={["#fff3dd", "#20262c", 0.9]} />
      <directionalLight position={[2, 4, 2]} intensity={1.4} />
      <pointLight position={[0, 1.6, 0]} intensity={0.6} color="#ffcf8a" />
      <CameraRig inspect={inspect} reducedMotion={reducedMotion} />
      <OrbitControls
        enabled={!inspect}
        enablePan={false}
        minDistance={1.4}
        maxDistance={3.6}
        minPolarAngle={0.3}
        maxPolarAngle={1.25}
        target={[0, 0.72, 0]}
      />

      <Model url="/models/table.glb" fallback={<FallbackTable />} />

      {/* Center: the product under inspection, rotated by mouse/keyboard/Leap. */}
      <group position={[0, TABLE_TOP, compare ? -0.12 : 0]}>
        <Turntable yawRef={yawRef} reducedMotion={reducedMotion}>
          {featured && (
            <group onClick={(e) => (e.stopPropagation(), props.onSelectProduct(featured.id))}>
              <Model key={featured.id} url={featured.modelUrl} fallback={<FallbackProduct />} scale={1.6} />
            </group>
          )}
        </Turntable>
      </group>

      {/* Right: comparison tray with two products. */}
      {compare && (
        <group position={[0, TABLE_TOP, 0.42]}>
          {compare.map((p, i) => (
            <group key={p.id} position={[i * 0.26 - 0.13, 0, 0]} onClick={(e) => (e.stopPropagation(), props.onSelectProduct(p.id))}>
              <Model url={p.modelUrl} fallback={<FallbackProduct color={i ? "#c98b4a" : "#9aa3ad"} />} scale={0.8} />
              <SpriteLabel lines={[`${p.name} · $${p.price}`]} position={[0, 0.38, 0]} lineHeight={0.024} />
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

      {shoppers.slice(0, 4).map((s, i) => (
        <Seat key={s.id} shopper={s} position={SEATS[i]} />
      ))}
    </Canvas>
  );
}
