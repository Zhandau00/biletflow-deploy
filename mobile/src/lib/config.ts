/**
 * Where the app finds BiletFlow. Set EXPO_PUBLIC_API_URL (for example
 * http://192.168.1.10:8000/api/v1 for a backend on your computer) to
 * override the address in app.json.
 */
import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; webUrl?: string };

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? "https://biletflow-api.vercel.app/api/v1"
).replace(/\/$/, "");

/** The website, for links people share (promo links, event pages). */
export const WEB_URL = (
  process.env.EXPO_PUBLIC_WEB_URL ?? extra.webUrl ?? "https://biletflow-web-five.vercel.app"
).replace(/\/$/, "");
