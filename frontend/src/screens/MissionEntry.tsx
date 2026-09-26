import { useState } from "react";
import { Avatar, AVATAR_IDS, ScreenHeading } from "../components/common";
import { CABIN_TRANSCRIPT, MISSION_EXAMPLES } from "../mocks/mission";
import type { MissionDraft } from "../services/contracts";
import type { Controller } from "../state/controller";
import { categoryLabel, money, RULE_OPTIONS } from "../state/labels";
import type { AppState } from "../state/machine";
import { PushToTalk } from "../voice/PushToTalk";

interface ScreenProps {
  state: AppState;
  actions: Controller;
}

export function HomeScreen({ state, actions }: ScreenProps) {
  const [text, setText] = useState("");
  const busy = Boolean(state.busy);
  return (
    <section className="screen screen--home" aria-labelledby="home-title">
      <nav className="home-nav" aria-label="Affinity sections">
        <button type="button" className="tab is-active" aria-current="page">New Mission</button>
        <button type="button" className="tab" disabled title="Not part of this demo">Missions</button>
        <button type="button" className="tab" disabled title="Not part of this demo">My Shopper</button>
      </nav>
      <ScreenHeading>What are you planning together?</ScreenHeading>
      <form
        className="mission-form"
        onSubmit={(e) => {
          e.preventDefault();
          actions.submitText(text);
        }}
      >
        <label htmlFor="mission-text" className="sr-only">Describe your group mission</label>
        <textarea
          id="mission-text"
          className="mission-input"
          rows={3}
          placeholder="Plan a cabin weekend with my friends…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) actions.submitText(text);
          }}
        />
        <div className="row">
          <PushToTalk demoTranscript={CABIN_TRANSCRIPT} onTranscript={(t, source) => actions.voiceCaptured(t, source)} />
          <button type="submit" className="btn btn--primary btn--large" disabled={busy || !text.trim()}>
            Create mission
          </button>
        </div>
      </form>
      <div className="examples">
        <h2 className="eyebrow">Try an example</h2>
        <ul>
          {MISSION_EXAMPLES.map((example) => (
            <li key={example}>
              <button type="button" className="link" onClick={() => setText(example)}>
                {example}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="presenter-hint">
        Presenter: if the mic fails, use{" "}
        <button type="button" className="link" onClick={() => actions.voiceCaptured(CABIN_TRANSCRIPT, "demo")}>
          the preloaded cabin transcript
        </button>
        .
      </p>
    </section>
  );
}

export function TranscriptScreen({ state, actions }: ScreenProps) {
  const [editing, setEditing] = useState(false);
  return (
    <section className="screen screen--narrow">
      <ScreenHeading>I heard:</ScreenHeading>
      {state.transcriptSource === "demo" && (
        <p className="tag tag--info">Preloaded demo transcript — not live speech</p>
      )}
      {editing ? (
        <>
          <label htmlFor="transcript-edit" className="label">Edit transcript</label>
          <textarea
            id="transcript-edit"
            className="mission-input"
            rows={4}
            autoFocus
            value={state.transcript}
            onChange={(e) => actions.editTranscript(e.target.value)}
          />
        </>
      ) : (
        <blockquote className="transcript" aria-label="Transcript">“{state.transcript}”</blockquote>
      )}
      <div className="row">
        <button type="button" className="btn btn--primary btn--large" disabled={!state.transcript.trim() || Boolean(state.busy)} onClick={actions.confirmTranscript}>
          Use this
        </button>
        <button type="button" className="btn" onClick={actions.retryVoice}>Try again</button>
        <button type="button" className="btn" aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
          {editing ? "Done editing" : "Edit transcript"}
        </button>
      </div>
    </section>
  );
}

export function MissionBriefScreen({ state, actions }: ScreenProps) {
  const draft = state.draft;
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState("");
  if (!draft) return null;
  const update = (patch: Partial<MissionDraft>) => actions.updateDraft({ ...draft, ...patch });

  return (
    <section className="screen screen--narrow brief">
      <p className="eyebrow">Mission Brief</p>
      <ScreenHeading>{draft.title}</ScreenHeading>
      <p className="brief__meta" data-testid="brief-meta">
        {draft.durationDays ? `${draft.durationDays} days · ` : ""}
        {draft.participantNames.length} people · {money(draft.sharedBudget)} shared-shopping budget
      </p>
      {draft.clarificationQuestion && <p className="banner banner--info">{draft.clarificationQuestion}</p>}

      {editing ? (
        <fieldset className="brief__edit">
          <legend>Edit the brief</legend>
          <label className="label" htmlFor="brief-title">Title</label>
          <input id="brief-title" className="input" value={draft.title} onChange={(e) => update({ title: e.target.value })} />
          <label className="label" htmlFor="brief-budget">Shared budget ($)</label>
          <input
            id="brief-budget"
            className="input"
            type="number"
            min={0}
            step={10}
            value={draft.sharedBudget}
            onChange={(e) => update({ sharedBudget: Math.max(0, Number(e.target.value) || 0) })}
          />
          <label className="label" htmlFor="brief-days">Days</label>
          <input
            id="brief-days"
            className="input"
            type="number"
            min={1}
            value={draft.durationDays ?? ""}
            onChange={(e) => update({ durationDays: Number(e.target.value) || undefined })}
          />
          <p className="label" id="people-label">People</p>
          <ul className="chips" aria-labelledby="people-label">
            {draft.participantNames.map((name) => (
              <li key={name} className="chip">
                {name}
                <button
                  type="button"
                  className="chip__remove"
                  aria-label={`Remove ${name}`}
                  onClick={() => update({ participantNames: draft.participantNames.filter((n) => n !== name) })}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newName.trim();
              if (name && !draft.participantNames.includes(name)) update({ participantNames: [...draft.participantNames, name] });
              setNewName("");
            }}
          >
            <label htmlFor="brief-add" className="sr-only">Add a person</label>
            <input id="brief-add" className="input" placeholder="Add a person" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button type="submit" className="btn">Add</button>
          </form>
        </fieldset>
      ) : (
        <>
          <h2 className="subhead">Affinity will build:</h2>
          <ul className="bullets">
            {draft.categories.map((c) => (
              <li key={c}>{briefCategory(c)}</li>
            ))}
          </ul>
          <h2 className="subhead">People:</h2>
          <p data-testid="brief-people">{draft.participantNames.join(" · ")}</p>
        </>
      )}

      <p className="supporting">
        Affinity uses the trip context to understand what the group needs to buy. It is building the shared cart, not booking the trip.
      </p>
      <div className="row">
        <button type="button" className="btn btn--primary btn--large" disabled={Boolean(state.busy) || draft.participantNames.length === 0} onClick={actions.confirmBrief}>
          Looks right
        </button>
        <button type="button" className="btn" aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
          {editing ? "Done editing" : "Edit"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => actions.back("HOME")}>Start over</button>
      </div>
    </section>
  );
}

const BRIEF_CATEGORY: Record<string, string> = {
  cooking: "Cooking supplies",
  safety: "Trail and safety supplies",
  comfort: "Comfort items",
  entertainment: "Shared entertainment",
};
const briefCategory = (c: string) => BRIEF_CATEGORY[c] ?? categoryLabel(c);

export function ParticipantScreen({ state, actions }: ScreenProps) {
  const missing = state.participants.filter((p) => p.status === "missing");
  const firstMissing = missing[0];
  return (
    <section className="screen screen--narrow">
      <ScreenHeading>Who is joining?</ScreenHeading>
      <ul className="participants" aria-label="Participants">
        {state.participants.map((p) => {
          const profile = state.shoppers.find((s) => s.id === p.shopperId);
          return (
            <li key={p.name} className={`participant participant--${p.status}`}>
              <Avatar avatarId={profile?.avatarId} name={p.name} />
              <span className="participant__name">{p.name}</span>
              <span className={`status status--${p.status === "ready" ? "ok" : "warn"}`}>
                <span aria-hidden="true">{p.status === "ready" ? "✓ " : "○ "}</span>
                {p.status === "ready" ? "Shopper ready" : "No shopper yet"}
              </span>
            </li>
          );
        })}
      </ul>
      {firstMissing ? (
        <>
          <p className="supporting">
            {firstMissing.name} doesn’t have a shopper yet. Their taste and rules won’t count until they create one.
          </p>
          <div className="row">
            <button type="button" className="btn" onClick={() => actions.invite(firstMissing.name)}>
              Invite {firstMissing.name}
            </button>
            <button type="button" className="btn btn--primary btn--large" onClick={actions.startShopperCreation}>
              Create shopper here
            </button>
            <button type="button" className="btn btn--ghost" onClick={actions.continueWithoutProfile}>
              Continue without profile
            </button>
          </div>
          {state.inviteSentTo && (
            <p className="tag tag--info" role="status">
              Invite link for {state.inviteSentTo} ready (mock — nothing was sent).
            </p>
          )}
        </>
      ) : (
        <div className="row">
          <button type="button" className="btn btn--primary btn--large" onClick={actions.continueWithoutProfile}>
            Open the mission
          </button>
        </div>
      )}
      <button type="button" className="btn btn--ghost" onClick={() => actions.back("MISSION_BRIEF")}>Back to brief</button>
    </section>
  );
}

export function ShopperCreationScreen({ state, actions }: ScreenProps) {
  const existing = state.shopper;
  const guest = state.participants.find((p) => p.status === "missing")?.name ?? "Guest";
  const [name, setName] = useState(existing?.name ?? (guest === "Guest" ? "" : guest));
  const [avatarId, setAvatarId] = useState(existing?.avatarId ?? "avatar_03");
  const [rule, setRule] = useState<string | null>(existing?.rules[0] ?? "no_fragile_glass");

  return (
    <section className="screen screen--narrow">
      <ScreenHeading>Create your shopper</ScreenHeading>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          actions.createShopper(name.trim() || "Guest", avatarId, rule);
        }}
      >
        <label className="label" htmlFor="shopper-name">Name</label>
        <input
          id="shopper-name"
          className="input"
          placeholder="Guest"
          value={name}
          disabled={Boolean(existing)}
          onChange={(e) => setName(e.target.value)}
        />
        <fieldset className="avatars">
          <legend className="label">Avatar</legend>
          {AVATAR_IDS.map((id, i) => (
            <label key={id} className={`avatar-choice${avatarId === id ? " is-selected" : ""}`}>
              <input type="radio" name="avatar" value={id} checked={avatarId === id} disabled={Boolean(existing)} onChange={() => setAvatarId(id)} className="sr-only" />
              <Avatar avatarId={id} name={name || "Guest"} size={48} />
              <span className="sr-only">Avatar {i + 1}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="rules">
          <legend className="label">Choose one rule this group must respect for you:</legend>
          {RULE_OPTIONS.map((option) => (
            <label key={option.label} className={`rule-choice${rule === option.id ? " is-selected" : ""}`}>
              <input type="radio" name="rule" checked={rule === option.id} onChange={() => setRule(option.id)} />
              {option.label}
            </label>
          ))}
        </fieldset>
        <p className="supporting">Your shopper learns taste from choices. Rules only change when you edit them.</p>
        <div className="row">
          <button type="submit" className="btn btn--primary btn--large" disabled={Boolean(state.busy)}>
            Learn my cabin taste
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => actions.back("PARTICIPANT_RESOLUTION")} disabled={Boolean(existing)}>
            Back
          </button>
        </div>
      </form>
    </section>
  );
}
