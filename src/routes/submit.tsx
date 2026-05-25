import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertCircle, Clock, Upload, Send, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/submit")({ component: SubmitPage });

type Status = "pending" | "approved" | "rejected" | "submitted" | "failed";

interface Submission {
  id: string;
  order_number: string;
  first_name: string;
  last_name: string;
  cnic: string;
  mobile_number: string;
  landline_number: string | null;
  address: string;
  email: string | null;
  customer_type: string;
  connection_type: string;
  document_received_date: string;
  document_received_from: string | null;
  zone: string | null;
  region: string | null;
  exchange: string | null;
  mrc: string | null;
  filled_sof_url: string | null;
  cnic_copy_url: string | null;
  utility_bill_url: string | null;
  status: Status;
  admin_remarks: string | null;
  cops_result: string | null;
  error_message: string | null;
  created_at: string;
}

function SubmitPage() {
  const { session, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!session) return <Navigate to="/login" />;
  return <AppShell><SubmitPanel /></AppShell>;
}

function SubmitPanel() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const [tab, setTab] = useState<"form" | "my" | "admin">("form");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSubmissions();
    const ch = supabase.channel("submissions-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "order_submissions" }, () => loadSubmissions())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function loadSubmissions() {
    const { data } = await supabase.from("order_submissions").select("*").order("created_at", { ascending: false });
    if (data) setSubmissions(data as Submission[]);
  }

  const mySubmissions = submissions.filter(s => s.requester_id === user?.id);
  const allSubmissions = submissions;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Order Verification Submission</h1>
        <p className="mt-1 text-sm text-muted-foreground">Form bharo → Admin approve kare → Extension COPS mein submit kare</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[
          { key: "form", label: "New Order" },
          { key: "my", label: `My Submissions (${mySubmissions.length})` },
          ...(isAdmin ? [{ key: "admin", label: `Admin Panel (${allSubmissions.filter(s => s.status === "pending").length} pending)` }] : []),
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "form" && <OrderForm onSubmitted={() => { loadSubmissions(); setTab("my"); }} />}
      {tab === "my" && <SubmissionsList submissions={mySubmissions} isAdmin={false} onRefresh={loadSubmissions} />}
      {tab === "admin" && isAdmin && <SubmissionsList submissions={allSubmissions} isAdmin={true} onRefresh={loadSubmissions} />}
    </div>
  );
}

function OrderForm({ onSubmitted }: { onSubmitted: () => void }) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    order_number: "", first_name: "", last_name: "", cnic: "",
    mobile_number: "", landline_number: "", address: "", email: "",
    customer_type: "Residential", connection_type: "New Order",
    document_received_date: new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }),
    document_received_from: "", zone: "North", region: "", exchange: "", mrc: "",
  });
  const [files, setFiles] = useState<{ sof?: File; cnic?: File; bill?: File }>({});

  function f(key: string, val: string) { setForm(p => ({ ...p, [key]: val })); }

  async function uploadFile(file: File, path: string): Promise<string | null> {
    const { data, error } = await supabase.storage.from("order-docs").upload(path, file, { upsert: true });
    if (error) { toast.error("File upload failed: " + error.message); return null; }
    const { data: { publicUrl } } = supabase.storage.from("order-docs").getPublicUrl(data.path);
    return publicUrl;
  }

  async function handleSubmit() {
    if (!form.order_number || !form.first_name || !form.last_name || !form.cnic || !form.mobile_number || !form.address) {
      toast.error("Zaruri fields fill karein (*) "); return;
    }
    if (form.order_number.replace(/-/g, "").length < 13) { toast.error("Order number 14 digits hona chahiye"); return; }
    if (!files.sof || !files.cnic || !files.bill) { toast.error("Teenon files zaruri hain"); return; }

    setSubmitting(true);
    try {
      const ts = Date.now();
      const sofUrl = await uploadFile(files.sof!, `${user!.id}/${ts}_sof_${files.sof!.name}`);
      const cnicUrl = await uploadFile(files.cnic!, `${user!.id}/${ts}_cnic_${files.cnic!.name}`);
      const billUrl = await uploadFile(files.bill!, `${user!.id}/${ts}_bill_${files.bill!.name}`);
      if (!sofUrl || !cnicUrl || !billUrl) { setSubmitting(false); return; }

      const { error } = await supabase.from("order_submissions").insert({
        requester_id: user!.id,
        ...form,
        filled_sof_url: sofUrl,
        cnic_copy_url: cnicUrl,
        utility_bill_url: billUrl,
        status: "pending",
      });

      if (error) throw error;
      toast.success("Submission ho gayi — admin approval ka wait karein");
      onSubmitted();
    } catch (e: any) {
      toast.error("Error: " + e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base text-green-700">Order Verification Form</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        {/* Order Number */}
        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label>Order Number*</Label>
            <Input placeholder="1-23456789012-3" value={form.order_number} onChange={e => f("order_number", e.target.value)} maxLength={14} />
          </div>
        </div>

        {/* Customer Info */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Customer Information</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div><Label>First Name*</Label><Input value={form.first_name} onChange={e => f("first_name", e.target.value)} /></div>
            <div><Label>Last Name*</Label><Input value={form.last_name} onChange={e => f("last_name", e.target.value)} /></div>
            <div><Label>CNIC*</Label><Input placeholder="12345-1234567-1" value={form.cnic} onChange={e => f("cnic", e.target.value)} maxLength={15} /></div>
            <div><Label>Mobile Number*</Label><Input value={form.mobile_number} onChange={e => f("mobile_number", e.target.value)} maxLength={11} /></div>
            <div><Label>Landline Number</Label><Input value={form.landline_number} onChange={e => f("landline_number", e.target.value)} maxLength={11} /></div>
            <div><Label>Address*</Label><Input value={form.address} onChange={e => f("address", e.target.value)} /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={e => f("email", e.target.value)} /></div>
            <div><Label>Customer Type</Label>
              <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.customer_type} onChange={e => f("customer_type", e.target.value)}>
                <option>Residential</option><option>Commercial</option>
              </select>
            </div>
            <div><Label>Connection Type</Label>
              <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.connection_type} onChange={e => f("connection_type", e.target.value)}>
                <option>New Order</option><option>Restoration</option>
              </select>
            </div>
          </div>
        </div>

        {/* Document Detail */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Document Detail</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div><Label>Filled SOF*</Label><Input type="file" accept=".pdf,.jpg,.png,.bmp,.tif" onChange={e => setFiles(p => ({ ...p, sof: e.target.files?.[0] }))} /></div>
            <div><Label>CNIC/SNIC/NICOP Copy*</Label><Input type="file" accept=".pdf,.jpg,.png,.bmp,.tif" onChange={e => setFiles(p => ({ ...p, cnic: e.target.files?.[0] }))} /></div>
            <div><Label>Utility Bill / Property Doc*</Label><Input type="file" accept=".pdf,.jpg,.png,.bmp,.tif" onChange={e => setFiles(p => ({ ...p, bill: e.target.files?.[0] }))} /></div>
            <div><Label>Document Received Date*</Label><Input value={form.document_received_date} onChange={e => f("document_received_date", e.target.value)} /></div>
            <div><Label>Document Received From</Label><Input value={form.document_received_from} onChange={e => f("document_received_from", e.target.value)} /></div>
            <div><Label>Zone</Label>
              <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.zone} onChange={e => f("zone", e.target.value)}>
                <option>North</option><option>Central</option><option>South</option>
              </select>
            </div>
            <div><Label>Region</Label><Input value={form.region} onChange={e => f("region", e.target.value)} /></div>
            <div><Label>Exchange</Label><Input value={form.exchange} onChange={e => f("exchange", e.target.value)} /></div>
            <div><Label>MRC</Label><Input value={form.mrc} onChange={e => f("mrc", e.target.value)} /></div>
          </div>
        </div>

        <Button onClick={handleSubmit} disabled={submitting} className="w-full sm:w-auto">
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          Submit for Approval
        </Button>
      </CardContent>
    </Card>
  );
}

