import { useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useCrew } from "../../state/CrewProvider";
import { Text, Button, color, font, Icon, Page, styles } from "../../components/ui";
import { ReportCard } from "../../components/ReportCard";
import { Reveal } from "../../components/motion";

export default function History() {
  const crew = useCrew();
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all"), [query, setQuery] = useState("");
  const reports = useMemo(() => crew.reports.filter(report => (filter === "all" || report.status === filter) && `${report.description} ${report.author} ${report.teamName ?? ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), [crew.reports, filter, query]);
  return <Page title={"Seen today.\nKept for tomorrow."} caption="SITE MEMORY" refresh><Text style={styles.body}>Every observation leaves the next crew better prepared. Photos, pins and resolutions stay with {crew.site?.name ?? "the site"}.</Text>
    <View style={history.search}><Icon name="search" size={21}/><TextInput accessibilityLabel="Search site history" placeholder="Search hazards, people or teams" placeholderTextColor={color.muted} value={query} onChangeText={setQuery} style={history.input}/></View>
    <View accessibilityRole="tablist" style={history.filters}>{([["all", "All records"], ["open", "Open"], ["resolved", "Resolved"]] as const).map(([id, title]) => <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: filter === id }} onPress={() => setFilter(id)} style={[history.filter, filter === id && { borderBottomColor: color.rust }]}><Text style={{ color: filter === id ? color.ink : color.muted, fontFamily: font.medium, fontSize: 13 }}>{title}</Text></Pressable>)}</View>
    <View>{reports.map(report => <ReportCard report={report} key={report.id}/>)}</View>
    {!reports.length && <Reveal><View style={history.empty}><Icon name="archive" size={36}/><Text style={styles.heading}>{crew.stale ? "Reconnect for site history." : query ? "No matching records." : "The first story is yours."}</Text><Text style={styles.body}>{query ? "Try another name or observation." : "What you notice today can help someone tomorrow. Add a photo and a pin to begin."}</Text></View></Reveal>}
    <Button title="Add an observation" icon="camera" disabled={!crew.site} onPress={() => router.push("/capture")}/>
  </Page>;
}
const history = StyleSheet.create({ search: { flexDirection: "row", gap: 12, alignItems: "center", borderBottomWidth: 1, borderColor: color.line }, input: { flex: 1, minHeight: 56, fontFamily: font.regular, fontSize: 14, color: color.ink }, filters: { flexDirection: "row", borderBottomWidth: 1, borderColor: color.line }, filter: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent" }, empty: { gap: 14, paddingVertical: 14, paddingHorizontal: 8 } });
