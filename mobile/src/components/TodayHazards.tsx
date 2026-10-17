import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useCrew } from "../state/CrewProvider";
import { todayCrewReports, todaySiteHazards, siteDay, type HazardStatus } from "../lib/site-hazards";
import { Text, color, Icon, styles } from "./ui";

export const hazardStatusLabel: Record<HazardStatus, string> = { HOLD: "Hold", RESTRICTED: "Restricted", ELEVATED: "Elevated screen", UNKNOWN: "Unknown", SCREENED: "Screening" };
export default function TodayHazards() {
  const crew = useCrew(), site = crew.site;
  if (!site) return null;
  const now = crew.currentTime, today = todaySiteHazards(site, crew.workspace?.conditions, crew.stale, now);
  const matching = crew.workspace?.siteId === site.id;
  const reported = todayCrewReports(crew.reports, site, now);
  const carried = crew.reports.filter(report => report.status === "open" && Date.parse(report.createdAt) <= now && siteDay(Date.parse(report.createdAt), site.timezone) < today.date);
  return <View style={[styles.card, { gap: 14 }]}>
    <View style={styles.between}><View style={{ flex: 1 }}><Text style={styles.eyebrow}>Today at this site · {today.date}</Text><Text accessibilityRole="header" style={styles.heading}>Know today’s hazards.</Text></View><Icon name="map-pin"/></View>
    <Text style={styles.small}>{today.current ? `${today.flagged} flagged channels · ${today.unknown} with unknown scores` : today.snapshot ? "Last-known conditions · waiting for a current update" : "Current site conditions are not available yet"}</Text>
    {today.rows.slice(0, 3).map(row => <View key={row.hazard} style={{ gap: 4, borderTopWidth: 1, borderTopColor: color.line, paddingTop: 11 }}>
      <View style={styles.between}><Text style={[styles.body, { fontWeight: "500", flex: 1 }]}>{row.title}</Text><Text style={[styles.small, { color: ["HOLD", "RESTRICTED", "ELEVATED"].includes(row.status) ? color.rust : color.muted }]}>{!today.current && row.overrides.length ? "Last-known " : ""}{hazardStatusLabel[row.status]}{row.score === null ? "" : ` · ${row.score.toFixed(1)}/10`}</Text></View>
      <Text numberOfLines={2} style={styles.small}>{row.detail}</Text>
      {row.labels.length > 0 && <Text style={[styles.small, { fontSize: 10 }]}>{row.labels.join(" · ")}</Text>}
    </View>)}
    {matching && <Text style={styles.small}>{reported.length} crew reports today · {carried.length} older unresolved reports carried forward{crew.stale ? " · cached counts" : ""}</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel="View all today's site hazards" onPress={() => router.push("/conditions")} style={[styles.between, { minHeight: 44, borderTopWidth: 1, borderTopColor: color.line, paddingTop: 10 }]}><Text style={[styles.body, { fontWeight: "500" }]}>View all 7 hazards and work status</Text><Icon name="arrow-up-right" size={20}/></Pressable>
    <Text style={[styles.small, { fontSize: 10 }]}>Provider and model screening is separate from crew observations. Missing coverage does not mean safe.</Text>
  </View>;
}
