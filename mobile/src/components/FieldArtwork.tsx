import { memo } from "react";
import Svg, { Path, Circle, Line } from "react-native-svg";
import { StyleSheet, View } from "react-native";

/** Original decorative contours. These lines do not represent environmental readings. */
function FieldArtwork({ compact = false }: { compact?: boolean }) {
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={compact ? { width: 48, height: 28, overflow: "hidden" } : StyleSheet.absoluteFill}>
    <Svg width="100%" height="100%" viewBox={compact ? "70 95 160 100" : "0 0 360 400"} preserveAspectRatio="xMidYMid slice">
      {Array.from({ length: 22 }, (_, i) => <Path key={i} d={`M ${-120 + i * 12} 420 C ${300 + i * 8} ${310 - i * 13}, ${-120 + i * 5} ${140 - i * 8}, ${250 + i * 14} -30`} fill="none" stroke={i % 4 === 0 ? "#c7d3af" : "#8b9c7a"} strokeWidth={i % 4 === 0 ? .8 : .45} opacity={compact ? .8 : .24}/>) }
      {!compact && <><Circle cx="275" cy="90" r="51" fill="none" stroke="#c7d3af" opacity=".14"/><Circle cx="275" cy="90" r="34" fill="none" stroke="#c7d3af" opacity=".14"/><Line x1="216" y1="90" x2="334" y2="90" stroke="#c7d3af" opacity=".12"/><Line x1="275" y1="31" x2="275" y2="149" stroke="#c7d3af" opacity=".12"/></>}
    </Svg>
  </View>;
}
export default memo(FieldArtwork);
