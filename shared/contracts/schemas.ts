import { z } from "zod";
import type {
  Bundle,
  ComparisonPair,
  LeapObservation,
  Mission,
  ParsedMission,
  Product,
  Recommendation,
  ShopperProfile,
  SubstitutionEvaluation,
  SubstitutionAction,
  SubstitutionEvaluationRequest,
  UseObservationResult,
  VoiceIntent,
} from "@/shared/types";

const numericRecordSchema = z.record(z.string(), z.number());
const booleanRecordSchema = z.record(z.string(), z.boolean());
const factRecordSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

export const missionSchema: z.ZodType<Mission> = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  missionType: z.enum(["group_trip_supplies", "holiday_hosting", "shared_home"]),
  sharedBudget: z.number().nonnegative(),
  durationDays: z.number().int().positive().optional(),
  destination: z.string().min(1).optional(),
  participantIds: z.array(z.string().min(1)),
  categories: z.array(z.string().min(1)),
  status: z.enum(["draft", "confirmed", "shopping", "approval"]),
});

export const parsedMissionSchema: z.ZodType<ParsedMission> = z.strictObject({
  missionType: z.enum(["group_trip_supplies", "holiday_hosting", "shared_home"]).optional(),
  title: z.string().min(1),
  destination: z.string().min(1).optional(),
  durationDays: z.number().int().positive().optional(),
  participantNames: z.array(z.string().min(1)),
  sharedBudget: z.number().nonnegative().optional(),
  categories: z.array(z.string().min(1)),
  needsConfirmation: z.boolean(),
  clarificationQuestion: z.string().min(1).optional(),
});

export const shopperProfileSchema: z.ZodType<ShopperProfile> = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  avatarId: z.string().min(1),
  category: z.string().min(1),
  preferences: numericRecordSchema,
  evidenceCounts: numericRecordSchema,
  rules: z.array(z.string().min(1)),
  preferredUseTraits: z.array(z.string().min(1)),
  confirmedUseRequirements: z.array(z.string().min(1)),
});

export const comparisonPairSchema: z.ZodType<ComparisonPair> = z.strictObject({
  pairId: z.string().min(1),
  axis: z.enum(["durability", "compactness", "simpleControls", "expressiveStyle"]),
  leftProductId: z.string().min(1),
  rightProductId: z.string().min(1),
  leftValue: z.number().min(-1).max(1),
  rightValue: z.number().min(-1).max(1),
});

export const productSchema: z.ZodType<Product> = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  price: z.number().nonnegative(),
  modelUrl: z.string().min(1).optional(),
  imageUrl: z.string().min(1),
  attributes: numericRecordSchema,
  facts: factRecordSchema,
  satisfies: booleanRecordSchema,
});

export const bundleSchema: z.ZodType<Bundle> = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  productIds: z.array(z.string().min(1)),
  totalPrice: z.number().nonnegative(),
  attributes: numericRecordSchema,
  satisfies: booleanRecordSchema,
  valueScore: z.number().min(0).max(1),
});

const individualScoreSchema = z.strictObject({
  shopperId: z.string().min(1),
  bundleId: z.string().min(1),
  score: z.number().min(0).max(1),
  reasons: z.array(z.string()),
});

export const recommendationSchema: z.ZodType<Recommendation> = z.strictObject({
  selectedBundleId: z.string().min(1),
  eligibleBundleIds: z.array(z.string().min(1)),
  rejectedBundles: z.array(
    z.strictObject({
      bundleId: z.string().min(1),
      shopperId: z.string().min(1),
      violatedRequirement: z.string().min(1),
    }),
  ),
  individualScores: z.array(individualScoreSchema),
  groupScores: numericRecordSchema,
  reasons: z.array(z.string()),
});

const voiceEntitySchema = z.union([z.string(), z.number(), z.array(z.string())]);
export const voiceIntentSchema: z.ZodType<VoiceIntent> = z.strictObject({
  transcript: z.string().min(1),
  intent: z.enum([
    "create_mission",
    "navigate_category",
    "compare_products",
    "filter_products",
    "modify_cart",
    "explain_decision",
    "approve_action",
  ]),
  entities: z.record(z.string(), voiceEntitySchema),
  requiresConfirmation: z.boolean(),
});

export const leapObservationSchema: z.ZodType<LeapObservation> = z.strictObject({
  handsUsed: z.number().int().min(0).max(2),
  activeHand: z.enum(["left", "right", "both", "unknown"]),
  approachSide: z.enum(["front", "left", "right", "top", "unknown"]),
  spanBand: z.enum(["small", "medium", "large", "unknown"]),
  regraspObserved: z.boolean(),
  trackingLossCount: z.number().int().nonnegative(),
});

export const useObservationResultSchema: z.ZodType<UseObservationResult> = z.strictObject({
  shopper: shopperProfileSchema,
  appliedRequirement: z.string().min(1).optional(),
  appliedPreference: z.string().min(1).optional(),
  discarded: z.boolean(),
});

export const substitutionEvaluationRequestSchema: z.ZodType<SubstitutionEvaluationRequest> = z.strictObject({
  missionId: z.string().min(1),
  currentProductId: z.string().min(1),
  replacementProductId: z.string().min(1),
  savings: z.number().nonnegative(),
  overrideApproved: z.boolean().optional(),
});

const askShopperActionSchema = z.custom<`ask_${string}`>(
  (value) => typeof value === "string" && /^ask_[a-z0-9_-]+$/.test(value),
);

export const substitutionEvaluationSchema: z.ZodType<SubstitutionEvaluation> = z.strictObject({
  decision: z.enum(["allow", "pause"]),
  affectedShopperId: z.string().min(1).optional(),
  violatedRequirement: z.string().min(1).optional(),
  message: z.string().min(1),
  actions: z.array(
    z.union([
      z.enum(["choose_alternative", "override_with_approval"]),
      askShopperActionSchema,
    ]),
  ) as z.ZodType<SubstitutionAction[]>,
});
