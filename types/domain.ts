// Agent-side contracts: the TypeScript mirror of backend/models.py and backend/AGENT_INTEGRATION.md.
// One definition per concept lives here; the director, stage store, HUD, and API routes all import
// from this file rather than keeping their own Mission/Bundle/event shapes.

export type MissionType = "shared" | "gift";
export type MissionKind = "shopping" | "plan";
export type CatalogSlot = "tree" | "lights" | "ornaments" | "topper" | "decoy";

export interface HouseRule {
  type: "maxHeight" | "excludedTag";
  inches?: number;
  tag?: string;
  why: string;
}

export interface FamilyProfile {
  id: string;
  name: string;
  relationship: string;
  look: string;
  colors: string[];
  personality: string[];
  loves: string[];
  avoids: string[];
  houseRules: HouseRule[];
}

/** Agent-readable digest of a learned taste profile (backend FamilyProfile.taste). Consumer UI never shows this raw. */
export interface TasteSummaryForAgents {
  summary: string;
  likes: string[];
  dislikes: string[];
  /** 0..1 overall confidence in the learned traits. */
  confidence: number;
  traits: Record<string, { score: number; confidence: number }>;
  evidenceCount: number;
}

/** What the backend receives per invited person: the roster profile plus optional contact and taste. */
export interface RuntimeProfile extends FamilyProfile {
  email?: string;
  emailNotifications?: boolean;
  taste?: TasteSummaryForAgents;
}

export interface ShoppingSlot {
  id: string;
  query: string;
  quantity?: number;
}

export interface Mission {
  occasion: string;
  budget: number;
  freeText: string;
  type: MissionType;
  /** Required for gift missions; must be one of invitedSpriteIds. Its wishes weigh double. */
  recipientId?: string;
  invitedSpriteIds: string[];
  /** Defaults to "shopping" on the backend. */
  kind?: MissionKind;
  /** Explicit product categories to fill; without them the backend infers slots from the text. */
  shoppingSlots?: ShoppingSlot[];
}

export interface SpriteOpinion {
  spriteId: string;
  say: string;
  hardRules: HouseRule[];
  wishes: string[];
  vetoes: string[];
}

export interface Conflict {
  rule: string;
  wish: string;
  resolution: string;
}

export interface ConstraintSet {
  hardRules: HouseRule[];
  wishes: Array<{ spriteId: string; wish: string; weight: number }>;
  conflicts: Conflict[];
}

/** One sprite's public response to the published opinions. */
export interface SpriteDeliberation {
  spriteId: string;
  say: string;
  replyToSpriteIds: string[];
  agreements: string[];
  concerns: string[];
  compromiseWishes: string[];
}

export interface SearchSlotPlan {
  slotId: string;
  queries: string[];
  rationale: string;
}

export interface SearchPlan {
  kind: MissionKind;
  slots: SearchSlotPlan[];
}

/** One renderable file supplied for a Shopify-hosted 3D model (backend ProductModel3dSource). */
export interface ProductModel3dSource {
  url: string;
  format: string;
  mimeType: string;
  filesize?: number;
}

/** A Shopify product model and its web/AR source files (backend ProductModel3d). */
export interface ProductModel3d {
  sources: ProductModel3dSource[];
  id?: string;
  alt?: string;
  previewImageUrl?: string;
}

export type ProductProvider = "local" | "shopify_ucp";

/**
 * A normalized product from the local catalog or Shopify UCP. Mirrors backend/models.py CatalogItem:
 * the tree slots keep their local `model`/`heightIn` fields, gift products carry merchant, media, and
 * explanation fields. `slot` is a string because the backend accepts any shopping slot id; the tree
 * renderer narrows it to CatalogSlot.
 */
export interface CatalogItem {
  id: string;
  slot: CatalogSlot | string;
  name: string;
  price: number;
  heightIn?: number;
  tags: string[];
  model?: string;
  ornamentAnchors?: number;
  provider?: ProductProvider;
  productId?: string;
  variantId?: string;
  merchantName?: string;
  merchantDomain?: string;
  /** Discovery-time link; never a checkout handoff (see CommerceCart.checkoutUrl). */
  productUrl?: string;
  imageUrl?: string;
  has3dModel?: boolean;
  models3d?: ProductModel3d[];
  currency?: string;
  quantity?: number;
  selectedBecause?: string[];
  /** Optional normalized taste traits (0..1) attached by the backend classifier. */
  traits?: Partial<Record<string, number>>;
}

export interface RejectedAlternative {
  id: string;
  slot: string;
  name: string;
  reason: string;
}

export interface Bundle {
  items: CatalogItem[];
  total: number;
  serves: Record<string, string[]>;
  source?: ProductProvider;
  warnings?: string[];
  rejectedAlternatives?: RejectedAlternative[];
}

