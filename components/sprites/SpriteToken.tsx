"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Sparkles } from "@react-three/drei";
import { easing } from "maath";
import { Color, Vector3, type Group } from "three";
import { SpeechBubble } from "@/components/council/SpeechBubble";
import { lobbySpot, useLook } from "@/lib/people/roster";
import { restSpot, seatedCount } from "@/lib/stage/slices/council";
import { activeSeatCount, SPRITE_FLOAT_HEIGHT, seatAngles, seatPosition } from "@/lib/stage/layout";
import { useStage } from "@/lib/stage/store";
import { getTargetWorldPosition, registerTarget } from "@/lib/stage/targets";
import type { FamilyProfile } from "@/types/domain";
import type { SpriteMood } from "@/types/stage";
import { CharacterModel } from "./CharacterModel";
import { BLANK_LOOK, STARTER_LOOKS } from "@/lib/people/starters";
import { MODEL_HEIGHT, characterForLook, characterTuning, createMotion } from "./characterPose";
import { IconMesh } from "./IconMesh";
import { iconsForProfile } from "./icons";
import { createAuraMaterial } from "./materials";
import { applyOverlays, moodStyle, resolveMood, type MoodStyle } from "./moodStyle";
import { accentColor, coreColor, rimColor } from "./palette";
import { SparkleTrail } from "./SparkleTrail";
import styles from "./SpriteToken.module.css";
import { typingDuration } from "./typewriter";

// One family member's sprite. Discrete store fields (bubble, mood, phase) re-render it; everything
// per-frame (hand pose, walk, mood dials) is read with getState() and applied to refs in useFrame.
// The character itself stands on the floor (see characterPose.ts); this file only steers it between
// home/seat/hand, faces it the right way, and drives the stage dials (aura, orbit, trail, sparkles).

const VETO_RED = new Color("#ff2a2a");
const ORBIT_RADIUS = 1.05;
const DRAG_LIFT = 0.5;
/** Just below/in front of the feet so the name tag never overlaps the body. */
const LABEL_Y = -0.35;
const LABEL_Z = 0.5;

/** Walking toward a goal: accelerate, then ease off inside the slow radius, then snap. */
const WALK_ACCEL = 6;
const WALK_SLOW_RADIUS = 1.5;
const WALK_STOP_EPS = 0.03;
/** Below this planar speed the character isn't considered to be walking (for facing). */
const WALK_FACING_SPEED = 0.4;

/** Numeric MoodStyle dials that are damped every frame. */
const DIALS = ["scale", "orbitSpeed", "rimFlash", "aura"] as const satisfies ReadonlyArray<keyof MoodStyle>;

/** Side seats grow their bubbles outward (as seen from the camera) so seated bubbles don't overlap. */
function bubbleSide(seat: number | null, activeCount: number): "left" | "center" | "right" {
  const angle = seat === null ? 0 : (seatAngles(activeCount)[seat] ?? 0);
  return angle < -0.1 ? "left" : angle > 0.1 ? "right" : "center";
}

export interface SpriteTokenProps {
  profile: FamilyProfile;
}