function SubmissionsList({ submissions, isAdmin, onRefresh }: { submissions: Submission[]; isAdmin: boolean; onRefresh: () => void }) {
  const { user } = useAuth();

  async function handleApprove(id: string) {
    await supabase.from("order_submissions").update({ status: "approved", approved_by: user?.id, approved_at: new Date().toISOString() }).eq("id", id);
    toast.success("Approved! Extension COPS mein submit karega.");
    onRefresh();
  }

  async function handleReject(id: string) {
    const reason = prompt("Rejection reason darj karein:");
    if (!reason) return;
    await supabase.from("order_submissions").update({ status: "rejected", admin_remarks: reason }).eq("id", id);
    toast.success("Rejected.");
    onRefresh();
  }

  if (submissions.length === 0)
    return <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">Koi submission nahi mili.</div>;

  return (
    <div className="space-y-3">
      {submissions.map(s => (
        <Card key={s.id}>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm">{s.order_number}</span>
                  <StatusBadge status={s.status} />
                </div>
                <p className="text-sm">{s.first_name} {s.last_name} — {s.cnic}</p>
                <p className="text-xs text-muted-foreground">{s.mobile_number} • {s.address}</p>
                {s.admin_remarks && <p className="text-xs text-destructive mt-1">Reason: {s.admin_remarks}</p>}
                {s.cops_result && <p className="text-xs text-green-600 mt-1">COPS: {s.cops_result}</p>}
                {s.error_message && <p className="text-xs text-destructive mt-1">Error: {s.error_message}</p>}
                <div className="flex gap-2 mt-2">
                  {s.filled_sof_url && <a href={s.filled_sof_url} target="_blank" className="text-xs text-blue-600 underline">SOF</a>}
                  {s.cnic_copy_url && <a href={s.cnic_copy_url} target="_blank" className="text-xs text-blue-600 underline">CNIC</a>}
                  {s.utility_bill_url && <a href={s.utility_bill_url} target="_blank" className="text-xs text-blue-600 underline">Bill</a>}
                </div>
              </div>
              {isAdmin && s.status === "pending" && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleApprove(s.id)}>
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleReject(s.id)}>
                    <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; className: string; icon: React.ReactNode }> = {
    pending:   { label: "Pending",   className: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: <Clock className="h-3 w-3" /> },
    approved:  { label: "Approved",  className: "bg-blue-100 text-blue-800 border-blue-200",       icon: <CheckCircle2 className="h-3 w-3" /> },
    rejected:  { label: "Rejected",  className: "bg-red-100 text-red-800 border-red-200",          icon: <XCircle className="h-3 w-3" /> },
    submitted: { label: "Submitted", className: "bg-green-100 text-green-800 border-green-200",    icon: <Send className="h-3 w-3" /> },
    failed:    { label: "Failed",    className: "bg-red-100 text-red-800 border-red-200",          icon: <AlertCircle className="h-3 w-3" /> },
  };
  const m = map[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${m.className}`}>
      {m.icon}{m.label}
    </span>
  );
}
