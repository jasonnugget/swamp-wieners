import { Tabs } from "expo-router";
import { Icon, color } from "../../components/ui";

export default function CrewTabs() {
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: color.ink, tabBarInactiveTintColor: color.muted, tabBarStyle: { backgroundColor: color.paper, borderTopColor: color.line }, tabBarLabelStyle: { fontSize: 11, fontWeight: "600" } }}>
    <Tabs.Screen name="index" options={{ title: "On site", tabBarIcon: ({ color: tint }) => <Icon name="home" tint={tint}/> }}/>
    <Tabs.Screen name="map" options={{ title: "Hazard map", tabBarIcon: ({ color: tint }) => <Icon name="map" tint={tint}/> }}/>
    <Tabs.Screen name="history" options={{ title: "Site memory", tabBarIcon: ({ color: tint }) => <Icon name="clock" tint={tint}/> }}/>
    <Tabs.Screen name="crew" options={{ title: "Crew", tabBarIcon: ({ color: tint }) => <Icon name="users" tint={tint}/> }}/>
  </Tabs>;
}
