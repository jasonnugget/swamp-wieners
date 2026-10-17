import { Image, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import type { HazardReport } from "../../../shared/types";
import { categories } from "../lib/report-input";
import { photoUrl } from "../lib/api";
import { useCrew } from "../state/CrewProvider";
import { color, Icon, styles } from "./ui";

export function ReportCard({ report }: { report: HazardReport }) {
  const { profile } = useCrew();
  const image = report.photoUrl && photoUrl(profile.server, report.photoUrl);
  return <Pressable accessibilityRole="button" accessibilityLabel={`View hazard: ${report.description}`} onPress={() => router.push({ pathname: "/report", params: { id: report.id } })} style={[styles.card, { flexDirection: "row", padding: 13, gap: 14 }]}>
    {image ? <Image source={{ uri: image }} style={{ width: 76, height: 90, borderRadius: 12 }} accessibilityLabel="Crew photo of the hazard"/> : <View style={{ width: 60, height: 76, borderRadius: 12, backgroundColor: color.soft, justifyContent: "center", alignItems: "center" }}><Icon name="map-pin"/></View>}
    <View style={{ flex: 1, gap: 6 }}><Text style={[styles.eyebrow, { color: report.status === "open" ? color.rust : color.muted, marginBottom: 0 }]}>{report.status === "open" ? "Unresolved" : "Resolved"} · {categories.find(c => c.id === report.category)?.label}</Text><Text numberOfLines={2} style={[styles.body, { fontSize: 15, fontWeight: "600", lineHeight: 20 }]}>{report.description}</Text><Text style={styles.small}>{report.author}{report.teamName ? ` · ${report.teamName}` : ""}</Text><Text style={[styles.small, { fontSize: 11 }]}>{new Date(report.createdAt).toLocaleString()}</Text></View>
  </Pressable>;
}
