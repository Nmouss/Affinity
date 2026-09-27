"use client";

/** Default preset before a mission is classified: a plain window, no season or venue dressing. */
export function NeutralPreset() {
  return (
    <mesh position={[-16, 3.5, -3]} rotation-y={Math.PI / 2}>
      <planeGeometry args={[40, 22]} />
      <meshStandardMaterial color="#e9e5db" roughness={0.95} />
    </mesh>
  );
}
