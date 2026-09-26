// Terminal 1 ↔ Terminal 2 integration: the real AffinityCoreService behind the real UI.
// These tests use no mocks for engine behavior — parsing, taste updates, eligibility, scoring,
// observation confirmation, and substitution policy all run in backend/**.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AffinityCoreService } from "@/backend/service";
import { createEngineApi, createLocalTransport } from "@/lib/mission/services/engineApi";
import { CABIN_TRANSCRIPT } from "@/lib/mission/mocks/mission";
import { appScreen, renderApp, waitForScreen } from "./helpers";

const engineApi = async () => createEngineApi(await createLocalTransport(), "core");

async function runCommand(user: ReturnType<typeof renderApp>["user"], text: string) {
  const input = screen.getByLabelText("Type a command");
  await user.clear(input);
  await user.type(input, text);
  await user.click(screen.getByRole("button", { name: "Run" }));
}

/** HOME → MISSION_SPACE with the guest's shopper, via buttons only. */
async function toMissionSpaceWithGuest(user: ReturnType<typeof renderApp>["user"]) {
  await user.type(screen.getByLabelText("Describe your group mission"), CABIN_TRANSCRIPT);
  await user.click(screen.getByRole("button", { name: "Create mission" }));
  await waitForScreen("MISSION_BRIEF");
  await user.click(screen.getByRole("button", { name: "Looks right" }));
  await waitForScreen("PARTICIPANT_RESOLUTION");
  await user.click(screen.getByRole("button", { name: "Create shopper here" }));
  await waitForScreen("SHOPPER_CREATION");
  await user.click(screen.getByRole("button", { name: "Learn my cabin taste" }));
  await waitForScreen("QUICK_CHOICES");
  for (const choice of [/Product A/, /Product A/, /Product A/, /^Skip$/]) {
    await waitFor(() => expect(screen.getByRole("button", { name: /Product B/ })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: choice }));
  }
  await waitForScreen("PROFILE_CONFIRMATION");
  await user.click(screen.getByRole("button", { name: "Looks right" }));
  await waitForScreen("MISSION_SPACE");
}

