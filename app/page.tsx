import { PeopleMaker } from "@/components/maker/PeopleMaker";
import { WelcomeGate } from "@/components/welcome/WelcomeGate";

// Home: the family greeting once per session, then the Plaza (People Maker) underneath it.
export default function Home() {
  return (
    <main>
      <WelcomeGate>
        <PeopleMaker />
      </WelcomeGate>
    </main>
  );
}
