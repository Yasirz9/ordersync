// extension/sb.js  — REPLACE existing sb.js with this
// Added: fetchPendingSms, claimSmsRequest, updateSmsRequest

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
const TOKENS_KEY = "sb_tokens_v1";

export async function getTokens() { const r = await chrome.storage.local.get(TOKENS_KEY); return r[TOKENS_KEY] || null; }
async function setTokens(t) { await chrome.storage.local.set({ [TOKENS_KEY]: t }); }
export async function clearTokens() { await chrome.storage.local.remove(TOKENS_KEY); }

export async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || data.error || "Sign in failed");
  await setTokens({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + (data.expires_in - 60) * 1000, user: data.user });
  return data.user;
}

async function refresh() {
  const t = await getTokens(); if (!t?.refresh_token) throw new Error("Not signed in");
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: t.refresh_token }),
  });
  const data = await res.json();
  if (!res.ok) { await clearTokens(); throw new Error("Session expired, please sign in again"); }
  await setTokens({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + (data.expires_in - 60) * 1000, user: data.user });
  return data.access_token;
}

export async function getAccessToken() { const t = await getTokens(); if (!t) return null; if (Date.now() > t.expires_at) return await refresh(); return t.access_token; }
async function authHeaders() { const token = await getAccessToken(); if (!token) throw new Error("Not signed in"); return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }; }

// ── Existing: Order search_requests ──────────────────────────────────────────
export async function fetchPending() {
  const headers = await authHeaders();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/search_requests?status=eq.pending&select=id,order_number,requester_id&order=created_at.asc&limit=10`, { headers });
  if (!res.ok) throw new Error(`Fetch pending failed: ${res.status}`);
  return await res.json();
}
export async function updateRequest(id, patch) {
  const headers = { ...(await authHeaders()), Prefer: "return=minimal" };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/search_requests?id=eq.${id}`, { method: "PATCH", headers, body: JSON.stringify(patch) });
  if (!res.ok) throw new Error(`Update failed: ${res.status} ${await res.text()}`);
}
export async function claimRequest(id) {
  const headers = { ...(await authHeaders()), Prefer: "return=representation" };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/search_requests?id=eq.${id}&status=eq.pending`, { method: "PATCH", headers, body: JSON.stringify({ status: "processing" }) });
  if (!res.ok) return false;
  const arr = await res.json();
  return Array.isArray(arr) && arr.length > 0;
}

// ── New: sms_requests ─────────────────────────────────────────────────────────
export async function fetchPendingSms() {
  const headers = await authHeaders();
  // Fetch all pending SMS requests; select fields extension needs
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sms_requests` +
    `?status=eq.pending` +
    `&select=id,order_number,action_type,cnic,verification_code,record_id,mobile_number,email,new_mobile,new_email,customer_name` +
    `&order=created_at.asc&limit=10`,
    { headers }
  );
  if (!res.ok) throw new Error(`Fetch pending SMS failed: ${res.status}`);
  return await res.json();
}

export async function claimSmsRequest(id) {
  const headers = { ...(await authHeaders()), Prefer: "return=representation" };
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sms_requests?id=eq.${id}&status=eq.pending`,
    { method: "PATCH", headers, body: JSON.stringify({ status: "processing" }) }
  );
  if (!res.ok) return false;
  const arr = await res.json();
  return Array.isArray(arr) && arr.length > 0;
}

export async function updateSmsRequest(id, patch) {
  const headers = { ...(await authHeaders()), Prefer: "return=minimal" };
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sms_requests?id=eq.${id}`,
    { method: "PATCH", headers, body: JSON.stringify(patch) }
  );
  if (!res.ok) throw new Error(`SMS update failed: ${res.status} ${await res.text()}`);
}
