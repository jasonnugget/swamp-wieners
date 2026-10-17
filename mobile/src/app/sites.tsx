import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useCrew } from "../state/CrewProvider";
import { Icon, Notice, Page, styles } from "../components/ui";

export default function Sites() {
  const crew = useCrew(), [search, setSearch] = useState("");
  const sites = crew.workspace?.sites.filter(site => (!crew.team || crew.team.siteIds.includes(site.id)) && `${site.name} ${site.state} ${site.id}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  return <Page title="Where are you working?" caption="CHOOSE SITE" back><TextInput accessibilityLabel="Find a plant" autoFocus placeholder="Plant name, state or EIA ID" value={search} onChangeText={setSearch} style={styles.input}/>{crew.team && <Text style={styles.small}>Showing plants assigned to {crew.team.name}.</Text>}{!sites.length && <Notice>{crew.workspace ? "No matching sites. Try a different search or change your team." : "Connect to your PlanIT server in Crew first."}</Notice>}{sites.map(site => <Pressable key={site.id} accessibilityRole="button" accessibilityState={{ selected: crew.profile.siteId === site.id }} onPress={() => { crew.setProfile(p => ({ ...p, siteId: site.id })); router.back(); }} style={[styles.card, styles.between]}><View style={{ flex: 1 }}><Text style={[styles.body, { fontWeight: "600" }]}>{site.name}</Text><Text style={styles.small}>{site.county}, {site.state} · EIA {site.id}</Text></View><Icon name={crew.profile.siteId === site.id ? "check-circle" : "chevron-right"}/></Pressable>)}</Page>;
}
