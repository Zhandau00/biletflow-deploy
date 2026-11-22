/** One admission ticket with its QR code, as shown at the door. */
import { useState } from "react";
import { View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { api } from "@/lib/api";
import { eventDate, eventTime } from "@/lib/events";
import { TICKET_STATUS_LABEL, type TicketDetail } from "@/lib/orders";
import { shareFile } from "./files";
import { openSupport } from "./links";
import { failure } from "./use-load";
import { Button, Card, Eyebrow, H2, Icon, Row, T } from "./ui";
import { color } from "./theme";
import { useT } from "@/lib/i18n";

export function TicketCard({ ticket }: { ticket: TicketDetail }) {
  const t = useT();
  const usable = ticket.status === "valid";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      await shareFile(api.tickets.pdf(ticket.id), `ticket-${ticket.id.slice(0, 8)}.pdf`);
    } catch (e) {
      setError(failure(e, t("Could not get the PDF.")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={!usable ? { opacity: 0.6 } : undefined}>
      <Eyebrow>{t("BILETFLOW / ADMIT ONE")}</Eyebrow>
      <H2>{ticket.ticket_type_name}</H2>
      <T>
        {ticket.attendee_name}
        {ticket.seat ? t(" · {section}, row {row}, seat {number}", { section: ticket.seat.section, row: ticket.seat.row, number: ticket.seat.number }) : ""}
      </T>
      <T muted small>
        {ticket.event.title} · {eventDate(ticket.event.start_at, ticket.event.timezone, { day: "numeric", month: "short" })},{" "}
        {eventTime(ticket.event.start_at, ticket.event.timezone)}
      </T>
      <View style={{ alignItems: "center", paddingVertical: 12 }}>
        {ticket.qr_payload && usable ? (
          <View style={{ backgroundColor: "#fff", padding: 14, borderRadius: 14 }} accessibilityLabel={t("QR code for ticket {slice}", { slice: ticket.id.slice(0, 8) })}>
            <QRCode value={ticket.qr_payload} size={210} ecl="M" />
          </View>
        ) : (
          <View style={{ width: 120, height: 120, borderRadius: 14, backgroundColor: color.ink700, alignItems: "center", justifyContent: "center" }}>
            <Icon name="ticket-outline" size={34} tint={color.muted} />
          </View>
        )}
      </View>
      <T bold style={{ textAlign: "center" }}>
        {TICKET_STATUS_LABEL[ticket.status]}
      </T>
      <T small muted style={{ textAlign: "center" }}>
        {usable ? t("Show this code at the door. Turn your screen brightness up.") : t("This ticket can no longer be used for entry.")}
      </T>
      <T small muted style={{ textAlign: "center", fontFamily: "monospace" }}>
        {ticket.id.slice(0, 8).toUpperCase()}
      </T>
      <Row style={{ justifyContent: "center" }}>
        {usable && <Button small kind="secondary" icon="download-outline" label={t("Ticket PDF")} busy={busy} onPress={download} />}
        <Button
          small
          kind="secondary"
          icon="mail-outline"
          label={t("Get help")}
          onPress={() => openSupport({ event: ticket.event.id, order: ticket.order_id, ticket: ticket.id })}
        />
      </Row>
      {error ? (
        <T small style={{ color: color.bad, textAlign: "center" }}>
          {error}
        </T>
      ) : null}
    </Card>
  );
}
