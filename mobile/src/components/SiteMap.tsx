import { memo, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { router } from "expo-router";
import type { SiteMapProps } from "./SiteMap.types";
import { color } from "./ui";

function SiteMap({ site, reports = [], pin, onPin, height = 270, fullBleed = false }: SiteMapProps) {
  const map = useRef<MapView>(null);
  const latitude = pin?.latitude, longitude = pin?.longitude;
  useEffect(() => { if (latitude !== undefined && longitude !== undefined) map.current?.animateCamera({ center: { latitude, longitude } }, { duration: 250 }); }, [latitude, longitude, site.id]);
  return <View style={[mapStyle.frame, { height }, fullBleed && { borderRadius: 0 }]}><MapView ref={map} key={site.id} style={StyleSheet.absoluteFill} mapType="hybrid" initialRegion={{ latitude: pin?.latitude ?? site.latitude, longitude: pin?.longitude ?? site.longitude, latitudeDelta: 0.018, longitudeDelta: 0.018 }} onPress={event => { if (event.nativeEvent.action !== "marker-press") onPin?.(event.nativeEvent.coordinate); }} accessibilityLabel={onPin ? "Hazard location map. Tap a location or drag the pin." : `${site.name} hazard map`}>
    <Marker coordinate={{ latitude: site.latitude, longitude: site.longitude }} title={site.name} description="Plant location" pinColor={color.ink}/>
    {reports.map(report => <Marker key={report.id} coordinate={{ latitude: report.latitude, longitude: report.longitude }} title={report.description} description={report.status === "resolved" ? "Resolved · retained in site history" : "Unresolved crew hazard"} pinColor={report.status === "open" ? color.rust : "#6e8975"} onCalloutPress={() => router.push({ pathname: "/report", params: { id: report.id } })}/>)}
    {pin && <Marker coordinate={pin} draggable onDragEnd={event => onPin?.(event.nativeEvent.coordinate)} title="Hazard pin" description="Drag to the exact location" pinColor="#e9bb50"/>}
  </MapView></View>;
}
export default memo(SiteMap);
const mapStyle = StyleSheet.create({ frame: { borderRadius: 8, overflow: "hidden", backgroundColor: color.soft } });
