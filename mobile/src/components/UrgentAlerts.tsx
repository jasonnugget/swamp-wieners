import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useCrew } from "../state/CrewProvider";
import { readStored, storageKeys, writeStored } from "../lib/storage";
import { Icon, Text, color, styles } from "./ui";

/** In-app escalations for the crew's site, refreshed by the 30 s workspace poll. */
export default function UrgentAlerts() {
  const crew = useCrew();
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => { void readStored<string[]>(storageKeys.dismissedAlerts).then(ids => { if (Array.isArray(ids)) setDismissed(ids); }); }, []);
  const alerts = (crew.workspace?.siteId === crew.site?.id ? crew.workspace?.urgentAlerts ?? [] : [])
    .filter(a => a.siteId === crew.site?.id && !dismissed.includes(a.id));
  if (!alerts.length) return null;
  function dismiss(id: string) {
    const next = [...dismissed, id].slice(-200);
    setDismissed(next);
    void writeStored(storageKeys.dismissedAlerts, next).catch(() => {});
  }
  return <View style={{ gap: 10 }}>{alerts.map(alert => <View key={alert.id} accessibilityRole="alert" style={[styles.notice, { borderLeftColor: color.rust, borderLeftWidth: 4, backgroundColor: "#f3dcd2" }]}>
    <Icon name="alert-circle" size={22} tint={color.rust}/>
    <View style={{ flex: 1, gap: 3 }}>
      <Text style={[styles.eyebrow, { color: color.rust }]}>{alert.kind === "hold" ? "Work hold" : alert.kind === "nws-warning" ? "Official warning" : alert.kind === "lightning" ? "Lightning within 10 mi" : "Thunderstorm"}</Text>
      <Text style={[styles.body, { fontWeight: "600" }]}>{alert.title}</Text>
      <Text style={styles.small}>{alert.detail}</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Dismiss alert" hitSlop={12} onPress={() => dismiss(alert.id)}><Icon name="x" size={18}/></Pressable>
  </View>)}</View>;
}
