import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useCrew } from "../../state/CrewProvider";
import { normalizeServer } from "../../lib/api";
import { Button, Icon, Notice, Page, styles } from "../../components/ui";

export default function Crew() {
  const crew = useCrew();
  const [serverInput, setServer] = useState<string>(), [error, setError] = useState("");
  const server = serverInput ?? crew.profile.server;
  function connect() {
    try {
      const address = normalizeServer(server); setError("");
      crew.setProfile(profile => ({ ...profile, server: address, siteId: address === profile.server ? profile.siteId : "", teamId: address === profile.server ? profile.teamId : "" }));
      setServer(undefined); crew.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Check the server address."); }
  }
  return <Page title="Good crews share." caption="YOUR CREW"><Text style={styles.body}>Your observations help the people working beside you—and the people who come after.</Text>
    <View style={styles.card}><Text style={styles.heading}>Reporting identity</Text><Text style={styles.small}>This name travels with your reports. Team rosters come from the shared PlanIT workspace.</Text>
      <Text style={styles.label}>Your name</Text>{crew.team ? <View style={styles.wrap}>{crew.team.members.map(name => <Pressable key={name} accessibilityRole="button" accessibilityState={{ selected: crew.profile.name === name }} style={[styles.chip, crew.profile.name === name && styles.chipActive]} onPress={() => crew.setProfile(p => ({ ...p, name }))}><Text>{name}</Text></Pressable>)}</View> : <TextInput accessibilityLabel="Your reporting name" value={crew.profile.name} onChangeText={name => crew.setProfile(p => ({ ...p, name }))} placeholder="First and last name" autoCapitalize="words" maxLength={80} style={styles.input}/>}
      <Button title={crew.team?.name ?? "Choose a crew team"} icon="users" secondary onPress={() => router.push("/team")}/>
      <Button title={crew.site?.name ?? "Choose a plant"} icon="map-pin" secondary onPress={() => router.push("/sites")}/>
      {crew.team && <Text style={styles.small}>{crew.team.members.length} crew members · {crew.team.siteIds.length} assigned plants</Text>}
    </View>
    <View style={styles.card}><Icon name="radio"/><Text style={styles.heading}>Server connection</Text><Text style={styles.small}>Use the same PlanIT server as your supervisor. On an iPhone, enter your Mac’s Wi-Fi IP address—not localhost.</Text><TextInput accessibilityLabel="PlanIT server address" value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="http://192.168.1.25:3001" style={styles.input}/><Button title={crew.loading ? "Connecting…" : "Connect to PlanIT"} icon="refresh-cw" onPress={connect} busy={crew.loading}/>{(error || crew.error) ? <Notice danger>{error || crew.error}</Notice> : <Text style={styles.small}>{crew.stale ? "Not connected yet" : "Connected · live crew updates enabled"}</Text>}</View>
    {crew.draft && <View style={styles.card}><Text style={styles.heading}>A draft is waiting.</Text><Text style={styles.small}>It is saved on this device and has not been automatically shared.</Text><Button title="Continue draft" secondary icon="edit-3" onPress={() => router.push("/capture")}/><Button title="Discard saved draft" secondary onPress={() => Alert.alert("Discard this draft?", "Its unshared photo and details will be removed from this device.", [{ text: "Keep draft", style: "cancel" }, { text: "Discard", style: "destructive", onPress: crew.discardDraft }])}/></View>}
    <Notice>Accepted reports are saved to the site’s shared history. App sharing does not send background push notifications.</Notice>
  </Page>;
}
