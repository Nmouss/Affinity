import type { FamilyProfile, Plan } from "@/types/domain";
import { handItem } from "@/components/hands/makerHitTest";
import { LinkIcon, MapPinIcon, RefreshIcon, StarIcon } from "@/components/hud/icons";
import { RoundAction } from "@/components/hud/RoundAction";
import { ImageWithFallback } from "@/components/media/ImageWithFallback";
import styles from "./PlanPreview.module.css";

export interface PlanPreviewProps {
  plan: Plan;
  family: FamilyProfile[];
  onSwap?: (placeId: string) => void;
  swapping?: string | null;
  plaza?: boolean;
  /** Side-panel size while the council is still talking. */
  compact?: boolean;
}

const SLOT_LABEL: Record<string, string> = { dinner: "Dinner", activity: "Activity", dessert: "Dessert" };

/** A Google Places itinerary. Photos are proxied so the browser never receives the API key. */
export function PlanPreview({ plan, onSwap, swapping, plaza = false, compact = false }: PlanPreviewProps) {
  return (
    <section
      className={[styles.plan, plaza ? styles.plaza : "", compact ? styles.compact : "", !compact && plan.stops.length > 1 ? styles.twoUp : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label="Proposed itinerary"
    >
      <p className={styles.location}>
        {plan.location}
        {plan.when ? ` · ${plan.when}` : ""}
      </p>
      <ol className={styles.stops}>
        {plan.stops.map((stop) => (
          <li key={stop.id} className={styles.stop} {...handItem(stop.id)}>
            <div className={styles.photoWrap}>
              {stop.photoName ? (
                <ImageWithFallback
                  src={`/api/places/photo?name=${encodeURIComponent(stop.photoName)}`}
                  alt={stop.name}
                  className={styles.photo}
                  loading="lazy"
                  fallback={<span className={styles.placeholder} role="img" aria-label={`${stop.name} photo unavailable`}>{stop.name.slice(0, 1)}</span>}
                />
              ) : (
                <span className={styles.placeholder} role="img" aria-label={`${stop.name} photo unavailable`}>{stop.name.slice(0, 1)}</span>
              )}
              <span className={styles.slot}>{SLOT_LABEL[stop.slot] ?? stop.slot}</span>
            </div>
            <div className={styles.details}>
              <strong>{stop.name}</strong>
              <span className={styles.rating}>
                {stop.rating ? (
                  <>
                    <StarIcon size={12} /> {stop.rating}
                  </>
                ) : (
                  "Rating unavailable"
                )}
                {stop.reservable ? " · Takes reservations" : ""}
              </span>
              <span>{stop.address}</span>
              {stop.photoAttributions?.map((credit, index) => (
                <small key={`${stop.id}-credit-${index}`} className={styles.credit}>
                  Photo: {credit.uri ? <a href={credit.uri}>{credit.displayName ?? "Contributor"}</a> : credit.displayName ?? "Contributor"}
                </small>
              ))}
            </div>
            <div className={styles.actions}>
              {stop.googleMapsUri && (
                <RoundAction plaza={plaza} size="sm" href={stop.googleMapsUri} icon={<MapPinIcon size={20} />} label="Map" target={`plan-map:${stop.id}`} />
              )}
              {stop.websiteUri && (
                <RoundAction plaza={plaza} size="sm" href={stop.websiteUri} icon={<LinkIcon size={20} />} label="Website" target={`plan-site:${stop.id}`} />
              )}
              {onSwap && (
                <RoundAction
                  plaza={plaza}
                  size="sm"
                  tone="swap"
                  icon={<RefreshIcon size={20} />}
                  label={swapping === stop.id ? "Asking…" : "Replace"}
                  target={`plan-swap:${stop.id}`}
                  disabled={swapping === stop.id}
                  onClick={() => onSwap(stop.id)}
                />
              )}
            </div>
          </li>
        ))}
      </ol>
      {plan.warnings?.map((warning) => (
        <p key={warning} className={styles.warning}>
          {warning}
        </p>
      ))}
    </section>
  );
}
