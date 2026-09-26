"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef, type CSSProperties } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, MeshDistortMaterial, Sparkles } from "@react-three/drei";
import { easing } from "maath";
import { Color, Vector3, type Group, type Mesh } from "three";
import { SpeechBubble } from "@/components/council/SpeechBubble";
import { COUNCIL_RING, HEARTH, SPRITE_FLOAT_HEIGHT, homePosition, seatPosition } from "@/lib/stage/layout";
import { useStage } from "@/lib/stage/store";
import { getTargetWorldPosition, registerTarget } from "@/lib/stage/targets";
import type { FamilyProfile } from "@/types/domain";
import { IconMesh } from "./IconMesh";
import { iconsForProfile } from "./icons";
import { createAuraMaterial, createRimMaterial, sharedSpriteAssets, spriteTuning } from "./materials";
import { applyOverlays, moodStyle, resolveMood, type MoodStyle } from "./moodStyle";
import { accentColor, coreColor, rimColor } from "./palette";
import { SparkleTrail } from "./SparkleTrail";
import styles from "./SpriteToken.module.css";
import { typingDuration } from "./typewriter";

// One family member's sprite. Discrete store fields (bubble, mood, phase) re-render it; everything
// per-frame (hand pose, glide, mood dials) is read with getState() and applied to refs in useFrame.

type DistortMaterial = ComponentRef<typeof MeshDistortMaterial>;

const VETO_RED = new Color("#ff2a2a");
const ORBIT_RADIUS = 1.05;
const DRAG_LIFT = 0.5;
const BUBBLE_Y = SPRITE_FLOAT_HEIGHT + 1.2;
const LABEL_Y = SPRITE_FLOAT_HEIGHT - 1.05;
const EYE_X = 0.19;
const EYE_Y = 0.1;
const EYE_Z = 0.57;

/** Numeric MoodStyle dials that are damped every frame. */
const DIALS = [
  "distort",
  "speed",
  "scale",
  "bounce",
  "saturation",
  "brightness",
  "orbitSpeed",
  "pulse",
  "droop",
  "wobble",
  "jump",
  "lean",
  "wave",
  "rimFlash",
  "aura",
] as const satisfies ReadonlyArray<keyof MoodStyle>;

function hashSeed(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return hash;
}

/** Side seats grow their bubbles outward (as seen from the camera) so seated bubbles don't overlap. */
function bubbleSide(seat: number | null): "left" | "center" | "right" {
  const angle = seat === null ? 0 : (COUNCIL_RING.seatAngles[seat] ?? 0);
  return angle < -0.1 ? "left" : angle > 0.1 ? "right" : "center";
}

export interface SpriteTokenProps {
  profile: FamilyProfile;
}

