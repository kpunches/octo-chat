
const DEFAULTS = {
  docId: "zR7eW6CJsf",
  sourceDocId: "zR7eW6CJsf",
  commentEngineDocId: "vVCvCSY3jx",
  targetTableId: "grid-GYhi07Ef8b",
  chatsTableId: "grid-TzMLOYO0fU",
  chatMessagesTableId: "grid-Tb0THna6ie",
  engineThreadsTableId: "grid-TzMLOYO0fU",
  engineMessagesTableId: "grid-Tb0THna6ie",
  engineAccessTableId: "grid-ARo8r4rHYO",
  fieldsTableId: "grid-vUUFPHUJhv",
  panelWidth: "390",
  nativeBridgeUrl: ""
};

function $(id) { return document.getElementById(id); }

function cleanToken(token) {
  return String(token || "")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function setStatus(msg, kind = "ok") {
  const el = $("status");
  el.className = kind;
  el.textContent = msg;
}

const STORAGE_KEYS = ["sourceApiToken", "sourceCodaApiToken", "commentEngineApiToken", "engineCodaApiToken", "apiToken", "codaApiToken", "token", "docId", "sourceDocId", "commentEngineDocId", "targetTableId", "chatsTableId", "chatMessagesTableId", "engineThreadsTableId", "engineMessagesTableId", "engineAccessTableId", "fieldsTableId", "panelWidth", "panelOpen", "nativeBridgeUrl"];

async function getBothStores() {
  const local = await chrome.storage.local.get(STORAGE_KEYS);
  let sync = {};
  try {
    sync = await chrome.storage.sync.get(STORAGE_KEYS);
  } catch {}
  return { local, sync };
}

function firstValue(...values) {
  for (const v of values) {
    const s = String(v || "").trim();
    if (s) return s;
  }
  return "";
}

async function load() {
  const { local, sync } = await getBothStores();
  const legacyToken = firstValue(local.apiToken, sync.apiToken, local.codaApiToken, sync.codaApiToken, local.token, sync.token);
  $("sourceApiToken").value = firstValue(local.sourceApiToken, sync.sourceApiToken, local.sourceCodaApiToken, sync.sourceCodaApiToken, legacyToken);
  $("commentEngineApiToken").value = firstValue(local.commentEngineApiToken, sync.commentEngineApiToken, local.engineCodaApiToken, sync.engineCodaApiToken, legacyToken);
  $("docId").value = local.docId || sync.docId || local.sourceDocId || sync.sourceDocId || DEFAULTS.docId;
  $("commentEngineDocId").value = local.commentEngineDocId || sync.commentEngineDocId || DEFAULTS.commentEngineDocId;
  $("engineThreadsTableId").value = local.engineThreadsTableId || sync.engineThreadsTableId || DEFAULTS.engineThreadsTableId;
  $("engineMessagesTableId").value = local.engineMessagesTableId || sync.engineMessagesTableId || DEFAULTS.engineMessagesTableId;
  $("engineAccessTableId").value = local.engineAccessTableId || sync.engineAccessTableId || DEFAULTS.engineAccessTableId;
  $("targetTableId").value = local.targetTableId || sync.targetTableId || DEFAULTS.targetTableId;
  $("fieldsTableId").value = local.fieldsTableId || sync.fieldsTableId || DEFAULTS.fieldsTableId;
  $("panelWidth").value = local.panelWidth || sync.panelWidth || DEFAULTS.panelWidth;
  $("nativeBridgeUrl").value = local.nativeBridgeUrl || sync.nativeBridgeUrl || DEFAULTS.nativeBridgeUrl;
}

async function save() {
  const widthRaw = Number.parseInt($("panelWidth").value, 10);
  const panelWidth = String(Number.isFinite(widthRaw) ? Math.min(560, Math.max(320, widthRaw)) : Number(DEFAULTS.panelWidth));
  const sourceApiToken = cleanToken($("sourceApiToken").value);
  const commentEngineApiToken = cleanToken($("commentEngineApiToken").value);
  const cfg = {
    sourceApiToken,
    sourceCodaApiToken: sourceApiToken,
    commentEngineApiToken,
    engineCodaApiToken: commentEngineApiToken,
    // Legacy aliases remain for older content-script paths; they point to the source doc token.
    apiToken: sourceApiToken,
    codaApiToken: sourceApiToken,
    token: sourceApiToken,
    docId: $("docId").value.trim() || DEFAULTS.docId,
    sourceDocId: $("docId").value.trim() || DEFAULTS.sourceDocId,
    commentEngineDocId: $("commentEngineDocId").value.trim() || DEFAULTS.commentEngineDocId,
    targetTableId: $("targetTableId").value.trim() || DEFAULTS.targetTableId,
    chatsTableId: $("engineThreadsTableId").value.trim() || DEFAULTS.engineThreadsTableId,
    chatMessagesTableId: $("engineMessagesTableId").value.trim() || DEFAULTS.engineMessagesTableId,
    engineThreadsTableId: $("engineThreadsTableId").value.trim() || DEFAULTS.engineThreadsTableId,
    engineMessagesTableId: $("engineMessagesTableId").value.trim() || DEFAULTS.engineMessagesTableId,
    engineAccessTableId: $("engineAccessTableId").value.trim() || DEFAULTS.engineAccessTableId,
    fieldsTableId: $("fieldsTableId").value.trim() || DEFAULTS.fieldsTableId,
    panelWidth,
    nativeBridgeUrl: $("nativeBridgeUrl").value.trim(),
    savedAt: new Date().toISOString()
  };

  await chrome.storage.local.set(cfg);
  try { await chrome.storage.sync.set(cfg); } catch {}

  const { local, sync } = await getBothStores();
  const savedSourceToken = local.sourceApiToken || sync.sourceApiToken || local.apiToken || sync.apiToken || "";
  const savedEngineToken = local.commentEngineApiToken || sync.commentEngineApiToken || "";
  if (!savedSourceToken || !savedEngineToken) {
    setStatus("Save failed: one or both API keys were not found after writing storage.", "bad");
    return cfg;
  }
  setStatus("Saved. Refresh the Coda tab.", "ok");
  return cfg;
}

async function test() {
  const cfg = await save();
  const sourceToken = cleanToken(cfg.sourceApiToken);
  const engineToken = cleanToken(cfg.commentEngineApiToken);
  if (!sourceToken || !engineToken) {
    setStatus("Missing API key. Paste both the Source Doc key and Comment Engine key first.", "bad");
    return;
  }
  setStatus("Testing both API keys...", "ok");
  async function testOne(label, token) {
    const res = await fetch("https://coda.io/apis/v1/whoami", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    if (!res.ok) throw new Error(`${label}: ${body.message || body.raw || `${res.status} ${res.statusText}`}`);
    return body.name || body.email || "authenticated";
  }
  try {
    const sourceWho = await testOne("Source Doc API key", sourceToken);
    const engineWho = await testOne("Comment Engine API key", engineToken);
    setStatus(`API OK. Source: ${sourceWho}. Comment Engine: ${engineWho}. Refresh the Coda tab.`, "ok");
  } catch (err) {
    setStatus(`API test failed: ${err.message || String(err)}`, "bad");
  }
}

$("save").addEventListener("click", save);
$("test").addEventListener("click", test);
load();


// wguAliasTokenSaveListener: defensive alias write for content-script compatibility.
document.addEventListener("click", async (ev) => {
  const target = ev.target;
  if (!target || !(target instanceof HTMLElement)) return;
  const txt = (target.textContent || "").toLowerCase();
  const id = (target.id || "").toLowerCase();
  if (!id.includes("save") && !txt.includes("save")) return;

  const sourceEl = document.getElementById("sourceApiToken") || document.getElementById("apiToken") || document.getElementById("codaApiToken") || document.getElementById("token");
  const engineEl = document.getElementById("commentEngineApiToken");
  const sourceToken = sourceEl?.value?.trim?.() || "";
  const engineToken = engineEl?.value?.trim?.() || "";
  if (!sourceToken && !engineToken) return;

  const aliases = {
    ...(sourceToken ? { sourceApiToken: sourceToken, sourceCodaApiToken: sourceToken, apiToken: sourceToken, codaApiToken: sourceToken, token: sourceToken } : {}),
    ...(engineToken ? { commentEngineApiToken: engineToken, engineCodaApiToken: engineToken } : {})
  };
  try {
    await chrome.storage.local.set(aliases);
    await chrome.storage.sync.set(aliases);
    console.log("[WGU Coda Comments] Token aliases saved.");
  } catch (err) {
    console.error("[WGU Coda Comments] Could not save token aliases.", err);
  }
}, true);
