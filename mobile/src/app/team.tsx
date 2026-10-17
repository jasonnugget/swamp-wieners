import { Pressable, Text } from "react-native";
import { router } from "expo-router";
import { useCrew } from "../state/CrewProvider";
import { Icon, Page, styles } from "../components/ui";

export default function Teams() {
  const crew = useCrew();
  return <Page title="Who’s on your crew?" caption="TEAM" back><Text style={styles.body}>Use your existing roster to share observations with the right site and name.</Text><Pressable accessibilityRole="button" style={styles.card} onPress={() => { crew.setProfile(p => ({ ...p, teamId: "" })); router.back(); }}><Icon name="user"/><Text style={styles.heading}>Independent / unassigned</Text><Text style={styles.small}>Reports still contribute to the site’s shared history.</Text></Pressable>{crew.workspace?.teams.map(team => <Pressable key={team.id} accessibilityRole="button" style={styles.card} onPress={() => { crew.setProfile(p => ({ ...p, teamId: team.id, name: team.members.includes(p.name) ? p.name : team.members[0], siteId: team.siteIds.includes(p.siteId) ? p.siteId : team.siteIds[0] })); router.back(); }}><Text style={styles.heading}>{team.name}</Text><Text style={styles.small}>{team.members.join(" · ")}</Text><Text style={styles.small}>{team.siteIds.length} assigned plants</Text></Pressable>)}<Text style={styles.small}>Create or edit teams in the supervisor website’s Crew reports view. Names and assignments are reporting context, not authenticated accounts.</Text></Page>;
}
