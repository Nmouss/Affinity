"use client";

import { useCallback, useEffect, type ReactNode } from "react";
import { WelcomeScreen } from "./WelcomeScreen";
import { useWelcome } from "./welcomeState";

// Shows the family greeting once per browser session before the Plaza, then gets out of the way.
// `/?welcome`, the Plaza's Welcome rail button, and the council's exit bring it back on demand. The
// Plaza underneath keeps rendering (it's a fixed overlay), so entering is a fade, not a route change,
// and its scene is ready the moment the greeting lifts.

const SESSION_KEY = "affinity.welcomed.v1";

function shouldShowWelcome(): boolean {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).has("welcome")) return true;
  try {
    return sessionStorage.getItem(SESSION_KEY) !== "yes";
  } catch {
    return true;
  }
}

export function WelcomeGate({ children }: { children: ReactNode }) {
  // Decided after mount so the server and first client render agree (no greeting flash on SSR).
  const show = useWelcome((state) => state.open);
  useEffect(() => {
    if (shouldShowWelcome()) useWelcome.getState().show();
  }, []);

  const enter = useCallback(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, "yes");
    } catch {
      // Private browsing: the greeting simply shows again next visit.
    }
    if (window.location.search.includes("welcome")) window.history.replaceState(null, "", window.location.pathname);
    useWelcome.getState().hide();
  }, []);

  return (
    <>
      {children}
      {show && <WelcomeScreen onEnter={enter} />}
    </>
  );
}
