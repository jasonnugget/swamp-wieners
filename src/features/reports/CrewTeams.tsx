import { useState } from "react";
import type { CrewTeam, Snapshot } from "../../../shared/types";
import { request } from "../../lib/api";
import "./crew-teams.css";

export default function CrewTeams({ snapshot, onChange }: {
  snapshot: Snapshot;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<string>(),
    [name, setName] = useState(""),
    [members, setMembers] = useState(""),
    [siteIds, setSiteIds] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState("");
  function edit(team?: CrewTeam) {
    setEditing(team?.id);
    setName(team?.name ?? "");
    setMembers(team?.members.join("\n") ?? "");
    setSiteIds(team?.siteIds ?? []);
    setSearch("");
    setError("");
    setSaved("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const team = await request<CrewTeam>("/teams", {
        id: editing, name,
        members: members.split("\n").map((m) => m.trim()).filter(Boolean),
        siteIds,
      });
      setEditing(team.id);
      setSaved(`${team.name} assignments saved.`);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="panel crew-teams">
      <summary>Manage teams and plant assignments <span className="muted">({snapshot.teams?.length ?? 0} teams)</span></summary>
      <p className="muted">Add crew members and assign their plants here. Choose your team and name when reporting; this device remembers them.</p>
      <div className="crew-team-list">
        {(snapshot.teams ?? []).map((team) => (
          <div key={team.id}>
            <strong>{team.name}</strong>
            <span>{team.members.join(", ")}</span>
            <small>{team.siteIds.map((id) => snapshot.sites.find((s) => s.id === id)?.name ?? id).join(" · ")}</small>
            <button type="button" className="secondary" onClick={() => edit(team)}>Edit {team.name}</button>
          </div>
        ))}
      </div>
      <form onSubmit={save}>
        <div className="panel-heading">
          <h3>{editing ? "Edit team" : "Create a team"}</h3>
          {editing && <button type="button" className="text-button" onClick={() => edit()}>Create another team</button>}
        </div>
        <div className="form-grid">
          <label>Team name<input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Crew members (one name per line)<textarea required rows={3} value={members} onChange={(e) => setMembers(e.target.value)} placeholder={"Alex Rivera\nSam Chen"} /></label>
        </div>
        <fieldset>
          <legend>Assigned plants · {siteIds.length} selected</legend>
          <label>Find a plant<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          <div className="crew-plant-options">
            {snapshot.sites.filter((s) => `${s.name} ${s.state} ${s.id}`.toLowerCase().includes(search.toLowerCase())).map((s) => (
              <label key={s.id} className="checkbox-label">
                <input type="checkbox" checked={siteIds.includes(s.id)} onChange={(e) => setSiteIds((ids) => e.target.checked ? [...ids, s.id] : ids.filter((id) => id !== s.id))} />
                {s.name} · {s.state}
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        {saved && <p role="status">{saved}</p>}
        <button className="primary" disabled={busy || !siteIds.length}>{busy ? "Saving…" : "Save team assignments"}</button>
      </form>
    </details>
  );
}
