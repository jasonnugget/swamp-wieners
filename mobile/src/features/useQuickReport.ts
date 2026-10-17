import { useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import { router } from "expo-router";
import { capturePhoto } from "../lib/photos";
import { useCrew } from "../state/CrewProvider";

/** Open the camera from a report action; saved photos go straight to review. */
export function useQuickReport() {
  const crew = useCrew(), locked = useRef(false);
  const [capturing, setCapturing] = useState(false);
  async function startReport() {
    if (locked.current) return;
    locked.current = true; setCapturing(true);
    try {
      const draft = crew.startDraft();
      if (!draft.photoUri && Platform.OS !== "web") {
        const uri = await capturePhoto("camera");
        if (uri) crew.editDraft({ photoUri: uri });
      }
      router.push("/capture");
    } catch (error) {
      Alert.alert("Camera unavailable", error instanceof Error ? error.message : "Choose an existing photo instead.", [
        { text: "Choose photo instead", onPress: () => router.push("/capture") },
        { text: "Cancel", style: "cancel" },
      ]);
    } finally { locked.current = false; setCapturing(false); }
  }
  return { startReport, capturing };
}
