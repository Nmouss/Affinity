import {
  ACCESSORY_TYPES,
  ADJUST,
  BODY_PRESETS,
  BROW_TYPES,
  EYE_COLORS,
  EYE_TYPES,
  FAVORITE_COLORS,
  MOUTH_TYPES,
  SKIN_TONES,
  type BodySize,
  type CharacterLook,
  type Circle,
  type PartKind,
} from "@/types/character";
import { BLANK_LOOK, STARTER_LOOKS } from "@/lib/people/starters";
import type { NewPerson, PersonPatch } from "@/lib/people/roster";
import {
  applyChoice,
  emptyProfile,
  nextComparison,
  progress,
  TASTE_COMPARISONS,
  undoChoice,
  type TasteChoice,
  type TasteComparison,
  type TasteProfile,
} from "@/lib/taste";

// Pure state machine for the People Maker (/create), modeled on the Wii Mii Channel's flow:
// Plaza -> New person -> Who is this? (circle, then size) -> Start from scratch/preset/random ->
// Editor (tabs) -> Quit dialog -> Taste (teach it what you like) -> Meet your character -> Plaza.
// UI components dispatch actions; nothing here touches the DOM, three.js, or the roster store
// directly (aside from the injected roster/taste calls in FlowDeps), so the whole flow is exercised
// in flow.test.ts without React or a browser.

export type MakerStep = "plaza" | "who-circle" | "who-size" | "start" | "editor" | "quit-dialog" | "taste" | "meet";

export const EDITOR_TABS = [
  "body",
  "colors",
  "eyes",
  "brows",
  "mouth",
  "cheeks",
  "accessory",
  "name",
] as const;
export type EditorTab = (typeof EDITOR_TABS)[number];

export const MAX_NAME_LENGTH = 12;

/** The Mii-style relationship label for each body size, when the person is family (not a friend). */
export const SIZE_RELATIONSHIP: Record<BodySize, string> = {
  grownup: "grown-up",
  kid: "kid",
  little: "little one",
};

/** STARTER_LOOKS keys, with the Mii-channel-style label shown on their "start from a preset" tile. */
export const PRESET_KEYS = ["wife", "daughter", "son"] as const;
export const PRESET_LABELS: Record<string, string> = {
  wife: "Maya-style",
  daughter: "Ava-style",
  son: "Leo-style",
};

export interface DraftPerson {
  name: string;
  circle: Circle;
  /** The "grown-up/kid/little one" pick; kept only to compute body + relationship, unused after. */
  size: BodySize;
  relationship: string;
  look: CharacterLook;
  /** Set when editing an existing person: save() updates them instead of adding a new one. */
  editingId: string | null;
}

export interface MakerState {
  step: MakerStep;
  tab: EditorTab;
  draft: DraftPerson | null;
  /** True right after a Save with an empty name; cleared the moment the name becomes non-empty. */
  nameError: boolean;
  /** Set while the plaza's Remove confirm dialog is open (rail click or Delete key), for this id. */
  plazaConfirmRemoveId: string | null;
  /** The saved person being taught their taste (steps "taste" and "meet"); `draft` keeps their look for the canvas. */
  tasteId: string | null;
}

export const initialMakerState: MakerState = {
  step: "plaza",
  tab: "body",
  draft: null,
  nameError: false,
  plazaConfirmRemoveId: null,
  tasteId: null,
};

export type MakerAction =
  | { type: "newPerson" }
  | { type: "editPerson"; id: string; name: string; circle: Circle; relationship: string; look: CharacterLook }
  | { type: "pickCircle"; circle: Circle }
  | { type: "pickSize"; size: BodySize }
  | { type: "startScratch" }
  | { type: "startPreset"; key: string }
  | { type: "startRandom"; random?: () => number }
  | { type: "setTab"; tab: EditorTab }
  | { type: "setBody"; field: "height" | "build"; delta: number }
  | { type: "setColor"; field: "bodyColor" | "accent" | "skin"; color: string }
  | { type: "setPart"; part: PartKind; option: string }
  | { type: "setPartColor"; part: "eyes" | "accessory"; color: string }
  | { type: "adjustEyes"; field: "height" | "size" | "spacing"; delta: number }
  | { type: "adjustBrows"; delta: number }
  | { type: "setCheeksOn"; on: boolean }
  | { type: "setCheeksColor"; color: string }
  | { type: "typeChar"; char: string }
  | { type: "backspace" }
  | { type: "setName"; name: string }
  | { type: "save" }
  | { type: "quit" }
  | { type: "quitWithoutSaving" }
  | { type: "cancelDialog" }
  | { type: "back" }
  | { type: "requestRemove"; id: string }
  | { type: "confirmRemove" }
  | { type: "cancelRemove" }
  /** Plaza: teach (or re-teach) an existing person's taste. Carries the look so the canvas can show them. */
  | { type: "teachTaste"; id: string; name: string; circle: Circle; relationship: string; look: CharacterLook }
  | { type: "tasteChoice"; choice: TasteChoice }
  | { type: "tasteUndo" }
  /** "Done for now": skip the remaining pairs and meet the character with what was learned. */
  | { type: "tasteDone" }
  | { type: "meetDone" };

