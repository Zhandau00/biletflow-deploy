/**
 * Files from the backend (ticket PDFs, calendar files, CSV reports, promo
 * QR codes). The website lets the browser download them; the app saves them
 * to its cache with the sign-in token, then opens the share sheet so they
 * can be saved, printed or opened in another app.
 */
import { Platform, Linking } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import { client } from "@/lib/api";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  ics: "text/calendar",
  csv: "text/csv",
  png: "image/png",
};

/** Download `path` (an API path such as /tickets/{id}/pdf) and share it. */
export async function shareFile(path: string, filename: string) {
  const headers = await client.authHeaders();
  const url = client.url(path);
  if (Platform.OS === "web") {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error("Could not download the file.");
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    return;
  }
  const target = new File(Paths.cache, filename);
  const file = await File.downloadFileAsync(url, target, { headers, idempotent: true });
  const extension = filename.split(".").pop() ?? "";
  if (await Sharing.isAvailableAsync())
    await Sharing.shareAsync(file.uri, { mimeType: MIME[extension], dialogTitle: filename });
  else throw new Error("Sharing files is not available on this device.");
}

/** Open a web page (Google Calendar, maps…) in the in-app browser. */
export async function openLink(url: string) {
  if (Platform.OS === "web") {
    window.open(url, "_blank", "noopener");
    return;
  }
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    await Linking.openURL(url);
  }
}

/** One CSV cell: quoted when needed; formulas (=, +, -, @) are neutralised. */
function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const toCsv = (rows: unknown[][]) => rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";

/** Save rows the screen already has as a CSV file and share it. */
export async function shareCsv(filename: string, rows: unknown[][]) {
  // The BOM makes Excel read Kazakh and Russian names correctly
  const text = "﻿" + toCsv(rows);
  if (Platform.OS === "web") {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    link.download = filename;
    link.click();
    return;
  }
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  await file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: filename });
}
