"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Sparkles } from "@react-three/drei";
import { easing } from "maath";
import { Color, Vector3, type Group } from "three";
import { SpeechBubble } from "@/components/council/SpeechBubble";
import {
  getAgents,
  radiusForScale,
  registerAgent,
  resolveOverlaps,
  steer,
  unregisterAgent,
  type CrowdAgent,
} from "@/lib/people/crowd";
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

// Every SpriteToken in the living room shares one "room" crowd (lib/people/crowd.ts). Only one of
// them needs to call resolveOverlaps each animation frame; this module-level frame-stamp guard
// lets whichever sprite's useFrame runs first this tick do it for everybody.
let roomResolvedAt = -1;

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
  const radius = useMemo(
    () => radiusForScale(character.scale * characterTuning.scale, character.width),
    [character],
  );
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
  /** This sprite's entry in the "room" crowd; registered on mount, mutated in place every frame. */
  const agentRef = useRef<CrowdAgent | null>(null);
  const lift = useRef<Group>(null);
  const body = useRef<Group>(null);
  const chest = useRef<Group>(null);
  const orbit = useRef<Group>(null);
  const emitting = useRef(false);
  const characterMood = useRef<SpriteMood>("idle");
  const characterGaze = useRef({ x: 0, y: 0 });
  const motion = useRef(createMotion());

  const bubble = useStage((state) => state.sprites[id]?.bubble ?? null);
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

  // Registers once per identity, at wherever the layout effect above just placed the sprite. Kept
  // separate from the radius effect below so a look edit that resizes the character doesn't reset
  // its walking position/velocity by re-registering a fresh agent object.
  useEffect(() => {
    const agent = registerAgent("room", {
      id,
      x: root.current?.position.x ?? 0,
      z: root.current?.position.z ?? 0,
      vx: 0,
      vz: 0,
      radius,
      pinned: false,
    });
    agentRef.current = agent;
    return () => {
      unregisterAgent("room", id);
      agentRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (agentRef.current) agentRef.current.radius = radius;
  }, [radius]);

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

    // Move: the hand while dragged, else steer toward the ring seat or home/guest spot, bending
    // around the rest of the room (lib/people/crowd.ts). oldX/oldZ are captured before this
    // frame's shared overlap correction and this sprite's own steering, so the walk animation
    // below reflects the sprite's *total* displacement for the frame (including any push from
    // resolveOverlaps) and feet never skate.
    const seatIndex = sprite?.seat ?? null;
    const frameActiveCount = activeSeatCount(seatedCount(stage.sprites));
    const [gx, , gz] = seatIndex !== null ? seatPosition(seatIndex, frameActiveCount) : restSpot(id, stage.visitors);
    const oldX = group.position.x;
    const oldZ = group.position.z;
    const agent = agentRef.current;

    if (agent) {
      const arrivedAtSeat = seatIndex !== null && Math.hypot(gx - agent.x, gz - agent.z) < WALK_STOP_EPS;
      // Pinned: seated and exactly at the seat (so the ring stays exact), or held/dragged.
      agent.pinned = held || arrivedAtSeat;

      // The whole room only needs one relaxation pass a frame; whichever sprite's useFrame runs
      // first this tick does it for everybody (see the roomResolvedAt guard above this component).
      if (t !== roomResolvedAt) {
        resolveOverlaps(getAgents("room"));
        roomResolvedAt = t;
      }

      if (held && hand.floorPoint) {
        scratch.goal.set(hand.floorPoint[0], 0, hand.floorPoint[2]);
        group.position.x = agent.x;
        group.position.z = agent.z;
        easing.damp3(group.position, scratch.goal, 0.07, delta);
        agent.x = group.position.x;
        agent.z = group.position.z;
        agent.vx = 0;
        agent.vz = 0;
      } else if (arrivedAtSeat) {
        agent.x = gx;
        agent.z = gz;
        agent.vx = 0;
        agent.vz = 0;
        group.position.x = gx;
        group.position.z = gz;
      } else {
        const maxSpeed = character.walkSpeed * characterTuning.walkSpeed;
        steer(
          agent,
          getAgents("room"),
          { goalX: gx, goalZ: gz, maxSpeed, accel: WALK_ACCEL, slowRadius: WALK_SLOW_RADIUS, dt: delta },
          agent,
        );
        agent.x += agent.vx * delta;
        agent.z += agent.vz * delta;
        if (Math.hypot(gx - agent.x, gz - agent.z) < WALK_STOP_EPS) {
          agent.x = gx;
          agent.z = gz;
          agent.vx = 0;
          agent.vz = 0;
        }
        group.position.x = agent.x;
        group.position.z = agent.z;
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

        {bubble ? (
          <Html position={[0, bubbleY, 0]} zIndexRange={[80, 0]} pointerEvents="none">
            <SpeechBubble speaker={name} text={bubble} accent={palette.accent} align={bubbleAlign} active />
          </Html>
        ) : null}
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
