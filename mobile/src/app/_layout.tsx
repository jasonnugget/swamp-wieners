import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CrewProvider } from "../state/CrewProvider";
import { color } from "../components/ui";

export default function Layout() {
  return <SafeAreaProvider><CrewProvider><StatusBar style="dark"/><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.paper } }}>
    <Stack.Screen name="(tabs)"/>
    <Stack.Screen name="capture" options={{ presentation: "fullScreenModal", gestureEnabled: false }}/>
    <Stack.Screen name="sites" options={{ presentation: "modal" }}/>
    <Stack.Screen name="team" options={{ presentation: "modal" }}/>
    <Stack.Screen name="report" options={{ presentation: "modal" }}/>
  </Stack></CrewProvider></SafeAreaProvider>;
}
