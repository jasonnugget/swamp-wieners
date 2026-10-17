import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, color, font } from "../../components/ui";

export default function CrewTabs() {
  const insets = useSafeAreaInsets();
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: color.white, tabBarInactiveTintColor: "#a2b099", tabBarStyle: { position: "absolute", bottom: Math.max(insets.bottom, 12), marginHorizontal: 18, height: 76, paddingTop: 9, paddingBottom: 9, backgroundColor: color.dark, borderTopWidth: 0, borderRadius: 10 }, tabBarLabelStyle: { fontFamily: font.medium, fontSize: 10, lineHeight: 15, marginTop: 1 }, animation: "fade" }}>
    <Tabs.Screen name="index" options={{ title: "On site", tabBarIcon: ({ color: tint }) => <Icon name="home" tint={typeof tint === "string" ? tint : color.white}/> }}/>
    <Tabs.Screen name="map" options={{ title: "Field map", tabBarIcon: ({ color: tint }) => <Icon name="map" tint={typeof tint === "string" ? tint : color.white}/> }}/>
    <Tabs.Screen name="history" options={{ title: "Site memory", tabBarIcon: ({ color: tint }) => <Icon name="clock" tint={typeof tint === "string" ? tint : color.white}/> }}/>
    <Tabs.Screen name="crew" options={{ title: "Your crew", tabBarIcon: ({ color: tint }) => <Icon name="users" tint={typeof tint === "string" ? tint : color.white}/> }}/>
  </Tabs>;
}