export function SpriteToken({ profile }: SpriteTokenProps) {
  const { id, name, colors } = profile;
  const targetId = `sprite:${id}` as const;
  const assets = sharedSpriteAssets();
  const icons = useMemo(() => iconsForProfile(profile), [profile]);
  const palette = useMemo(() => {
    const core = new Color(coreColor(colors));
    return {
      core: coreColor(colors),
      rim: rimColor(colors),
      accent: accentColor(colors),
      coreHsl: core.getHSL({ h: 0, s: 0, l: 0 }),
      rimColor: new Color(rimColor(colors)),
    };
  }, [colors]);
  const materials = useMemo(
    () => ({ rim: createRimMaterial(palette.rim), aura: createAuraMaterial(palette.core, 0.3) }),
    [palette],
  );
  useEffect(
    () => () => {
      materials.rim.dispose();
      materials.aura.dispose();
    },
    [materials],
  );

  const root = useRef<Group>(null);
  const float = useRef<Group>(null);
  const body = useRef<Group>(null);
  const core = useRef<Mesh>(null);
  const distort = useRef<DistortMaterial>(null);
  const eyes = useRef<Group>(null);
  const eyeLeft = useRef<Group>(null);
  const eyeRight = useRef<Group>(null);
  const orbit = useRef<Group>(null);
  const emitting = useRef(false);

  const bubble = useStage((state) => state.sprites[id]?.bubble ?? null);
  const thinking = useStage((state) => state.sprites[id]?.mood === "thinking");
  const celebrating = useStage((state) => state.phase === "receipt");
  const seat = useStage((state) => state.sprites[id]?.seat ?? null);
  const bubbleAlign = bubbleSide(seat);

  // When the current bubble started typing, so the sprite bounces only while it types.
  const bubbleTiming = useRef({ start: 0, duration: 0 });
  useEffect(() => {
    bubbleTiming.current = { start: performance.now() / 1000, duration: typingDuration(bubble) };
  }, [bubble]);

  const scratch = useMemo(
    () => ({
      style: { ...moodStyle("idle") },
      goal: new Vector3(),
      look: new Vector3(),
      local: new Vector3(),
      color: new Color(),
      seed: hashSeed(id),
    }),
    [id],
  );
  const anim = useRef({
    ...Object.fromEntries(DIALS.map((dial) => [dial, moodStyle("idle")[dial]])),
    time: 0,
    bouncePhase: 0,
    jumpPhase: 0,
    hop: 0,
    lift: 0,
    blinkAt: 1 + (hashSeed(id) % 30) / 10,
    blinkEnd: 0,
    prevMood: "idle",
  } as Record<(typeof DIALS)[number], number> & {
    time: number;
    bouncePhase: number;
    jumpPhase: number;
    hop: number;
    lift: number;
    blinkAt: number;
    blinkEnd: number;
    prevMood: string;
  });

  // Start at home instead of gliding in from the origin.
  useLayoutEffect(() => {
    const [x, , z] = homePosition(id);
    root.current?.position.set(x, 0, z);
  }, [id]);

  useEffect(() => (float.current ? registerTarget(targetId, float.current, 0.9) : undefined), [targetId]);

  useFrame(({ clock, camera }, rawDelta) => {
    const group = root.current;
    const floatGroup = float.current;
    const bodyGroup = body.current;
    const material = distort.current;
    if (!group || !floatGroup || !bodyGroup || !material) return;

    const delta = Math.min(rawDelta, 0.1);
    const t = clock.elapsedTime;
    const stage = useStage.getState();
    const { hand } = stage;
    const sprite = stage.sprites[id];
    const held = hand.draggingSpriteId === id;
    const hovered = !held && hand.hoverTarget === targetId;
    const timing = bubbleTiming.current;
    const typing = performance.now() / 1000 - timing.start < timing.duration;
    const mood = resolveMood({ id, mood: sprite?.mood ?? "idle", phase: stage.phase, conflict: stage.conflict, typing });
    const style = applyOverlays(moodStyle(mood), { hovered, held }, scratch.style);
    const a = anim.current;

    // Perk up with a hop when the conflict resolves (a bundle arrived) or the party starts.
    if ((a.prevMood === "conceding" && mood !== "conceding") || (mood === "celebrating" && a.prevMood !== mood)) a.hop = 1;
    a.prevMood = mood;

    for (const dial of DIALS) easing.damp(a, dial, style[dial], dial === "scale" ? 0.18 : 0.3, delta);
    easing.damp(a, "lift", held ? DRAG_LIFT : 0, 0.15, delta);
    a.time += delta * a.speed;
    a.bouncePhase += delta * Math.PI * style.bounceRate;
    a.jumpPhase += delta * Math.PI * 1.4;
    a.hop = Math.max(0, a.hop - delta * 1.6);

    // Glide: the hand while dragged, else the ring seat, else home.
    const seatIndex = sprite?.seat ?? null;
    const [gx, , gz] =
      held && hand.floorPoint ? hand.floorPoint : seatIndex !== null ? seatPosition(seatIndex) : homePosition(id);
    easing.damp3(group.position, scratch.goal.set(gx, 0, gz), held ? 0.07 : 0.45, delta);

    floatGroup.position.y =
      SPRITE_FLOAT_HEIGHT +
      a.lift +
      Math.sin(t * 1.3 + scratch.seed) * 0.08 +
      a.bounce * Math.abs(Math.sin(a.bouncePhase)) +
      a.jump * Math.abs(Math.sin(a.jumpPhase)) +
      Math.sin(a.hop * Math.PI) * 0.7 -
      a.droop * 0.35;

    // Facing: the hearth when seated and calm, the vetoed item during a veto, otherwise the room.
    const look = scratch.look;
    if (style.facing === "hearth") look.set(HEARTH.position[0], 0, HEARTH.position[2]);
    else if (!(style.facing === "item" && stage.conflict?.itemId && getTargetWorldPosition(`item:${stage.conflict.itemId}`, look)))
      look.copy(camera.position);
    easing.dampAngle(bodyGroup.rotation, "y", Math.atan2(look.x - group.position.x, look.z - group.position.z), 0.35, delta);
    bodyGroup.rotation.x = a.lean + a.droop * 0.4;
    bodyGroup.rotation.z = a.wobble * Math.sin(t * 7) + a.wave * Math.sin(t * 4.5);
    bodyGroup.scale.setScalar(a.scale);

    // Core: distortion is the thinking dial; saturation and glow carry the mood.
    core.current?.scale.setScalar(1 + a.pulse * Math.sin(t * 6));
    material.distort = a.distort;
    material.time = a.time;
    const { h, s, l } = palette.coreHsl;
    const lightness = a.saturation > 1 ? l - (a.saturation - 1) * 0.15 : l;
    material.color.setHSL(h, Math.min(1, s * a.saturation), lightness);
    material.emissive.copy(material.color);
    material.emissiveIntensity = spriteTuning.glow * a.brightness;

    const flash = a.rimFlash * (0.5 + 0.5 * Math.sin(t * 14));
    materials.rim.uniforms.uColor!.value.copy(palette.rimColor).lerp(VETO_RED, flash);
    materials.rim.uniforms.uIntensity!.value = spriteTuning.rim * (0.3 + 0.7 * a.brightness) + flash * 1.5;
    materials.aura.uniforms.uOpacity!.value = a.aura * 0.7;

    // Icons orbit faster the harder the sprite thinks.
    const orbitGroup = orbit.current;
    if (orbitGroup) {
      orbitGroup.rotation.y += delta * a.orbitSpeed;
      orbitGroup.scale.setScalar(a.scale);
      orbitGroup.children.forEach((child, index) => {
        const angle = (index / orbitGroup.children.length) * Math.PI * 2;
        child.position.set(Math.cos(angle) * ORBIT_RADIUS, Math.sin(t * 1.6 + index * 2) * 0.18, Math.sin(angle) * ORBIT_RADIUS);
        child.rotation.y += delta * 1.4;
      });
    }

    // Eyes follow the hand cursor (or the audience), and blink every few seconds.
    if (eyes.current) {
      if (held || !hand.present) look.copy(camera.position);
      else if (hand.floorPoint) look.set(hand.floorPoint[0], 1.2, hand.floorPoint[2]);
      else look.set(hand.pointer[0], hand.pointer[1], 0.5).unproject(camera);
      const local = bodyGroup.worldToLocal(scratch.local.copy(look)).sub(eyes.current.position).normalize();
      const eyeGoalX = Math.max(-1, Math.min(1, local.x)) * 0.07;
      const eyeGoalY = EYE_Y + Math.max(-1, Math.min(1, local.y)) * 0.06;
      easing.damp(eyes.current.position, "x", eyeGoalX, 0.12, delta);
      easing.damp(eyes.current.position, "y", eyeGoalY, 0.12, delta);

      if (t > a.blinkAt) {
        a.blinkEnd = t + 0.13;
        a.blinkAt = t + 2 + Math.random() * 3.5;
      }
      const open = t < a.blinkEnd ? 0.12 : 1;
      eyeLeft.current?.scale.set(1, open, 1);
      eyeRight.current?.scale.set(1, open, 1);
    }

    emitting.current = style.trail;
  });

  const eye = (ref: typeof eyeLeft, side: number) => (
    <group ref={ref} position={[side * EYE_X, 0, 0]}>
      <mesh geometry={assets.eye} material={assets.eyeMaterial} scale={[0.075, 0.1, 0.05]} />
      <mesh geometry={assets.eye} material={assets.glintMaterial} position={[0.025, 0.035, 0.04]} scale={0.022} />
    </group>
  );

  return (
    <>
      <group ref={root}>
        <mesh geometry={assets.aura} material={materials.aura} position-y={0.03} rotation-x={-Math.PI / 2} />

        <group ref={float} position-y={SPRITE_FLOAT_HEIGHT}>
          <group ref={body} rotation-order="YXZ">
            <mesh ref={core} geometry={assets.core}>
              <MeshDistortMaterial
                ref={distort}
                color={palette.core}
                emissive={palette.core}
                emissiveIntensity={spriteTuning.glow}
                roughness={0.35}
                clearcoat={0.6}
                distort={0.22}
              />
            </mesh>
            <mesh geometry={assets.rim} material={materials.rim} />
            <group ref={eyes} position={[0, EYE_Y, EYE_Z]}>
              {eye(eyeLeft, -1)}
              {eye(eyeRight, 1)}
            </group>
          </group>

          <group ref={orbit}>
            {icons.map((icon, index) => (
              <group key={`${icon.kind}-${index}`} scale={0.24}>
                <IconMesh icon={icon} />
              </group>
            ))}
          </group>

          {celebrating && (
            <Sparkles count={48} scale={3.2} size={7} speed={1.4} noise={1.5} color={palette.rim} />
          )}
        </group>

        <Html position={[0, BUBBLE_Y, 0]} zIndexRange={[0, 0]} pointerEvents="none">
          <SpeechBubble speaker={name} text={bubble} thinking={thinking} accent={palette.accent} align={bubbleAlign} />
        </Html>
        <Html position={[0, LABEL_Y, 0]} zIndexRange={[0, 0]} pointerEvents="none">
          <div className={styles.label} style={{ "--accent": palette.accent, "--core": palette.core } as CSSProperties}>
            <span className={styles.dot} />
            {name}
          </div>
        </Html>
      </group>

      <SparkleTrail source={float} emitting={emitting} color={palette.rim} />
    </>
  );
}
