import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Search, AlertCircle, CheckCircle2, Clock,
  Send, ShieldAlert, User, Phone, Mail, Hash,
  Calendar, MousePointerClick, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/sms")({ component: SmsPage });

type Status = "pending" | "processing" | "completed" | "failed";
type ActionType = "search" | "resend" | "bypass";

interface SmsRow {
  id: string;
  order_number: string;
  action_type: ActionType;
  status: Status;
  customer_name: string | null;
  mobile_number: string | null;
  email: string | null;
  new_email: string | null;
  new_mobile: string | null;
  message_sent: string | null;
  link_opened_at: string | null;
  action_performed: string | null;
  customer_response: string | null;
  sms_status: string | null;
  sms_count: string | null;
  cnic: string | null;
  verification_code: string | null;
  record_id: string | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

function SmsPage() {
  const { session, loading } = useAuth();
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (!session) return <Navigate to="/login" />;
  return <AppShell><SmsPanel /></AppShell>;
}

function SmsPanel() {
  const { user } = useAuth();
  const [orderNumber, setOrderNumber] = useState("");
  const [searching, setSearching] = useState(false);
  const [actionBusy, setActionBusy] = useState<ActionType | null>(null);
  const [searchRow, setSearchRow] = useState<SmsRow | null>(null);
  const [actionRow, setActionRow] = useState<SmsRow | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, []);

  // Fetch latest row from DB directly
  async function fetchRow(id: string): Promise<SmsRow | null> {
    const { data } = await supabase
      .from("sms_requests")
      .select("*")
      .eq("id", id)
      .single();
    return data as SmsRow | null;
  }

