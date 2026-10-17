import { View } from "react-native";
import { useCrew } from "../state/CrewProvider";
import { todayCrewReports, todaySiteHazards } from "../lib/site-hazards";
import { taskOptions } from "../lib/report-input";
import { Text, color, Notice, Page, styles } from "../components/ui";
import { hazardStatusLabel } from "../components/TodayHazards";
import { ReportCard } from "../components/ReportCard";

export default function Conditions() {
  const crew = useCrew(), site = crew.site;
  if (!site) return <Page title="Today’s site hazards" back><Notice>Choose your site in Crew to see today’s conditions.</Notice></Page>;
  const now = crew.currentTime, today = todaySiteHazards(site, crew.workspace?.conditions, crew.stale, now);
  const reported = todayCrewReports(crew.reports, site, now);
  const time = (value: string) => new Date(value).toLocaleString(undefined, { timeZone: site.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const provenance = today.snapshot?.observation.provenance;
  return <Page title="Today’s site hazards." caption={`${site.name} / ${today.date}`} back refresh>
    <Text style={styles.body}>Today in {site.timezone}. Current screening, active restrictions and crew observations for this site.</Text>
    {!today.current && <Notice danger>{today.snapshot ? "These conditions are cached or out of date. Current scores are unknown until a fresh update arrives. Last-known holds stay visible." : "No current site conditions have loaded. Check your connection and refresh; missing data is unknown."}</Notice>}
    {today.generatedAt && <Text style={styles.small}>Site screening checked {time(today.generatedAt)}{today.current ? "" : " · last-known record"}</Text>}
    {crew.workspace?.clockMode === "demo" && <Notice>Demo crew reports use the workspace’s demonstration date. Provider screening below uses real current time; demo reports are not presented as today’s observations.</Notice>}
    <View style={styles.card}><Text style={styles.heading}>Work status</Text>{today.snapshot?.tasks.map(task => <View key={task.task} style={{ gap: 4 }}><Text style={[styles.body, { color: task.state === "HOLD" || task.state === "RESTRICTED" ? color.rust : color.ink }]}>{taskOptions.find(option => option.id === task.task)?.label}: {today.current ? task.state : task.state === "HOLD" || task.state === "RESTRICTED" ? `last known ${task.state}` : "UNKNOWN"}</Text>{task.reasons.length > 0 && <Text style={styles.small}>{task.reasons.join(" ")}</Text>}</View>)}{!today.snapshot && <Text style={styles.small}>Unknown · current task restrictions have not loaded.</Text>}<Text style={styles.small}>A low score or resolved report cannot clear an independent hold.</Text></View>
    {today.rows.map(row => <View key={row.hazard} style={[styles.card, { gap: 10 }]}>
      <View style={styles.between}><Text style={[styles.heading, { flex: 1 }]}>{row.title}</Text><Text style={[styles.small, { color: ["HOLD", "RESTRICTED", "ELEVATED"].includes(row.status) ? color.rust : color.muted }]}>{!today.current && row.overrides.length ? "Last-known " : ""}{hazardStatusLabel[row.status]}</Text></View>
      <Text style={styles.body}>{row.detail}</Text>
      <Text style={styles.small}>{row.score === null ? "Current risk score unknown" : `Risk screen ${row.score.toFixed(1)}/10 · evidence confidence ${Math.round(row.confidence * 100)}%`}</Text>
      {row.labels.length > 0 && <Text style={styles.small}>Evidence: {row.labels.join(" · ")}</Text>}
      {row.overrides.map((override, index) => <View key={`${override.id}:${index}`} style={{ borderLeftWidth: 2, borderLeftColor: color.rust, paddingLeft: 10, gap: 4 }}><Text style={styles.body}>{override.reason}</Text><Text style={styles.small}>{override.source === "crew" ? "Unresolved crew report" : override.source === "lightning" ? "Detected lightning" : "Official alert"} · {override.state}{override.expiresAt ? ` · expires ${time(override.expiresAt)}` : " · until reviewed"}</Text></View>)}
      {today.current && row.evidence.length > 0 && <Text style={styles.small}>{row.evidence.join(" ")}</Text>}
    </View>)}
    <Text style={styles.heading}>Source coverage</Text>
    {Object.entries(provenance?.providers ?? {}).map(([key, provider]) => <View key={key} style={styles.listRow}><Text style={styles.body}>{provider.source}</Text><Text style={styles.small}>{provider.mode === "FORECAST" ? "Forecast / model estimate" : provider.mode === "DEMO" ? "Demo evidence" : provider.mode === "STATIC" ? "Static exposure" : "Live provider"} · {provider.status}{provider.fetchedAt ? ` · checked ${time(provider.fetchedAt)}` : " · check time unknown"}</Text>{provider.observedAt && <Text style={styles.small}>Source valid time {time(provider.observedAt)}</Text>}</View>)}
    {!Object.keys(provenance?.providers ?? {}).length && <Text style={styles.small}>No provider coverage is available.</Text>}
    {provenance?.error && <Notice>Some source data is unavailable. Affected fields remain unknown.</Notice>}
    <Text style={styles.heading}>Crew reports today · {reported.length}</Text>
    {reported.map(report => <ReportCard key={report.id} report={report}/>)}
    {!reported.length && <Text style={styles.small}>No crew reports are recorded for today’s local date. Older unresolved hazards remain on the map and in site history.</Text>}
    <Notice>Site-level screening does not locate an exact incident. Map pins represent crew observations; forecasts and model estimates do not confirm a hazard occurred.</Notice>
  </Page>;
}
