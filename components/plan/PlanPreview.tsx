import type { FamilyProfile, Plan } from "@/types/domain";
import styles from "./PlanPreview.module.css";

export interface PlanPreviewProps {
  plan: Plan;
  family: FamilyProfile[];
  onSwap?: (placeId: string) => void;
  swapping?: string | null;
}

/** A Google Places itinerary. Photos are proxied so the browser never receives the API key. */
export function PlanPreview({ plan, family, onSwap, swapping }: PlanPreviewProps) {
  const servedBy = (placeId: string) =>
    Object.entries(plan.serves)
      .filter(([, places]) => places.includes(placeId))
      .map(([id]) => family.find((member) => member.id === id))
      .filter((member): member is FamilyProfile => Boolean(member));

  return (
    <section className={styles.plan} aria-label="Proposed itinerary">
      <p className={styles.location}>{plan.location}{plan.when ? ` · ${plan.when}` : ""}</p>
      <ol className={styles.stops}>
        {plan.stops.map((stop) => (
          <li key={stop.id} className={styles.stop}>
            {stop.photoName ? (
              <img
                src={`/api/places/photo?name=${encodeURIComponent(stop.photoName)}`}
                alt={stop.name}
                className={styles.photo}
                loading="lazy"
              />
            ) : <span className={styles.placeholder} aria-hidden="true" />}
            <div className={styles.details}>
              <strong>{stop.name}</strong>
              <span>{stop.address}</span>
              <span>
                {stop.rating ? `★ ${stop.rating}` : "Rating unavailable"}
                {stop.reservable ? " · Reservations" : ""}
              </span>
              <span className={styles.people}>
                {servedBy(stop.id).map((member) => (
                  <span key={member.id} className={styles.dot} style={{ background: member.colors[0] }} title={member.name} />
                ))}
              </span>
              <span className={styles.links}>
                {stop.googleMapsUri && <a href={stop.googleMapsUri} target="_blank" rel="noreferrer">Map</a>}
                {stop.websiteUri && <a href={stop.websiteUri} target="_blank" rel="noreferrer">Website</a>}
                {onSwap && (
                  <button type="button" onClick={() => onSwap(stop.id)} disabled={swapping === stop.id}>
                    {swapping === stop.id ? "Asking…" : "Replace"}
                  </button>
                )}
              </span>
              {stop.photoAttributions?.map((credit, index) => (
                <small key={`${stop.id}-credit-${index}`} className={styles.credit}>
                  Photo: {credit.uri ? <a href={credit.uri}>{credit.displayName ?? "Contributor"}</a> : credit.displayName ?? "Contributor"}
                </small>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {plan.warnings?.map((warning) => <p key={warning} className={styles.warning}>{warning}</p>)}
    </section>
  );
}
