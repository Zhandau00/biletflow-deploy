/** Shared building blocks for the app's screens, in the website's style. */
import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { color, radius, space } from "./theme";
import { useT } from "@/lib/i18n";

export type IconName = keyof typeof Ionicons.glyphMap;

export function Icon({ name, size = 18, tint = color.cream }: { name: IconName; size?: number; tint?: string }) {
  return <Ionicons name={name} size={size} color={tint} />;
}

/** A scrolling page with pull-to-refresh. */
export function Screen({
  children,
  onRefresh,
  refreshing = false,
  scroll = true,
  edges = [],
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  edges?: ("top" | "bottom")[];
}) {
  return (
    <SafeAreaView style={s.screen} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.ember} colors={[color.ember]} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[s.content, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function T({ children, style, muted, small, bold, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; muted?: boolean; small?: boolean; bold?: boolean; numberOfLines?: number }) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[s.text, muted && s.muted, small && s.small, bold && { fontWeight: "700" }, style]}
    >
      {children}
    </Text>
  );
}

export const Eyebrow = ({ children }: { children: ReactNode }) => <Text style={s.eyebrow}>{children}</Text>;
export const H1 = ({ children }: { children: ReactNode }) => <Text style={s.h1}>{children}</Text>;
export const H2 = ({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) => <Text style={[s.h2, style]}>{children}</Text>;

export function Intro({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <View style={{ gap: space.sm, marginBottom: space.sm }}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <H1>{title}</H1>
      {description ? <T muted>{description}</T> : null}
      {action ? <View style={{ marginTop: space.xs }}>{action}</View> : null}
    </View>
  );
}

type ButtonKind = "primary" | "secondary" | "text" | "danger";

export function Button({
  label,
  onPress,
  kind = "primary",
  disabled,
  busy,
  icon,
  small,
  style,
}: {
  label: string;
  onPress?: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  busy?: boolean;
  icon?: IconName;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || busy;
  const text = kind === "primary" ? color.ink : kind === "danger" ? color.bad : kind === "text" ? color.ember : color.cream;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        small && s.buttonSmall,
        kind === "primary" && s.primary,
        kind === "secondary" && s.secondary,
        (kind === "text" || kind === "danger") && s.textButton,
        pressed && { opacity: 0.75 },
        off && { opacity: 0.45 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={text} /> : icon ? <Icon name={icon} size={small ? 14 : 17} tint={text} /> : null}
      <Text style={[s.buttonText, small && { fontSize: 13 }, { color: text }]}>{label}</Text>
    </Pressable>
  );
}

export const Row = ({ children, style, wrap = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; wrap?: boolean }) => (
  <View style={[{ flexDirection: "row", gap: space.sm, alignItems: "center", flexWrap: wrap ? "wrap" : "nowrap" }, style]}>{children}</View>
);

export const Gap = ({ size = space.md }: { size?: number }) => <View style={{ height: size }} />;

export function Field({
  label,
  hint,
  optional,
  ...input
}: TextInputProps & { label: string; hint?: string; optional?: boolean }) {
  const t = useT();
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>
        {label}
        {optional ? <Text style={s.optional}>{" "}{t("Optional")}</Text> : null}
      </Text>
      <TextInput
        placeholderTextColor={color.muted}
        selectionColor={color.ember}
        style={[s.input, input.multiline && { minHeight: 96, textAlignVertical: "top" }]}
        {...input}
      />
      {hint ? <T small muted>{hint}</T> : null}
    </View>
  );
}

