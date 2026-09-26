"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, ExtrudeGeometry, MeshStandardMaterial, Object3D, Shape, Vector3, type Group } from "three";
import { lobbySpot } from "@/lib/people/roster";
import { SPRITE_FLOAT_HEIGHT, TREE } from "@/lib/stage/layout";
import { useStage } from "@/lib/stage/store";
import { getTarget, getTargetWorldPosition, registerTarget } from "@/lib/stage/targets";
import type { Bundle, CatalogItem } from "@/types/domain";
import { ANCHOR_COUNT, allocateAnchors, servingSprite, type AnchorAssignment } from "./anchors";
import { ornamentStyle, topperKind, type OrnamentStyle } from "./catalog";
import { LowPolyDino } from "./LowPolyDino";
import { TOPPER_FALLBACK } from "./TreeAssembly";
import { TIMING, easeInOutCubic, easeOutBack, progress } from "./timing";

const BAUBLE_RADIUS = 0.21;
const DINO_ORNAMENT_HEIGHT = 0.7;
const LAND_BOUNCE_MS = 260;

/** Where a flight starts: the ornament box for the resolved veto item, else the serving sprite. */
function launchOrigin(spriteId: string | null, boxItemId: string | null, out: Vector3): Vector3 {
  if (boxItemId && getTargetWorldPosition(`item:${boxItemId}`, out)) return out.setY(out.y + 0.6);
  if (spriteId && getTargetWorldPosition(`sprite:${spriteId}`, out)) return out;
  if (spriteId) {
    const [x, , z] = lobbySpot(spriteId);
    return out.set(x, SPRITE_FLOAT_HEIGHT, z);
  }
  return out.set(TREE.position[0] + 3, 6, TREE.position[2] + 4);
}

/** Quadratic Bézier from origin to target with a control point lifted above their midpoint. */
function bezier(origin: Vector3, target: Vector3, t: number, out: Vector3): Vector3 {
  const lift = 2.2 + origin.distanceTo(target) * 0.15;
  const cx = (origin.x + target.x) / 2;
  const cy = Math.max(origin.y, target.y) + lift;
  const cz = (origin.z + target.z) / 2;
  const a = (1 - t) ** 2;
  const b = 2 * (1 - t) * t;
  const c = t ** 2;
  return out.set(a * origin.x + b * cx + c * target.x, a * origin.y + b * cy + c * target.y, a * origin.z + b * cz + c * target.z);
}

interface Flight {
  launched: boolean;
  origin: Vector3;
  landedAt: number | null;
}

function newFlight(): Flight {
  return { launched: false, origin: new Vector3(), landedAt: null };
}

/**
 * Advances one flight and poses its object. Returns true once landed. `launchAt` may move later
 * until launch (the veto box holds its ornaments until the T-rex has shrunk into it).
 */
function stepFlight(
  object: Object3D,
  flight: Flight,
  now: number,
  launchAt: number,
  target: Vector3 | null,
  origin: () => Vector3,
  spin: number,
): boolean {
  if (!target || now < launchAt) {
    object.visible = false;
    return false;
  }
  if (!flight.launched) {
    flight.launched = true;
    flight.origin.copy(origin());
  }
  object.visible = true;
  const t = progress(now, launchAt, TIMING.flight);
  if (t < 1) {
    bezier(flight.origin, target, easeInOutCubic(t), object.position);
    object.scale.setScalar(Math.min(1, t * 6));
    object.rotation.y = spin + t * Math.PI * 3;
    return false;
  }
  flight.landedAt ??= now;
  object.position.copy(target);
  object.rotation.y = spin;
  const bounce = progress(now, flight.landedAt, LAND_BOUNCE_MS);
  object.scale.setScalar(1 + Math.sin(bounce * Math.PI) * 0.35);
  return true;
}

function Bauble({ material, capMaterial }: { material: MeshStandardMaterial; capMaterial: MeshStandardMaterial }) {
  return (
    <group position-y={-BAUBLE_RADIUS * 0.9}>
      <mesh material={material}>
        <sphereGeometry args={[BAUBLE_RADIUS, 20, 16]} />
      </mesh>
      <mesh material={capMaterial} position-y={BAUBLE_RADIUS * 0.98}>
        <cylinderGeometry args={[0.055, 0.06, 0.08, 10]} />
      </mesh>
    </group>
  );
}

