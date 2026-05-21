import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Download } from "lucide-react";

export const Route = createFileRoute("/setup")({
  component: SetupPage,
});

function SetupPage() {
  const { session, role, loading } = useAuth();
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (!session) return <Navigate to="/login" />;
  if (role !== "admin") return <Navigate to="/" />;

  const download = async (file: string) => {
    try {
      const res = await fetch(`/${file}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("Download failed:", err);
      window.open(`/${file}`, "_blank");
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Browser Extension Setup</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Yeh extension sirf aap ki (admin) machine par chalegi. Yahi 14 users ke search requests
            ko portal se fetch karke wapas bhejti hai.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 1 — Extension download karein</CardTitle>
            <CardDescription>Apny browser k mutabiq zip download karein</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button onClick={() => download("cops-relay-extension.zip")}>
              <Download className="mr-2 h-4 w-4" />
              Chrome / Edge / Brave (.zip)
            </Button>
            <Button variant="outline" onClick={() => download("cops-relay-extension-firefox.zip")}>
              <Download className="mr-2 h-4 w-4" />
              Firefox (.zip)
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 2 — Browser mein install karein</CardTitle>
            <CardDescription>One time setup</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-medium mb-1">Chrome / Edge / Brave:</p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Zip ko unzip karein.</li>
                  <li><code className="rounded bg-muted px-1.5 py-0.5">chrome://extensions</code> kholein.</li>
                  <li>Top-right par <strong>Developer mode</strong> ON karein.</li>
                  <li><strong>Load unpacked</strong> → unzipped folder select karein.</li>
                </ol>
              </div>
              <div>
                <p className="font-medium mb-1">Firefox:</p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li><code className="rounded bg-muted px-1.5 py-0.5">about:debugging#/runtime/this-firefox</code> kholein.</li>
                  <li><strong>Load Temporary Add-on</strong> click karein.</li>
                  <li>Unzipped folder mein se <code className="rounded bg-muted px-1.5 py-0.5">manifest.json</code> select karein.</li>
                  <li className="text-muted-foreground">Note: Firefox temporary add-ons browser restart par hat jate hain. Permanent install k liye signed XPI chahiye.</li>
                </ol>
              </div>
              <p>Phir extension icon par click → admin email/password se login karein.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 3 — Use karein</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              <li>
                <strong>VPN</strong> hamesha ON rakhein.
              </li>
              <li>
                <code className="rounded bg-muted px-1.5 py-0.5">cops.ptml.pk</code> par ek tab mein
                logged in rahein.
              </li>
              <li>Extension popup mein "Connected" green dot dikhna chahiye.</li>
              <li>Jab aap online hain, 14 users search kar sakte hain.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}