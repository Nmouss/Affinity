"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Sparkles } from "@react-three/drei";
import { easing } from "maath";
import { Color, Vector3, type Group } from "three";
import { SpeechBubble } from "@/components/council/SpeechBubble";
import { COUNCIL_RING, SPRITE_FLOAT_HEIGHT, homePosition, seatPosition } from "@/lib/stage/layout";
import { useStage } from "@/lib/stage/store";
import { getTargetWorldPosition, registerTarget } from "@/lib/stage/targets";
import type { FamilyProfile } from "@/types/domain";
import type { SpriteMood } from "@/types/stage";
import { CharacterModel } from "./CharacterModel";
import { IconMesh } from "./IconMesh";
import { iconsForProfile } from "./icons";
import { createAuraMaterial } from "./materials";
import { applyOverlays, moodStyle, resolveMood, type MoodStyle } from "./moodStyle";
import { accentColor, coreColor, rimColor } from "./palette";
import { SparkleTrail } from "./SparkleTrail";
import styles from "./SpriteToken.module.css";
import { typingDuration } from "./typewriter";

// One family member's sprite. Discrete store fields (bubble, mood, phase) re-render it; everything
// per-frame (hand pose, glide, mood dials) is read with getState() and applied to refs in useFrame.

const VETO_RED = new Color("#ff2a2a");
const ORBIT_RADIUS = 1.05;
const DRAG_LIFT = 0.5;
const BUBBLE_Y = SPRITE_FLOAT_HEIGHT + 1.2;
const LABEL_Y = SPRITE_FLOAT_HEIGHT - 1.05;

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
  const auraMaterial = useMemo(() => createAuraMaterial(palette.core, 0.3), [palette]);
  useEffect(
    () => () => {
      auraMaterial.dispose();
    },
    [auraMaterial],
  );

  const root = useRef<Group>(null);
  const float = useRef<Group>(null);
  const body = useRef<Group>(null);
  const orbit = useRef<Group>(null);
  const emitting = useRef(false);
  const characterMood = useRef<SpriteMood>("idle");
  const characterGaze = useRef({ x: 0, y: 0 });

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
    if (!group || !floatGroup || !bodyGroup) return;

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
    characterMood.current = held ? "held" : hovered ? "hovered" : mood;
    characterGaze.current.x = hand.present ? hand.pointer[0] : 0;
    characterGaze.current.y = hand.present ? hand.pointer[1] : 0;
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
      Math.sin(a.hop * Math.PI) * 0.7 -
      a.droop * 0.35;

    // Seated characters stay three-quarter visible to the audience. Vetoes still turn toward the
    // disputed item, while unseated/speaking characters face the room camera.
    const look = scratch.look;
    let facingAngle: number;
    if (style.facing === "hearth" && seatIndex !== null) {
      facingAngle = -(COUNCIL_RING.seatAngles[seatIndex] ?? 0) * 0.8;
    } else {
      if (!(style.facing === "item" && stage.conflict?.itemId && getTargetWorldPosition(`item:${stage.conflict.itemId}`, look))) {
        look.copy(camera.position);
      }
      facingAngle = Math.atan2(look.x - group.position.x, look.z - group.position.z);
    }
    easing.dampAngle(bodyGroup.rotation, "y", facingAngle, 0.35, delta);
    bodyGroup.scale.setScalar(a.scale);

    const flash = a.rimFlash * (0.5 + 0.5 * Math.sin(t * 14));
    auraMaterial.uniforms.uColor!.value.copy(palette.rimColor).lerp(VETO_RED, flash);
    auraMaterial.uniforms.uOpacity!.value = a.aura * 0.7;

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

    emitting.current = style.trail;
  });

  return (
    <>
      <group ref={root}>
        <mesh position-y={0.03} rotation-x={-Math.PI / 2} material={auraMaterial}>
          <circleGeometry args={[1.4, 40]} />
        </mesh>

        <group ref={float} position-y={SPRITE_FLOAT_HEIGHT}>
          <group ref={body} rotation-order="YXZ">
            <CharacterModel profile={profile} mood={characterMood} gaze={characterGaze} />
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
