import { Image, Pressable, View } from "react-native";
import { router } from "expo-router";
import type { HazardReport } from "../../../shared/types";
import { categories } from "../lib/report-input";
import { photoUrl } from "../lib/api";
import { useCrew } from "../state/CrewProvider";
import { color, Icon, Text, styles } from "./ui";

export function ReportCard({ report, gallery = false }: { report: HazardReport; gallery?: boolean }) {
  const { profile } = useCrew();
  const image = report.photoUrl && photoUrl(profile.server, report.photoUrl);
  return <Pressable accessibilityRole="button" accessibilityLabel={`View hazard: ${report.description}`} onPress={() => router.push({ pathname: "/report", params: { id: report.id } })} style={({ pressed }) => [{ paddingVertical: gallery ? 0 : 18, gap: 14, borderBottomWidth: gallery ? 0 : 1, borderBottomColor: color.line, flexDirection: gallery ? "column" : "row", opacity: pressed ? .75 : 1, transform: [{ scale: pressed ? .985 : 1 }] }]}>
    {image ? <Image source={{ uri: image }} style={{ width: gallery ? "100%" : 78, height: gallery ? 168 : 100, borderRadius: 5 }} accessibilityLabel="Crew photo of the hazard"/> : <View style={{ width: gallery ? "100%" : 65, height: gallery ? 128 : 90, borderRadius: 5, backgroundColor: color.soft, justifyContent: "center", alignItems: "center" }}><Icon name="map-pin" size={28}/>{gallery && <Text style={[styles.small, { marginTop: 9 }]}>Observation · no photo</Text>}</View>}
    <View style={{ flex: 1, gap: 7 }}><View style={styles.between}><Text style={[styles.eyebrow, { color: report.status === "open" ? color.rust : color.muted, marginBottom: 0, fontSize: 9 }]}>{report.status === "open" ? "Open" : "Resolved"} · {categories.find(c => c.id === report.category)?.label}</Text><Icon name="arrow-up-right" size={15}/></View><Text numberOfLines={2} style={[styles.body, { fontSize: gallery ? 19 : 16, lineHeight: gallery ? 25 : 21 }]}>{report.description}</Text><Text style={styles.small}>{report.author}{report.teamName ? ` · ${report.teamName}` : ""}</Text><Text style={[styles.small, { fontSize: 10 }]}>{new Date(report.createdAt).toLocaleString()}</Text></View>
  </Pressable>;
}