export function Notice({ children, error, onDismiss }: { children: ReactNode; error?: boolean; onDismiss?: () => void }) {
  const t = useT();
  return (
    <View
      accessibilityRole={error ? "alert" : undefined}
      style={[s.notice, error && { borderColor: color.bad, backgroundColor: "#2a1419" }]}
    >
      <Icon name={error ? "alert-circle" : "information-circle"} tint={error ? color.bad : color.gold} />
      <View style={{ flex: 1 }}>{typeof children === "string" ? <T>{t(children)}</T> : children}</View>
      {onDismiss ? (
        <Pressable onPress={onDismiss} accessibilityLabel={t("Dismiss")}>
          <Icon name="close" size={16} tint={color.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Empty({ title, description, action, onAction, icon = "sparkles-outline" }: { title: string; description?: string; action?: string; onAction?: () => void; icon?: IconName }) {
  return (
    <View style={s.empty}>
      <Icon name={icon} size={30} tint={color.ember} />
      <H2 style={{ textAlign: "center" }}>{title}</H2>
      {description ? <T muted style={{ textAlign: "center" }}>{description}</T> : null}
      {action && onAction ? <Button label={action} onPress={onAction} icon="arrow-forward" /> : null}
    </View>
  );
}

export function Card({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  if (!onPress) return <View style={[s.card, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }, style]}>
      {children}
    </Pressable>
  );
}

export function Badge({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "live" | "bad" | "warn" }) {
  const tint = tone === "live" ? color.ok : tone === "bad" ? color.bad : tone === "warn" ? color.warn : color.muted;
  return (
    <View style={[s.badge, { borderColor: tint }]}>
      <Text style={[s.badgeText, { color: tint }]}>{label}</Text>
    </View>
  );
}

/** Pill buttons for a short list of choices (tabs, filters). */
export function Chips<V extends string>({
  options,
  value,
  onChange,
  scroll = true,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
  scroll?: boolean;
}) {
  const pills = options.map((o) => {
    const active = o.value === value;
    return (
      <Pressable
        key={o.value}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={() => onChange(o.value)}
        style={[s.chip, active && s.chipActive]}
      >
        <Text style={[s.chipText, active && { color: color.ink }]}>{o.label}</Text>
      </Pressable>
    );
  });
  return scroll ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingVertical: 2 }}>
      {pills}
    </ScrollView>
  ) : (
    <Row>{pills}</Row>
  );
}

/** A labelled field that opens a list to choose from. */
export function Select<V extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (value: V) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value)?.label ?? t("Choose…");
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[s.input, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, disabled && { opacity: 0.5 }]}
      >
        <Text style={s.text} numberOfLines={1}>{current}</Text>
        <Icon name="chevron-down" size={16} tint={color.muted} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <View style={s.sheet}>
            <Text style={[s.label, { marginBottom: space.sm }]}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              renderItem={({ item }) => (
                <Pressable
                  style={s.option}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Text style={[s.text, item.value === value && { color: color.ember, fontWeight: "700" }]}>{item.label}</Text>
                  {item.value === value ? <Icon name="checkmark" tint={color.ember} /> : null}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (value: boolean) => void; hint?: string }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T>{label}</T>
        {hint ? <T small muted>{hint}</T> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: color.ember, false: color.ink700 }}
        thumbColor={color.cream}
      />
    </Pressable>
  );
}

export function Loading({ label }: { label?: string }) {
  const t = useT();
  return (
    <View style={{ padding: space.xl, alignItems: "center", gap: space.sm }}>
      <ActivityIndicator color={color.ember} />
      <T muted small>{label ?? t("Loading…")}</T>
    </View>
  );
}

export function LoadError({ message, retry }: { message: string; retry?: () => void }) {
  const t = useT();
  return (
    <Notice error>
      <T>{message}</T>
      {retry ? <Button kind="text" small label={t("Try again")} onPress={retry} style={{ alignSelf: "flex-start", paddingHorizontal: 0 }} /> : null}
    </Notice>
  );
}

/** Loading, error or the data, for one `useLoad` result. */
export function Loaded<T>({
  data,
  children,
}: {
  data: { data?: T; status: string; error?: Error; reload: () => void };
  children: (value: T) => ReactNode;
}) {
  const t = useT();
  if (data.status === "error" && data.data === undefined)
    return <LoadError message={data.error?.message ?? t("Could not load this.")} retry={data.reload} />;
  if (data.data === undefined) return <Loading />;
  return <>{children(data.data)}</>;
}