function OrnamentVisual({ style, index, materials, capMaterial }: { style: OrnamentStyle; index: number; materials: MeshStandardMaterial[]; capMaterial: MeshStandardMaterial }) {
  if (style.kind === "dino") {
    const body = style.colors[index % style.colors.length];
    return (
      <group scale={DINO_ORNAMENT_HEIGHT} position-y={-DINO_ORNAMENT_HEIGHT * 0.6}>
        <LowPolyDino colors={{ body, belly: "#f4ffd8", spikes: "#1f6f35" }} detailed={false} glow={style.glow} />
      </group>
    );
  }
  return <Bauble material={materials[index % materials.length]} capMaterial={capMaterial} />;
}

function OrnamentSet({
  item,
  assignments,
  capMaterial,
}: {
  item: CatalogItem;
  assignments: AnchorAssignment[];
  capMaterial: MeshStandardMaterial;
}) {
  const style = useMemo(() => ornamentStyle(item), [item]);
  const materials = useMemo(
    () =>
      style.colors.map(
        (color) =>
          new MeshStandardMaterial({
            color,
            metalness: style.metalness,
            roughness: style.roughness,
            transparent: style.opacity < 1,
            opacity: style.opacity,
            emissive: new Color(color),
            emissiveIntensity: style.glow,
          }),
      ),
    [style],
  );
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);

  const [mountedAt] = useState(() => performance.now());
  const objects = useRef<Array<Group | null>>([]);
  const flights = useRef(assignments.map(newFlight));
  const centroid = useRef<Group>(null);
  const unregister = useRef<(() => void) | null>(null);
  const target = useMemo(() => new Vector3(), []);
  const scratch = useMemo(() => new Vector3(), []);

  useEffect(() => () => unregister.current?.(), []);

  useFrame(() => {
    const now = performance.now();
    const beat = useStage.getState().scene.conflictBeat;
    const fromBox = beat !== null && beat.resolvedItemId === item.id && beat.resolveAt !== null;
    let landed = 0;
    const sum = scratch.set(0, 0, 0);
    assignments.forEach((assignment, index) => {
      const object = objects.current[index];
      const flight = flights.current[index];
      if (!object || !flight) return;
      let launchAt = mountedAt + TIMING.flightDelay + assignment.order * TIMING.flightStagger;
      if (fromBox) launchAt = Math.max(launchAt, beat.resolveAt! + TIMING.boxRelease + index * TIMING.flightStagger * 1.5);
      const anchor = getTargetWorldPosition(`anchor:${assignment.anchor}`, target);
      const origin = () => launchOrigin(assignment.spriteId, fromBox ? item.id : null, new Vector3());
      if (stepFlight(object, flight, now, launchAt, anchor, origin, assignment.anchor * 1.3)) {
        landed += 1;
        sum.add(object.position);
      }
    });
    // Once the whole set hangs on the tree, it becomes pointable as item:<id>.
    if (landed === assignments.length && landed > 0 && !unregister.current && centroid.current) {
      centroid.current.position.copy(sum.divideScalar(landed));
      unregister.current = registerTarget(`item:${item.id}`, centroid.current, 0.9);
    }
  });

  return (
    <group>
      <group ref={centroid} />
      {assignments.map((assignment, index) => (
        <group
          key={assignment.anchor}
          visible={false}
          ref={(group) => {
            objects.current[index] = group;
          }}
        >
          <OrnamentVisual style={style} index={index} materials={materials} capMaterial={capMaterial} />
        </group>
      ))}
    </group>
  );
}

function starGeometry(outer: number, inner: number): ExtrudeGeometry {
  const shape = new Shape();
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const radius = i % 2 === 0 ? outer : inner;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 1 });
  geometry.center();
  return geometry;
}

