/** The event poster: the cover image, or a coloured card in the category's hue. */
import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { eventDate, eventTime } from "@/lib/events";
import { color, poster as hues } from "./theme";

export type PosterInfo = {
  id: string;
  poster: string;
  title: string;
  city: string;
  category: string;
  date: string;
  image?: string | null;
  timeZone: string;
};

export function Poster({ event, compact }: { event: PosterInfo; compact?: boolean }) {
  const hue = hues[event.poster] ?? color.ember;
  const height = compact ? 120 : 220;
  if (event.image)
    return (
      <Image
        source={{ uri: event.image }}
        style={{ width: "100%", height, borderRadius: 16, backgroundColor: color.ink700 }}
        contentFit="cover"
        accessibilityLabel={`Poster for ${event.title}`}
      />
    );
  return (
    <View style={[st.poster, { height, backgroundColor: hue }]} accessibilityLabel={`Poster for ${event.title}`}>
      <View style={st.row}>
        <Text style={st.meta}>{event.category.toUpperCase()}</Text>
        <Text style={st.meta}>{event.city.toUpperCase()}</Text>
      </View>
      <Text style={[st.title, compact && { fontSize: 20, lineHeight: 22 }]} numberOfLines={compact ? 2 : 3}>
        {event.title}
      </Text>
      <View style={st.row}>
        <Text style={st.meta}>{eventDate(event.date, event.timeZone, { day: "numeric", month: "short" }).toUpperCase()}</Text>
        <Text style={st.meta}>{eventTime(event.date, event.timeZone)}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  poster: { borderRadius: 16, padding: 16, justifyContent: "space-between", overflow: "hidden" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  meta: { color: color.ink, fontSize: 10, letterSpacing: 1.2, fontWeight: "700" },
  title: { color: color.ink, fontSize: 32, lineHeight: 34, fontFamily: "serif", fontWeight: "600", letterSpacing: -1 },
});
