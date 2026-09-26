import { PeopleMaker } from "@/components/maker/PeopleMaker";

// People Maker: Mii-style creation for family and friends. PeopleMaker is a client component (the
// canvas inside it loads with next/dynamic ssr:false, mirroring components/stage/AffinityStage.tsx),
// so this server component itself never touches window/localStorage.
export default function CreatePage() {
  return (
    <main>
      <PeopleMaker />
    </main>
  );
}
