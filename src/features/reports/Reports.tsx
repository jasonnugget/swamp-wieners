import { useEffect, useState } from "react";
import { Camera, Check, MapPin, Plus, Send, X } from "lucide-react";
import type {
  Category,
  HazardReport,
  Site,
  Snapshot,
  Task,
} from "../../../shared/types";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  TASKS,
  TASK_LABELS,
} from "../../../shared/policy";
import { request } from "../../lib/api";
import SiteMap from "../../components/SiteMap";

export function ReportForm({
  site,
  snapshot,
  onClose,
  onSaved,
}: {
  site: Site;
  snapshot: Snapshot;
  onClose: () => void;
  onSaved: () => void;
}) {
  const draftKey = `planit-draft-${site.id}`;
  const [description, setDescription] = useState(
      () => localStorage.getItem(draftKey) ?? "",
    ),
    [category, setCategory] = useState<Category>("soil"),
    [tasks, setTasks] = useState<Task[]>(["mobilization"]),
    [author, setAuthor] = useState("Field crew"),
    [photo, setPhoto] = useState<string>(),
    [pin, setPin] = useState({
      latitude: site.latitude,
      longitude: site.longitude,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    localStorage.setItem(draftKey, description);
  }, [description, draftKey]);
  async function upload(file?: File) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 4 * 1024 * 1024
    ) {
      setError("Choose a JPEG, PNG, or WebP image under 4 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPhoto(String(reader.result));
      setError("");
    };
    reader.readAsDataURL(file);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/reports", {
        siteId: site.id,
        description,
        category,
        tasks,
        author,
        ...pin,
        photo,
      });
      localStorage.removeItem(draftKey);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
      >
        <div className="panel-heading">
          <div>
            <span className="eyebrow">SHARE WHAT YOU SEE</span>
            <h2 id="report-title">Report a site hazard</h2>
            <p className="muted">
              {site.name} · your report carries into the next shift.
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="Close report"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              Hazard type
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Your name
              <input
                required
                maxLength={80}
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </label>
          </div>
          <label>
            What happened?
            <textarea
              required
              minLength={5}
              maxLength={2000}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Standing water has blocked the equipment access road…"
            />
          </label>
          <fieldset>
            <legend>Tasks to hold until reviewed</legend>
            {TASKS.map((t) => (
              <label className="checkbox-label" key={t}>
                <input
                  type="checkbox"
                  checked={tasks.includes(t)}
                  onChange={(e) =>
                    setTasks((v) =>
                      e.target.checked ? [...v, t] : v.filter((x) => x !== t),
                    )
                  }
                />
                {TASK_LABELS[t]}
              </label>
            ))}
          </fieldset>
          <label className="photo-picker">
            <Camera size={22} />
            <span>
              {photo
                ? "Photo attached. Choose a different image."
                : "Take a photo or attach evidence"}
              <small>JPEG, PNG, WebP · up to 4 MB</small>
            </span>
            <input
              aria-label="Attach photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </label>
          {photo && (
            <img
              className="photo-preview"
              src={photo}
              alt="Hazard report attachment"
            />
          )}
          <div className="pin-heading">
            <MapPin size={15} />
            <strong>Pin the hazard</strong>
            <span>Tap the map to move the pin</span>
          </div>
          <div className="pin-map">
            <SiteMap
              sites={[site]}
              decisions={snapshot.decisions}
              selected={site.id}
              onSelect={() => {}}
              onPin={(latitude, longitude) => setPin({ latitude, longitude })}
              pin={pin}
            />
          </div>
          <p className="coordinates">
            {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}
          </p>
          {error && (
            <p className="error" role="alert">
              {error} Your description is saved on this device.
            </p>
          )}
          <div className="modal-footer">
            <p>
              Selected task holds apply immediately. Jev may suggest a
              classification for review.
            </p>
            <button className="primary" disabled={busy || !tasks.length}>
              <Send size={15} />
              {busy ? "Sharing…" : "Share report"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function Reports({
  site,
  snapshot,
  onReport,
  onChange,
}: {
  site: Site;
  snapshot: Snapshot;
  onReport: () => void;
  onChange: () => void;
}) {
  const reports = snapshot.reports.filter((r) => r.siteId === site.id),
    [filter, setFilter] = useState<"open" | "all">("open"),
    [resolving, setResolving] = useState<string>(),
    [resolution, setResolution] = useState(""),
    [name, setName] = useState("Supervisor"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function resolve(report: HazardReport) {
    setBusy(true);
    setError("");
    try {
      await request(`/reports/${report.id}/resolve`, {
        author: name,
        resolution,
      });
      setResolving(undefined);
      setResolution("");
      onChange();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function confirm(report: HazardReport) {
    setBusy(true);
    try {
      await request(`/reports/${report.id}/confirm-triage`, {});
      onChange();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-title">
        <div>
          <span className="eyebrow">SITE MEMORY</span>
          <h2>What the next crew should know</h2>
          <p className="muted">
            Reports stay with the location. Resolutions preserve who checked the
            hazard and why.
          </p>
        </div>
        <button className="primary" onClick={onReport}>
          <Plus size={16} />
          Report hazard
        </button>
      </div>
      <div className="filter-tabs">
        <button
          className={filter === "open" ? "active" : ""}
          onClick={() => setFilter("open")}
        >
          Unresolved{" "}
          <span>{reports.filter((r) => r.status === "open").length}</span>
        </button>
        <button
          className={filter === "all" ? "active" : ""}
          onClick={() => setFilter("all")}
        >
          All history <span>{reports.length}</span>
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="reports-list">
        {reports
          .filter((r) => filter === "all" || r.status === "open")
          .reverse()
          .map((report) => (
            <article className="panel report-card" key={report.id}>
              <div className="report-card-top">
                <span
                  className={`pill ${report.status === "open" ? "danger" : "safe"}`}
                >
                  {report.status === "open" ? "UNRESOLVED" : "RESOLVED"}
                </span>
                <span className="muted">
                  {CATEGORY_LABELS[report.category]} · {report.author}
                </span>
                <time>{new Date(report.createdAt).toLocaleString()}</time>
              </div>
              <h3>{report.description}</h3>
              <div className="report-tasks">
                {report.tasks.map((t) => (
                  <span key={t}>{TASK_LABELS[t]}</span>
                ))}
              </div>
              {report.photoUrl && (
                <img
                  className="report-image"
                  src={report.photoUrl}
                  alt="Crew hazard evidence"
                />
              )}
              <div className="report-evidence">
                <MapPin size={13} />
                {report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}
                <span>Evidence ID {report.id.slice(0, 8)}</span>
              </div>
              {report.triage?.mode === "live" ? (
                <div className="jev-suggestion">
                  <span className="eyebrow">
                    JEV SUGGESTION · {report.triage.model}
                  </span>
                  <pre>{JSON.stringify(report.triage.answers, null, 2)}</pre>
                  {report.status === "open" && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => confirm(report)}
                    >
                      Confirm classification; preserve existing holds
                    </button>
                  )}
                </div>
              ) : (
                <p className="note">
                  {report.triage?.error ??
                    "Jev triage pending. Crew selection applies now."}
                </p>
              )}
              {report.status === "resolved" ? (
                <div className="resolution">
                  <Check size={16} />
                  <div>
                    <strong>Cleared by {report.resolvedBy}</strong>
                    <p>{report.resolution}</p>
                    <small>
                      {report.resolvedAt &&
                        new Date(report.resolvedAt).toLocaleString()}
                    </small>
                  </div>
                </div>
              ) : resolving === report.id ? (
                <div className="resolve-form">
                  <label>
                    Reviewer
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    What did you verify?
                    <textarea
                      minLength={5}
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                    />
                  </label>
                  <button
                    className="primary"
                    disabled={
                      busy || resolution.trim().length < 5 || !name.trim()
                    }
                    onClick={() => resolve(report)}
                  >
                    Record resolution
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setResolving(undefined)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="secondary"
                  onClick={() => setResolving(report.id)}
                >
                  Review and resolve
                  <Arrow />
                </button>
              )}
            </article>
          ))}
        {!reports.filter((r) => filter === "all" || r.status === "open")
          .length && (
          <section className="panel empty-state">
            <MapPin size={32} />
            <h3>
              No {filter === "open" ? "unresolved " : ""}reports at this site
            </h3>
            <p>A photo and a pin can change the next crew’s plan.</p>
            <button className="secondary" onClick={onReport}>
              Add the first report
              <Plus size={15} />
            </button>
          </section>
        )}
      </div>
    </>
  );
}
function Arrow() {
  return <span aria-hidden="true">↗</span>;
}