export function SpriteToken({ profile }: SpriteTokenProps) {
  const { id, name, colors } = profile;
  const targetId = `sprite:${id}` as const;
  // Walk physics and bubble height come from the same look CharacterModel renders, so a custom
  // person walks and speaks at their own size.
  const characterLook = useLook(id);
  const look = characterLook ?? STARTER_LOOKS[id] ?? BLANK_LOOK;
  const character = useMemo(() => characterForLook(look, id), [look, id]);
  const icons = useMemo(() => iconsForProfile(profile), [profile]);
  const bubbleY = useMemo(() => MODEL_HEIGHT * character.scale * characterTuning.scale + 0.5, [character]);
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
  const lift = useRef<Group>(null);
  const body = useRef<Group>(null);
  const chest = useRef<Group>(null);
  const orbit = useRef<Group>(null);
  const emitting = useRef(false);
  const characterMood = useRef<SpriteMood>("idle");
  const characterGaze = useRef({ x: 0, y: 0 });
  const motion = useRef(createMotion());

  const bubble = useStage((state) => state.sprites[id]?.bubble ?? null);
  const thinking = useStage((state) => state.sprites[id]?.mood === "thinking");
  const celebrating = useStage((state) => state.phase === "receipt");
  const seat = useStage((state) => state.sprites[id]?.seat ?? null);
  const seatedTotal = useStage((state) => seatedCount(state.sprites));
  const activeCount = activeSeatCount(seatedTotal);
  const bubbleAlign = bubbleSide(seat, activeCount);

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
      /** Planar walk velocity, ft/s. Reused every frame so nothing allocates. */
      velocity: new Vector3(),
    }),
    [],
  );
  const anim = useRef({
    ...Object.fromEntries(DIALS.map((dial) => [dial, moodStyle("idle")[dial]])),
    lift: 0,
    prevMood: "idle",
    prevHeld: false,
  } as Record<(typeof DIALS)[number], number> & {
    lift: number;
    prevMood: string;
    prevHeld: boolean;
  });

  // Start at home (family), or at the doorway (friends only ever mount once they start visiting,
  // whether that's by walking in unseated or straight into a seat) instead of gliding in from the
  // origin. Uses lobbySpot rather than restSpot: by the time this sprite mounts, seatSprite may
  // already have added it to `visitors`, and restSpot would then place it at its guest spot instead
  // of the doorway it should walk in from.
  useLayoutEffect(() => {
    const [x, , z] = lobbySpot(id);
    root.current?.position.set(x, 0, z);
  }, [id]);

  useEffect(() => (chest.current ? registerTarget(targetId, chest.current, 0.9) : undefined), [targetId]);

  useFrame(({ clock, camera }, rawDelta) => {
    const group = root.current;
    const liftGroup = lift.current;
    const bodyGroup = body.current;
    if (!group || !liftGroup || !bodyGroup) return;

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

    // Perk up with a jump when the conflict resolves (a bundle arrived) or the party starts.
    if ((a.prevMood === "conceding" && mood !== "conceding") || (mood === "celebrating" && a.prevMood !== mood)) {
      motion.current.jumpAt = t;
    }
    a.prevMood = mood;
    // A landing plays out the moment a hold releases.
    if (a.prevHeld && !held) motion.current.landAt = t;
    a.prevHeld = held;

    for (const dial of DIALS) easing.damp(a, dial, style[dial], dial === "scale" ? 0.18 : 0.3, delta);
    easing.damp(a, "lift", held ? DRAG_LIFT : 0, 0.15, delta);
    liftGroup.position.y = a.lift;

    // Move: the hand while dragged, else walk toward the ring seat or home/guest spot.
    const seatIndex = sprite?.seat ?? null;
    const frameActiveCount = activeSeatCount(seatedCount(stage.sprites));
    const oldX = group.position.x;
    const oldZ = group.position.z;
    if (held && hand.floorPoint) {
      scratch.goal.set(hand.floorPoint[0], 0, hand.floorPoint[2]);
      easing.damp3(group.position, scratch.goal, 0.07, delta);
    } else {
      const [gx, , gz] = seatIndex !== null ? seatPosition(seatIndex, frameActiveCount) : restSpot(id, stage.visitors);
      scratch.goal.set(gx, 0, gz);
      const toGoalX = scratch.goal.x - group.position.x;
      const toGoalZ = scratch.goal.z - group.position.z;
      const dist = Math.hypot(toGoalX, toGoalZ);
      if (dist < WALK_STOP_EPS) {
        group.position.x = scratch.goal.x;
        group.position.z = scratch.goal.z;
        scratch.velocity.set(0, 0, 0);
      } else {
        const maxSpeed = character.walkSpeed * characterTuning.walkSpeed;
        const desiredSpeed = dist < WALK_SLOW_RADIUS ? (maxSpeed * dist) / WALK_SLOW_RADIUS : maxSpeed;
        const dirX = toGoalX / dist;
        const dirZ = toGoalZ / dist;
        const currentSpeed = scratch.velocity.length();
        const nextSpeed =
          currentSpeed < desiredSpeed
            ? Math.min(desiredSpeed, currentSpeed + WALK_ACCEL * delta)
            : Math.max(desiredSpeed, currentSpeed - WALK_ACCEL * delta);
        scratch.velocity.set(dirX * nextSpeed, 0, dirZ * nextSpeed);
        group.position.x += scratch.velocity.x * delta;
        group.position.z += scratch.velocity.z * delta;
        if (Math.hypot(scratch.goal.x - group.position.x, scratch.goal.z - group.position.z) < WALK_STOP_EPS) {
          group.position.x = scratch.goal.x;
          group.position.z = scratch.goal.z;
        }
      }
    }

    // Feed CharacterModel's walk/jump/land animation from how far the sprite actually moved.
    const movedX = group.position.x - oldX;
    const movedZ = group.position.z - oldZ;
    const moveDist = Math.hypot(movedX, movedZ);
    const motionState = motion.current;
    motionState.speed = moveDist / delta;
    motionState.gaitPhase += (moveDist / character.stride) * Math.PI * 2;
    if (held) {
      const yaw = bodyGroup.rotation.y;
      const axisX = Math.cos(yaw);
      const axisZ = -Math.sin(yaw);
      const velX = movedX / delta;
      const velZ = movedZ / delta;
      motionState.dragVelocityX = Math.max(-8, Math.min(8, velX * axisX + velZ * axisZ));
    } else {
      motionState.dragVelocityX = 0;
    }

    // Seated characters stay three-quarter visible to the audience. Vetoes still turn toward the
    // disputed item, unseated/speaking characters face the room camera, and a walking character
    // faces where it's going.
    const look = scratch.look;
    const walking = !held && motionState.speed > WALK_FACING_SPEED;
    let facingAngle: number;
    if (walking) {
      facingAngle = Math.atan2(movedX, movedZ);
    } else if (style.facing === "hearth" && seatIndex !== null) {
      facingAngle = -(seatAngles(frameActiveCount)[seatIndex] ?? 0) * 0.8;
    } else {
      if (!(style.facing === "item" && stage.conflict?.itemId && getTargetWorldPosition(`item:${stage.conflict.itemId}`, look))) {
        look.copy(camera.position);
      }
      facingAngle = Math.atan2(look.x - group.position.x, look.z - group.position.z);
    }
    easing.dampAngle(bodyGroup.rotation, "y", facingAngle, walking ? 0.2 : 0.35, delta);
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

        <group ref={lift}>
          <group ref={body} rotation-order="YXZ">
            <CharacterModel profile={profile} mood={characterMood} gaze={characterGaze} motion={motion} look={look} />
          </group>

          <group ref={chest} position-y={SPRITE_FLOAT_HEIGHT}>
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
        </group>

        <Html position={[0, bubbleY, 0]} zIndexRange={[0, 0]} pointerEvents="none">
          <SpeechBubble speaker={name} text={bubble} thinking={thinking} accent={palette.accent} align={bubbleAlign} />
        </Html>
        <Html position={[0, LABEL_Y, LABEL_Z]} zIndexRange={[0, 0]} pointerEvents="none">
          <div className={styles.label} style={{ "--accent": palette.accent, "--core": palette.core } as CSSProperties}>
            <span className={styles.dot} />
            {name}
          </div>
        </Html>
      </group>

      <SparkleTrail source={chest} emitting={emitting} color={palette.rim} />
    </>
  );
}
