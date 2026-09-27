"use client";

/** What the window looks out on for a shopping-mall mission: a bright storefront concourse. */
export function MallPreset() {
  const storefronts: Array<[number, number, string]> = [
    [-14.5, -6, "#c98a4a"],
    [-14.5, -2, "#4a7fc9"],
    [-14.5, 2, "#9a4ac9"],
  ];
  return (
    <group>
      <mesh position={[-22, 5, -3]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[40, 22]} />
        <meshStandardMaterial color="#e8e2d6" roughness={0.9} />
      </mesh>
      <mesh position={[-16, -0.4, -3]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[12, 30]} />
        <meshStandardMaterial color="#d8d2c4" roughness={0.6} />
      </mesh>
      {storefronts.map(([x, z, color], index) => (
        <mesh key={index} position={[x, 2.2, z]}>
          <boxGeometry args={[0.15, 2.6, 3]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}
