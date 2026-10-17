import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps, ReactNode } from "react";
import { router } from "expo-router";
import { useCrew } from "../state/CrewProvider";

export const color = { paper: "#f6f5ef", ink: "#173d35", muted: "#697a70", accent: "#d9ed9d", rust: "#bd5e3e", line: "#dce1d5", white: "#ffffff", soft: "#eaf0e5" };
export function Icon({ name, size = 22, tint = color.ink }: { name: ComponentProps<typeof Feather>["name"]; size?: number; tint?: ComponentProps<typeof Feather>["color"] }) { return <Feather name={name} size={size} color={tint} />; }
export function Button({ title, onPress, secondary = false, disabled = false, icon, busy = false, style }: { title: string; onPress(): void; secondary?: boolean; disabled?: boolean; icon?: ComponentProps<typeof Feather>["name"]; busy?: boolean; style?: StyleProp<ViewStyle> }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, { opacity: disabled || busy ? 0.5 : pressed ? 0.8 : 1 }, style]}>{busy ? <ActivityIndicator color={secondary ? color.ink : color.white} /> : icon && <Icon name={icon} tint={secondary ? color.ink : color.white} size={19} />}<Text style={[styles.buttonText, secondary && { color: color.ink }]}>{title}</Text></Pressable>;
}
export function Notice({ children, danger = false }: { children: ReactNode; danger?: boolean }) { return <View style={[styles.notice, danger && { backgroundColor: "#f7e9df" }]}><Icon name={danger ? "alert-circle" : "info"} size={17} tint={danger ? color.rust : color.ink}/><Text accessibilityRole={danger ? "alert" : undefined} style={[styles.small, { flex: 1 }]}>{children}</Text></View>; }
export function Page({ title, caption, children, back = false, refresh = false }: { title: string; caption?: string; children: ReactNode; back?: boolean; refresh?: boolean }) {
  const crew = useCrew();
  return <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page} refreshControl={refresh ? <RefreshControl refreshing={crew.refreshing} onRefresh={crew.refresh} tintColor={color.ink}/> : undefined}>
    <View style={styles.row}>{back && <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" style={styles.iconButton}><Icon name="arrow-left"/></Pressable>}<View style={{ flex: 1 }}>{caption && <Text style={styles.eyebrow}>{caption}</Text>}<Text accessibilityRole="header" style={styles.title}>{title}</Text></View></View>
    {crew.storageError ? <Notice danger>{crew.storageError}</Notice> : null}
    {refresh && crew.stale && <Notice>{crew.workspace ? "Cached site records · reconnect for current updates." : "Connecting to your site…"}{crew.error ? ` ${crew.error}` : ""}</Notice>}
    {children}
  </ScrollView></SafeAreaView>;
}
export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.paper }, page: { padding: 22, paddingBottom: 48, gap: 22 },
  title: { color: color.ink, fontSize: 32, fontWeight: "700", letterSpacing: -1.2, lineHeight: 38 },
  heading: { color: color.ink, fontSize: 21, fontWeight: "600", letterSpacing: -0.5 },
  body: { color: color.ink, fontSize: 16, lineHeight: 24 }, small: { color: color.muted, fontSize: 13, lineHeight: 20 },
  eyebrow: { color: color.muted, fontSize: 10, letterSpacing: 2, fontWeight: "700", textTransform: "uppercase", marginBottom: 7 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 }, between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  card: { backgroundColor: color.white, borderRadius: 20, padding: 20, gap: 12 },
  button: { minHeight: 54, borderRadius: 16, backgroundColor: color.ink, paddingHorizontal: 18, paddingVertical: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  buttonText: { color: color.white, fontWeight: "600", fontSize: 15, flexShrink: 1 }, secondary: { backgroundColor: color.soft },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  notice: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: color.soft, padding: 14, borderRadius: 14 },
  input: { minHeight: 52, backgroundColor: color.white, borderRadius: 13, padding: 15, color: color.ink, fontSize: 16, borderWidth: 1, borderColor: color.line },
  label: { color: color.ink, fontSize: 13, fontWeight: "600", marginBottom: 8 },
  chip: { minHeight: 44, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 24, backgroundColor: color.white, borderWidth: 1, borderColor: color.line, flexDirection: "row", alignItems: "center", gap: 7 },
  chipActive: { backgroundColor: color.accent, borderColor: color.accent }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