  // Watch a row with realtime + polling fallback
  function watchRow(
    row: SmsRow,
    onUpdate: (updated: SmsRow) => void,
    onDone: () => void
  ) {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    if (pollRef.current) clearInterval(pollRef.current);

    // Realtime subscription
    const ch = supabase
      .channel(`sms-${row.id}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public",
        table: "sms_requests", filter: `id=eq.${row.id}`,
      }, (payload) => {
        const updated = payload.new as SmsRow;
        onUpdate(updated);
        if (updated.status === "completed" || updated.status === "failed") {
          cleanup();
          onDone();
        }
      })
      .subscribe();
    channelRef.current = ch;

    // Polling fallback — every 3 seconds
    const poll = setInterval(async () => {
      const fresh = await fetchRow(row.id);
      if (!fresh) return;
      onUpdate(fresh);
      if (fresh.status === "completed" || fresh.status === "failed") {
        cleanup();
        onDone();
      }
    }, 3000);
    pollRef.current = poll;

    // Safety timeout 90s
    setTimeout(() => { cleanup(); onDone(); }, 90_000);

    function cleanup() {
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
  }

  async function insertRequest(action: ActionType, extra?: Record<string, unknown>) {
    if (!user) return null;
    const { data, error } = await supabase
      .from("sms_requests")
      .insert({
        requester_id: user.id,
        order_number: orderNumber.trim(),
        action_type: action,
        status: "pending",
        ...extra,
      })
      .select()
      .single();
    if (error || !data) {
      toast.error("Request bhejne mein masla: " + (error?.message ?? "unknown"));
      return null;
    }
    return data as SmsRow;
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!orderNumber.trim()) return;
    setSearching(true);
    setSearchRow(null);
    setActionRow(null);

    const row = await insertRequest("search");
    if (!row) { setSearching(false); return; }
    setSearchRow(row);

    watchRow(row, (u) => setSearchRow(u), () => setSearching(false));
  }

  async function handleAction(type: "resend" | "bypass") {
    if (!searchRow) return;
    setActionBusy(type);
    setActionRow(null);

    const extra: Record<string, unknown> = {
      cnic: searchRow.cnic,
      verification_code: searchRow.verification_code,
      record_id: searchRow.record_id,
      mobile_number: searchRow.new_mobile || searchRow.mobile_number,
      email: searchRow.new_email || searchRow.email,
      customer_name: searchRow.customer_name,
    };

    const row = await insertRequest(type, extra);
    if (!row) { setActionBusy(null); return; }
    setActionRow(row);

    watchRow(row, (u) => setActionRow(u), () => setActionBusy(null));
  }

  const hasData = searchRow?.status === "completed" && searchRow.customer_name;
  const isDefaulter = searchRow?.customer_response === "Defaulter";
  const isAccepted = searchRow?.customer_response === "Accepted";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">PTCL Order Verification SMS</h1>
        <p className="mt-1 text-sm text-muted-foreground">Order number daalein, customer info dekhein aur SMS resend karein.</p>
      </div>

      {/* Search */}
      <Card>
        <CardHeader><CardTitle className="text-base">Order Search</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              autoFocus
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="Order number daalein (e.g. 1-374218141312)"
              disabled={searching}
            />
            <Button type="submit" disabled={searching || !orderNumber.trim()}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2">Search</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Status while loading */}
      {searchRow && !hasData && <StatusCard row={searchRow} label="Order Info Fetch" />}

      {/* Customer Info */}
      {hasData && searchRow && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Customer Information</CardTitle>
            <ResponseBadge response={searchRow.customer_response} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <InfoField icon={<Hash className="h-3.5 w-3.5" />} label="Order Number" value={searchRow.order_number} />
              <InfoField icon={<User className="h-3.5 w-3.5" />} label="Customer Name" value={searchRow.customer_name} />
              <InfoField icon={<Phone className="h-3.5 w-3.5" />} label="Mobile Number" value={searchRow.mobile_number} />
              <InfoField icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={searchRow.email} />
              <InfoField icon={<Phone className="h-3.5 w-3.5" />} label="New Mobile" value={searchRow.new_mobile} muted={!searchRow.new_mobile} />
              <InfoField icon={<Mail className="h-3.5 w-3.5" />} label="New Email" value={searchRow.new_email} muted={!searchRow.new_email} />
              <InfoField icon={<Calendar className="h-3.5 w-3.5" />} label="Link Sent At" value={searchRow.message_sent} />
              <InfoField icon={<MousePointerClick className="h-3.5 w-3.5" />} label="Link Clicked At" value={searchRow.link_opened_at} />
              <InfoField icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Action Performed" value={searchRow.action_performed} />
              <InfoField icon={<MessageSquare className="h-3.5 w-3.5" />} label="SMS Response" value={searchRow.sms_status} />
              <InfoField icon={<MessageSquare className="h-3.5 w-3.5" />} label="SMS Count" value={searchRow.sms_count} />
              <InfoField icon={<User className="h-3.5 w-3.5" />} label="Customer Response" value={searchRow.customer_response} />
            </div>

            {/* Action Buttons */}
            {!isAccepted && (
              <div className="flex flex-wrap gap-3 border-t pt-4">
                <Button onClick={() => handleAction("resend")} disabled={actionBusy !== null}>
                  {actionBusy === "resend"
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Send className="mr-2 h-4 w-4" />}
                  Resend SMS
                </Button>
                {isDefaulter && (
                  <Button variant="destructive" onClick={() => handleAction("bypass")} disabled={actionBusy !== null}>
                    {actionBusy === "bypass"
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <ShieldAlert className="mr-2 h-4 w-4" />}
                    Bypass Default
                  </Button>
                )}
              </div>
            )}
            {isAccepted && (
              <p className="border-t pt-4 text-sm text-green-600 font-medium">
                ✓ Customer ne accept kar liya — koi action required nahi.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action result */}
      {actionRow && (
        <StatusCard
          row={actionRow}
          label={actionRow.action_type === "resend" ? "Resend SMS" : "Bypass Default"}
        />
      )}
    </div>
  );
}

function InfoField({ icon, label, value, muted }: {
  icon: React.ReactNode; label: string; value: string | null | undefined; muted?: boolean;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}<span>{label}</span>
      </div>
      <p className={`text-sm font-medium truncate ${muted || !value ? "text-muted-foreground italic" : ""}`}>
        {value || "—"}
      </p>
    </div>
  );
}

function StatusCard({ row, label }: { row: SmsRow; label: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">{label}</CardTitle>
        <StatusBadge status={row.status} />
      </CardHeader>
      <CardContent>
        {(row.status === "pending" || row.status === "processing") && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>{row.status === "pending" ? "Extension relay ko request bheja gaya..." : "COPS portal pe kaam ho raha hai..."}</span>
          </div>
        )}
        {row.status === "completed" && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{row.action_type === "search" ? "Data successfully fetch ho gaya." : "SMS successfully bhej diya gaya."}</span>
          </div>
        )}
        {row.status === "failed" && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>{row.error_message ?? "Request fail ho gaya."}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
    pending: { label: "Pending", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
    processing: { label: "Processing", variant: "secondary", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    completed: { label: "Completed", variant: "default", icon: <CheckCircle2 className="h-3 w-3" /> },
    failed: { label: "Failed", variant: "destructive", icon: <AlertCircle className="h-3 w-3" /> },
  };
  const m = map[status];
  return <Badge variant={m.variant} className="gap-1">{m.icon}{m.label}</Badge>;
}

function ResponseBadge({ response }: { response: string | null | undefined }) {
  if (!response) return null;
  const colorMap: Record<string, string> = {
    Accepted: "bg-green-100 text-green-800 border-green-200",
    Defaulter: "bg-red-100 text-red-800 border-red-200",
    Rejected: "bg-orange-100 text-orange-800 border-orange-200",
    Pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  };
  const cls = colorMap[response] ?? "bg-gray-100 text-gray-800 border-gray-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {response}
    </span>
  );
}
