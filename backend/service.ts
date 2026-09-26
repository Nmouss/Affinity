import bundlesJson from "@/shared/data/bundles.json";
import demoExpectations from "@/shared/data/demo-expectations.json";
import productsJson from "@/shared/data/products.json";
import shoppersJson from "@/shared/data/shoppers.json";
import {
  bundleSchema,
  comparisonPairSchema,
  leapObservationSchema,
  missionSchema,
  productSchema,
  recommendationSchema,
  shopperProfileSchema,
  substitutionEvaluationRequestSchema,
  substitutionEvaluationSchema,
  useObservationResultSchema,
  voiceIntentSchema,
} from "@/shared/contracts";
import type {
  AddParticipantRequest,
  AddRuleRequest,
  ApplyComparisonRequest,
  ConfirmUseObservationRequest,
  CreateMissionRequest,
  CreateShopperRequest,
  MissionParseRequest,
  RecommendRequest,
  VoiceInterpretRequest,
} from "@/shared/contracts";
import type {
  Bundle,
  Mission,
  Product,
  Recommendation,
  ShopperProfile,
  SubstitutionEvaluation,
  SubstitutionEvaluationRequest,
  UseObservationResult,
  VoiceIntent,
} from "@/shared/types";
import {
  addRule,
  applyComparison,
  confirmUseObservation,
  evaluateSubstitution,
  interpretVoice,
  parseMission,
  recommendBundles,
  recordUseObservation,
  type PendingUseObservation,
  type StructuredMissionExtractor,
  type StructuredVoiceExtractor,
} from "./core";

export interface AffinityCoreServiceOptions {
  missionExtractor?: StructuredMissionExtractor;
  voiceExtractor?: StructuredVoiceExtractor;
  seedDemo?: boolean;
}

export class AffinityCoreService {
  private readonly missions = new Map<string, Mission>();
  private readonly shoppers = new Map<string, ShopperProfile>();
  private readonly pendingObservations = new Map<string, PendingUseObservation>();
  private readonly products: Product[];
  private readonly bundles: Bundle[];
  private readonly missionExtractor?: StructuredMissionExtractor;
  private readonly voiceExtractor?: StructuredVoiceExtractor;

  constructor(options: AffinityCoreServiceOptions = {}) {
    this.missionExtractor = options.missionExtractor;
    this.voiceExtractor = options.voiceExtractor;
    this.products = productSchema.array().parse(productsJson).map((product) => structuredClone(product));
    this.bundles = bundleSchema.array().parse(bundlesJson);

    if (options.seedDemo !== false) {
      const mission = missionSchema.parse(demoExpectations.mission);
      this.missions.set(mission.id, structuredClone(mission));
      for (const shopper of shopperProfileSchema.array().parse(shoppersJson)) {
        this.shoppers.set(shopper.id, structuredClone(shopper));
      }
    }
  }

  async parseMission(request: MissionParseRequest) {
    return parseMission(request.text, this.missionExtractor);
  }

  createMission(request: CreateMissionRequest): Mission {
    const mission = missionSchema.parse(request.mission);
    this.missions.set(mission.id, structuredClone(mission));
    return structuredClone(mission);
  }

  getMission(missionId: string): Mission {
    return structuredClone(this.requireMission(missionId));
  }

  addParticipant(missionId: string, request: AddParticipantRequest): Mission {
    const mission = this.requireMission(missionId);
    this.requireShopper(request.shopperId);
    if (!mission.participantIds.includes(request.shopperId)) mission.participantIds.push(request.shopperId);
    return structuredClone(mission);
  }

  createShopper(request: CreateShopperRequest): ShopperProfile {
    const shopper = shopperProfileSchema.parse(request.shopper);
    this.shoppers.set(shopper.id, structuredClone(shopper));
    return structuredClone(shopper);
  }

  addShopperRule(shopperId: string, request: AddRuleRequest): ShopperProfile {
    const updated = addRule(this.requireShopper(shopperId), request.rule);
    this.shoppers.set(shopperId, updated);
    return structuredClone(updated);
  }

