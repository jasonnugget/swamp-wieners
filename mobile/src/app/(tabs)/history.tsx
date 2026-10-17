import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useCrew } from "../../state/CrewProvider";
import { Button, Icon, Page, styles } from "../../components/ui";
import { ReportCard } from "../../components/ReportCard";

export default function History() {
  const crew = useCrew();
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all"), [query, setQuery] = useState("");
  const reports = [...crew.reports].filter(report => (filter === "all" || report.status === filter) && `${report.description} ${report.author} ${report.teamName ?? ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return <Page title="Knowledge stays here." caption="SITE MEMORY" refresh><Text style={styles.body}>{crew.site?.name ?? "This site"} keeps its story across crews and projects. Photos, pins and verified resolutions remain attached to the location.</Text><TextInput accessibilityLabel="Search site history" placeholder="Search hazards, people or teams" value={query} onChangeText={setQuery} style={styles.input}/><View style={styles.wrap}>{([["all", "All history"], ["open", "Unresolved"], ["resolved", "Resolved"]] as const).map(([id, title]) => <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: filter === id }} onPress={() => setFilter(id)} style={[styles.chip, filter === id && styles.chipActive]}><Text style={styles.small}>{title}</Text></Pressable>)}</View>{reports.map(report => <ReportCard report={report} key={report.id}/>)}{!reports.length && <View style={styles.card}><Icon name="archive"/><Text style={styles.heading}>{crew.stale ? "Reconnect for site history." : "No matching reports yet."}</Text><Text style={styles.small}>New observations become useful history for the next project owner.</Text></View>}<Button title="Add a site observation" icon="camera" disabled={!crew.site} onPress={() => router.push("/capture")}/></Page>;
}
