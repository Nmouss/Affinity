"use client";

import { useEffect, useMemo, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, ShaderMaterial, Vector3, type Object3D } from "three";

// World-space sparkles left behind a held sprite. A fixed ring buffer of points; nothing allocates per frame.

const COUNT = 64;
const LIFETIME = 0.9;
const RATE = 55;

export interface SparkleTrailProps {
  source: RefObject<Object3D | null>;
  /** Written by the sprite every frame. */
  emitting: RefObject<boolean>;
  color: string;
}

export function SparkleTrail({ source, emitting, color }: SparkleTrailProps) {
  const { geometry, material, positions, ages } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const ages = new Float32Array(COUNT).fill(1);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("aAge", new BufferAttribute(ages, 1));
    const material = new ShaderMaterial({
      uniforms: { uColor: { value: new Color(color) }, uSize: { value: 140 } },
      vertexShader: /* glsl */ `
        attribute float aAge;
        uniform float uSize;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vAlpha = 1.0 - aAge;
          gl_PointSize = uSize * vAlpha / -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.0, d) * vAlpha;
          gl_FragColor = vec4(uColor * a * 1.6, a);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    return { geometry, material, positions, ages };
  }, [color]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const state = useMemo(() => ({ next: 0, carry: 0, at: new Vector3() }), []);

  useFrame((_, delta) => {
    let alive = false;
    for (let i = 0; i < COUNT; i += 1) {
      if (ages[i]! < 1) {
        ages[i] = Math.min(1, ages[i]! + delta / LIFETIME);
        positions[i * 3 + 1] += delta * 0.35;
        alive = true;
      }
    }

    const object = source.current;
    if (emitting.current && object) {
      object.getWorldPosition(state.at);
      state.carry += delta * RATE;
      while (state.carry >= 1) {
        state.carry -= 1;
        const i = state.next;
        state.next = (state.next + 1) % COUNT;
        positions[i * 3] = state.at.x + (Math.random() - 0.5) * 0.7;
        positions[i * 3 + 1] = state.at.y + (Math.random() - 0.5) * 0.7;
        positions[i * 3 + 2] = state.at.z + (Math.random() - 0.5) * 0.7;
        ages[i] = 0;
        alive = true;
      }
    } else {
      state.carry = 0;
    }

    if (alive) {
      geometry.attributes.position!.needsUpdate = true;
      geometry.attributes.aAge!.needsUpdate = true;
    }
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
