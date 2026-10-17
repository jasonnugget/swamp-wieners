import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { randomUUID } from "expo-crypto";

export async function capturePhoto(source: "camera" | "library") {
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error("Camera access is off. Allow it in iPhone Settings, or choose an existing photo.");
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: false, quality: 0.8, exif: false };
  const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return;
  const asset = result.assets[0];
  const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  context.resize(asset.width >= asset.height ? { width: Math.min(asset.width, 1600) } : { height: Math.min(asset.height, 1600) });
  const rendered = await context.renderAsync();
  const image = await rendered.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.72, base64: true });
  if (!image.base64 || image.base64.length > 5_500_000 || image.base64.length * 3 / 4 > 4 * 1024 * 1024) throw new Error("This photo is too large. Try another photo or crop it in Photos first.");
  if (!FileSystem.documentDirectory) throw new Error("Photo storage is unavailable on this device.");
  const directory = `${FileSystem.documentDirectory}crew-drafts/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const uri = `${directory}${randomUUID()}.jpg`;
  await FileSystem.copyAsync({ from: image.uri, to: uri });
  return uri;
}
export async function photoData(uri: string) {
  return `data:image/jpeg;base64,${await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })}`;
}
