import { useEffect, useMemo, useState } from "react";
import { buildScenarioFrame, DEFAULT_SCENARIO_CONFIG, type ScenarioConfig } from "../../../shared/simulation";
import type { Site } from "../../../shared/types";

export type SimulationLayer = "wind" | "rain" | "runoff";

export function useSimulation(sites: Site[], reducedMotion: boolean) {
  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState<ScenarioConfig>({ ...DEFAULT_SCENARIO_CONFIG });
  const [hour, setHour] = useState(24);
  const [playing, setPlaying] = useState(false);
  const [layer, setLayer] = useState<SimulationLayer>("wind");
  const frame = useMemo(() => enabled ? buildScenarioFrame(config, hour, sites) : undefined, [enabled, config, hour, sites]);

  useEffect(() => {
    if (!enabled || reducedMotion) setPlaying(false);
  }, [enabled, reducedMotion]);
  useEffect(() => {
    if (!enabled || !playing || reducedMotion) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setHour(value => Math.min(72, value + 0.5));
    }, 350);
    const pause = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener("visibilitychange", pause);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", pause); };
  }, [enabled, playing, reducedMotion]);
  useEffect(() => { if (hour >= 72) setPlaying(false); }, [hour]);

  function updateConfig(next: ScenarioConfig) { setPlaying(false); setConfig(next); }
  function scrub(next: number) { setPlaying(false); setHour(next); }
  function togglePlayback() { if (hour >= 72) setHour(0); setPlaying(value => !value); }
  return { enabled, setEnabled, config, updateConfig, hour, scrub, playing, togglePlayback, layer, setLayer, frame };
}

export type SimulationState = ReturnType<typeof useSimulation>;
