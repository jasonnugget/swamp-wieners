import { useMemo } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuickReport } from "../../features/useQuickReport";
import { useCrew } from "../../state/CrewProvider";
import { Text, Button, color, font, Icon, Notice, Page, styles } from "../../components/ui";
import SiteMap from "../../components/SiteMap";
import { Reveal } from "../../components/motion";

export default function HazardMap() {
  const crew = useCrew(), insets = useSafeAreaInsets(), { height } = useWindowDimensions();
  const { startReport, capturing } = useQuickReport();
  const open = useMemo(() => crew.reports.filter(report => report.status === "open"), [crew.reports]);
  if (!crew.site) return <Page title="Your ground. In view." caption="FIELD MAP"><Notice>Choose your server and site in Crew to load the map.</Notice><Button title="Set up your crew" onPress={() => router.push("/crew")}/></Page>;
  const matching = crew.workspace?.siteId === crew.site.id;
  return <View style={{ flex: 1, backgroundColor: color.soft }}>
    <SiteMap site={crew.site} reports={open} height={height} fullBleed/>
    <View pointerEvents="box-none" style={[map.header, { top: insets.top + 12 }]}><Pressable accessibilityRole="button" accessibilityLabel="Choose site" onPress={() => router.push("/sites")} style={map.site}><Text style={styles.eyebrow}>Field map</Text><Text numberOfLines={2} style={map.name}>{crew.site.name}</Text><Text style={styles.small}>{crew.site.county}, {crew.site.state} · {crew.stale ? "Cached records" : "Connected"}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Refresh crew observations" disabled={crew.refreshing} onPress={crew.refresh} style={map.refresh}><Icon name="refresh-cw"/></Pressable></View>
    <View style={[map.bottom, { bottom: Math.max(insets.bottom, 12) + 92 }]}><Reveal><View style={map.sheet}><View style={styles.between}><View style={{ flex: 1 }}><Text style={map.count}>{matching ? open.length : "—"}<Text style={map.countLabel}> open observations</Text></Text><Text style={styles.small}>Crew knowledge, pinned to place.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Read site history" onPress={() => router.push("/history")} style={styles.iconButton}><Icon name="arrow-up-right"/></Pressable></View><Pressable accessibilityRole="button" accessibilityLabel="View today’s site hazards" onPress={() => router.push("/conditions")} style={[styles.between, { minHeight: 44 }]}><Text style={styles.body}>Today’s conditions &amp; work status</Text><Icon name="arrow-up-right" size={19}/></Pressable><Button title="Report what you see" icon="camera" busy={capturing} onPress={() => { void startReport(); }}/><Text style={map.disclaimer}>No pins does not mean a site is clear for work.</Text></View></Reveal></View>
  </View>;
}
const map = StyleSheet.create({
  header: { position: "absolute", left: 18, right: 18, flexDirection: "row", alignItems: "flex-start", gap: 8 }, site: { flex: 1, padding: 18, backgroundColor: color.paper, borderRadius: 6, gap: 5 }, name: { fontFamily: font.medium, fontSize: 23, lineHeight: 27, letterSpacing: -.7 }, refresh: { width: 50, height: 50, borderRadius: 6, backgroundColor: color.paper, alignItems: "center", justifyContent: "center" },
  bottom: { position: "absolute", left: 18, right: 18 }, sheet: { backgroundColor: color.paper, borderRadius: 8, padding: 20, gap: 17 }, count: { fontFamily: font.regular, fontSize: 33, letterSpacing: -1 }, countLabel: { fontSize: 14, letterSpacing: 0 }, disclaimer: { color: color.muted, fontSize: 11, textAlign: "center" },
});