/** A merchant cart created only after the mandate is approved and preflight passed. */
export interface CommerceCart {
  merchantDomain: string;
  cartId: string;
  checkoutUrl: string;
  total?: number;
  currency?: string;
}

export interface SpriteScore {
  spriteId: string;
  score: number;
  say: string;
  complaint?: string;
}

/** The lowest scorer's complaint that sends the council back to search. */
export interface Revision {
  spriteId: string;
  complaint: string;
}

/** Normalized targeted repair after a replace_agent resume. */
export interface ProposalRepair {
  itemId: string;
  slotId: string;
  prompt: string;
  autonomous: boolean;
}

export type PreflightStatus = "ready" | "changed" | "repair";

/** Shopify refresh result before final approval. `changed` means fresh consent is required. */
export interface Preflight {
  status: PreflightStatus;
  changes: string[];
  total?: number;
}

/** Terminal receipt from the backend; distinct from the browser's signed CartMandate proof. */
export interface CouncilReceipt {
  status: "approved" | "rejected";
  threadId: string;
  total?: number;
  signature?: string;
  rejectedItemId?: string;
}

/** The value LangGraph interrupts with at the human mandate. */
export interface MandateInterrupt {
  type: "cart_mandate" | "plan_mandate";
  bundle?: Bundle;
  plan?: unknown;
  requiredGesture: string;
  holdSeconds: number;
}

export type RunStatus = "interrupted" | "complete";

/** Public checkpointed state; the last event of every HTTP segment. */
export interface RunState {
  threadId: string;
  status: RunStatus;
  interrupts: Array<{ id: string; value: MandateInterrupt; responseSchema?: unknown }>;
  state: {
    mission?: Mission;
    bundle?: Bundle;
    scores?: SpriteScore[];
    receipt?: CouncilReceipt;
    carts?: CommerceCart[];
    preflightStatus?: PreflightStatus;
    preflightChanges?: string[];
    revisionCount?: number;
    rejectedCandidateIds?: string[];
  } & Record<string, unknown>;
}

export interface SafeError {
  detail: string;
  status: number;
}

/** Body of POST /runs/stream (proxied by /api/council). */
export interface StartRunRequest {
  threadId: string;
  mission: Mission;
  profiles: RuntimeProfile[];
}

export type ResumeAction =
  | { action: "approve"; signature: string }
  | { action: "replace_agent"; itemId: string; prompt?: string }
  | { action: "reject"; itemId: string };

/** Body of POST /runs/resume/stream (proxied by /api/council/resume). Same threadId as the start. */
export type ResumeRunRequest = { threadId: string } & ResumeAction;

/** The browser's signed proof of approval (AP2 vocabulary). Its signature is what resumes the backend. */
export interface CartMandate {
  mission: Mission;
  bundle: Bundle;
  approvedAt: string;
  publicKey: JsonWebKey;
  signature: string;
}

/**
 * Every SSE frame the council can produce. Backend events follow AGENT_INTEGRATION.md; `veto` is
 * frontend-only, synthesized from the first constraints conflict (and present in the replay
 * transcript) so the room's veto beat plays with the live backend too.
 */
export type CouncilEvent =
  | { type: "mission"; payload: Mission }
  | { type: "opinion"; payload: SpriteOpinion }
  | { type: "constraints"; payload: ConstraintSet }
  | { type: "deliberation"; payload: SpriteDeliberation }
  | { type: "consensus"; payload: ConstraintSet }
  | { type: "search_plan"; payload: SearchPlan }
  | { type: "bundle"; payload: Bundle }
  | { type: "score"; payload: SpriteScore }
  | { type: "veto"; payload: Conflict }
  | { type: "revision"; payload: Revision }
  | { type: "scores_complete"; payload: SpriteScore[] }
  /** The backend sends the interrupt value; the replay transcript sends a bare Bundle. */
  | { type: "awaiting_mandate"; payload: MandateInterrupt | Bundle }
  | { type: "repair_requested"; payload: Record<string, unknown> }
  | { type: "repair"; payload: ProposalRepair }
  | { type: "preflight"; payload: Preflight }
  | { type: "receipt"; payload: CouncilReceipt }
  | { type: "carts"; payload: CommerceCart[] }
  | { type: "notifications"; payload: unknown[] }
  | { type: "plan"; payload: unknown }
  | { type: "run_state"; payload: RunState }
  | { type: "error"; payload: SafeError };

export type CouncilEventType = CouncilEvent["type"];

/** The bundle a mandate payload carries, whichever shape it arrived in. */
export function mandateBundle(payload: MandateInterrupt | Bundle): Bundle | null {
  if ("items" in payload && Array.isArray(payload.items)) return payload;
  if ("bundle" in payload && payload.bundle && Array.isArray(payload.bundle.items)) return payload.bundle;
  return null;
}