  applyShopperComparison(shopperId: string, request: ApplyComparisonRequest): ShopperProfile {
    const shopper = this.requireShopper(shopperId);
    const pair = comparisonPairSchema.parse(request.pair);
    for (const productId of [pair.leftProductId, pair.rightProductId]) {
      const product = this.requireProduct(productId);
      if (product.category !== shopper.category) {
        throw new Error(`Comparison product ${productId} does not match shopper category ${shopper.category}`);
      }
    }
    const updated = applyComparison(shopper, pair, request.choice);
    this.shoppers.set(shopperId, updated);
    return structuredClone(updated);
  }

  recordShopperUseObservation(
    shopperId: string,
    request: { observation: unknown },
  ): { recorded: true } {
    const shopper = this.requireShopper(shopperId);
    const observation = leapObservationSchema.parse(request.observation);
    const { pending } = recordUseObservation(shopper, observation);
    this.pendingObservations.set(shopperId, pending);
    return { recorded: true };
  }

  confirmShopperUseObservation(shopperId: string, request: ConfirmUseObservationRequest): UseObservationResult {
    const shopper = this.requireShopper(shopperId);
    const observation = leapObservationSchema.parse(request.observation);
    const pending = this.pendingObservations.get(shopperId);
    if (!pending) throw new Error(`No pending use observation for shopper: ${shopperId}`);
    if (JSON.stringify(pending.observation) !== JSON.stringify(observation)) {
      throw new Error("Confirmed observation does not match the pending observation");
    }
    const result = useObservationResultSchema.parse(
      confirmUseObservation(shopper, pending.observation, request.classification),
    );
    this.shoppers.set(shopperId, result.shopper);
    this.pendingObservations.delete(shopperId);
    return structuredClone(result);
  }

  acceptShopperEvent(shopperId: string, _event: { event: string; data: Record<string, unknown> }): { accepted: true } {
    this.requireShopper(shopperId);
    return { accepted: true };
  }

  async interpretVoice(request: VoiceInterpretRequest): Promise<VoiceIntent> {
    return voiceIntentSchema.parse(await interpretVoice(request.transcript, this.voiceExtractor));
  }

  recommend(missionId: string, request: RecommendRequest = {}): Recommendation {
    const mission = this.requireMission(missionId);
    const shopperIds = [...new Set([...mission.participantIds, ...(request.shopperIds ?? [])])];
    const shoppers = shopperIds.map((id) => this.requireShopper(id));
    const withinBudget = this.bundles.filter((bundle) => bundle.totalPrice <= mission.sharedBudget);
    return recommendationSchema.parse(recommendBundles(withinBudget, shoppers));
  }

  evaluateSubstitution(
    missionId: string,
    requestInput: SubstitutionEvaluationRequest,
  ): SubstitutionEvaluation {
    const mission = this.requireMission(missionId);
    const request = substitutionEvaluationRequestSchema.parse(requestInput);
    if (request.missionId !== missionId) throw new Error("Mission path and request missionId do not match");
    const shoppers = mission.participantIds.map((id) => this.requireShopper(id));
    const result = evaluateSubstitution(
      request,
      this.requireProduct(request.currentProductId),
      this.requireProduct(request.replacementProductId),
      shoppers,
    );
    return substitutionEvaluationSchema.parse(result);
  }

  private requireMission(id: string): Mission {
    const mission = this.missions.get(id);
    if (!mission) throw new Error(`Unknown mission: ${id}`);
    return mission;
  }

  private requireShopper(id: string): ShopperProfile {
    const shopper = this.shoppers.get(id);
    if (!shopper) throw new Error(`Unknown shopper: ${id}`);
    return shopper;
  }

  private requireProduct(id: string): Product {
    const product = this.products.find((candidate) => candidate.id === id);
    if (!product) throw new Error(`Unknown product: ${id}`);
    return product;
  }
}