export interface FlowDeps {
  addPerson: (person: NewPerson) => string | null;
  updatePerson: (id: string, patch: PersonPatch) => void;
  removePerson: (id: string) => void;
  /** The person's saved taste, if they have been taught anything yet. */
  getTaste: (id: string) => TasteProfile | undefined;
  setTaste: (id: string, profile: TasteProfile) => void;
  /** ISO timestamp for taste evidence; injected so the reducer stays deterministic in tests. */
  now: () => string;
}

/** The pair the person is looking at now, or null once every curated comparison is done. */
export function currentComparison(profile: TasteProfile | undefined): TasteComparison | null {
  return nextComparison(profile ?? emptyProfile(""), TASTE_COMPARISONS);
}

/** "3 of 10" style progress for the taste step. */
export function tasteProgress(profile: TasteProfile | undefined): { done: number; total: number } {
  return progress(profile ?? emptyProfile(""), TASTE_COMPARISONS);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampAdjust(value: number): number {
  return clamp(value, ADJUST.min, ADJUST.max);
}

/** First letter of each word upper case, the rest lower — Mii-channel-style names ("Sam", not
 * "SAM" or "sam"), regardless of how the caller typed or dispatched the raw characters. */
export function toTitleCase(raw: string): string {
  return raw
    .split(" ")
    .map((word) => (word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1).toLowerCase()))
    .join(" ");
}

export function sanitizeName(raw: string): string {
  return toTitleCase(raw.replace(/[^A-Za-z ]/g, "").slice(0, MAX_NAME_LENGTH));
}

function pick<T>(options: readonly T[], random: () => number): T {
  const index = Math.min(options.length - 1, Math.floor(random() * options.length));
  return options[index]!;
}

/** WCAG relative luminance of a #rrggbb hex color, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const channel = (value: number) => (value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
  const r = channel(parseInt(clean.slice(0, 2), 16) / 255);
  const g = channel(parseInt(clean.slice(2, 4), 16) / 255);
  const b = channel(parseInt(clean.slice(4, 6), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors: 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/** Eyes need to read against the face they sit on. EYE_COLORS has no eye that's light on every
 * skin tone, so a plain random pick can land a near-black eye on near-black skin; this keeps the
 * random pick everywhere it already reads fine, and only swaps in the most legible option in
 * EYE_COLORS on the skin tones where it wouldn't. */
export const MIN_EYE_CONTRAST = 3;

export function pickEyeColor(skin: string, random: () => number): string {
  const candidate = pick(EYE_COLORS, random);
  if (contrastRatio(candidate, skin) >= MIN_EYE_CONTRAST) return candidate;
  return EYE_COLORS.reduce((best, color) => (contrastRatio(color, skin) > contrastRatio(best, skin) ? color : best));
}

/** A fresh, fully random look (body kept as given: it was already set by the who-size pick). */
export function randomLook(body: { height: number; build: number }, random: () => number = Math.random): CharacterLook {
  const skin = pick(SKIN_TONES, random);
  return {
    body,
    bodyColor: pick(FAVORITE_COLORS, random),
    accent: pick(FAVORITE_COLORS, random),
    skin,
    eyes: { type: pick(EYE_TYPES, random), color: pickEyeColor(skin, random), size: 0, spacing: 0, height: 0 },
    brows: { type: pick(BROW_TYPES, random), height: 0 },
    mouth: { type: pick(MOUTH_TYPES, random) },
    cheeks: { on: true, color: pick(FAVORITE_COLORS, random) },
    accessory: { type: pick(ACCESSORY_TYPES, random), color: pick(FAVORITE_COLORS, random) },
  };
}

function cloneLook(look: CharacterLook): CharacterLook {
  return {
    body: { ...look.body },
    bodyColor: look.bodyColor,
    accent: look.accent,
    skin: look.skin,
    eyes: { ...look.eyes },
    brows: { ...look.brows },
    mouth: { ...look.mouth },
    cheeks: { ...look.cheeks },
    accessory: { ...look.accessory },
  };
}

