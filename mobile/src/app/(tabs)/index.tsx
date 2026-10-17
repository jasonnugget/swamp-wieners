import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useCrew } from "../../state/CrewProvider";
import { Button, color, Icon, Notice, Page, styles } from "../../components/ui";
import SiteMap from "../../components/SiteMap";
import { ReportCard } from "../../components/ReportCard";

export default function OnSite() {
  const crew = useCrew();
  const open = useMemo(() => crew.reports.filter(report => report.status === "open"), [crew.reports]);
  const recent = [...crew.reports].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 3);
  return <Page title="PlanIT +" caption="CREW / FIELD NOTES" refresh>
    <Pressable accessibilityRole="button" accessibilityLabel="Choose your site" onPress={() => router.push("/sites")} style={styles.between}><View style={styles.row}><Icon name="map-pin" size={17}/><View><Text style={[styles.body, { fontWeight: "600" }]}>{crew.site?.name ?? "Choose your site"}</Text><Text style={styles.small}>{crew.site ? `${crew.site.county}, ${crew.site.state}` : "Connect to your PlanIT server in Crew"}</Text></View></View><Icon name="chevron-down" size={18}/></Pressable>
    {crew.workspace?.clockMode === "demo" && <Text style={styles.small}>DEMO CLOCK · Reports use the workspace’s demonstration time.</Text>}
    <View style={{ backgroundColor: color.ink, padding: 25, borderRadius: 26, gap: 20 }}>
      <View style={styles.between}><Text style={[styles.eyebrow, { color: color.accent }]}>YOUR EYES. EVERYONE’S SAFETY.</Text><Icon name="camera" tint={color.accent} size={26}/></View>
      <Text accessibilityRole="header" style={{ color: color.white, fontSize: 39, fontWeight: "600", letterSpacing: -1.6, lineHeight: 42 }}>See it. Pin it.{"\n"}Pass it on.</Text>
      <Text style={[styles.body, { color: "#c3d4c8", fontSize: 15 }]}>A photo for your crew today. Local knowledge for the next project owner.</Text>
      <Pressable disabled={!crew.site} accessibilityRole="button" accessibilityLabel={crew.draft ? "Continue hazard draft" : "Snap a hazard"} onPress={() => router.push("/capture")} style={{ backgroundColor: color.accent, padding: 18, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", opacity: crew.site ? 1 : 0.5 }}><View style={styles.row}><Icon name={crew.draft ? "edit-3" : "camera"}/><Text style={{ color: color.ink, fontSize: 17, fontWeight: "700" }}>{crew.draft ? "Continue hazard draft" : "Snap a hazard"}</Text></View><Icon name="arrow-up-right"/></Pressable>
      <Text style={{ color: "#a4bcaf", fontSize: 11 }}>01 PHOTO    →    02 PIN    →    03 SHARE</Text>
    </View>
    <View style={{ flexDirection: "row", gap: 12 }}><View style={[styles.card, { flex: 1 }]}><Text style={[styles.title, { fontSize: 30 }]}>{crew.site && crew.workspace?.siteId === crew.site.id ? crew.reports.filter(r => r.status === "open").length : "—"}</Text><Text style={styles.small}>Unresolved at this site</Text></View><View style={[styles.card, { flex: 1 }]}><Text style={[styles.title, { fontSize: 30 }]}>{crew.site && crew.workspace?.siteId === crew.site.id ? crew.reports.length : "—"}</Text><Text style={styles.small}>Reports in site memory</Text></View></View>
    {crew.site && <><View style={styles.between}><Text style={styles.heading}>Know the ground.</Text><Pressable accessibilityRole="button" onPress={() => router.push("/map")} style={styles.iconButton} accessibilityLabel="Open hazard map"><Icon name="arrow-up-right"/></Pressable></View><SiteMap site={crew.site} reports={open} height={220}/></>}
    <View style={styles.between}><Text style={styles.heading}>From the crew</Text><Pressable accessibilityRole="button" onPress={() => router.push("/history")} style={styles.iconButton} accessibilityLabel="View all site reports"><Icon name="arrow-right"/></Pressable></View>
    {recent.length ? recent.map(report => <ReportCard report={report} key={report.id}/>) : <View style={styles.card}><Text style={styles.heading}>{crew.stale ? "Your site feed is waiting." : "Start the local knowledge."}</Text><Text style={styles.small}>{crew.stale ? "Connect or pull to refresh to see this site’s records." : "No reports have been recorded here. Share what you see so the next crew arrives informed."}</Text></View>}
    {!crew.workspace && <Button title="Set up server connection" onPress={() => router.push("/crew")} secondary/>}
    <Notice>Shared reports stay with this site. A resolution records what changed; it never erases the original observation.</Notice>
  </Page>;
}
