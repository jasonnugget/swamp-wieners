import { useEffect, useRef, useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { router } from "expo-router";
import * as Location from "expo-location";
import type { HazardReport } from "../../../shared/types";
import { useCrew } from "../state/CrewProvider";
import { categories, draftIssue, taskOptions } from "../lib/report-input";
import { capturePhoto } from "../lib/photos";
import { photoUrl } from "../lib/api";
import { Text, Button, color, Icon, Notice, Page, styles } from "../components/ui";
import SiteMap from "../components/SiteMap";
import FieldArtwork from "../components/FieldArtwork";

export default function ReportComposer() {
  const crew = useCrew();
  const [action, setAction] = useState<"photo" | "location" | "share">(), [error, setError] = useState("");
  const [accepted, setAccepted] = useState<HazardReport>();
  const [editName, setEditName] = useState(false), [editTasks, setEditTasks] = useState(false), [editCoordinates, setEditCoordinates] = useState(false);
  const [coordinateInput, setCoordinateInput] = useState<{ latitude: string; longitude: string; pin: string }>();
  const submitting = useRef(false), busy = !!action;
  const draft = crew.draft, site = crew.workspace?.sites.find(s => s.id === draft?.siteId);
  const team = crew.workspace?.teams.find(t => t.id === draft?.teamId);
  useEffect(() => {
    if (crew.ready && crew.site && !draft && !accepted && !submitting.current) crew.startDraft();
    // A route opened directly still needs a draft after provider hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crew.ready, crew.site?.id, !!draft, accepted]);
  const pin = `${draft?.latitude},${draft?.longitude}`;
  const latitude = coordinateInput?.pin === pin ? coordinateInput.latitude : draft?.latitude.toFixed(5) ?? "";
  const longitude = coordinateInput?.pin === pin ? coordinateInput.longitude : draft?.longitude.toFixed(5) ?? "";
  const unappliedCoordinates = !!draft && (latitude !== draft.latitude.toFixed(5) || longitude !== draft.longitude.toFixed(5));

  async function photo(source: "camera" | "library") {
    if (busy) return;
    setAction("photo"); setError("");
    try { const uri = await capturePhoto(source); if (uri) crew.editDraft({ photoUri: uri }); }
    catch (e) { setError(e instanceof Error ? e.message : "The photo could not be opened. Try Choose photo."); }
    finally { setAction(undefined); }
  }
  async function locate() {
    if (busy) return;
    setAction("location"); setError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error("Location access is off. Tap the map to place the hazard pin.");
      const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      crew.editDraft({ latitude: result.coords.latitude, longitude: result.coords.longitude, pinConfirmed: false });
      setCoordinateInput(undefined);
    } catch (e) { setError(e instanceof Error ? e.message : "Location is unavailable. Place the pin manually."); }
    finally { setAction(undefined); }
  }
  function applyCoordinates() {
    const lat = Number(latitude), lon = Number(longitude);
    if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      setError("Enter valid latitude (−90 to 90) and longitude (−180 to 180)."); return;
    }
    crew.editDraft({ latitude: lat, longitude: lon, pinConfirmed: false });
    setCoordinateInput(undefined); setError("");
  }
  async function send() {
    if (submitting.current || busy || !draft) return;
    const issue = unappliedCoordinates ? "Apply your entered coordinates before sharing." : draftIssue({ ...draft, pinConfirmed: true });
    if (issue) { setError(issue); return; }
    submitting.current = true; setAction("share"); setError("");
    try { setAccepted(await crew.publish({ confirmPin: true })); }
    catch (e) { setError(e instanceof Error ? e.message : "Sharing failed. Your draft stays on this device."); }
    finally { submitting.current = false; setAction(undefined); }
  }
  function close() { if (!busy) { if (router.canGoBack()) router.back(); else router.replace("/"); } }

  if (accepted) {
    const image = accepted.photoUrl && photoUrl(crew.profile.server, accepted.photoUrl);
    return <Page title={"You saw it.\nNow we all know."} caption="REPORT SHARED">
      <View style={{ alignItems: "center", backgroundColor: color.accent, borderRadius: 8, padding: 26, gap: 16 }}>
        <Icon name="check-circle" size={54}/>
        <Text accessibilityRole="header" style={[styles.heading, { textAlign: "center" }]}>Photo, pin and observation saved.</Text>
        <Text style={[styles.body, { textAlign: "center" }]}>{accepted.teamName ? `${accepted.teamName} and the shared site history now have this report.` : "Your observation is now part of the shared site history."}</Text>
      </View>
      {image && <Image source={{ uri: image }} style={{ width: "100%", height: 220, borderRadius: 8 }}/>}
      <Text style={styles.body}>{accepted.description}</Text>
      <Notice>Selected tasks are on hold until reviewed. The original evidence stays with the site after resolution.</Notice>
      <Button title="Back to the crew" icon="arrow-right" onPress={() => router.replace("/")}/>
      <Text style={styles.small}>Saved record {accepted.id.slice(0, 8)} · {new Date(accepted.createdAt).toLocaleString()}</Text>
    </Page>;
  }
  if (!draft || !site) return <Page title="Report a hazard" caption="NEW OBSERVATION"><Notice danger>Connect to your Threshold server and choose a site before reporting.</Notice><Button title="Back to crew setup" onPress={() => router.replace("/crew")}/></Page>;
  const issue = unappliedCoordinates ? "Apply your entered coordinates before sharing." : draftIssue({ ...draft, pinConfirmed: true });
  const needsName = editName || !draft.author.trim() || (!!team && !team.members.includes(draft.author));
  const affectedWork = taskOptions.filter(task => draft.tasks.includes(task.id)).map(task => task.label).join(", ");
  const footer = <View style={{ gap: 7 }}>
    {issue && <Text accessibilityRole="alert" style={styles.small}>{issue}</Text>}
    <Button title={action === "share" ? "Sharing with the crew…" : "Confirm pin & share hazard"} icon="send" busy={action === "share"} disabled={!!issue || busy} onPress={() => { void send(); }}/>
    <Text style={[styles.small, { textAlign: "center", fontSize: 10 }]}>Confirms the gold pin · pauses: {affectedWork || "choose affected work"}</Text>
  </View>;
  return <KeyboardAvoidingView pointerEvents={busy ? "none" : "auto"} style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <Page title="Pass it on." caption={`REPORT / ${site.name}`} footer={footer}>
      <View style={styles.between}><Text style={styles.body}>Photo. Pin. Share.</Text><Pressable disabled={busy} accessibilityRole="button" accessibilityLabel="Save draft and close" onPress={close} style={styles.iconButton}><Icon name="x"/></Pressable></View>
      {crew.workspace?.clockMode === "demo" && <Text style={styles.small}>Demo workspace · this report uses the demonstration clock.</Text>}
      {error ? <Notice danger>{error}</Notice> : null}
      {draft.photoUri ? <View style={[styles.row, { alignItems: "stretch" }]}>
        <Image source={{ uri: draft.photoUri }} style={{ width: 104, height: 116, borderRadius: 8 }} accessibilityLabel="Hazard photo ready to share"/>
        <View style={{ flex: 1, justifyContent: "center", gap: 6 }}>
          <Button title="Retake" icon="camera" secondary busy={action === "photo"} onPress={() => { void photo("camera"); }}/>
          <Button title="Choose photo" icon="image" secondary onPress={() => { void photo("library"); }}/>
        </View>
      </View> : <View style={{ gap: 12 }}>
        <View style={{ padding: 24, alignItems: "center", backgroundColor: color.soft, borderRadius: 8, gap: 12 }}><FieldArtwork/><Text style={styles.body}>Show the hazard and a little of what’s around it.</Text></View>
        <Button title="Take a photo" icon="camera" busy={action === "photo"} onPress={() => { void photo("camera"); }}/>
        <Button title="Choose photo" icon="image" secondary onPress={() => { void photo("library"); }}/>
      </View>}
      <View style={{ gap: 10 }}><Text style={styles.label}>Hazard type</Text><View style={styles.wrap}>{categories.map(category => <Pressable key={category.id} accessibilityRole="button" accessibilityState={{ selected: draft.category === category.id }} style={[styles.chip, draft.category === category.id && styles.chipActive]} onPress={() => crew.editDraft({ category: category.id })}><Text style={styles.small}>{category.label}</Text></Pressable>)}</View></View>
      <View><Text style={styles.label}>Add a note · optional</Text><TextInput accessibilityLabel="Hazard note (optional)" value={draft.description} onChangeText={description => crew.editDraft({ description })} placeholder="Anything the photo doesn’t show?" multiline textAlignVertical="top" maxLength={2000} style={[styles.input, { minHeight: 76 }]}/></View>
      <View style={{ gap: 10 }}>
        <Text style={styles.label}>Check the hazard pin</Text>
        <SiteMap site={site} pin={{ latitude: draft.latitude, longitude: draft.longitude }} height={240} onPin={coordinate => { crew.editDraft({ ...coordinate, pinConfirmed: false }); setCoordinateInput(undefined); }}/>
        <Text style={styles.small}>The gold pin starts at the plant. Tap or drag it to the hazard; sharing confirms this location.</Text>
        <Button title={action === "location" ? "Finding your location…" : "Use my location"} icon="navigation" secondary busy={action === "location"} onPress={() => { void locate(); }}/>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: editCoordinates }} onPress={() => setEditCoordinates(value => !value)} style={[styles.between, { minHeight: 44 }]}><Text style={styles.small}>{draft.latitude.toFixed(5)}, {draft.longitude.toFixed(5)} · edit coordinates</Text><Icon name="chevron-down" size={16}/></Pressable>
        {editCoordinates && <>
          <View style={{ flexDirection: "row", gap: 10 }}><View style={{ flex: 1 }}><Text style={styles.label}>Latitude</Text><TextInput accessibilityLabel="Hazard latitude" value={latitude} onChangeText={value => setCoordinateInput({ latitude: value, longitude, pin })} keyboardType="numbers-and-punctuation" style={styles.input}/></View><View style={{ flex: 1 }}><Text style={styles.label}>Longitude</Text><TextInput accessibilityLabel="Hazard longitude" value={longitude} onChangeText={value => setCoordinateInput({ latitude, longitude: value, pin })} keyboardType="numbers-and-punctuation" style={styles.input}/></View></View>
          <Button title="Apply coordinates" secondary onPress={applyCoordinates}/>
        </>}
      </View>
      <View style={{ gap: 10 }}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: needsName }} accessibilityLabel="Change reporting name" onPress={() => setEditName(value => !value)} style={[styles.between, { minHeight: 44 }]}><Text style={[styles.body, { flex: 1 }]}>Reporting as {draft.author || "your name"}{team ? ` · ${team.name}` : ""}</Text><Text style={styles.small}>Change</Text></Pressable>
        {needsName && (team ? <View style={styles.wrap}>{team.members.map(author => <Pressable key={author} accessibilityRole="button" accessibilityState={{ selected: draft.author === author }} style={[styles.chip, draft.author === author && styles.chipActive]} onPress={() => { crew.editDraft({ author }); setEditName(false); }}><Text>{author}</Text></Pressable>)}</View> : <TextInput accessibilityLabel="Your reporting name" value={draft.author} onChangeText={author => crew.editDraft({ author })} placeholder="First and last name" autoCapitalize="words" maxLength={80} style={styles.input}/>)}
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: editTasks }} accessibilityLabel="Change affected work" onPress={() => setEditTasks(value => !value)} style={[styles.between, { minHeight: 44 }]}><Text style={[styles.body, { flex: 1 }]}>Pauses: {affectedWork || "choose affected work"}</Text><Text style={styles.small}>Change</Text></Pressable>
        {editTasks && <View style={{ gap: 8 }}>{taskOptions.map(task => <Pressable key={task.id} accessibilityRole="checkbox" accessibilityState={{ checked: draft.tasks.includes(task.id) }} onPress={() => crew.editDraft({ tasks: draft.tasks.includes(task.id) ? draft.tasks.filter(value => value !== task.id) : [...draft.tasks, task.id] })} style={[styles.chip, draft.tasks.includes(task.id) && styles.chipActive]}><Icon name={draft.tasks.includes(task.id) ? "check-square" : "square"} size={19}/><Text style={styles.body}>{task.label}</Text></Pressable>)}</View>}
      </View>
      <Text style={styles.small}>{crew.storageError ? "Keep the app open: this draft could not be saved on your device." : "Your unshared photo and details stay on this device."} Reports stay in site history for later crews and owners.</Text>
      <Pressable accessibilityRole="button" onPress={() => Alert.alert("Discard this draft?", "This removes its unshared photo and details from this device.", [{ text: "Keep draft", style: "cancel" }, { text: "Discard", style: "destructive", onPress: () => { submitting.current = true; crew.discardDraft(); close(); } }])} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}><Text style={{ color: color.rust }}>Discard draft</Text></Pressable>
    </Page>
  </KeyboardAvoidingView>;
}
