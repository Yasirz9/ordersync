import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

interface Row {
  id: string;
  order_number: string;
  status: string;
  requester_id: string;
  created_at: string;
  updated_at: string;
  error_message: string | null;
}

function AdminPage() {
  const { session, role, loading } = useAuth();
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (!session) return <Navigate to="/login" />;
  if (role !== "admin") return <Navigate to="/" />;
  return (
    <AppShell>
      <AdminDashboard />
    </AppShell>
  );
}

function AdminDashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase
        .from("search_requests")
        .select("id, order_number, status, requester_id, created_at, updated_at, error_message")
        .order("created_at", { ascending: false })
        .limit(50);
      if (mounted) {
        setRows((data as Row[]) ?? []);
        setLoading(false);
      }
    };
    load();

    const ch = supabase
      .channel("admin-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "search_requests" },
        () => load(),
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, []);

  const pending = rows.filter((r) => r.status === "pending" || r.status === "processing").length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin Relay</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aap ki Chrome extension yahan se requests uthati hai. Browser khula rakhein + VPN ON rakhein.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Pending" value={pending} />
        <Stat label="Last hour (total)" value={rows.length} />
        <Stat label="Success" value={rows.filter((r) => r.status === "completed").length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent requests</CardTitle>
          <CardDescription>Auto-deleted after 1 hour.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Abhi tak koi request nahi.</p>
          ) : (
            <div className="divide-y">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <div className="font-mono">{r.order_number}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                  <Badge
                    variant={
                      r.status === "completed"
                        ? "default"
                        : r.status === "failed"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {r.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}