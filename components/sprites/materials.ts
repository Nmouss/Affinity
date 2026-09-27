import { AdditiveBlending, Color, ShaderMaterial } from "three";

// The shader material every sprite's floor aura uses. Created lazily so nothing touches three
// until the canvas mounts.

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
