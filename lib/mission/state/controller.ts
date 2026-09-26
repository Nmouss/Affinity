import { useCallback, useMemo, useReducer, useRef } from "react";
import type { AffinityApi } from "@/lib/mission/services/affinityApi";
import type {
  ComparisonChoice,
  MissionDraft,
  Product,
  UseClassification,
  UseObservation,
  VoiceIntent,
} from "@/lib/mission/services/contracts";
import { categoryLabel, nameFor, ruleLabel } from "@/lib/mission/state/labels";
import { type AppState, type Screen, handlingFor, initialState, reducer } from "@/lib/mission/state/machine";

export type Controller = ReturnType<typeof useAffinity>["actions"];

/** Products in the catalog that expose a physical control worth a contextual Leap check. */
export const hasPhysicalControl = (product: Product | undefined) =>
  Boolean(product && (typeof product.facts.control === "string" || typeof product.facts.controls === "string"));

/** Rule a spoken "no glass"-style exclusion would add; display mapping, confirmed by the user. */
const RULE_FOR_MATERIAL: Record<string, string> = { glass: "no_fragile_glass" };

export function useAffinity(api: AffinityApi, init: Partial<AppState> = {}) {
  const [state, dispatch] = useReducer(reducer, { ...initialState, ...init });
  const stateRef = useRef(state);
  stateRef.current = state;

  /** Runs one adapter call with a visible busy label and a recoverable error. */
  const run = useCallback(async <T,>(label: string, work: () => Promise<T>): Promise<T | undefined> => {
    dispatch({ type: "BUSY", label });
    try {
      const result = await work();
      dispatch({ type: "BUSY", label: null });
      return result;
    } catch (error) {
      dispatch({ type: "ERROR", message: `${label} failed: ${error instanceof Error ? error.message : String(error)}` });
      return undefined;
    }
  }, []);

  const actions = useMemo(() => {
    const go = (screen: Screen) => dispatch({ type: "GO", screen });
    const s = () => stateRef.current;
    const product = (id: string | null) => s().catalog?.products.find((p) => p.id === id);
    /** Same-category products cheaper than `base` and not already in the cart, cheapest first. */
    const cheaperAlternatives = (base: Product) =>
      (s().catalog?.products ?? [])
        .filter((p) => p.category === base.category && p.price < base.price && !s().cartIds.includes(p.id))
        .sort((a, b) => a.price - b.price);
    const savingsBetween = (a: Product, b: Product) => Math.round((a.price - b.price) * 100) / 100;

    async function parseInto(text: string) {
      const draft = await run("Reading your mission", () => api.parseMission(text));
      if (!draft) return;
      dispatch({ type: "SET_DRAFT", draft });
      go("MISSION_BRIEF");
    }

    async function refreshRecommendation() {
      const mission = s().mission;
      const shopper = s().shopper;
      if (!mission) return;
      const after = await run("Updating the group decision", () => api.recommend(mission.id));
      if (after) dispatch({ type: "RECOMMENDATION_UPDATED", after });
      return { after, shopper };
    }

    const actions = {
      reset: () => dispatch({ type: "RESET" }),
      clearError: () => dispatch({ type: "ERROR", message: null }),
      clearNotice: () => dispatch({ type: "NOTICE", message: null }),
      back: (screen: Screen) => go(screen),

      // HOME / TRANSCRIPT_CONFIRMATION — text and voice share parseInto().
      submitText: (text: string) => (text.trim() ? parseInto(text.trim()) : undefined),
      voiceCaptured(transcript: string, source: "live" | "demo") {
        dispatch({ type: "SET_TRANSCRIPT", transcript, source });
        go("TRANSCRIPT_CONFIRMATION");
      },
      editTranscript: (transcript: string) => dispatch({ type: "SET_TRANSCRIPT", transcript }),
      confirmTranscript: () => parseInto(s().transcript.trim()),
      retryVoice() {
        dispatch({ type: "SET_TRANSCRIPT", transcript: "", source: undefined });
        go("HOME");
      },

      // MISSION_BRIEF
      updateDraft: (draft: MissionDraft) => dispatch({ type: "SET_DRAFT", draft }),
      async confirmBrief() {
        const draft = s().draft;
        if (!draft) return;
        const result = await run("Creating the mission", async () => {
          const mission = await api.createMission(draft);
          const [participants, shoppers, catalog, before] = await Promise.all([
            api.resolveParticipants(mission.id),
            api.getShoppers(mission.id),
            api.getCatalog(mission.id),
            api.recommend(mission.id),
          ]);
          return { mission, participants, shoppers, catalog, before };
        });
        if (!result) return;
        dispatch({ type: "MISSION_CREATED", ...result });
        go("PARTICIPANT_RESOLUTION");
      },

      // PARTICIPANT_RESOLUTION
      invite: (name: string) => dispatch({ type: "INVITE_SENT", name }),
      startShopperCreation: () => go("SHOPPER_CREATION"),
      async continueWithoutProfile() {
        dispatch({ type: "ENTER_SPACE", shopper: null, shoppers: s().shoppers, after: null });
        go("MISSION_SPACE");
      },

      // SHOPPER_CREATION
      async createShopper(name: string, avatarId: string, rule: string | null) {
        const mission = s().mission;
        if (!mission) return;
        const result = await run("Creating your shopper", async () => {
          const existing = s().shopper;
          // Re-entering from "Edit" keeps the same shopper and adds only a newly chosen rule.
          const shopper = existing
            ? rule && !existing.rules.includes(rule)
              ? await api.addShopperRule(existing.id, rule)
              : existing
            : await api.createShopper({ missionId: mission.id, name, avatarId, category: "cabin_supplies", rule });
          const pairs = s().pairs.length ? s().pairs : await api.getComparisonPairs(shopper.category);
          return { shopper, pairs };
        });
        if (!result) return;
        dispatch({ type: "SHOPPER_CREATED", ...result });
        go("QUICK_CHOICES");
      },

      // QUICK_CHOICES
      async choose(choice: ComparisonChoice) {
        const { shopper, pairs, choiceIndex, busy } = s();
        const pair = pairs[choiceIndex];
        if (!shopper || !pair || busy) return;
        const updated = await run("Learning your cabin taste", () =>
          api.submitComparison(shopper.id, { pairId: pair.pairId, choice }),
        );
        if (!updated) return;
        const before = shopper.evidenceCounts[pair.axis] ?? 0;
        const after = updated.evidenceCounts[pair.axis] ?? 0;
        const learned = after > before;
        // Which side was "more" of the axis comes from the pair definition, not from the score change.
        const chosen = choice === "left" ? pair.leftValue : pair.rightValue;
        const other = choice === "left" ? pair.rightValue : pair.leftValue;
        dispatch({
          type: "CHOICE_RECORDED",
          shopper: updated,
          feedback: {
            pairId: pair.pairId,
            choice,
            learnedAxis: learned ? pair.axis : null,
            direction: learned ? (chosen >= other ? 1 : -1) : 0,
          },
        });
        if (choiceIndex + 1 >= pairs.length) go("PROFILE_CONFIRMATION");
      },

      // PROFILE_CONFIRMATION
      editProfile: () => go("SHOPPER_CREATION"),
      async confirmProfile() {
        const { shopper, mission } = s();
        if (!shopper || !mission) return;
        const result = await run("Saving confirmed traits", async () => {
          const confirmed = await api.confirmShopper(shopper.id);
          const [after, shoppers] = await Promise.all([api.recommend(mission.id), api.getShoppers(mission.id)]);
          return { confirmed, after, shoppers };
        });
        if (!result) return;
        dispatch({ type: "ENTER_SPACE", shopper: result.confirmed, shoppers: result.shoppers, after: result.after });
        go("MISSION_SPACE");
      },

      // MISSION_SPACE
      setPanel: (panel: AppState["panel"]) => dispatch({ type: "PANEL", panel }),
      showCategory: (category: string | null) => dispatch({ type: "CATEGORY", category }),
      selectProduct: (productId: string | null) => dispatch({ type: "SELECT_PRODUCT", productId }),
      compare: (ids: [string, string] | null) => dispatch({ type: "COMPARE", ids }),
      addToCart(productId: string) {
        const item = product(productId);
        if (!item || s().cartIds.includes(productId)) return;
        dispatch({ type: "SET_CART", cartIds: [...s().cartIds, productId], undoMessage: `Added ${item.name} to the shared cart.` });
      },
      removeFromCart(productId: string) {
        const item = product(productId);
        if (!item) return;
        dispatch({ type: "SET_CART", cartIds: s().cartIds.filter((id) => id !== productId), undoMessage: `Removed ${item.name}.` });
      },
      undo: () => dispatch({ type: "UNDO" }),
      dismissUndo: () => dispatch({ type: "DISMISS_UNDO" }),
      dismissLeapOffer: () => dispatch({ type: "DISMISS_LEAP_OFFER" }),

      /** Voice and the command bar both land here with a confirmed transcript. */
      async runCommand(transcript: string) {
        const text = transcript.trim();
        if (!text) return;
        const intent = await run("Understanding your command", () => api.interpretVoice(text));
        if (!intent) return;
        const response = await applyIntent(intent);
        dispatch({ type: "VOICE_LOG", entry: { transcript: text, response } });
      },

      async confirmPending(choice: "confirm" | "alternate") {
        const pending = s().pending;
        dispatch({ type: "CONFIRM_CLEAR" });
        if (!pending) return;
        if (pending.kind === "add_rule") {
          if (choice === "alternate") {
            dispatch({ type: "HIDE_MATERIAL", material: pending.material });
            dispatch({ type: "NOTICE", message: `Hiding products with ${pending.material}. No rule was added.` });
            return;
          }
          const shopper = s().shopper;
          if (!shopper) {
            dispatch({ type: "NOTICE", message: "Create a shopper first to add a rule." });
            return;
          }
          const updated = await run("Adding the rule", () => api.addShopperRule(shopper.id, pending.rule));
          if (!updated) return;
          dispatch({ type: "HIDE_MATERIAL", material: pending.material });
          const mission = s().mission;
          if (mission) {
            const after = await run("Updating the group decision", () => api.recommend(mission.id));
            if (after) dispatch({ type: "RECOMMENDATION_UPDATED", after, shopper: updated });
          }
          dispatch({ type: "NOTICE", message: `Added “${ruleLabel(pending.rule)}” as your rule for this mission.` });
        } else if (pending.kind === "mission_change") {
          // TODO(Terminal 1): no mission-update endpoint yet; the change is acknowledged but not saved.
          dispatch({ type: "NOTICE", message: "Mission changes need a Terminal 1 endpoint; nothing was changed." });
        } else if (pending.kind === "request_approval") {
          dispatch({ type: "APPROVAL_REQUESTED" });
          go("COMPLETE");
        } else if (pending.kind === "override_substitution") {
          const { substitution: sub, mission } = s();
          if (!sub || !mission) return;
          // The engine decides whether an approved override is allowed.
          const result = await run("Recording the override", () =>
            api.evaluateSubstitution(mission.id, {
              missionId: mission.id,
              currentProductId: sub.currentProductId,
              replacementProductId: sub.replacementProductId,
              savings: sub.savings,
              overrideApproved: true,
            }),
          );
          if (!result) return;
          if (result.decision !== "allow") {
            dispatch({ type: "ERROR", message: result.message });
            return;
          }
          dispatch({ type: "SUBSTITUTION_STATUS", status: "overridden", cartIds: swap(s().cartIds, sub.currentProductId, sub.replacementProductId) });
        }
      },
      cancelPending: () => dispatch({ type: "CONFIRM_CLEAR" }),
      requestApproval: () => dispatch({ type: "CONFIRM_REQUEST", pending: { kind: "request_approval", transcript: "" } }),

      // LEAP_CHECK
      startLeapCheck(productId: string) {
        dispatch({ type: "LEAP_START", productId });
        go("LEAP_CHECK");
      },
      leapCapturing: (source: "live" | "recorded" | "manual") => dispatch({ type: "LEAP_CAPTURING", source }),
      leapObserved: (observation: UseObservation, source: "live" | "recorded" | "manual") =>
        dispatch({ type: "LEAP_OBSERVED", observation, source }),
      async classifyObservation(classification: UseClassification) {
        const { leapCheck, shopper } = s();
        if (!leapCheck?.observation || !leapCheck.source) return;
        if (shopper) {
          const ok = await run("Saving your answer", () =>
            api.submitUseObservation(shopper.id, {
              productId: leapCheck.productId,
              observation: leapCheck.observation!,
              classification,
              source: leapCheck.source!,
            }).then(() => true),
          );
          if (!ok) return;
        }
        dispatch({ type: "LEAP_CLASSIFIED", classification });
      },
      leaveLeapCheck: () => go("MISSION_SPACE"),

      // SUBSTITUTION_APPROVAL
      /**
       * Evaluates a cheaper replacement with the engine. Without arguments it takes the cart item with
       * a physical control and its cheapest same-category alternative.
       */
      async findSavings(currentProductId?: string, replacementProductId?: string) {
        const { mission, cartIds, catalog } = s();
        if (!mission || !catalog) return;
        const current = product(currentProductId ?? null) ?? product(cartIds.find((id) => hasPhysicalControl(product(id))) ?? null);
        const replacement = product(replacementProductId ?? null) ?? (current && cheaperAlternatives(current)[0]);
        if (!current || !replacement) {
          dispatch({ type: "NOTICE", message: "No cheaper alternative in this category." });
          return;
        }
        const swapInput = { currentProductId: current.id, replacementProductId: replacement.id, savings: savingsBetween(current, replacement) };
        const result = await run("Checking a cheaper substitute", () => api.evaluateSubstitution(mission.id, { missionId: mission.id, ...swapInput }));
        if (!result) return;
        const allowed = result.decision === "allow";
        dispatch({ type: "SUBSTITUTION", substitution: { ...swapInput, result, status: allowed ? "allowed" : "paused" } });
        if (allowed) dispatch({ type: "SET_CART", cartIds: swap(s().cartIds, swapInput.currentProductId, swapInput.replacementProductId) });
        go("SUBSTITUTION_APPROVAL");
      },
      /** Asks the engine about each remaining cheaper option, closest price first, and takes the first it allows. */
      async chooseCompatibleAlternative() {
        const { mission, substitution: paused } = s();
        const current = product(paused?.currentProductId ?? null);
        if (!mission || !paused || !current) return;
        const candidates = cheaperAlternatives(current).filter((p) => p.id !== paused.replacementProductId).reverse();
        const found = await run("Finding a compatible alternative", async () => {
          for (const candidate of candidates) {
            const input = { currentProductId: current.id, replacementProductId: candidate.id, savings: savingsBetween(current, candidate) };
            const result = await api.evaluateSubstitution(mission.id, { missionId: mission.id, ...input });
            if (result.decision === "allow") return { input, result };
          }
          return null;
        });
        if (found === undefined) return;
        if (!found) {
          dispatch({ type: "ERROR", message: "No cheaper alternative satisfies everyone. Keep the current item or ask the affected shopper." });
          return;
        }
        dispatch({ type: "SUBSTITUTION", substitution: { ...found.input, result: found.result, status: "alternative_approved" } });
        dispatch({ type: "SET_CART", cartIds: swap(s().cartIds, found.input.currentProductId, found.input.replacementProductId) });
      },
      askAffected: () => dispatch({ type: "SUBSTITUTION_STATUS", status: "asked" }),
      requestOverride: () => dispatch({ type: "CONFIRM_REQUEST", pending: { kind: "override_substitution" } }),
      backToSpace: () => go("MISSION_SPACE"),
      finish: () => go("COMPLETE"),
      startOver() {
        go("HOME");
        dispatch({ type: "RESET" });
      },
      refreshRecommendation,
    };

    /** Applies a typed intent using the Terminal 2 confirmation policy. Returns a one-line response. */
    async function applyIntent(intent: VoiceIntent): Promise<string> {
      const state = s();
      const { entities } = intent;
      if (entities.unrecognized) {
        return "I didn’t catch a command. Try “Show the cooking category” or “Compare these two.”";
      }
      const handling = handlingFor(intent);

      if (handling === "confirm_always") {
        dispatch({ type: "CONFIRM_REQUEST", pending: { kind: "request_approval", transcript: intent.transcript } });
        return "Waiting for your confirmation before asking everyone.";
      }
      if (handling === "confirm") {
        const material = typeof entities.excludedMaterial === "string" ? entities.excludedMaterial : null;
        const rule = typeof entities.proposedRule === "string" ? entities.proposedRule : material ? RULE_FOR_MATERIAL[material] : undefined;
        if (rule) {
          dispatch({ type: "CONFIRM_REQUEST", pending: { kind: "add_rule", rule, material: material ?? "glass", transcript: intent.transcript } });
          return `Waiting for your confirmation to add “${ruleLabel(rule)}”.`;
        }
        const field = typeof entities.missionField === "string"
          ? entities.missionField
          : "sharedBudget" in entities ? "sharedBudget" : "participantNames" in entities ? "participants" : "rule" in entities ? "rules" : "mission";
        const value = typeof entities.value === "number" ? entities.value : typeof entities.sharedBudget === "number" ? entities.sharedBudget : undefined;
        dispatch({ type: "CONFIRM_REQUEST", pending: { kind: "mission_change", field, value, transcript: intent.transcript } });
        return "Waiting for your confirmation.";
      }

      const selected = product(state.selectedProductId) ?? product(state.cartIds.find((id) => hasPhysicalControl(product(id))) ?? null);

      switch (intent.intent) {
        case "navigate_category": {
          // Prefer the engine's entity; otherwise resolve which on-screen category the transcript names.
          const shown = [...new Set(state.cartIds.map((id) => product(id)?.category).filter((c): c is string => Boolean(c)))];
          const spoken = shown.find((c) => intent.transcript.toLowerCase().includes(categoryLabel(c).toLowerCase()));
          const category = typeof entities.category === "string" ? entities.category : spoken ?? shown[0] ?? "cooking";
          dispatch({ type: "CATEGORY", category });
          return `Showing ${categoryLabel(category)}.`;
        }
        case "compare_products": {
          const base = selected;
          const other = base && state.catalog?.products.find((p) => p.category === base.category && p.id !== base.id && !state.cartIds.includes(p.id));
          if (!base || !other) return "Select a product in the cart to compare.";
          dispatch({ type: "COMPARE", ids: [base.id, other.id] });
          return `Comparing ${base.name} with ${other.name}.`;
        }
        case "filter_products": {
          if (entities.priceDirection === "lower") {
            const base = selected;
            const cheaper = base && state.catalog?.products
              .filter((p) => p.category === base.category && p.price < base.price && !state.cartIds.includes(p.id))
              .sort((a, b) => a.price - b.price)[0];
            if (!base || !cheaper) return "No cheaper option in this category.";
            dispatch({ type: "SELECT_PRODUCT", productId: base.id });
            dispatch({ type: "COMPARE", ids: [base.id, cheaper.id] });
            return `${cheaper.name} is ${Math.round(base.price - cheaper.price)} dollars cheaper. Use “Swap in” to check it against everyone’s rules.`;
          }
          return "Filter applied.";
        }
        case "explain_decision": {
          const named = state.shoppers.find((p) => intent.transcript.toLowerCase().includes(p.name.toLowerCase()));
          const shopperId = typeof entities.shopperId === "string" ? entities.shopperId : named?.id ?? state.shoppers[0]?.id ?? "maya";
          const rec = state.recommendationAfter ?? state.recommendationBefore;
          const who = nameFor(shopperId, state.shoppers);
          const lines: string[] = [];
          const profile = state.shoppers.find((p) => p.id === shopperId);
          for (const rejected of rec?.rejectedBundles.filter((r) => r.shopperId === shopperId) ?? []) {
            lines.push(`${who}’s shopper ruled out ${bundleName(rejected.bundleId)}: ${ruleLabel(rejected.violatedRequirement)}.`);
          }
          for (const score of rec?.individualScores.filter((x) => x.shopperId === shopperId) ?? []) {
            lines.push(`${bundleName(score.bundleId)}: ${score.reasons.join(" ")}`);
          }
          for (const requirement of profile?.confirmedUseRequirements ?? []) {
            lines.push(`${who} confirmed a requirement: ${ruleLabel(requirement)}.`);
          }
          dispatch({ type: "EXPLAIN", shopperId, lines: lines.length ? lines : [`${who}’s shopper has no objections recorded.`] });
          return `Here’s what ${who}’s shopper said.`;
        }
        case "modify_cart": {
          if (!selected) return "Select a product first.";
          if ((entities.action ?? entities.operation) === "remove") {
            actions.removeFromCart(selected.id);
            return `Removed ${selected.name}. Undo is available.`;
          }
          const target = state.compareIds?.find((id) => !state.cartIds.includes(id)) ?? selected.id;
          actions.addToCart(target);
          return `Added ${product(target)?.name ?? "it"} to the shared cart. Undo is available.`;
        }
        default:
          return "Done.";
      }
    }

    function bundleName(bundleId: string) {
      return s().catalog?.bundles.find((b) => b.id === bundleId)?.name ?? bundleId;
    }

    return actions;
  }, [api, run]);

  return { state, actions };
}

function swap(ids: string[], from: string, to: string) {
  return ids.includes(from) ? ids.map((id) => (id === from ? to : id)) : [...ids, to];
}
