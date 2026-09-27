"use client";

/** What the window looks out on for an outdoor market/festival mission: bright daytime plaza. */
export function PlazaPreset() {
  const lampPositions: Array<[number, number, number]> = [
    [-14, 0, -6],
    [-16, 0, -2],
    [-14, 0, 2],
  ];
  return (
    <group>
      <mesh position={[-22, 5, -3]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[40, 22]} />
        <meshStandardMaterial color="#cfe3ee" roughness={1} />
      </mesh>
      <mesh position={[-16, -0.4, -3]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[12, 30]} />
        <meshStandardMaterial color="#c9beac" roughness={1} />
      </mesh>
      {lampPositions.map((position, index) => (
        <group key={index} position={position}>
          <mesh position-y={2.4}>
            <cylinderGeometry args={[0.05, 0.05, 4.8, 8]} />
            <meshStandardMaterial color="#8a8a80" metalness={0.4} roughness={0.5} />
          </mesh>
          <mesh position-y={4.7}>
            <sphereGeometry args={[0.22, 12, 12]} />
            <meshStandardMaterial color="#fff6e0" emissive="#ffe6b0" emissiveIntensity={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
