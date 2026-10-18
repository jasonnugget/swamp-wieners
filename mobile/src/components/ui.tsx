import { CameraIcon, MapPinIcon, MapTrifoldIcon, HouseLineIcon, UsersThreeIcon, UserIcon, ClockCounterClockwiseIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpRightIcon, ArrowClockwiseIcon, CaretDownIcon, CaretRightIcon, CheckCircleIcon, CheckSquareIcon, CheckIcon, SquareIcon, XIcon, PencilSimpleLineIcon, ImageIcon, NavigationArrowIcon, PaperPlaneTiltIcon, ShareNetworkIcon, ArchiveIcon, BroadcastIcon, WarningCircleIcon, InfoIcon, MagnifyingGlassIcon } from "phosphor-react-native";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text as NativeText, View, type TextProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedScrollHandler, type SharedValue } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { ReactNode } from "react";
import { router } from "expo-router";
import { useCrew } from "../state/CrewProvider";
import { Reveal } from "./motion";

export const color = { paper: "#f0f0e7", ink: "#29382e", dark: "#16231f", muted: "#5e6855", accent: "#d8dec7", rust: "#9d482d", line: "#ced4c3", white: "#fafaf5", soft: "#e2e5d7" };
export const font = { regular: "Outfit", medium: "OutfitMedium", bold: "OutfitSemiBold" };
const glyphs = { camera: CameraIcon, "map-pin": MapPinIcon, map: MapTrifoldIcon, home: HouseLineIcon, users: UsersThreeIcon, user: UserIcon, clock: ClockCounterClockwiseIcon, "arrow-left": ArrowLeftIcon, "arrow-right": ArrowRightIcon, "arrow-up-right": ArrowUpRightIcon, "refresh-cw": ArrowClockwiseIcon, "chevron-down": CaretDownIcon, "chevron-right": CaretRightIcon, "check-circle": CheckCircleIcon, "check-square": CheckSquareIcon, check: CheckIcon, square: SquareIcon, x: XIcon, "edit-3": PencilSimpleLineIcon, image: ImageIcon, navigation: NavigationArrowIcon, send: PaperPlaneTiltIcon, "share-2": ShareNetworkIcon, archive: ArchiveIcon, radio: BroadcastIcon, "alert-circle": WarningCircleIcon, info: InfoIcon, search: MagnifyingGlassIcon };
export type IconName = keyof typeof glyphs;
export function Icon({ name, size = 22, tint = color.ink }: { name: IconName; size?: number; tint?: string }) { const Glyph = glyphs[name]; return <Glyph size={size} color={tint} weight="light"/>; }
export function Text({ style, ...props }: TextProps) {
  const flat = StyleSheet.flatten(style), weight = Number(flat?.fontWeight ?? 400);
  const family = weight >= 600 ? font.bold : weight >= 500 ? font.medium : flat?.fontFamily ?? font.regular;
  return <NativeText {...props} style={[{ color: color.ink }, style, { fontFamily: family }]}/>;
}
export function Button({ title, onPress, secondary = false, disabled = false, icon, busy = false, style }: { title: string; onPress(): void; secondary?: boolean; disabled?: boolean; icon?: IconName; busy?: boolean; style?: StyleProp<ViewStyle> }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, { opacity: disabled || busy ? .45 : 1, transform: [{ scale: pressed ? .98 : 1 }] }, style]}><Text style={[styles.buttonText, secondary && { color: color.ink }]}>{title}</Text><View style={[styles.buttonIcon, secondary && { backgroundColor: color.soft }]}>{busy ? <ActivityIndicator size="small" color={secondary ? color.ink : color.white}/> : <Icon name={icon ?? "arrow-up-right"} tint={secondary ? color.ink : color.white} size={19}/>}</View></Pressable>;
}
export function Notice({ children, danger = false }: { children: ReactNode; danger?: boolean }) { return <View style={[styles.notice, danger && { borderLeftColor: color.rust, backgroundColor: "#eee1d4" }]}><Icon name={danger ? "alert-circle" : "info"} size={18} tint={danger ? color.rust : color.muted}/><Text accessibilityRole={danger ? "alert" : undefined} style={[styles.small, { flex: 1 }]}>{children}</Text></View>; }
export function Page({ title, caption, children, back = false, refresh = false, home = false, scrollY, footer }: { title: string; caption?: string; children: ReactNode; back?: boolean; refresh?: boolean; home?: boolean; scrollY?: SharedValue<number>; footer?: ReactNode }) {
  const crew = useCrew(), insets = useSafeAreaInsets();
  const onScroll = useAnimatedScrollHandler(event => { if (scrollY) scrollY.set(event.contentOffset.y); });
  return <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}><Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.page, { paddingBottom: footer ? 24 : 112 + insets.bottom }]} refreshControl={refresh ? <RefreshControl refreshing={crew.refreshing} onRefresh={crew.refresh} tintColor={color.rust}/> : undefined}>
    <View style={styles.masthead}>{back ? <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" style={styles.iconButton}><Icon name="arrow-left"/></Pressable> : <View style={[styles.row, { gap: 4 }]}><Text style={styles.wordmark}>Threshold</Text><Text style={styles.cross}>+</Text><Text style={styles.brandCaption}>Crew</Text></View>}<View style={[styles.row, { gap: 6 }]}><View style={[styles.connectionDot, { backgroundColor: crew.stale ? color.muted : color.rust }]}/><Text style={styles.connectionText}>{crew.stale ? crew.workspace ? "Cached" : crew.loading ? "Connecting" : "Not connected" : "Connected"}</Text></View></View>
    {!home && <Reveal><View style={styles.pageHeading}>{caption && <Text style={styles.eyebrow}>{caption}</Text>}<Text accessibilityRole="header" style={styles.title}>{title}</Text></View></Reveal>}
    {crew.storageError ? <Notice danger>{crew.storageError}</Notice> : null}
    {refresh && crew.stale && <Notice>{crew.workspace ? "Cached site records · reconnect for current updates." : "Connecting to your site…"}{crew.error ? ` ${crew.error}` : ""}</Notice>}
    {children}
  </Animated.ScrollView>{footer && <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12), borderTopWidth: 1, borderTopColor: color.line, backgroundColor: color.paper }}>{footer}</View>}</SafeAreaView>;
}
export function SectionHeading({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return <View style={[styles.between, { marginTop: 12 }]}><Text accessibilityRole="header" style={styles.heading}>{title}</Text>{onPress && <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={action} style={styles.iconButton}><Icon name="arrow-up-right" size={22}/></Pressable>}</View>;
}
export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.paper }, page: { paddingHorizontal: 24, paddingTop: 8, gap: 24, width: "100%", maxWidth: 620, alignSelf: "center" },
  masthead: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: color.line, paddingBottom: 12 },
  wordmark: { fontFamily: font.medium, color: color.ink, fontSize: 29, letterSpacing: -1.8 }, cross: { color: color.rust, fontSize: 23, marginTop: -3 }, brandCaption: { fontSize: 11, color: color.muted, marginLeft: 8 },
  connectionDot: { width: 5, height: 5, borderRadius: 3 }, connectionText: { fontSize: 10, color: color.muted },
  pageHeading: { gap: 6, paddingTop: 9, paddingBottom: 2 }, title: { fontFamily: font.regular, color: color.ink, fontSize: 38, letterSpacing: -1.6, lineHeight: 42 },
  heading: { fontFamily: font.medium, color: color.ink, fontSize: 22, letterSpacing: -.6, lineHeight: 28 },
  body: { fontFamily: font.regular, color: color.ink, fontSize: 15, lineHeight: 23 }, small: { fontFamily: font.regular, color: color.muted, fontSize: 12, lineHeight: 19 },
  eyebrow: { fontFamily: font.medium, color: color.muted, fontSize: 10, letterSpacing: 1.7, textTransform: "uppercase", marginBottom: 3 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 }, between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  card: { backgroundColor: color.soft, borderRadius: 8, padding: 20, gap: 14 },
  button: { minHeight: 58, borderRadius: 6, backgroundColor: color.rust, paddingLeft: 18, paddingRight: 8, paddingVertical: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  buttonText: { fontFamily: font.medium, color: color.white, fontSize: 15, flexShrink: 1 }, buttonIcon: { width: 40, height: 40, backgroundColor: "#ffffff12", borderRadius: 4, alignItems: "center", justifyContent: "center" }, secondary: { backgroundColor: "transparent", borderBottomWidth: 1, borderBottomColor: color.line, borderRadius: 0 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  notice: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: color.soft, padding: 14, borderLeftWidth: 2, borderLeftColor: "#8b987b" },
  input: { minHeight: 54, backgroundColor: color.white, borderRadius: 5, padding: 15, color: color.ink, fontFamily: font.regular, fontSize: 16, borderBottomWidth: 1, borderColor: color.line },
  label: { fontFamily: font.medium, color: color.ink, fontSize: 12, marginBottom: 9 },
  chip: { minHeight: 46, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 4, backgroundColor: "transparent", borderWidth: 1, borderColor: color.line, flexDirection: "row", alignItems: "center", gap: 8 },
  chipActive: { backgroundColor: color.accent, borderColor: "#7d896c" }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  listRow: { paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: color.line, gap: 5 },
});
