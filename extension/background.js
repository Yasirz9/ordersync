// extension/background.js  — REPLACE existing background.js with this
// Adds: SMS search, Resend SMS, Bypass Default via sms_requests table

import { getAccessToken, fetchPending, claimRequest, updateRequest, fetchPendingSms, claimSmsRequest, updateSmsRequest } from "./sb.js";
import { DEFAULT_PORTAL_URL, SMS_PORTAL_URL } from "./config.js";

const POLL_ALARM = "poll-pending";
chrome.runtime.onInstalled.addListener(() => chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 }));
chrome.alarms.onAlarm.addListener((a) => { if (a.name === POLL_ALARM) poll(); });
chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg?.type === "poll") { poll().then(() => sendResponse({ ok: true })); return true; }
  if (msg?.type === "status") { getStatus().then(sendResponse); return true; }
});

async function getStatus() {
  const token = await getAccessToken().catch(() => null);
  const { last_poll_at, last_error, processed_count } = await chrome.storage.local.get(["last_poll_at", "last_error", "processed_count"]);
  return { signed_in: !!token, last_poll_at: last_poll_at || null, last_error: last_error || null, processed_count: processed_count || 0 };
}

async function poll() {
  try {
    const token = await getAccessToken().catch(() => null);
    if (!token) return;

    // ── 1. Order search requests (existing) ──────────────────────────────
    const pending = await fetchPending();
    await chrome.storage.local.set({ last_poll_at: Date.now(), last_error: null });
    for (const req of pending) {
      const claimed = await claimRequest(req.id);
      if (!claimed) continue;
      try {
        const result = await fetchOrderFromPortal(req.order_number);
        await updateRequest(req.id, { status: "completed", result });
        const { processed_count = 0 } = await chrome.storage.local.get("processed_count");
        await chrome.storage.local.set({ processed_count: processed_count + 1 });
      } catch (err) {
        await updateRequest(req.id, { status: "failed", error_message: String(err?.message || err).slice(0, 500) });
      }
    }

    // ── 2. SMS requests (new) ─────────────────────────────────────────────
    const smsPending = await fetchPendingSms();
    for (const req of smsPending) {
      const claimed = await claimSmsRequest(req.id);
      if (!claimed) continue;
      try {
        let patch;
        if (req.action_type === "search") {
          patch = await smsSearch(req.order_number);
        } else if (req.action_type === "resend") {
          patch = await smsResend(req);
        } else if (req.action_type === "bypass") {
          patch = await smsBypass(req);
        } else {
          throw new Error("Unknown action_type: " + req.action_type);
        }
        await updateSmsRequest(req.id, { status: "completed", ...patch });
        const { processed_count = 0 } = await chrome.storage.local.get("processed_count");
        await chrome.storage.local.set({ processed_count: processed_count + 1 });
      } catch (err) {
        await updateSmsRequest(req.id, { status: "failed", error_message: String(err?.message || err).slice(0, 500) });
      }
    }
  } catch (err) {
    await chrome.storage.local.set({ last_error: String(err?.message || err) });
  }
}

// ── Existing: Order search ────────────────────────────────────────────────────
async function fetchOrderFromPortal(orderNumber) {
  const { portal_url_template } = await chrome.storage.local.get("portal_url_template");
  const url = portal_url_template || DEFAULT_PORTAL_URL;
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const yyyy = today.getFullYear();
  const body = {
    startdate: "01/01/2026",
    enddate: `${mm}/${dd}/${yyyy}`,
    zone: "All", region: "All", exchange: "All",
    orderNumber: String(orderNumber),
    statuses: "All",
  };
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Portal returned ${res.status} (check VPN + login)`);
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("json")) {
    const text = await res.text();
    throw new Error(`Session expired or error page. Re-login to cops.ptml.pk. (${text.slice(0, 200)})`);
  }
  const json = await res.json();
  const records = Array.isArray(json?.d) ? json.d : [];
  const match = records.find((r) => String(r.order_number) === String(orderNumber)) || records[0] || null;
  return { type: "record", url, found: !!match, count: records.length, record: match, all: records };
}

// ── New: SMS Search ───────────────────────────────────────────────────────────
async function smsSearch(orderNumber) {
  const url = SMS_PORTAL_URL + "/Get_Records";
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
    body: JSON.stringify({ orderNumber: String(orderNumber) }),
  });
  if (!res.ok) throw new Error(`SMS portal returned ${res.status} — check VPN + COPS login`);
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("json")) {
    const text = await res.text();
    throw new Error(`Session expired. Re-login to COPS. (${text.slice(0, 200)})`);
  }
  const json = await res.json();
  const d = Array.isArray(json?.d) ? json.d : [];
  if (d.length === 0) throw new Error("No record found for this order number.");
  const r = d[0];
  return {
    customer_name:      r.CustomerName     ?? null,
    mobile_number:      r.MobileNumber     ?? null,
    email:              r.Email            ?? null,
    new_email:          r.New_Email        ?? null,
    new_mobile:         r.New_Mobile       ?? null,
    message_sent:       r.Message_Sent     ?? null,
    link_opened_at:     r.Link_Opend_DateTime ?? null,
    action_performed:   r.Action_Performed ?? null,
    customer_response:  r.customerResponse ?? null,
    sms_status:         r.SMSStatus        ?? null,
    sms_count:          String(r.MessageResent ?? ""),
    cnic:               r.cnic             ?? null,
    verification_code:  r.verification_code ?? null,
    record_id:          String(r.Id ?? ""),
    result: { raw: r },
  };
}

// ── New: Resend SMS ───────────────────────────────────────────────────────────
async function smsResend(req) {
  const url = SMS_PORTAL_URL + "/ResendSMS";
  const body = buildSmsBody(req);
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Resend SMS failed: ${res.status}`);
  const json = await res.json();
  if (json?.d !== "Success") throw new Error("SMS resend nahi hua: " + (json?.d ?? "unknown response"));
  return { result: { action: "resend", response: json.d } };
}

// ── New: Bypass Default ───────────────────────────────────────────────────────
async function smsBypass(req) {
  const url = SMS_PORTAL_URL + "/SendByPassDefaultSMS";
  const body = buildSmsBody(req);
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Bypass SMS failed: ${res.status}`);
  const json = await res.json();
  if (json?.d !== "Success") throw new Error("Bypass SMS nahi hua: " + (json?.d ?? "unknown response"));
  return { result: { action: "bypass", response: json.d } };
}

function buildSmsBody(req) {
  return {
    cnic:              req.cnic              ?? "",
    mobile:            req.mobile_number     ?? "",
    email:             req.email             ?? "",
    orderNo:           req.order_number      ?? "",
    verification_code: req.verification_code ?? "",
    id:                req.record_id         ?? "",
  };
}
