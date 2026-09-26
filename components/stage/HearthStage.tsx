import { MissionForm } from "@/components/council/MissionForm";

export function HearthStage() {
  return (
    <section className="stage-shell" aria-label="Hearth family council stage">
      <div className="stage-copy">
        <p>Family shopping, decided together</p>
        <h1>Hearth</h1>
        <MissionForm />
      </div>
    </section>
  );
}
