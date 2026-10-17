import { useFonts } from "expo-font";
import { Outfit_400Regular } from "@expo-google-fonts/outfit/400Regular";
import { Outfit_500Medium } from "@expo-google-fonts/outfit/500Medium";
import { Outfit_600SemiBold } from "@expo-google-fonts/outfit/600SemiBold";
import { View, ActivityIndicator } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CrewProvider } from "../state/CrewProvider";
import { color } from "../components/ui";

export default function Layout() {
  const [loaded, error] = useFonts({ Outfit: Outfit_400Regular, OutfitMedium: Outfit_500Medium, OutfitSemiBold: Outfit_600SemiBold });
  if (!loaded && !error) return <View style={{ flex: 1, backgroundColor: color.paper, justifyContent: "center", alignItems: "center" }}><ActivityIndicator color={color.rust} accessibilityLabel="Opening PlanIT Crew"/></View>;
  return <SafeAreaProvider><CrewProvider><StatusBar style="dark"/><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.paper } }}>
    <Stack.Screen name="(tabs)"/>
    <Stack.Screen name="capture" options={{ presentation: "fullScreenModal", gestureEnabled: false }}/>
    <Stack.Screen name="sites" options={{ presentation: "modal" }}/>
    <Stack.Screen name="team" options={{ presentation: "modal" }}/>
    <Stack.Screen name="conditions" options={{ presentation: "modal" }}/>
    <Stack.Screen name="report" options={{ presentation: "modal" }}/>
  </Stack></CrewProvider></SafeAreaProvider>;
}
