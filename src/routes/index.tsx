import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: HomePage,
});

type Status = "pending" | "processing" | "completed" | "failed";
interface SearchRow {
  id: string;
  order_number: string;
  status: Status;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

function HomePage() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" />;
  return (
    <AppShell>
      <SearchPanel />
    </AppShell>
  );
}

function SearchPanel() {
  const { user, role } = useAuth();
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<SearchRow | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!orderNumber.trim() || !user) return;
    setBusy(true);
    setCurrent(null);

    const { data, error } = await supabase
      .from("search_requests")
      .insert({
        requester_id: user.id,
        order_number: orderNumber.trim(),
        status: "pending",
      })
      .select()
      .single();

    if (error || !data) {
      toast.error("Request bhejne mein masla: " + (error?.message ?? "unknown"));
      setBusy(false);
      return;
    }

    const row = data as SearchRow;
    setCurrent(row);

    // Subscribe to updates on this row
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const ch = supabase
      .channel(`req-${row.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "search_requests", filter: `id=eq.${row.id}` },
        (payload) => {
          const updated = payload.new as SearchRow;
          setCurrent(updated);
          if (updated.status === "completed" || updated.status === "failed") {
            setBusy(false);
          }
        },
      )
      .subscribe();
    channelRef.current = ch;

    // Safety timeout
    setTimeout(() => {
      setBusy(false);
    }, 60_000);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Order Search</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Order number daalein. Result live company portal se aayega.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex gap-2">
            <Input
              autoFocus
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="Order number (e.g. 123456)"
              disabled={busy}
            />
            <Button type="submit" disabled={busy || !orderNumber.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2">Search</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {current && <ResultCard row={current} />}

      {role !== "admin" && !claimed && (
        <div className="rounded-md border border-dashed bg-background p-3 text-xs text-muted-foreground">
          First-time setup? Agar aap is system ke admin hain to{" "}
          <button
            className="text-primary underline-offset-4 hover:underline disabled:opacity-50"
            disabled={claiming}
            onClick={async () => {
              setClaiming(true);
              const { data, error } = await supabase.rpc("claim_admin");
              setClaiming(false);
              if (error) {
                toast.error(error.message);
                return;
              }
              if (data === true) {
                setClaimed(true);
                toast.success("Aap ab admin hain. Page refresh karein.");
              } else {
                toast.info("Admin pehle se exist karta hai.");
                setClaimed(true);
              }
            }}
          >
            yahan click karke admin role claim karein
          </button>
          .
        </div>
      )}
    </div>
  );
}

function ResultCard({ row }: { row: SearchRow }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Order #{row.order_number}</CardTitle>
          <CardDescription>
            Request {new Date(row.created_at).toLocaleTimeString()}
          </CardDescription>
        </div>
        <StatusBadge status={row.status} />
      </CardHeader>
      <CardContent>
        {row.status === "pending" && (
          <p className="text-sm text-muted-foreground">
            Admin relay ko bheja gaya. Reply ka intezar...
          </p>
        )}
        {row.status === "processing" && (
          <p className="text-sm text-muted-foreground">Portal se data le rahe hain...</p>
        )}
        {row.status === "failed" && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>{row.error_message ?? "Request fail ho gaya"}</p>
          </div>
        )}
        {row.status === "completed" && row.result && (
          <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(row.result, null, 2)}
          </pre>
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
  return (
    <Badge variant={m.variant} className="gap-1">
      {m.icon}
      {m.label}
    </Badge>
  );
}
