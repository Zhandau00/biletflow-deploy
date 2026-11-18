/** Pieces shared by the organizer screens. */
import { useState } from "react";
import { View } from "react-native";
import type { ApiEvent } from "@/lib/events";
import { eventDate, eventTime } from "@/lib/events";
import type { StaffRole } from "@/lib/organizer";
import { Field, Row } from "../ui";

export type EventContext = {
  event: ApiEvent;
  role: StaffRole;
  reload: () => void;
  setEvent: (event: ApiEvent) => void;
  notify: (message: string, error?: boolean) => void;
};

export const lifecycleLabel = (value: string) =>
  ({ draft: "Draft", upcoming: "Published", active: "Happening now", completed: "Completed", cancelled: "Cancelled" })[value] ?? value;

export const when = (iso: string, event: Pick<ApiEvent, "timezone">) =>
  `${eventDate(iso, event.timezone, { day: "numeric", month: "short", year: "numeric" })}, ${eventTime(iso, event.timezone)}`;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const validDate = (v: string) => DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
export const validTime = (v: string) => TIME.test(v);

/** A date (YYYY-MM-DD) and time (HH:MM) pair, in Kazakhstan time. */
export function DateTimeFields({
  label,
  date,
  time,
  onDate,
  onTime,
  optional,
  hint,
}: {
  label: string;
  date: string;
  time: string;
  onDate: (v: string) => void;
  onTime: (v: string) => void;
  optional?: boolean;
  hint?: string;
}) {
  return (
    <Row wrap={false} style={{ alignItems: "flex-start" }}>
      <View style={{ flex: 3 }}>
        <Field
          label={label}
          optional={optional}
          value={date}
          onChangeText={onDate}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          hint={date && !validDate(date) ? "Use the form 2026-12-31" : hint}
        />
      </View>
      <View style={{ flex: 2 }}>
        <Field
          label="Time"
          value={time}
          onChangeText={onTime}
          placeholder="HH:MM"
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          hint={time && !validTime(time) ? "Use 24-hour time, 19:30" : undefined}
        />
      </View>
    </Row>
  );
}

/** A number typed into a text field. */
export function useNumber(initial: number) {
  const [text, setText] = useState(String(initial));
  const value = Number(text.replace(/\s/g, ""));
  return { text, setText, value: Number.isFinite(value) ? value : NaN };
}
