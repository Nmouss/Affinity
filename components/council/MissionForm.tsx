export function MissionForm() {
  return (
    <form>
      <label htmlFor="mission">What should the council find?</label>
      <input id="mission" name="mission" defaultValue="Family Christmas tree, under $200" />
      <button type="submit">Gather the council</button>
    </form>
  );
}
