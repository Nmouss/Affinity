"use client";

/** What the window looks out on for a sports/game mission: a sunlit field under a clear sky. */
export function StadiumPreset() {
  const floodlights: Array<[number, number, number]> = [
    [-16, 0, -6],
    [-16, 0, 0],
    [-16, 0, 6],
  ];
  return (
    <group>
      <mesh position={[-22, 5, -3]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[40, 22]} />
        <meshStandardMaterial color="#bfe0f0" roughness={1} />
      </mesh>
      <mesh position={[-16, -0.4, -3]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[12, 30]} />
        <meshStandardMaterial color="#5fa868" roughness={1} />
      </mesh>
      {floodlights.map((position, index) => (
        <group key={index} position={position}>
          <mesh position-y={4}>
            <cylinderGeometry args={[0.08, 0.08, 8, 8]} />
            <meshStandardMaterial color="#8a8a80" metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position-y={7.9}>
            <boxGeometry args={[1.2, 0.6, 0.2]} />
            <meshStandardMaterial color="#ffffff" emissive="#fff6e0" emissiveIntensity={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