function TopperVisual({ item }: { item: CatalogItem }) {
  const kind = topperKind(item);
  const star = useMemo(() => (kind === "star" ? starGeometry(0.27, 0.12) : null), [kind]);
  if (kind === "dino") {
    return (
      <group scale={0.55} position-y={-0.05}>
        <LowPolyDino />
      </group>
    );
  }
  if (kind === "bow") {
    return (
      <group position-y={0.12}>
        {[-1, 1].map((side) => (
          <mesh key={side} position-x={side * 0.13} rotation-z={(side * Math.PI) / 2}>
            <coneGeometry args={[0.12, 0.26, 8]} />
            <meshStandardMaterial color="#ff6fbf" emissive="#ff6fbf" emissiveIntensity={0.4} />
          </mesh>
        ))}
        <mesh>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshStandardMaterial color="#ff9fd2" />
        </mesh>
      </group>
    );
  }
  return (
    <mesh geometry={star ?? undefined} position-y={0.2}>
      <meshStandardMaterial color="#ffd36b" emissive={new Color("#ffc23a")} emissiveIntensity={2.2} metalness={0.6} roughness={0.3} />
    </mesh>
  );
}

function TopperFlight({ item, spriteId }: { item: CatalogItem; spriteId: string | null }) {
  const object = useRef<Group>(null);
  const [mountedAt] = useState(() => performance.now());
  const flight = useRef(newFlight());
  const unregister = useRef<(() => void) | null>(null);
  const target = useMemo(() => new Vector3(), []);

  useEffect(() => () => unregister.current?.(), []);

  useFrame(({ clock }) => {
    if (!object.current) return;
    const tree = getTarget("tree")?.object;
    const node = tree?.getObjectByName("topper") ?? tree?.getObjectByName(TOPPER_FALLBACK);
    const launchAt = mountedAt + TIMING.flightDelay + (ANCHOR_COUNT + 2) * TIMING.flightStagger;
    const origin = () => launchOrigin(spriteId, null, new Vector3());
    const landed = stepFlight(object.current, flight.current, performance.now(), launchAt, node ? node.getWorldPosition(target) : null, origin, 0);
    if (landed) {
      object.current.rotation.y = clock.elapsedTime * 0.6;
      unregister.current ??= registerTarget(`item:${item.id}`, object.current, 0.5);
    }
  });

  return (
    <group ref={object} visible={false}>
      <TopperVisual item={item} />
    </group>
  );
}

/**
 * Each sprite's ornament sets fly from the sprite (or, for the resolved veto item, from its box) to
 * the tree's anchors, staggered. Sets and anchors are keyed so a revised bundle only re-flies the
 * sets that changed.
 */
export function OrnamentFlights() {
  const bundle = useStage((state) => state.bundle);
  const previous = useRef<AnchorAssignment[] | undefined>(undefined);
  const assignments = useMemo(
    () => (bundle ? allocateAnchors(bundle, ANCHOR_COUNT, previous.current) : []),
    [bundle],
  );
  useEffect(() => {
    previous.current = assignments.length > 0 ? assignments : undefined;
  }, [assignments]);

  const capMaterial = useMemo(() => new MeshStandardMaterial({ color: "#d9b25a", metalness: 0.9, roughness: 0.3 }), []);
  useEffect(() => () => capMaterial.dispose(), [capMaterial]);

  if (!bundle || !bundle.items.some((item) => item.slot === "tree")) return null;
  const sets = groupSets(bundle, assignments);
  const topper = bundle.items.find((item) => item.slot === "topper");
  return (
    <group>
      {sets.map(({ item, assignments: setAssignments }) => (
        <OrnamentSet
          key={`${item.id}:${setAssignments.map((a) => a.anchor).join(",")}`}
          item={item}
          assignments={setAssignments}
          capMaterial={capMaterial}
        />
      ))}
      {topper && <TopperFlight key={topper.id} item={topper} spriteId={servingSprite(bundle.serves, topper.id)} />}
    </group>
  );
}

function groupSets(bundle: Bundle, assignments: AnchorAssignment[]) {
  return bundle.items
    .filter((item) => item.slot === "ornaments")
    .map((item) => ({ item, assignments: assignments.filter((assignment) => assignment.itemId === item.id) }))
    .filter((set) => set.assignments.length > 0);
}
