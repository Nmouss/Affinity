import { HomeHub } from "@/components/home/HomeHub";

// Home is the Character Plaza: your people milling about, big activity tiles on the rails, and the
// Christmas gift flow (pick a recipient and advisors, then gather the council). The living-room
// council itself lives at /council. HomeHub is a client component; its canvas loads with
// next/dynamic ssr:false, so this server component never touches window or localStorage.
export default function Home() {
  return (
    <main>
      <HomeHub />
    </main>
  );
}
