import { useEffect, useRef, useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import * as Location from "expo-location";
import type { HazardReport } from "../../../shared/types";
import { useCrew } from "../state/CrewProvider";
import { categories, draftIssue, taskOptions } from "../lib/report-input";
import { capturePhoto } from "../lib/photos";
import { photoUrl } from "../lib/api";
import { Button, color, Icon, Notice, Page, styles } from "../components/ui";
import SiteMap from "../components/SiteMap";

export default function ReportComposer() {
  const crew = useCrew();
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [accepted, setAccepted] = useState<HazardReport>();
  const [coordinateInput, setCoordinateInput] = useState<{ latitude: string; longitude: string; pin: string }>();
  const submitting = useRef(false);
  const draft = crew.draft, site = crew.workspace?.sites.find(s => s.id === draft?.siteId);
  const team = crew.workspace?.teams.find(t => t.id === draft?.teamId);
  useEffect(() => {
    if (crew.ready && crew.site && !draft && !accepted && !submitting.current) crew.startDraft();
    // The provider creates a draft only once; identity changes never replace it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crew.ready, crew.site?.id, !!draft, accepted]);
  const pin = `${draft?.latitude},${draft?.longitude}`;
  const latitude = coordinateInput?.pin === pin ? coordinateInput.latitude : draft?.latitude.toFixed(5) ?? "";
  const longitude = coordinateInput?.pin === pin ? coordinateInput.longitude : draft?.longitude.toFixed(5) ?? "";
  async function photo(source: "camera" | "library") {
    if (busy) return;
    setBusy(true); setError("");
    try { const uri = await capturePhoto(source); if (uri) crew.editDraft({ photoUri: uri }); }
    catch (e) { setError(e instanceof Error ? e.message : "The photo could not be opened. Try Choose photo."); }
    finally { setBusy(false); }
  }
  async function locate() {
    setBusy(true); setError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error("Location access is off. Tap the map to place the pin, or enter coordinates below.");
      const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      crew.editDraft({ latitude: result.coords.latitude, longitude: result.coords.longitude, pinConfirmed: false });
    } catch (e) { setError(e instanceof Error ? e.message : "Location is unavailable. You can still place the pin manually."); }
    finally { setBusy(false); }
  }
  function applyCoordinates() {
    const lat = Number(latitude), lon = Number(longitude);
    if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { setError("Enter valid latitude (−90 to 90) and longitude (−180 to 180)."); return; }
    setError(""); crew.editDraft({ latitude: lat, longitude: lon, pinConfirmed: false });
  }
  async function send() {
    if (submitting.current || !draft) return;
    const issue = draftIssue(draft);
    if (issue) { setError(issue); return; }
    submitting.current = true; setBusy(true); setError("");
    try { setAccepted(await crew.publish()); }
    catch (e) { setError(e instanceof Error ? e.message : "Sharing failed. Your draft stays on this device."); }
    finally { submitting.current = false; setBusy(false); }
  }
  function close() {
    if (!busy) { if (router.canGoBack()) router.back(); else router.replace("/"); }
  }
  if (accepted) {
    const image = accepted.photoUrl && photoUrl(crew.profile.server, accepted.photoUrl);
    return <Page title="You saw it.\nNow we all know." caption="REPORT SHARED"><View style={{ alignItems: "center", backgroundColor: color.accent, borderRadius: 28, padding: 30, gap: 18 }}><Icon name="check-circle" size={58}/><Text accessibilityRole="header" style={[styles.heading, { textAlign: "center" }]}>Photo, location and observation saved.</Text><Text style={[styles.body, { textAlign: "center" }]}>{accepted.teamName ? `${accepted.teamName} and the shared site history now have this report.` : "Your observation is now part of the shared site history."}</Text></View>{image && <Image source={{ uri: image }} style={{ width: "100%", height: 220, borderRadius: 20 }}/>}<Text style={styles.body}>{accepted.description}</Text><Notice>Selected tasks are on hold until reviewed. The record stays available to later crews and project owners, even after resolution.</Notice><Button title="Back to the crew" icon="arrow-right" onPress={() => router.replace("/")}/><Text style={styles.small}>Saved record {accepted.id.slice(0, 8)} · {new Date(accepted.createdAt).toLocaleString()}</Text></Page>;
  }
  if (!draft || !site) return <Page title="Report a hazard" caption="NEW OBSERVATION"><Notice danger>{error || "Connect to your PlanIT server and choose a site before reporting."}</Notice><Button title="Back to crew setup" onPress={() => router.replace("/crew")}/></Page>;
  const issue = draftIssue(draft);
  return <KeyboardAvoidingView pointerEvents={busy ? "none" : "auto"} style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}><Page title={["A photo says more.", "Put it on the map.", "Give the next crew a heads-up."][step]} caption={`REPORT / ${site.name}`}>
    <View style={styles.between}><View style={styles.row}>{["Photo", "Pin", "Share"].map((label, index) => <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><View style={{ width: 23, height: 23, borderRadius: 12, backgroundColor: step === index ? color.ink : color.line, alignItems: "center", justifyContent: "center" }}><Text style={{ color: step === index ? color.white : color.muted, fontSize: 11 }}>{index + 1}</Text></View><Text style={styles.small}>{label}</Text></View>)}</View><Pressable disabled={busy} accessibilityRole="button" accessibilityLabel="Save draft and close" onPress={close} style={styles.iconButton}><Icon name="x"/></Pressable></View>
    {crew.workspace?.clockMode === "demo" && <Notice>Demonstration workspace · this report uses the server’s demo clock. Switch the workspace to live time in PlanIT Control for field reporting.</Notice>}
    {error ? <Notice danger>{error}</Notice> : null}
    {crew.storageError ? <Notice danger>{crew.storageError}</Notice> : null}
    {step === 0 && <>
      {draft.photoUri ? <Image source={{ uri: draft.photoUri }} style={{ width: "100%", height: 300, borderRadius: 22 }} accessibilityLabel="Photo attached to your unshared draft"/> : <View style={{ padding: 38, alignItems: "center", backgroundColor: color.soft, borderRadius: 24, gap: 18 }}><Icon name="camera" size={60}/><Text style={[styles.body, { textAlign: "center" }]}>Show the hazard and a little of what’s around it.</Text></View>}
      <Button title={draft.photoUri ? "Retake photo" : "Take a photo"} icon="camera" onPress={() => { void photo("camera"); }} busy={busy}/><Button title="Choose photo" icon="image" secondary disabled={busy} onPress={() => { void photo("library"); }}/>
      <Text style={styles.heading}>What kind of hazard?</Text><View style={styles.wrap}>{categories.map(category => <Pressable key={category.id} accessibilityRole="button" accessibilityState={{ selected: draft.category === category.id }} style={[styles.chip, draft.category === category.id && styles.chipActive]} onPress={() => crew.editDraft({ category: category.id })}><Text style={styles.small}>{category.label}</Text></Pressable>)}</View>
      <Button title="Next: pin the location" icon="arrow-right" disabled={!draft.photoUri || busy} onPress={() => { setError(""); setStep(1); }}/>
    </>}
    {step === 1 && <>
      <Text style={styles.body}>Tap the hazard’s exact location or drag the gold pin. It starts at the plant location—not your current position.</Text>
      <SiteMap site={site} pin={{ latitude: draft.latitude, longitude: draft.longitude }} height={360} onPin={pin => crew.editDraft({ ...pin, pinConfirmed: false })}/>
      <Button title="Use my current location" icon="navigation" secondary busy={busy} onPress={() => { void locate(); }}/>
      <View style={{ flexDirection: "row", gap: 10 }}><View style={{ flex: 1 }}><Text style={styles.label}>Latitude</Text><TextInput accessibilityLabel="Hazard latitude" value={latitude} onChangeText={value => setCoordinateInput({ latitude: value, longitude, pin })} keyboardType="numbers-and-punctuation" style={styles.input}/></View><View style={{ flex: 1 }}><Text style={styles.label}>Longitude</Text><TextInput accessibilityLabel="Hazard longitude" value={longitude} onChangeText={value => setCoordinateInput({ latitude, longitude: value, pin })} keyboardType="numbers-and-punctuation" style={styles.input}/></View></View>
      <Button title="Apply coordinates" secondary onPress={applyCoordinates} disabled={busy}/>
      <Button title="Confirm pin & continue" icon="check" disabled={busy} onPress={() => { const lat = Number(latitude), lon = Number(longitude); if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { setError("Enter valid coordinates before confirming the pin."); return; } crew.editDraft({ latitude: lat, longitude: lon, pinConfirmed: true }); setError(""); setStep(2); }}/>
      <Button title="Back to photo" secondary onPress={() => { setStep(0); setError(""); }}/>
    </>}
    {step === 2 && <>
      <View style={[styles.card, styles.row]}><Image source={{ uri: draft.photoUri }} style={{ width: 70, height: 80, borderRadius: 12 }}/><View style={{ flex: 1 }}><Text style={styles.heading}>{site.name}</Text><Text style={styles.small}>{categories.find(c => c.id === draft.category)?.label}</Text><Text style={styles.small}>Pin {draft.latitude.toFixed(5)}, {draft.longitude.toFixed(5)}</Text></View><Icon name="map-pin"/></View>
      <View><Text style={styles.label}>What should the crew know?</Text><TextInput accessibilityLabel="Describe the hazard" value={draft.description} onChangeText={description => crew.editDraft({ description })} placeholder="e.g. Standing water has blocked the equipment access road." multiline textAlignVertical="top" maxLength={2000} style={[styles.input, { minHeight: 120 }]}/></View>
      <View><Text style={styles.label}>Your reporting name</Text>{team ? <View style={styles.wrap}>{team.members.map(author => <Pressable key={author} accessibilityRole="button" accessibilityState={{ selected: draft.author === author }} style={[styles.chip, draft.author === author && styles.chipActive]} onPress={() => crew.editDraft({ author })}><Text>{author}</Text></Pressable>)}</View> : <TextInput accessibilityLabel="Your reporting name" value={draft.author} onChangeText={author => crew.editDraft({ author })} placeholder="First and last name" autoCapitalize="words" maxLength={80} style={styles.input}/>}<Text style={styles.small}>{team ? `Shared as ${team.name}` : "Shared with the site’s connected crews"}</Text></View>
      <Text style={styles.heading}>Which work needs to pause?</Text><View style={{ gap: 8 }}>{taskOptions.map(task => <Pressable key={task.id} accessibilityRole="checkbox" accessibilityState={{ checked: draft.tasks.includes(task.id) }} onPress={() => crew.editDraft({ tasks: draft.tasks.includes(task.id) ? draft.tasks.filter(t => t !== task.id) : [...draft.tasks, task.id] })} style={[styles.chip, { borderRadius: 14 }, draft.tasks.includes(task.id) && styles.chipActive]}><Icon name={draft.tasks.includes(task.id) ? "check-square" : "square"} size={19}/><Text style={styles.body}>{task.label}</Text></Pressable>)}</View>
      <Notice>Selected tasks are put on hold when this report is accepted. Your photo and pin stay in the site’s history for future project owners.</Notice>
      {issue && <Text style={styles.small}>{issue}</Text>}
      <Button title={busy ? "Sharing with the crew…" : "Share hazard"} icon="send" busy={busy} disabled={!!issue} onPress={() => { void send(); }}/>
      <Button title="Back to location" secondary disabled={busy} onPress={() => { setStep(1); setError(""); }}/>
    </>}
    <Text style={[styles.small, { textAlign: "center" }]}>{crew.storageError ? "Keep the app open: this draft could not be saved on your device." : "Your unfinished report stays on this device."} Nothing is shared until you tap Share hazard and the server accepts it.</Text>
    {!busy && <Pressable accessibilityRole="button" onPress={() => Alert.alert("Discard this draft?", "This removes its unshared photo and details from this device.", [{ text: "Keep draft", style: "cancel" }, { text: "Discard", style: "destructive", onPress: () => { submitting.current = true; crew.discardDraft(); close(); } }])} style={{ padding: 12, alignItems: "center" }}><Text style={{ color: color.rust }}>Discard draft</Text></Pressable>}
  </Page></KeyboardAvoidingView>;
}
