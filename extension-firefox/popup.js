import { signIn, clearTokens, getTokens } from "./sb.js";
import { DEFAULT_PORTAL_URL } from "./config.js";
const $ = (id) => document.getElementById(id);
async function render() {
  const t = await getTokens();
  if (!t) { $("signedOut").style.display = "block"; $("signedIn").style.display = "none"; return; }
  $("signedOut").style.display = "none"; $("signedIn").style.display = "block";
  const status = await chrome.runtime.sendMessage({ type: "status" });
  $("dot").className = "dot " + (status.signed_in ? "on" : "off");
  $("state").textContent = status.signed_in ? "Connected" : "Disconnected";
  $("count").textContent = String(status.processed_count || 0);
  $("lastPoll").textContent = status.last_poll_at ? "Last check: " + new Date(status.last_poll_at).toLocaleTimeString() : "Waiting for first check...";
  $("err").textContent = status.last_error || "";
  const { portal_url_template } = await chrome.storage.local.get("portal_url_template");
  $("tmpl").value = portal_url_template || DEFAULT_PORTAL_URL;
}
$("signin").addEventListener("click", async () => {
  $("signinErr").textContent = ""; $("signin").disabled = true;
  try { await signIn($("email").value.trim(), $("pwd").value); await chrome.runtime.sendMessage({ type: "poll" }); await render(); }
  catch (e) { $("signinErr").textContent = e.message; } finally { $("signin").disabled = false; }
});
$("signout").addEventListener("click", async () => { await clearTokens(); await render(); });
$("pollNow").addEventListener("click", async () => { $("pollNow").disabled = true; await chrome.runtime.sendMessage({ type: "poll" }); await render(); $("pollNow").disabled = false; });
$("saveTmpl").addEventListener("click", async () => { await chrome.storage.local.set({ portal_url_template: $("tmpl").value.trim() }); $("saveTmpl").textContent = "Saved ✓"; setTimeout(() => ($("saveTmpl").textContent = "Save"), 1200); });
render(); setInterval(render, 2000);