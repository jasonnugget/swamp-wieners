import { useMemo } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useCrew } from "../../state/CrewProvider";
import { Button, Notice, Page, styles } from "../../components/ui";
import SiteMap from "../../components/SiteMap";
import { ReportCard } from "../../components/ReportCard";

export default function HazardMap() {
  const crew = useCrew();
  const open = useMemo(() => crew.reports.filter(report => report.status === "open"), [crew.reports]);
  return <Page title="The site, together." caption="HAZARD MAP" refresh><Text style={styles.body}>Every pin is something a crew member saw. Tap a marker’s callout to read the evidence.</Text>{crew.site ? <><View style={styles.between}><Text style={styles.heading}>{crew.site.name}</Text><Text style={styles.small}>{open.length} unresolved</Text></View><SiteMap site={crew.site} reports={open} height={430}/><Button title="Report a hazard here" icon="camera" onPress={() => router.push("/capture")}/>{open.map(report => <ReportCard report={report} key={report.id}/>)}</> : <Notice>Choose your server and plant in Crew to load the map.</Notice>}<Text style={styles.small}>Pins are crew observations, not a complete safety survey. No pins does not mean a site is clear for work.</Text></Page>;
}
