import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeInDown, ReduceMotion, useReducedMotion } from "react-native-reanimated";

export function useMotionPreference() {
  const initial = useReducedMotion();
  const [reduced, setReduced] = useState(initial);
  useEffect(() => { const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced); return () => subscription.remove(); }, []);
  return reduced;
}
export function Reveal({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useMotionPreference();
  return <Animated.View style={style} entering={reduced ? undefined : FadeInDown.duration(600).delay(delay).springify().damping(22).reduceMotion(ReduceMotion.System)}>{children}</Animated.View>;
}
