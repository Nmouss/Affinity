import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  IcosahedronGeometry,
  MeshBasicMaterial,
  ShaderMaterial,
  SphereGeometry,
} from "three";

// Geometries shared by every sprite, plus the small shader materials each sprite owns one of.
// Created lazily so nothing touches three until the canvas mounts.

export const CORE_RADIUS = 0.6;
export const RIM_RADIUS = 0.74;
export const AURA_RADIUS = 1.4;

/** Live-tunable from the lab's leva panel; read in useFrame. */
export const spriteTuning = { glow: 0.7, rim: 1.3 };

let shared:
  | {
      core: IcosahedronGeometry;
      rim: SphereGeometry;
      aura: CircleGeometry;
      eye: SphereGeometry;
      eyeMaterial: MeshBasicMaterial;
      glintMaterial: MeshBasicMaterial;
    }
  | undefined;

export function sharedSpriteAssets() {
  shared ??= {
    // High detail so MeshDistortMaterial has vertices to push around.
    core: new IcosahedronGeometry(CORE_RADIUS, 24),
    rim: new SphereGeometry(RIM_RADIUS, 48, 32),
    aura: new CircleGeometry(AURA_RADIUS, 48),
    eye: new SphereGeometry(1, 16, 12),
    eyeMaterial: new MeshBasicMaterial({ color: "#1d1420" }),
    glintMaterial: new MeshBasicMaterial({ color: "#ffffff", toneMapped: false }),
  };
  return shared;
}

const viewVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

/** Additive fresnel shell. Left un-tonemapped so the rim feeds the bloom pass. */
export function createRimMaterial(color: string): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uIntensity: { value: spriteTuning.rim },
      uPower: { value: 2.4 },
    },
    vertexShader: viewVertex,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uPower;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float f = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0), uPower);
        gl_FragColor = vec4(uColor * f * uIntensity, f);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

/** Soft radial glow for the floor under a sprite or a seat. */
export function createAuraMaterial(color: string, opacity = 0.5): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float d = distance(vUv, vec2(0.5)) * 2.0;
        float a = smoothstep(1.0, 0.0, d);
        a *= a;
        gl_FragColor = vec4(uColor * a * uOpacity, a * uOpacity);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}
