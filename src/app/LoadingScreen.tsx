import { ArrowUpRight, MapPinSimple as Zap } from "@phosphor-icons/react";
import FieldSculpture from "../components/FieldSculpture";

export default function LoadingScreen({ snapshotReady, modelReady, error, onEnter }: {
  snapshotReady: boolean;
  modelReady: boolean;
  error: string;
  onEnter?: () => void;
}) {
  return (
    <div className="boot-screen" aria-busy={!error && !(snapshotReady && modelReady)}>
      <div className="boot-top"><span className="boot-wordmark"><Zap aria-hidden="true" size={20} /> Threshold<span>↗</span></span><span>Good eyes. Good crew.</span></div>
      <div className="boot-illustration"><FieldSculpture paused/></div>
      <div className="boot-copy">
        <span className="eyebrow">A better heads-up starts here.</span>
        <h1>GET YOUR<br /><span>BEARINGS.</span><ArrowUpRight aria-hidden="true" /></h1>
        <div className="boot-status" role="status">
          {error ? "Connection needs attention" : "Preparing your view…"}
          <span className="boot-pulse" aria-hidden="true">•••</span>
        </div>
        <div className="boot-stages"><span data-ready={snapshotReady}>{snapshotReady ? "✓" : "○"} Site evidence</span><span data-ready={modelReady}>{modelReady ? "✓" : "○"} Model weights</span></div>
        {onEnter && !error && <button className="boot-enter text-button" onClick={onEnter}>Enter workspace <ArrowUpRight aria-hidden="true" size={15} /></button>}
        {error && <div className="boot-error"><p role="alert">{error}</p><button className="primary" onClick={() => location.reload()}>Retry connection <ArrowUpRight aria-hidden="true" size={16} /></button></div>}
      </div>
      <div className="boot-bottom"><span>GEOGRAPHY. EVIDENCE. PERSPECTIVE.</span><span>THRESHOLD CONTROL <span className="boot-pulse">↗</span></span></div>
    </div>
  );
}
