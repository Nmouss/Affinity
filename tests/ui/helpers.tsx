import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { expect } from "vitest";
import App from "../../frontend/src/App";
import type { AffinityApi } from "../../frontend/src/services/affinityApi";
import { createMockApi } from "../../frontend/src/services/mockApi";
import type { Screen } from "../../frontend/src/state/machine";

/** A plausible cabin-trip prompt. Any text that isn't a "holiday"/"apartment" keyword parses to
 * the fixed cabin draft (frontend/src/mocks/mission.ts mockParse), so wording beyond that doesn't
 * matter for these tests. */
export const DEFAULT_MISSION_TEXT = "Plan a weekend cabin trip with my friends.";

/**
 * Renders the app in mock mode with zero artificial latency and the Leap socket disabled. Cleans
 * up any previously rendered app first, so a test that calls this twice (to compare two independent
 * journeys) doesn't end up with two `.app` roots in the document at once.
 */
export function renderApp(apiOverride?: AffinityApi) {
  cleanup();
  const api = apiOverride ?? createMockApi({ latencyMs: 0 });
  const user = userEvent.setup();
  const utils = render(<App api={api} leap={false} />);
  return { ...utils, api, user };
}

/** The state machine's current screen, read the same way a presenter or a11y tooling would: the
 * `data-screen` attribute App.tsx sets on its root, rather than screen-specific text. */
export function appScreen(): Screen | null {
  return document.querySelector(".app")?.getAttribute("data-screen") as Screen | null;
}

export async function waitForScreen(name: Screen) {
  await waitFor(() => expect(appScreen()).toBe(name));
}

// ---- HOME ----

export async function createMissionByText(user: UserEvent, text = DEFAULT_MISSION_TEXT) {
  const textbox = screen.getByLabelText("Describe your group mission");
  await user.type(textbox, text);
  await user.click(screen.getByRole("button", { name: "Create mission" }));
  await waitForScreen("MISSION_BRIEF");
}

/**
 * Captures the preloaded demo transcript the same way a presenter without a working mic does:
 * press and release the push-to-talk button. jsdom has no SpeechRecognition, so PushToTalk's
 * "unsupported" branch fires immediately on release with the demo transcript.
 */
export async function captureVoiceDemoTranscript() {
  const button = screen.getByRole("button", { name: /Hold to talk/i });
  fireEvent.pointerDown(button);
  fireEvent.pointerUp(button);
  await waitForScreen("TRANSCRIPT_CONFIRMATION");
}

export async function confirmTranscript(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Use this" }));
  await waitForScreen("MISSION_BRIEF");
}

// ---- MISSION_BRIEF ----

export async function confirmBrief(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Looks right" }));
  await waitForScreen("PARTICIPANT_RESOLUTION");
}

// ---- PARTICIPANT_RESOLUTION ----

export async function startShopperCreation(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Create shopper here" }));
  await waitForScreen("SHOPPER_CREATION");
}

// ---- SHOPPER_CREATION ----

/** Submits the shopper form as-is (name defaults to "Guest", rule defaults to "no_fragile_glass"). */
export async function submitShopperForm(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Learn my cabin taste" }));
  await waitForScreen("QUICK_CHOICES");
}

// ---- QUICK_CHOICES ----

/** Clicks one of "Product A" / "Product B" / "Neither" / "Skip" and waits for the pair (or screen) to change. */
export async function chooseInPair(user: UserEvent, label: "Product A" | "Product B" | "Neither" | "Skip") {
  const before = screen.queryByText(/Quick choices ·/)?.textContent ?? null;
  await user.click(screen.getByRole("button", { name: label }));
  await waitFor(() => {
    const now = screen.queryByText(/Quick choices ·/)?.textContent ?? null;
    expect(now === before && appScreen() === "QUICK_CHOICES").toBe(false);
  });
}

export async function answerAllPairs(
  user: UserEvent,
  labels: ("Product A" | "Product B" | "Neither" | "Skip")[] = ["Skip", "Skip", "Skip", "Skip"],
) {
  for (const label of labels) {
    await chooseInPair(user, label);
  }
}

// ---- PROFILE_CONFIRMATION ----

export async function confirmProfile(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Looks right" }));
  await waitForScreen("MISSION_SPACE");
}

// ---- Composite flows ----

/** HOME through QUICK_CHOICES, via typed text and the default (no-rule-change) shopper form. */
export async function goToQuickChoices(user: UserEvent) {
  await createMissionByText(user);
  await confirmBrief(user);
  await startShopperCreation(user);
  await submitShopperForm(user);
}

/** HOME through PROFILE_CONFIRMATION, answering the 4 quick-choice pairs with the given labels. */
export async function goToProfileConfirmation(
  user: UserEvent,
  labels: ("Product A" | "Product B" | "Neither" | "Skip")[] = ["Skip", "Skip", "Skip", "Skip"],
) {
  await goToQuickChoices(user);
  await answerAllPairs(user, labels);
  await waitForScreen("PROFILE_CONFIRMATION");
}

/**
 * HOME through MISSION_SPACE. Keeps the shopper's default "no_fragile_glass" rule, so the group
 * decision changes from Premium to Balanced (frontend/src/mocks/recommendation.ts recommendationAfterJudge).
 */
export async function goToMissionSpace(user: UserEvent) {
  await goToProfileConfirmation(user);
  await confirmProfile(user);
}

/**
 * From MISSION_SPACE: selects Easy Press (the cart's physical-control product), dismisses the
 * optional Leap offer, then asks Affinity to find savings — landing on the paused substitution
 * (Easy Press -> Basic Pump conflicts with Maya's one-hand requirement).
 */
export async function goToPausedSubstitution(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: /Select Easy Press Coffee Maker/ }));
  await user.click(screen.getByRole("button", { name: "Skip" }));
  await user.click(screen.getByRole("button", { name: "Find savings" }));
  await waitForScreen("SUBSTITUTION_APPROVAL");
}
