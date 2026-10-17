import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { Button, color, font, Icon, Text } from "./ui";
import FieldArtwork from "./FieldArtwork";
import { Reveal, useMotionPreference } from "./motion";

export default function FieldHero({ hasSite, draft, scrollY }: { hasSite: boolean; draft: boolean; scrollY: SharedValue<number> }) {
  const reduced = useMotionPreference();
  const artwork = useAnimatedStyle(() => ({ transform: [{ translateY: reduced ? 0 : Math.min(scrollY.value, 500) * .12 }], opacity: reduced ? 1 : interpolate(scrollY.value, [0, 500], [1, .4], Extrapolation.CLAMP) }));
  return <Reveal delay={70}><View style={hero.shell}><View style={hero.core}>
    <Animated.View style={[StyleSheet.absoluteFill, artwork]}><FieldArtwork/></Animated.View>
    <View style={hero.copy}><View style={{ flexDirection: "row", gap: 12, alignItems: "center", justifyContent: "center" }}><Text accessibilityRole="header" style={hero.title}>See it.</Text><FieldArtwork compact/></View><Text accessibilityRole="header" style={hero.title}>Pass it on.</Text><Text style={hero.description}>Your field knowledge.{"\n"}Your crew’s next advantage.</Text></View>
    <View style={{ gap: 8, marginTop: 28 }}><Button title={draft ? "Continue hazard draft" : "Snap a hazard"} icon={draft ? "edit-3" : "camera"} disabled={!hasSite} onPress={() => router.push("/capture")}/><Pressable accessibilityRole="button" accessibilityLabel="View site map" disabled={!hasSite} onPress={() => router.push("/map")} style={({ pressed }) => [hero.mapLink, { opacity: !hasSite ? .4 : pressed ? .7 : 1 }]}><Text style={{ color: color.accent, fontSize: 13 }}>View site map</Text><Icon name="arrow-up-right" size={16} tint={color.accent}/></Pressable></View>
    <View style={hero.flow}><Text style={hero.flowText}>Photo</Text><View style={hero.flowLine}/><Text style={hero.flowText}>Pin</Text><View style={hero.flowLine}/><Text style={hero.flowText}>Share</Text></View>
  </View></View></Reveal>;
}
const hero = StyleSheet.create({
  shell: { padding: 4, backgroundColor: "#bcc6ab", borderRadius: 12 }, core: { backgroundColor: color.dark, padding: 22, borderRadius: 8, overflow: "hidden" },
  copy: { paddingTop: 22, alignItems: "center" }, title: { fontFamily: font.regular, color: color.white, fontSize: 45, lineHeight: 48, letterSpacing: -1.8, textAlign: "center" },
  description: { color: "#b7c3ac", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 18 },
  mapLink: { minHeight: 44, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 10 },
  flow: { flexDirection: "row", alignItems: "center", gap: 12, justifyContent: "center", borderTopWidth: 1, borderTopColor: "#d8dec720", paddingTop: 18, marginTop: 12 }, flowText: { fontSize: 10, color: "#a9b79d" }, flowLine: { width: 25, height: 1, backgroundColor: "#d8dec730" },
});
