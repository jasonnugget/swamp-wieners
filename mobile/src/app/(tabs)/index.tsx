import { useMemo } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { router } from "expo-router";
import { useCrew } from "../../state/CrewProvider";
import { Text, Button, color, Icon, Notice, Page, SectionHeading, styles } from "../../components/ui";
import SiteMap from "../../components/SiteMap";
import FieldHero from "../../components/FieldHero";
import { Reveal } from "../../components/motion";
import { ReportCard } from "../../components/ReportCard";

export default function OnSite() {
  const crew = useCrew(), { width } = useWindowDimensions(), scrollY = useSharedValue(0);
  const open = useMemo(() => crew.reports.filter(report => report.status === "open"), [crew.reports]);
  const recent = useMemo(() => [...crew.reports].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 3), [crew.reports]);
  const matched = crew.site && crew.workspace?.siteId === crew.site.id;
  return <Page title="PlanIT Crew" home refresh scrollY={scrollY}>
    <Pressable accessibilityRole="button" accessibilityLabel="Choose your site" onPress={() => router.push("/sites")} style={[styles.between, { paddingVertical: 2 }]}><View style={[styles.row, { flex: 1 }]}><Icon name="map-pin" size={21}/><View style={{ flex: 1 }}><Text style={styles.eyebrow}>On site</Text><Text style={[styles.body, { fontSize: 17, fontWeight: "500" }]}>{crew.site?.name ?? "Choose your site"}</Text><Text style={styles.small}>{crew.site ? `${crew.site.county}, ${crew.site.state}` : "Connect to your PlanIT server in Crew"}</Text></View></View><Icon name="chevron-down" size={18}/></Pressable>
    {crew.workspace?.clockMode === "demo" && <Text style={styles.small}>Demo workspace · reports use the demonstration clock.</Text>}
    <FieldHero hasSite={!!crew.site} draft={!!crew.draft} scrollY={scrollY}/>
    <Reveal delay={140}><View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: color.line, paddingBottom: 24 }}><View style={{ flex: 1, gap: 5 }}><Text style={[styles.title, { fontSize: 37 }]}>{matched ? open.length : "—"}</Text><Text style={styles.small}>Open observations</Text></View><View style={{ flex: 1, gap: 5, paddingLeft: 24, borderLeftWidth: 1, borderLeftColor: color.line }}><Text style={[styles.title, { fontSize: 37 }]}>{matched ? crew.reports.length : "—"}</Text><Text style={styles.small}>Records kept here</Text></View></View></Reveal>
    {crew.site && <><SectionHeading title="Know the ground." action="Open hazard map" onPress={() => router.push("/map")}/><SiteMap site={crew.site} reports={open} height={218}/><Text style={[styles.small, { marginTop: -14, fontSize: 10 }]}>Actual site coordinates · crew observations</Text></>}
    <SectionHeading title="From the crew." action="View all site reports" onPress={() => router.push("/history")}/>
    {recent.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={Math.min(width - 80, 320) + 14} contentContainerStyle={{ gap: 14 }} style={{ marginRight: -24 }}>{recent.map(report => <View key={report.id} style={{ width: Math.min(width - 80, 320) }}><ReportCard report={report} gallery/></View>)}</ScrollView> : <View style={styles.card}><Icon name="archive" size={28}/><Text style={styles.heading}>{crew.stale ? "Your site feed is waiting." : "The first note matters."}</Text><Text style={styles.small}>{crew.stale ? "Connect or pull to refresh for this site’s records." : "No observations yet. Share what you see so the next crew arrives informed."}</Text></View>}
    {!crew.workspace && <Button title="Set up server connection" onPress={() => router.push("/crew")} secondary/>}
    <Notice>Reports stay with the site. No reports does not mean the site is clear for work.</Notice>
  </Page>;
}
