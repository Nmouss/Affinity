"use client";

/** What the window looks out on for a dinner/reservation mission: a bright, airy dining room view. */
export function RestaurantPreset() {
  const candles: Array<[number, number]> = [
    [-14.5, -6],
    [-14.5, -3],
    [-14.5, 0],
    [-14.5, 3],
  ];
  return (
    <group>
      <mesh position={[-22, 5, -3]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[40, 22]} />
        <meshStandardMaterial color="#f0e6dc" roughness={1} />
      </mesh>
      <mesh position={[-16, -0.4, -3]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[12, 30]} />
        <meshStandardMaterial color="#e2d2c2" roughness={0.7} />
      </mesh>
      {candles.map(([x, z], index) => (
        <mesh key={index} position={[x, 1.1, z]}>
          <sphereGeometry args={[0.1, 10, 10]} />
          <meshStandardMaterial color="#ffe6b8" emissive="#ffc766" emissiveIntensity={0.6} />
        </mesh>
      ))}
    </group>
  );
}