function withLook(state: MakerState, mutate: (look: CharacterLook) => CharacterLook): MakerState {
  if (!state.draft) return state;
  return { ...state, draft: { ...state.draft, look: mutate(cloneLook(state.draft.look)) } };
}

function applyNameChange(state: MakerState, name: string): MakerState {
  if (!state.draft) return state;
  return { ...state, draft: { ...state.draft, name }, nameError: state.nameError && name.trim().length === 0 };
}

/**
 * The reducer proper. `deps` is only exercised on "save": production code passes the roster
 * store's addPerson/updatePerson, tests pass spies so the whole wizard is exercised without React
 * or zustand.
 */
export function flowReducer(state: MakerState, action: MakerAction, deps: FlowDeps): MakerState {
  switch (action.type) {
    case "newPerson": {
      if (state.step !== "plaza") return state;
      return {
        step: "who-circle",
        tab: "body",
        nameError: false,
        plazaConfirmRemoveId: null,
        tasteId: null,
        draft: {
          name: "",
          circle: "family",
          size: "grownup",
          relationship: SIZE_RELATIONSHIP.grownup,
          look: cloneLook(BLANK_LOOK),
          editingId: null,
        },
      };
    }

    case "editPerson": {
      if (state.step !== "plaza") return state;
      return {
        step: "editor",
        tab: "body",
        nameError: false,
        plazaConfirmRemoveId: null,
        tasteId: null,
        draft: {
          name: action.name,
          circle: action.circle,
          size: "grownup",
          relationship: action.relationship,
          look: cloneLook(action.look),
          editingId: action.id,
        },
      };
    }

    case "pickCircle": {
      if (state.step !== "who-circle" || !state.draft) return state;
      const relationship = action.circle === "friend" ? "friend" : SIZE_RELATIONSHIP[state.draft.size];
      return { ...state, step: "who-size", draft: { ...state.draft, circle: action.circle, relationship } };
    }

    case "pickSize": {
      if (state.step !== "who-size" || !state.draft) return state;
      const relationship = state.draft.circle === "friend" ? "friend" : SIZE_RELATIONSHIP[action.size];
      return {
        ...state,
        step: "start",
        draft: {
          ...state.draft,
          size: action.size,
          relationship,
          look: { ...cloneLook(state.draft.look), body: { ...BODY_PRESETS[action.size] } },
        },
      };
    }

    case "startScratch": {
      if (state.step !== "start" || !state.draft) return state;
      const body = { ...BODY_PRESETS[state.draft.size] };
      return { ...state, step: "editor", tab: "body", draft: { ...state.draft, look: { ...cloneLook(BLANK_LOOK), body } } };
    }

    case "startPreset": {
      if (state.step !== "start" || !state.draft) return state;
      const preset = STARTER_LOOKS[action.key];
      if (!preset) return state;
      const body = { ...BODY_PRESETS[state.draft.size] };
      return { ...state, step: "editor", tab: "body", draft: { ...state.draft, look: { ...cloneLook(preset), body } } };
    }

    case "startRandom": {
      if (state.step !== "start" || !state.draft) return state;
      const body = { ...BODY_PRESETS[state.draft.size] };
      return {
        ...state,
        step: "editor",
        tab: "body",
        draft: { ...state.draft, look: randomLook(body, action.random ?? Math.random) },
      };
    }

    case "setTab": {
      if (state.step !== "editor" || !state.draft) return state;
      return { ...state, tab: action.tab };
    }

    case "setBody": {
      return withLook(state, (look) => {
        look.body[action.field] = clamp(look.body[action.field] + action.delta, 0, 1);
        return look;
      });
    }

    case "setColor": {
      return withLook(state, (look) => {
        look[action.field] = action.color;
        return look;
      });
    }

    case "setPart": {
      return withLook(state, (look) => {
        // PartKind spans four differently-typed part records (EyeType/BrowType/...); `option` is
        // validated by the UI against PART_OPTIONS[part] before it ever reaches here.
        const part = look as unknown as Record<PartKind, { type: string }>;
        part[action.part] = { ...part[action.part], type: action.option };
        return look;
      });
    }

    case "setPartColor": {
      return withLook(state, (look) => {
        const part = look as unknown as Record<"eyes" | "accessory", { color: string }>;
        part[action.part] = { ...part[action.part], color: action.color };
        return look;
      });
    }

    case "adjustEyes": {
      return withLook(state, (look) => {
        look.eyes = { ...look.eyes, [action.field]: clampAdjust(look.eyes[action.field] + action.delta) };
        return look;
      });
    }

    case "adjustBrows": {
      return withLook(state, (look) => {
        look.brows = { ...look.brows, height: clampAdjust(look.brows.height + action.delta) };
        return look;
      });
    }

    case "setCheeksOn": {
      return withLook(state, (look) => {
        look.cheeks = { ...look.cheeks, on: action.on };
        return look;
      });
    }

    case "setCheeksColor": {
      return withLook(state, (look) => {
        look.cheeks = { ...look.cheeks, color: action.color };
        return look;
      });
    }

    case "typeChar": {
      if (state.step !== "editor" || !state.draft) return state;
      return applyNameChange(state, sanitizeName(state.draft.name + action.char));
    }

    case "backspace": {
      if (state.step !== "editor" || !state.draft) return state;
      return applyNameChange(state, state.draft.name.slice(0, -1));
    }

    case "setName": {
      if (!state.draft) return state;
      return applyNameChange(state, sanitizeName(action.name));
    }

    case "save": {
      if ((state.step !== "editor" && state.step !== "quit-dialog") || !state.draft) return state;
      const name = sanitizeName(state.draft.name).trim();
      if (!name) return { ...state, step: "editor", tab: "name", nameError: true };
      const person: NewPerson = { name, circle: state.draft.circle, relationship: state.draft.relationship, look: state.draft.look };
      let id: string | null;
      if (state.draft.editingId) {
        id = state.draft.editingId;
        deps.updatePerson(id, person);
        // An existing person who already has a taste goes straight back to the plaza, as before.
        if (deps.getTaste(id)) return { ...initialMakerState };
      } else {
        id = deps.addPerson(person);
        if (!id) return { ...initialMakerState }; // roster full: nothing to teach
      }
      return {
        ...initialMakerState,
        step: "taste",
        tasteId: id,
        draft: { ...state.draft, name, editingId: id },
      };
    }

    case "quit": {
      if (state.step !== "editor") return state;
      return { ...state, step: "quit-dialog" };
    }

    case "quitWithoutSaving": {
      if (state.step !== "quit-dialog") return state;
      return { ...initialMakerState };
    }

    case "cancelDialog": {
      if (state.step !== "quit-dialog") return state;
      return { ...state, step: "editor" };
    }

    case "back": {
      switch (state.step) {
        case "who-circle":
          return { ...initialMakerState };
        case "who-size":
          return { ...state, step: "who-circle" };
        case "start":
          return { ...state, step: "who-size" };
        case "editor":
          return { ...state, step: "quit-dialog" };
        case "quit-dialog":
          return { ...state, step: "editor" };
        case "taste":
          // The person is already saved; leaving the lesson early just meets them with what they know.
          return { ...state, step: "meet" };
        case "meet":
          return { ...initialMakerState };
        default:
          return state;
      }
    }

    case "requestRemove": {
      if (state.step !== "plaza") return state;
      return { ...state, plazaConfirmRemoveId: action.id };
    }

    case "confirmRemove": {
      if (state.step !== "plaza" || !state.plazaConfirmRemoveId) return state;
      deps.removePerson(state.plazaConfirmRemoveId);
      return { ...state, plazaConfirmRemoveId: null };
    }

    case "cancelRemove": {
      if (state.step !== "plaza") return state;
      return { ...state, plazaConfirmRemoveId: null };
    }

    case "teachTaste": {
      if (state.step !== "plaza") return state;
      return {
        ...initialMakerState,
        step: "taste",
        tasteId: action.id,
        draft: {
          name: action.name,
          circle: action.circle,
          size: "grownup",
          relationship: action.relationship,
          look: cloneLook(action.look),
          editingId: action.id,
        },
      };
    }

    case "tasteChoice": {
      if (state.step !== "taste" || !state.tasteId) return state;
      const now = deps.now();
      const profile = deps.getTaste(state.tasteId) ?? emptyProfile(now);
      const comparison = currentComparison(profile);
      if (!comparison) return { ...state, step: "meet" };
      const next = applyChoice(profile, comparison, action.choice, now);
      deps.setTaste(state.tasteId, next);
      const { done, total } = tasteProgress(next);
      return done >= total ? { ...state, step: "meet" } : state;
    }

    case "tasteUndo": {
      if (state.step !== "taste" || !state.tasteId) return state;
      const profile = deps.getTaste(state.tasteId);
      const last = profile?.completedComparisonIds.at(-1);
      if (!profile || !last) return state;
      deps.setTaste(state.tasteId, undoChoice(profile, last, deps.now()));
      return state;
    }

    case "tasteDone": {
      if (state.step !== "taste") return state;
      return { ...state, step: "meet" };
    }

    case "meetDone": {
      if (state.step !== "meet") return state;
      return { ...initialMakerState };
    }

    default:
      return state;
  }
}
