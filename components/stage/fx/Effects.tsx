"use client";

import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { useControls } from "leva";
import { ToneMappingMode } from "postprocessing";

// Kept cheap: mipmap bloom on HDR highlights only (fire, bulbs, the rule line), a vignette, and ACES
// tone mapping (the composer turns off the renderer's own tone mapping).
export function Effects() {
  const { bloom, threshold, vignette } = useControls("Post", {
    bloom: { value: 0.9, min: 0, max: 3 },
    threshold: { value: 0.8, min: 0, max: 2 },
    vignette: { value: 0.55, min: 0, max: 1 },
  });

  return (
    <EffectComposer multisampling={2}>
      <Bloom mipmapBlur intensity={bloom} luminanceThreshold={threshold} luminanceSmoothing={0.2} radius={0.7} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.28} darkness={vignette} />
    </EffectComposer>
  );
}
