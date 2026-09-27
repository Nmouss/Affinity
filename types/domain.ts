export type MissionType = "shared" | "gift";
/** Free-form product-category id assigned by the backend's shopping plan (e.g. "centerpiece",
 *  "lighting", "accessory"). Generated per-mission by the shopper node, not a fixed set. */
export type CatalogSlot = string;

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
  email?: string;
  emailNotifications?: boolean;
}

export interface ShoppingSlot {
  id: string;
  query: string;
  quantity?: number;
}

export interface PlanLocation {
  label: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
}

export interface PlanSlot {
  id: string;
  query: string;
  includedType?: string;
  minRating?: number;
  openNow?: boolean;
  priceLevels?: string[];
  durationMinutes?: number;
}

export interface Mission {
  occasion: string;
  budget: number;
  freeText: string;
  type: MissionType;
  recipientId?: string;
  invitedSpriteIds: string[];
  kind?: "shopping" | "plan";
  shoppingSlots?: ShoppingSlot[];
  location?: PlanLocation;
  when?: string;
  planSlots?: PlanSlot[];
}

export interface SpriteOpinion {
  spriteId: string;
  say: string;
  hardRules: HouseRule[];
  wishes: string[];
  vetoes: string[];
}

/** One sprite's public response after it has heard the other opinions. */
export interface SpriteDeliberation {
  spriteId: string;
  say: string;
  replyToSpriteIds: string[];
  agreements: string[];
  concerns: string[];
  compromiseWishes: string[];
}

export interface SearchPlan {
  kind: "shopping" | "plan";
  slots: Array<{ slotId: string; queries: string[]; rationale: string }>;
}

export interface ConstraintSet {
  hardRules: HouseRule[];
  wishes: Array<{ spriteId: string; wish: string; weight: number }>;
  conflicts: Array<{ rule: string; wish: string; resolution: string }>;
}

/** One renderable file for a Shopify-hosted 3D model (glTF/GLB/USDZ). */
export interface ProductModel3dSource {
  url: string;
  format: string;
  mimeType: string;
  filesize?: number;
}

/** A Shopify product model and its web/AR source files. */
export interface ProductModel3d {
  sources: ProductModel3dSource[];
  id?: string;
  alt?: string;
  previewImageUrl?: string;
}

export interface CatalogItem {
  id: string;
  slot: CatalogSlot;
  name: string;
  price: number;
  heightIn?: number;
  tags: string[];
  model?: string;
  ornamentAnchors?: number;
  // Shopify-derived fields, present only for live-sourced items (absent for local fixtures).
  checkoutUrl?: string;
  productUrl?: string;
  imageUrl?: string;
  merchantName?: string;
  currency?: string;
  has3dModel?: boolean;
  models3d?: ProductModel3d[];
  provider?: "local" | "shopify_ucp";
  productId?: string;
  variantId?: string;
  merchantDomain?: string;
  quantity?: number;
  selectedBecause?: string[];
}

export interface Bundle {
  items: CatalogItem[];
  total: number;
  serves: Record<string, string[]>;
  source?: "local" | "shopify_ucp";
  warnings?: string[];
  rejectedAlternatives?: RejectedAlternative[];
}

export interface RejectedAlternative {
  id: string;
  slot: string;
  name: string;
  reason: string;
}

export interface PhotoAttribution {
  displayName?: string;
  uri?: string;
  photoUri?: string;
}

export interface PlaceCandidate {
  id: string;
  slot: string;
  name: string;
  address: string;
  tags: string[];
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  googleMapsUri?: string;
  websiteUri?: string;
  latitude?: number;
  longitude?: number;
  openNow?: boolean;
  reservable?: boolean;
  durationMinutes?: number;
  selectedBecause?: string[];
  photoName?: string;
  photoAttributions?: PhotoAttribution[];
}

export interface Plan {
  stops: PlaceCandidate[];
  location: string;
  serves: Record<string, string[]>;
  source: "google_places";
  when?: string;
  warnings?: string[];
  rejectedAlternatives?: RejectedAlternative[];
}

export interface ProposalRepair {
  itemId: string;
  slotId: string;
  prompt: string;
  autonomous: boolean;
}

export interface PreflightResult {
  status: "ready" | "changed" | "repair";
  changes: string[];
  total?: number;
}

export interface CommerceCart {
  merchantDomain: string;
  cartId: string;
  checkoutUrl: string;
  total?: number;
  currency?: string;
}

export interface ReceiptResult {
  status: "approved" | "rejected";
  threadId: string;
  total?: number;
  signature?: string;
  rejectedItemId?: string;
}

export interface NotificationDelivery {
  spriteId: string;
  name: string;
  email: string;
  channel: "email";
  status: "sent" | "simulated" | "failed";
  messageId?: string;
  error?: string;
}

export interface MandateEnvelope {
  type: "cart_mandate" | "plan_mandate";
  bundle?: Bundle;
  plan?: Plan;
  requiredGesture: "handshake";
  holdSeconds: number;
  notificationPreview?: Array<{ spriteId: string; name: string; email: string }>;
}

export interface SpriteScore {
  spriteId: string;
  score: number;
  say: string;
  complaint?: string;
}

export interface CartMandate {
  mission: Mission;
  bundle: Bundle;
  approvedAt: string;
  publicKey: JsonWebKey;
  signature: string;
}

export interface PlanMandate {
  mission: Mission;
  plan: Plan;
  approvedAt: string;
  publicKey: JsonWebKey;
  signature: string;
}

export type SignedMandate = CartMandate | PlanMandate;

/** Public graph-state snapshot the backend emits after every stream (see backend/api.py's
 *  _response()). The frontend only reads `threadId` from it today. */
export interface RunState {
  threadId: string;
  status: "interrupted" | "complete";
  interrupts: Array<{ id: string; value: unknown; responseSchema?: unknown }>;
  state: Record<string, unknown>;
}

export type CouncilEvent =
  | { type: "mission"; payload: Mission }
  | { type: "opinion"; payload: SpriteOpinion }
  | { type: "deliberation"; payload: SpriteDeliberation }
  | { type: "constraints"; payload: ConstraintSet }
  | { type: "consensus"; payload: ConstraintSet }
  | { type: "search_plan"; payload: SearchPlan }
  | { type: "bundle"; payload: Bundle }
  | { type: "plan"; payload: Plan }
  | { type: "score"; payload: SpriteScore }
  | { type: "revision"; payload: { spriteId: string; complaint: string } }
  | { type: "scores_complete"; payload: SpriteScore[] }
  | { type: "veto"; payload: ConstraintSet["conflicts"][number] }
  | { type: "awaiting_mandate"; payload: MandateEnvelope | Bundle }
  | { type: "repair_requested"; payload: { action: string; itemId?: string; prompt?: string } }
  | { type: "repair"; payload: ProposalRepair }
  | { type: "preflight"; payload: PreflightResult }
  | { type: "receipt"; payload: ReceiptResult }
  | { type: "carts"; payload: CommerceCart[] }
  | { type: "notifications"; payload: NotificationDelivery[] }
  | { type: "error"; payload: { detail: string; status?: number } }
  | { type: "run_state"; payload: RunState };
