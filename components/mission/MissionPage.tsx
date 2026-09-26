"use client";

import dynamic from "next/dynamic";

const MissionApp = dynamic(() => import("./MissionApp"), {
  ssr: false,
  loading: () => <p style={{ padding: "2rem", fontFamily: "system-ui" }}>Loading Affinity…</p>,
});

export function MissionPage() {
  return <MissionApp />;
}