describe("UI over Terminal 1's engine", () => {
  it("runs the full story HOME → COMPLETE with engine decisions", async () => {
    const api = await engineApi();
    const { user } = renderApp(api);

    await user.type(screen.getByLabelText("Describe your group mission"), CABIN_TRANSCRIPT);
    await user.click(screen.getByRole("button", { name: "Create mission" }));
    await waitForScreen("MISSION_BRIEF");
    expect(screen.getByTestId("brief-meta")).toHaveTextContent("3 days");
    expect(screen.getByTestId("brief-meta")).toHaveTextContent("$400");
    await user.click(screen.getByRole("button", { name: "Looks right" }));
    await waitForScreen("PARTICIPANT_RESOLUTION");

    const people = screen.getByRole("list", { name: "Participants" });
    expect(within(people).getByText("Maya").closest("li")).toHaveTextContent("Shopper ready");
    expect(within(people).getByText("Alex").closest("li")).toHaveTextContent("Shopper ready");
    expect(within(people).getByText("Guest").closest("li")).toHaveTextContent("No shopper yet");
    await user.click(screen.getByRole("button", { name: "Create shopper here" }));
    await waitForScreen("SHOPPER_CREATION");
    await user.type(screen.getByLabelText("Name"), "Sam");
    await user.click(screen.getByRole("button", { name: "Learn my cabin taste" }));
    await waitForScreen("QUICK_CHOICES");

    // Durability pair: the left product is the more durable one in Terminal 1's pair.
    await user.click(screen.getByRole("button", { name: /Product A/ }));
    await screen.findByText("Durability +1 signal");
    for (const choice of [/Product A/, /Product A/, /^Skip$/]) {
      await waitFor(() => expect(screen.getByRole("button", { name: /Product B/ })).toBeEnabled());
      await user.click(screen.getByRole("button", { name: choice }));
    }
    await waitForScreen("PROFILE_CONFIRMATION");
    await user.click(screen.getByRole("button", { name: "Looks right" }));
    await waitForScreen("MISSION_SPACE");

    // Before/after comes from two engine recommendations.
    expect(screen.getByTestId("before-card")).toHaveTextContent("Premium Cabin Bundle");
    expect(screen.getByTestId("after-card")).toHaveTextContent("Balanced Cabin Bundle");
    expect(screen.getByTestId("before-card")).toHaveTextContent("No fragile glass");

    // Leap check through the engine's record → confirm flow.
    await user.click(screen.getByRole("button", { name: /^Select / }));
    await user.click(screen.getByRole("button", { name: "Try it" }));
    await waitForScreen("LEAP_CHECK");
    await user.click(screen.getByRole("button", { name: "One hand (right)" }));
    await user.click(screen.getByRole("button", { name: "Required" }));
    await screen.findByText(/confirmed requirement for you/);

    // Substitution paused by the engine for Maya's requirement, then an engine-approved alternative.
    await user.click(screen.getByRole("button", { name: "Continue: look for savings" }));
    await waitForScreen("SUBSTITUTION_APPROVAL");
    expect(screen.getByText(/Substitution paused/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Maya");
    expect(screen.getByRole("alert")).toHaveTextContent("One-hand operation");
    await user.click(screen.getByRole("button", { name: "Choose compatible alternative" }));
    await screen.findByText("Compatible alternative approved");

    await user.click(screen.getByRole("button", { name: "Ask everyone for approval" }));
    await user.click(screen.getByRole("button", { name: "Ask everyone" }));
    await waitForScreen("COMPLETE");
  }, 30000);

  it("override goes back to the engine with overrideApproved", async () => {
    const api = await engineApi();
    const calls: unknown[] = [];
    const spied = { ...api, evaluateSubstitution: (id: string, input: Parameters<typeof api.evaluateSubstitution>[1]) => (calls.push(input), api.evaluateSubstitution(id, input)) };
    const { user } = renderApp(spied);
    await toMissionSpaceWithGuest(user);
    await user.click(screen.getByRole("button", { name: /^Select / }));
    await user.click(screen.getByRole("button", { name: "Skip" }));
    await user.click(screen.getByRole("button", { name: "Find savings" }));
    await waitForScreen("SUBSTITUTION_APPROVAL");
    await user.click(screen.getByRole("button", { name: "Override with approval" }));
    expect(calls).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Override with my approval" }));
    await screen.findByText("Overridden with your approval");
    expect(calls[1]).toMatchObject({ overrideApproved: true, savings: 18 });
  }, 30000);

  it("in-mission commands that the engine parses today behave per the confirmation policy", async () => {
    const api = await engineApi();
    const { user } = renderApp(api);
    await user.type(screen.getByLabelText("Describe your group mission"), CABIN_TRANSCRIPT);
    await user.click(screen.getByRole("button", { name: "Create mission" }));
    await waitForScreen("MISSION_BRIEF");
    await user.click(screen.getByRole("button", { name: "Looks right" }));
    await waitForScreen("PARTICIPANT_RESOLUTION");
    await user.click(screen.getByRole("button", { name: "Continue without profile" }));
    await waitForScreen("MISSION_SPACE");

    await runCommand(user, "Show a cheaper option without glass.");
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("No fragile glass");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await runCommand(user, "Set the budget to $350.");
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("$350");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await runCommand(user, "Why did Maya pick this?");
    await waitFor(() => expect(screen.getByRole("tab", { name: "Why" })).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Maya");
    expect(appScreen()).toBe("MISSION_SPACE");
  }, 30000);
});

// The seven commands from the Terminal 2 brief, run straight through Terminal 1's interpreter.
// `it.fails` marks known parser gaps requested from Terminal 1; when a gap is fixed the test starts
// failing, which is the signal to flip it to `it`.
describe("spec voice commands through Terminal 1's interpreter", () => {
  const service = new AffinityCoreService();
  const interpret = (t: string) => service.interpretVoice({ transcript: t });

  it("“Compare these two.” → compare_products", async () => {
    expect((await interpret("Compare these two.")).intent).toBe("compare_products");
  });
  it("“Show a cheaper option.” → filter_products lower", async () => {
    expect(await interpret("Show a cheaper option.")).toMatchObject({ intent: "filter_products", entities: { priceDirection: "lower" } });
  });
  it("“Add this to the cart.” → modify_cart add", async () => {
    expect(await interpret("Add this to the cart.")).toMatchObject({ intent: "modify_cart", entities: { action: "add" } });
  });
  it("“Why did Maya reject this?” → explain_decision", async () => {
    expect((await interpret("Why did Maya reject this?")).intent).toBe("explain_decision");
  });
  it.fails("GAP: “Show the cooking category.” should carry entities.category", async () => {
    expect(await interpret("Show the cooking category.")).toMatchObject({ intent: "navigate_category", entities: { category: "cooking" } });
  });
  it.fails("GAP: “Remove products with glass.” should be a glass exclusion, not a cart removal", async () => {
    expect(await interpret("Remove products with glass.")).toMatchObject({ entities: { excludedMaterial: "glass" } });
  });
  it.fails("GAP: “Ask everyone for approval.” should be approve_action", async () => {
    expect(await interpret("Ask everyone for approval.")).toMatchObject({ intent: "approve_action", requiresConfirmation: true });
  });
});
