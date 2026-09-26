import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMockApi } from "@/lib/mission/services/mockApi";
import {
  appScreen,
  captureVoiceDemoTranscript,
  chooseInPair,
  confirmBrief,
  confirmProfile,
  confirmTranscript,
  createMissionByText,
  DEFAULT_MISSION_TEXT,
  goToMissionSpace,
  goToPausedSubstitution,
  goToProfileConfirmation,
  goToQuickChoices,
  renderApp,
  startShopperCreation,
  submitShopperForm,
  waitForScreen,
} from "./helpers";

describe("1. text and voice reach the same Mission Brief", () => {
  it("typed text via Create mission and the voice demo transcript via Use this land on the same brief", async () => {
    const { user: textUser } = renderApp();
    await createMissionByText(textUser, DEFAULT_MISSION_TEXT);
    expect(screen.getByRole("heading", { name: "Blue Ridge Cabin Weekend", level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("brief-meta").textContent).toContain("3 days · 4 people · $400");

    const { user: voiceUser } = renderApp();
    await captureVoiceDemoTranscript();
    await confirmTranscript(voiceUser);
    expect(screen.getByRole("heading", { name: "Blue Ridge Cabin Weekend", level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("brief-meta").textContent).toContain("3 days · 4 people · $400");
  });
});

describe("2. a voice transcript must be confirmed before it becomes a mission", () => {
  it("shows the transcript for confirmation, lets it be edited, and only parses the edited text", async () => {
    const api = createMockApi({ latencyMs: 0 });
    const parseSpy = vi.spyOn(api, "parseMission");
    const { user } = renderApp(api);

    await captureVoiceDemoTranscript();
    expect(appScreen()).toBe("TRANSCRIPT_CONFIRMATION");
    expect(
      screen.getByText(/Plan a three-day Blue Ridge cabin trip for me, Maya, Alex, and one guest/),
    ).toBeInTheDocument();
    // Nothing has been parsed or created yet.
    expect(parseSpy).toHaveBeenCalledTimes(0);

    await user.click(screen.getByRole("button", { name: "Edit transcript" }));
    const editBox = screen.getByLabelText("Edit transcript");
    await user.clear(editBox);
    await user.type(editBox, "Cabin trip for the group. Keep shared supplies under $350.");

    await user.click(screen.getByRole("button", { name: "Use this" }));
    await waitForScreen("MISSION_BRIEF");

    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("brief-meta").textContent).toContain("$350");
  });
});

describe("3. editing the Mission Brief updates participants and budget", () => {
  it("removing Alex and adding Riley in the brief editor carries through to participant resolution", async () => {
    const { user } = renderApp();
    await createMissionByText(user);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const budgetInput = screen.getByLabelText("Shared budget ($)");
    await user.clear(budgetInput);
    await user.type(budgetInput, "350");

    await user.click(screen.getByRole("button", { name: "Remove Alex" }));
    await user.type(screen.getByLabelText("Add a person"), "Riley");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByTestId("brief-meta").textContent).toContain("$350");
    expect(screen.getByText("Riley")).toBeInTheDocument();
    expect(screen.queryByText("Alex")).toBeNull();

    await confirmBrief(user);
    expect(screen.getByText("Riley")).toBeInTheDocument();
    expect(screen.queryByText("Alex")).toBeNull();
  });
});

describe("4. a missing shopper opens onboarding", () => {
  it("shows shopper status per participant and routes Create shopper here to SHOPPER_CREATION", async () => {
    const { user } = renderApp();
    await createMissionByText(user);
    await confirmBrief(user);

    const list = screen.getByRole("list", { name: "Participants" });
    for (const name of ["Jonathan", "Maya", "Alex"]) {
      const item = within(list).getByText(name).closest("li");
      expect(item).not.toBeNull();
      expect(within(item as HTMLElement).getByText("Shopper ready")).toBeInTheDocument();
    }
    const guestItem = within(list).getByText("Guest").closest("li") as HTMLElement;
    expect(within(guestItem).getByText("No shopper yet")).toBeInTheDocument();

    await startShopperCreation(user);
    expect(appScreen()).toBe("SHOPPER_CREATION");
    expect(screen.getByRole("heading", { name: "Create your shopper" })).toBeInTheDocument();
  });
});

describe("5. four quick choices can be completed by buttons only", () => {
  it("reaches PROFILE_CONFIRMATION after four button clicks", async () => {
    const { user } = renderApp();
    await goToProfileConfirmation(user, ["Product A", "Product B", "Neither", "Skip"]);
    expect(appScreen()).toBe("PROFILE_CONFIRMATION");
    expect(screen.getByRole("heading", { name: "Here’s my first read" })).toBeInTheDocument();
  });
});

describe("6. Skip does not display a learned signal", () => {
  it("Skip shows 'nothing learned' with no +1 signal; Product B shows a Durability +1 signal", async () => {
    const { user: skipUser } = renderApp();
    await goToQuickChoices(skipUser);
    await chooseInPair(skipUser, "Skip");
    expect(screen.getByText("Skipped — nothing learned.")).toBeInTheDocument();
    expect(screen.queryByText(/\+1 signal/)).toBeNull();

    const { user: pickUser } = renderApp();
    await goToQuickChoices(pickUser);
    await chooseInPair(pickUser, "Product B");
    expect(screen.getByText("Durability +1 signal")).toBeInTheDocument();
  });
});

describe("7. the profile separates taste from rules", () => {
  it("keeps taste, rule, and unknown-axis sections distinct, and shows no percentages", async () => {
    const { user } = renderApp();
    // Pair 1 (durability) is skipped -> stays unknown. The rest get one signal each.
    await goToProfileConfirmation(user, ["Skip", "Product B", "Product B", "Product B"]);

    const tasteSection = screen.getByRole("heading", { name: /Taste \(learned from choices\)/ }).closest(
      "section",
    ) as HTMLElement;
    const ruleSection = screen.getByRole("heading", { name: /Your rule/ }).closest("section") as HTMLElement;

    expect(within(tasteSection).queryByText(/Reject fragile glass/)).toBeNull();
    expect(within(ruleSection).getByText(/Reject fragile glass/)).toBeInTheDocument();

    expect(within(tasteSection).getByRole("heading", { name: "Still unknown" })).toBeInTheDocument();
    const unknownGroup = within(tasteSection).getByRole("heading", { name: "Still unknown" }).closest("div");
    expect(within(unknownGroup as HTMLElement).getByText(/Price versus durability/)).toBeInTheDocument();

    expect(document.body.textContent?.includes("%")).toBe(false);
  });
});

describe("8. the recommendation shows before and after", () => {
  it("shows both bundles, the engine's reasons, and Premium marked Rejected", async () => {
    const { user } = renderApp();
    await goToMissionSpace(user);

    const panel = screen.getByTestId("decision-panel");
    expect(within(panel).getByText("Before you joined")).toBeInTheDocument();
    expect(within(panel).getByText("Premium Cabin Bundle")).toBeInTheDocument();
    expect(within(panel).getByText("After you joined")).toBeInTheDocument();
    expect(within(panel).getByText("Balanced Cabin Bundle")).toBeInTheDocument();

    for (const reason of [
      "Your no-glass rule removed Premium.",
      "Your durability preference strengthened Balanced.",
      "Balanced gives the least-satisfied shopper the best remaining result.",
    ]) {
      expect(within(panel).getByText(reason)).toBeInTheDocument();
    }

    const premiumHeader = within(panel).getByRole("rowheader", { name: "Premium" });
    const premiumRow = premiumHeader.closest("tr") as HTMLElement;
    expect(within(premiumRow).getByText(/Rejected/)).toBeInTheDocument();
  });
});

describe("9. the 3D scene has a mouse/keyboard fallback", () => {
  it("renders the 2D table with a reason, keyboard-focusable toolbar buttons, and an arrow-key-safe stage", async () => {
    const { user } = renderApp();
    await goToMissionSpace(user);

    const table2d = screen.getByTestId("table-2d");
    expect(table2d).toBeInTheDocument();
    expect(table2d.textContent).toMatch(/3D isn.t available|3D view failed/);

    const rotateLeft = screen.getByRole("button", { name: "Rotate product left" });
    const rotateRight = screen.getByRole("button", { name: "Rotate product right" });
    const inspect = screen.getByRole("button", { name: "Inspect" });
    const reset = screen.getByRole("button", { name: "Reset view" });
    for (const button of [rotateLeft, rotateRight, inspect, reset]) {
      button.focus();
      expect(document.activeElement).toBe(button);
    }

    const stage = screen.getByRole("application");
    stage.focus();
    expect(() => {
      fireEvent.keyDown(stage, { key: "ArrowRight" });
    }).not.toThrow();
  });
});

describe("10. a Leap observation requires confirmation", () => {
  it("observes a recorded session immediately under reduced motion and only saves after Required", async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList);

    try {
      const api = createMockApi({ latencyMs: 0 });
      const submitSpy = vi.spyOn(api, "submitUseObservation");
      const { user } = renderApp(api);
      await goToMissionSpace(user);

      await user.click(screen.getByRole("button", { name: /Select Easy Press Coffee Maker/ }));
      await user.click(screen.getByRole("button", { name: "Try it" }));
      await waitForScreen("LEAP_CHECK");

      await user.click(screen.getByRole("button", { name: "Play recorded session" }));
      await waitFor(() => {
        expect(screen.getByText(/We observed one-handed use/)).toBeInTheDocument();
      });
      expect(screen.getByText(/[Rr]ecorded session/)).toBeInTheDocument();
      expect(screen.getByText(/not live/i)).toBeInTheDocument();

      expect(submitSpy).toHaveBeenCalledTimes(0);

      await user.click(screen.getByRole("button", { name: "Required" }));
      await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));
      expect(submitSpy).toHaveBeenCalledWith("judge", {
        productId: "easy_press",
        observation: {
          handsUsed: 1,
          activeHand: "right",
          approachSide: "front",
          spanBand: "medium",
          regraspObserved: false,
          trackingLossCount: 0,
        },
        classification: "required",
        source: "recorded",
      });
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});

describe("11. a consequential voice command opens a confirmation", () => {
  it("gates a rule change and approval on confirmation, but runs navigation immediately", async () => {
    const api = createMockApi({ latencyMs: 0 });
    const ruleSpy = vi.spyOn(api, "addShopperRule");
    const { user } = renderApp(api);
    await goToMissionSpace(user);

    // Typed into the command bar and run.
    await user.type(screen.getByLabelText("Type a command"), "Remove products with glass.");
    await user.click(screen.getByRole("button", { name: "Run" }));

    const ruleDialog = await screen.findByRole("alertdialog");
    expect(within(ruleDialog).getByRole("heading", { name: /No fragile glass/ })).toBeInTheDocument();
    await user.click(within(ruleDialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(ruleSpy).toHaveBeenCalledTimes(0);
    expect(appScreen()).toBe("MISSION_SPACE");

    // Navigation is not consequential: it runs immediately, no dialog.
    await user.click(screen.getByRole("button", { name: "Show the cooking category." }));
    await screen.findByText("Affinity: Showing Cooking.");
    expect(screen.queryByRole("alertdialog")).toBeNull();

    // Asking for approval is always consequential, and ends the mission when confirmed.
    await user.click(screen.getByRole("button", { name: "Ask everyone for approval." }));
    const approvalDialog = await screen.findByRole("alertdialog");
    expect(within(approvalDialog).getByRole("heading", { name: "Ask everyone for approval?" })).toBeInTheDocument();
    expect(appScreen()).toBe("MISSION_SPACE");

    await user.click(within(approvalDialog).getByRole("button", { name: "Ask everyone" }));
    await waitForScreen("COMPLETE");
  });
});

describe("12. a paused substitution names the affected shopper and reason", () => {
  it("pauses the swap and explains why in terms of Maya and one-hand operation", async () => {
    const { user } = renderApp();
    await goToMissionSpace(user);
    await goToPausedSubstitution(user);

    expect(screen.getByText("Substitution paused")).toBeInTheDocument();
    expect(document.body.textContent).toContain("Maya");
    expect(document.body.textContent).toContain("One-hand operation");
  });
});

describe("13. an override requires confirmation", () => {
  it(
    "keeps the substitution paused until the override is confirmed",
    async () => {
      const { user } = renderApp();
      await goToMissionSpace(user);
      await goToPausedSubstitution(user);

      await user.click(screen.getByRole("button", { name: "Override with approval" }));
      const dialog = await screen.findByRole("alertdialog");
      expect(within(dialog).getByRole("heading", { name: /Override Maya/ })).toBeInTheDocument();
      expect(screen.getByText("Substitution paused")).toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(screen.getByText("Substitution paused")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Override with approval" }));
      const dialog2 = await screen.findByRole("alertdialog");
      await user.click(within(dialog2).getByRole("button", { name: "Override with my approval" }));

      expect(screen.getByText("Overridden with your approval")).toBeInTheDocument();
    },
    15000,
  );
});

describe("14. the complete demo works in mock mode with the network disabled", () => {
  it("runs HOME through COMPLETE with fetch and WebSocket unused", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("network is disabled in this demo");
    });
    const originalFetch = globalThis.fetch;
    const originalWebSocket = globalThis.WebSocket;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchSpy;
    class ThrowingWebSocket {
      constructor() {
        throw new Error("WebSocket is disabled in this demo");
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = ThrowingWebSocket;

    try {
      const { user } = renderApp();
      await goToMissionSpace(user);

      await user.click(screen.getByRole("button", { name: "Ask everyone for approval." }));
      const dialog = await screen.findByRole("alertdialog");
      await user.click(within(dialog).getByRole("button", { name: "Ask everyone" }));

      await waitForScreen("COMPLETE");
      expect(screen.getByText("Mock authorization — no payment was made")).toBeInTheDocument();
      expect(fetchSpy).toHaveBeenCalledTimes(0);
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.WebSocket = originalWebSocket;
    }
  });
});
