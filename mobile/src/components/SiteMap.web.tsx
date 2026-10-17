// Presentation preview only: real coordinates on a local grid, never a live basemap.
import { memo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { router } from "expo-router";
import type { SiteMapProps } from "./SiteMap.types";
import { color, Text } from "./ui";
function SiteMap({ site, reports = [], pin, onPin, height = 270, fullBleed = false }: SiteMapProps) {
  const [width, setWidth] = useState(360);
  const span = .036;
  const x = (longitude: number) => width / 2 + (longitude - site.longitude) / span * width;
  const y = (latitude: number) => height / 2 - (latitude - site.latitude) / span * height;
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ height, borderRadius: fullBleed ? 0 : 8, overflow: "hidden", backgroundColor: "#cbd1ba" }}><Pressable style={StyleSheet.absoluteFill} accessibilityRole={onPin ? "button" : undefined} accessibilityLabel={onPin ? "Coordinate preview. Tap to place hazard pin; verify coordinates below." : `${site.name} coordinate preview`} onPress={onPin ? event => { const { locationX, locationY } = event.nativeEvent; if (width) onPin({ latitude: site.latitude + (.5 - locationY / height) * span, longitude: site.longitude + (locationX / width - .5) * span }); } : undefined}>
    <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
      {Array.from({ length: 13 }, (_, i) => <Path key={i} d={`M -80 ${i * 45} Q 120 ${i * 38 - 130} 190 ${i * 44} T 440 ${i * 42 - 60}`} fill="none" stroke="#8e9c7d" strokeWidth=".8" opacity=".45"/>)}
      {[60, 120, 180, 240, 300].map(n => <Line key={n} x1={n} x2={n} y1={0} y2={height} stroke="#ffffff38"/>)}
      {[80, 160, 240, 320, 400].map(n => <Line key={n} x1={0} x2={width} y1={n} y2={n} stroke="#ffffff38"/>)}
      <Circle cx={width / 2} cy={height / 2} r={18} fill="none" stroke={color.ink} strokeWidth="1"/><Circle cx={width / 2} cy={height / 2} r={5} fill={color.ink}/>
      <SvgText x={width / 2 + 14} y={height / 2 - 4} fontSize={9} fill={color.ink}>SITE</SvgText>
      {reports.map(report => <Circle key={report.id} cx={x(report.longitude)} cy={y(report.latitude)} r={8} fill={report.status === "open" ? color.rust : color.muted}/>)}
      {pin && <Circle cx={x(pin.longitude)} cy={y(pin.latitude)} r={9} fill="#e9bb50" stroke={color.ink}/>}
    </Svg>
  </Pressable>{reports.map(report => <Pressable key={report.id} accessibilityRole="button" accessibilityLabel={`View hazard: ${report.description}`} onPress={() => router.push({ pathname: "/report", params: { id: report.id } })} style={{ position: "absolute", left: x(report.longitude) - 22, top: y(report.latitude) - 22, width: 44, height: 44 }}/>)}<View pointerEvents="none" style={{ position: "absolute", bottom: fullBleed ? height * .44 : 12, left: 14, right: 14 }}><Text style={{ color: color.ink, fontSize: 10, textAlign: "center" }}>Coordinate preview · Apple Maps on iPhone</Text></View></View>;
}
export default memo(SiteMap);