export function Stat({ label, value, note, icon }: { label: string; value: string | number; note?: string; icon?: IconName }) {
  return (
    <View style={s.stat}>
      <Row style={{ justifyContent: "space-between" }} wrap={false}>
        <T small muted>{label}</T>
        {icon ? <Icon name={icon} size={16} tint={color.ember} /> : null}
      </Row>
      <Text style={s.statValue}>{value}</Text>
      {note ? <T small muted>{note}</T> : null}
    </View>
  );
}

/** Label / value pairs. */
export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <View style={s.card}>
      {rows.map(([label, value], i) => (
        <View key={label} style={[{ paddingVertical: space.sm, gap: 2 }, i > 0 && { borderTopWidth: 1, borderTopColor: color.line }]}>
          <T small muted>{label}</T>
          {typeof value === "string" || typeof value === "number" ? <T>{value}</T> : value}
        </View>
      ))}
    </View>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <View style={s.track}>
      <View style={[s.trackFill, { width: `${Math.max(0, Math.min(100, value))}%` }]} />
    </View>
  );
}

export const initials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function Avatar({ name }: { name: string }) {
  return (
    <View style={s.avatar}>
      <Text style={{ color: color.ink, fontWeight: "700" }}>{initials(name) || "?"}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ink },
  content: { padding: space.lg, gap: space.md, paddingBottom: 48 },
  text: { color: color.cream, fontSize: 15, lineHeight: 21 },
  muted: { color: color.muted },
  small: { fontSize: 13, lineHeight: 18 },
  eyebrow: { color: color.ember, fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", fontWeight: "600" },
  h1: { color: color.cream, fontSize: 30, lineHeight: 36, fontWeight: "400", fontFamily: "serif", letterSpacing: -0.8 },
  h2: { color: color.cream, fontSize: 20, lineHeight: 26, fontWeight: "500", fontFamily: "serif" },
  label: { color: color.cream, fontSize: 14, fontWeight: "600" },
  optional: { color: color.muted, fontWeight: "400", fontSize: 12 },
  input: {
    backgroundColor: color.ink800,
    borderColor: color.line,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    color: color.cream,
    fontSize: 16,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: 13,
    borderRadius: 999,
  },
  buttonSmall: { paddingHorizontal: space.md, paddingVertical: 8 },
  primary: { backgroundColor: color.ember },
  secondary: { borderWidth: 1, borderColor: color.line, backgroundColor: color.ink800 },
  textButton: { paddingHorizontal: space.sm },
  buttonText: { fontSize: 15, fontWeight: "600" },
  notice: {
    flexDirection: "row",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.ink800,
    alignItems: "flex-start",
  },
  empty: { alignItems: "center", gap: space.md, padding: space.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, borderStyle: "dashed" },
  card: { backgroundColor: color.ink800, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, padding: space.lg, gap: space.sm },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, alignSelf: "flex-start" },
  badgeText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  chip: { borderWidth: 1, borderColor: color.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: color.ink800 },
  chipActive: { backgroundColor: color.cream, borderColor: color.cream },
  chipText: { color: color.cream, fontSize: 14 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: color.ink800, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, maxHeight: "70%" },
  option: { paddingVertical: 14, flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: color.line },
  stat: { flexGrow: 1, flexBasis: 150, backgroundColor: color.ink800, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, padding: space.md, gap: 4 },
  statValue: { color: color.cream, fontSize: 24, fontWeight: "600" },
  track: { height: 6, borderRadius: 3, backgroundColor: color.ink700, overflow: "hidden" },
  trackFill: { height: 6, backgroundColor: color.ember },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: color.gold, alignItems: "center", justifyContent: "center" },
});
