
(() => {
  "use strict";

  const VERSION = "1.10.9";
  let extensionContextInvalidated = false;
  const wguTimeouts = new Set();

  function isExtensionContextError(err) {
    return String(err?.message || err || "").toLowerCase().includes("extension context invalidated");
  }

  function markExtensionContextInvalidated(err) {
    if (!extensionContextInvalidated) {
      extensionContextInvalidated = true;
      // Do not console.warn here; Chrome records warnings on the extension error page.
      console.debug("[WGU Coda Comments] Extension context invalidated. Refresh this Coda tab after reloading/updating the extension.");
    }
    for (const id of wguTimeouts) clearTimeout(id);
    wguTimeouts.clear();
  }

  function safeSetTimeout(fn, ms) {
    const id = setTimeout(async () => {
      wguTimeouts.delete(id);
      if (extensionContextInvalidated) return;
      try {
        await fn();
      } catch (err) {
        if (isExtensionContextError(err)) markExtensionContextInvalidated(err);
        else console.error(err);
      }
    }, ms);
    wguTimeouts.add(id);
    return id;
  }

  const WGU_RUNTIME_MODE = { IDLE: "idle", ACTIVE: "active", COMMENTING: "commenting", NAVIGATING: "navigating" };
  let wguRuntimeMode = WGU_RUNTIME_MODE.IDLE;
  let wguHasRenderableThreads = false;

  const wguPerf = window.__wguPerf = window.__wguPerf || {
    version: "1.10.9",
    runtimeMode: wguRuntimeMode,
    threadsLoaded: 0,
    messagesLoaded: 0,
    apiCalls: 0,
    scrollEvents: 0,
    resizeEvents: 0,
    pointerMoveEvents: 0,
    hoverSurfaceChecks: 0,
    hoverSuppressions: 0,
    iconPositionReflows: 0,
    iconPositionUpdates: 0,
    iconPositionHides: 0,
    iconPositionShows: 0,
    readableViewportRefreshes: 0,
    readableViewportInvalidations: 0,
    readableViewportCacheHits: 0,
    readableViewportCacheMisses: 0,
    scrollContainerDetections: 0,
    scrollFullHighlightReflowSuppressions: 0,
    anchorVisibilityRepairRuns: 0,
    anchorVisibilityRepairAttempts: 0,
    anchorVisibilityRepairSuccesses: 0,
    mutationEvents: 0,
    anchorResolveCalls: 0,
    textIndexBuilds: 0,
    textNodesScanned: 0,
    highlightReflows: 0,
    highlightApplyCalls: 0,
    nativeHighlightSuppressions: 0,
    staleCurrentMatchSuppressions: 0,
    iconsRendered: 0,
    approxIconsRendered: 0,
    layoutReads: 0,
    idleSuppressions: 0,
    writeAttempts: 0,
    blockedWrites: 0,
    lastWriteAt: "",
    lastWriteMethod: "",
    lastWritePath: "",
    lastWriteReason: "",
    lastTimings: [],
    writes: []
  };

  function wguPerfInc(key, by = 1) {
    try { wguPerf[key] = (Number(wguPerf[key]) || 0) + by; } catch {}
  }

  function setWguRuntimeMode(mode, reason = "") {
    if (!Object.values(WGU_RUNTIME_MODE).includes(mode)) mode = WGU_RUNTIME_MODE.IDLE;
    if (wguRuntimeMode === mode) {
      wguPerf.runtimeMode = mode;
      return;
    }
    wguRuntimeMode = mode;
    wguPerf.runtimeMode = mode;
    wguPerf.lastModeReason = reason || "";
    wguPerf.lastModeChangedAt = new Date().toISOString();
    document.documentElement?.setAttribute?.("data-wgu-runtime-mode", mode);
    console.debug("[WGU Coda Comments] runtime mode", mode, reason || "");
  }

  function hasActiveThreadWork() {
    return wguHasRenderableThreads || wguRuntimeMode === WGU_RUNTIME_MODE.COMMENTING || wguRuntimeMode === WGU_RUNTIME_MODE.NAVIGATING;
  }

  function suppressIdleDomWork(reason = "idle") {
    wguPerfInc("idleSuppressions");
    wguPerf.lastIdleSuppression = reason;
    return true;
  }

  function enterIdleMode(reason = "no active threads") {
    wguHasRenderableThreads = false;
    setWguRuntimeMode(WGU_RUNTIME_MODE.IDLE, reason);
  }

  function enterActiveMode(reason = "active threads") {
    wguHasRenderableThreads = true;
    if (wguRuntimeMode === WGU_RUNTIME_MODE.IDLE) setWguRuntimeMode(WGU_RUNTIME_MODE.ACTIVE, reason);
  }

  window.__wguPerfReset = function () {
    for (const key of Object.keys(wguPerf)) {
      if (typeof wguPerf[key] === "number") wguPerf[key] = 0;
    }
    wguPerf.version = "1.11.0";
    wguPerf.runtimeMode = wguRuntimeMode;
    wguPerf.writes = [];
    wguPerf.writeLock = wguWriteLock;
    wguPerf.lastResetAt = new Date().toISOString();
    return window.__wguPerfReport();
  };

  window.__wguPerfReport = function () {
    const report = {
      ...wguPerf,
      runtimeMode: wguRuntimeMode,
      hasRenderableThreads: wguHasRenderableThreads,
      cachedThreads: Array.isArray(lastFetchedPageChats) ? lastFetchedPageChats.length : 0,
      optimisticThreads: optimisticChats?.size || 0,
      renderedIcons: document.querySelectorAll?.(".wgu-coda-comment-icon").length || 0,
      renderedHighlights: document.querySelectorAll?.(".wgu-coda-highlight").length || 0,
      registeredAnchors: anchorRegistryByThreadId?.size || 0
    };
    console.table(report);
    return report;
  };

  window.__wguViewportReport = function () {
    const vp = getReadableViewport({ force: true, reason: "manual report" });
    const anchors = [];
    try {
      for (const [threadId, record] of anchorRegistryByThreadId.entries()) {
        const icon = record?.iconElement instanceof HTMLElement ? record.iconElement : null;
        let anchorRect = null;
        try {
          const rects = rectsForResolvedAnchor(record);
          anchorRect = plainRect(iconAnchorRectForResolved(record, rects) || record?.anchorRect || null);
        } catch {
          anchorRect = plainRect(record?.anchorRect || null);
        }
        anchors.push({
          threadId,
          hash: record?.hash || '',
          status: record?.status || '',
          anchorRect,
          visibleInReadableViewport: !!anchorRect && rectIntersectsViewport(anchorRect, vp.readableViewport, -2),
          iconRect: icon ? plainRect(icon.getBoundingClientRect()) : null,
          iconHiddenReason: icon?.dataset?.wguHiddenReason || '',
          iconConnected: !!icon?.isConnected
        });
        if (anchors.length >= 50) break;
      }
    } catch {}
    const report = {
      ...vp,
      cacheReason: readableViewportCacheReason,
      activeAnchors: anchors
    };
    console.log("[WGU Coda Comments] Viewport report", report);
    return report;
  };

  window.__wguAnchorReport = function () {
    const rows = [];
    try {
      for (const anchor of anchorCacheByHash.values()) {
        const rec = getResolvedAnchorByHash(anchor.hash) || null;
        const resolvedText = rec ? textFromResolved(rec) : "";
        rows.push({
          hash: anchor.hash,
          exact: truncate(anchor.exact || "", 160),
          currentMatchedText: truncate(anchor.currentMatchedText || "", 160),
          resolvedText: truncate(resolvedText || "", 160),
          method: rec?.method || "",
          status: rec?.status || "",
          confidence: rec?.confidence || "",
          textSimilarityOk: resolvedText ? isLikelySameAnchorText(anchor.exact || "", resolvedText, 0.72) : null,
          threadIds: rec?.threadIds || anchor.chatIds || []
        });
      }
    } catch (err) {
      rows.push({ error: String(err?.message || err) });
    }
    console.table(rows);
    return rows;
  };

  let wguWriteLock = false;

  function methodForCodaOptions(options = {}) {
    return String(options?.method || "GET").toUpperCase();
  }

  function isCodaWriteMethod(method) {
    return !["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());
  }

  function inferWriteReason(path, method) {
    const m = String(method || "GET").toUpperCase();
    const cleanPath = String(path || "");
    if (!isCodaWriteMethod(m)) return "read";
    if (/\/rows(?:$|\?)/.test(cleanPath) && m === "POST") return "add-row(s)";
    if (/\/rows\//.test(cleanPath) && (m === "PUT" || m === "PATCH")) return "update-row";
    if (/\/rows\//.test(cleanPath) && m === "DELETE") return "delete-row";
    return "write";
  }

  function auditCodaWrite(path, options = {}, extra = {}) {
    try {
      const method = methodForCodaOptions(options);
      const entry = {
        at: new Date().toISOString(),
        method,
        path: String(path || ""),
        reason: options?.wguReason || inferWriteReason(path, method),
        blocked: !!extra.blocked,
        stack: String(new Error().stack || "").split("\n").slice(2, 9).join("\n")
      };
      wguPerfInc("writeAttempts");
      wguPerf.lastWriteAt = entry.at;
      wguPerf.lastWriteMethod = entry.method;
      wguPerf.lastWritePath = entry.path;
      wguPerf.lastWriteReason = entry.reason;
      if (entry.blocked) wguPerfInc("blockedWrites");
      if (!Array.isArray(wguPerf.writes)) wguPerf.writes = [];
      wguPerf.writes.push(entry);
      if (wguPerf.writes.length > 80) wguPerf.writes.splice(0, wguPerf.writes.length - 80);
      console.debug(`[WGU Coda Comments] Coda write ${entry.blocked ? "BLOCKED" : "AUDIT"}: ${entry.method} ${entry.path}`, entry);
      return entry;
    } catch {
      return null;
    }
  }

  window.__wguSetWriteLock = function (locked = true) {
    wguWriteLock = !!locked;
    wguPerf.writeLock = wguWriteLock;
    console.warn(`[WGU Coda Comments] Diagnostic write lock ${wguWriteLock ? "ENABLED" : "DISABLED"}.`);
    return { writeLock: wguWriteLock };
  };

  window.__wguGetWriteAudit = function () {
    return Array.isArray(wguPerf.writes) ? wguPerf.writes.slice() : [];
  };


  // Coda can rate-limit aggressively when a create flow performs several reads/writes
  // in quick succession. Serialize Coda API calls and retry 429/5xx responses with
  // backoff so users do not get browser alerts for temporary throttling.
  let codaRequestQueue = Promise.resolve();
  let lastCodaRequestAt = 0;
  const CODA_MIN_REQUEST_GAP_MS = 450;
  const CODA_MAX_RETRIES = 4;

  let currentCodaUserCache = null;

  function currentUserInitialsForAvatar() {
    const nameOrEmail = currentCodaUserCache?.name || currentCodaUserCache?.email || "";
    return initialsFor(nameOrEmail || "You");
  }

  async function primeCurrentCodaUserCache() {
    try {
      currentCodaUserCache = await getCurrentCodaUserSafe();
    } catch {
      currentCodaUserCache = currentCodaUserCache || { name: "", email: "" };
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function parseRetryAfterMs(value) {
    if (!value) return 0;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateMs = Date.parse(value);
    if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
    return 0;
  }

  function jitter(ms) {
    return ms + Math.floor(Math.random() * 250);
  }

  async function throttleCodaRequest() {
    const elapsed = Date.now() - lastCodaRequestAt;
    if (elapsed < CODA_MIN_REQUEST_GAP_MS) await sleep(CODA_MIN_REQUEST_GAP_MS - elapsed);
    lastCodaRequestAt = Date.now();
  }

  function enqueueCodaRequest(task) {
    wguPerfInc("apiCalls");
    const run = codaRequestQueue.catch(() => {}).then(task);
    codaRequestQueue = run.catch(() => {});
    return run;
  }

  const COL = {
    fields: {
      displayLabel: "c-yGrcVTCo9v",
      sourceTableName: "c-LuVeVj2nQp",
      fieldKey: "c-WUDxDO2t7E",
      pageName: "c-A05mefM-Iw",
      editTable: "c-lxg8aF0R1z",
      editRowLogic: "c-VFcsXuB5S0",
      viewUrl: "c--3Mi-dbudR",
      useSnippetPicker: "c-IG1lrIl-ta"
    },
    target: {
      commentField: "c-2XlwRQtrPT",
      sourceTableName: "c-ci8o_0scsy",
      sourceRowId: "c-w0jxpPehCd",
      sourceRowUrl: "c-RUKmSa7_xP",
      initialValueSnapshot: "c-z26wMwXCer",
      contextViewUrl: "c-89eKf7qUXk",
      pageUrl: "c-2OyeQ3L309",
      surfaceType: "c-KtEjX3liuw",
      columnId: "c-DJENhOZUrF",
      anchorExactText: "c-8yPT0qIXfw",
      anchorPrefix: "c-is_OrI39hY",
      anchorSuffix: "c-mYFPgQW5HZ",
      anchorTextHash: "c-XwLoKXsEWs",
      anchorStatus: "c-hZKk6CUB4s",
      domPathHint: "c-ROuYN38rLR",
      anchorMatchConfidence: "c-o8UstSP9T-",
      createdByExtension: "c-sjSA64M27C",
      sourceBrowserUrl: "c-mk8KwH-_qM",
      sourcePageUrl: "c-5FP3U7Z2R9"
    },
    chats: {
      commentTarget: "c-hlpwNRacQB",
      whatsOnYourMind: "c-KpscyOn4uO",
      commentLog: "c-krYv0KEOQR",
      pageName: "c-eVcc8gwN06",
      resolved: "c-9AuOT3Wrye",
      currentThreadCount: "c-N_VlbDUPpB",
      chatLabel: "c-XhRsFxBwe_",
      latestChats: "c-LpvViPyU3D",
      textAnchor: "c-423vQgmtcp",
      threadType: "c-y1Q5U0wklm",
      extensionCreated: "c-SKuHLA4GB1",
      lastAnchorMatchConfidence: "c-OFxuWXQcmD",
      currentMatchedText: "c-5SyfvvoFFK",
      extSourceBrowserUrl: "c-sO3Z3ieaQk",
      extSourcePageUrl: "c-yZ_j3vbXDL",
      targetSourceBrowserUrl: "c-4BXUVBE5E-",
      targetSourcePageUrl: "c-4kyE3pO8J_",
      targetPageUrl: "c-m3C8hHTqs-",
      targetAnchorExactText: "c-BSAEXLqNq0",
      targetAnchorPrefix: "c-I_q5uLwvGV",
      targetAnchorSuffix: "c-c9pUdxPOa1",
      targetAnchorStatus: "c-5SGFe4eVHI",
      targetAnchorTextHash: "c-dCUI8fSDza",
      extPageUrl: "c-IbKADzafkT",
      extAnchorExactText: "c-lXdSwGh_SI",
      extAnchorPrefix: "c-9ogBWkXntJ",
      extAnchorSuffix: "c-L_Dc5Wukf0",
      extAnchorTextHash: "c-CqU8aOFU6B",
      extFieldLabel: "c-hCxW3DlDQp",
      extTargetRowId: "c-yrdd9So_3x",
      extAnchorStatus: "c-GGvsUctFyn",
      extPendingSync: "c-gVNV9WQ0MK",
      nativeThreadUri: "c-mqqEfpUvVZ",
      nativeThreadUrl: "c-02eodYzBgw",
      nativeSyncStatus: "c-W4OOQW0hz_",
      nativeLastSyncedAt: "c--MuqyMuD0_",
      nativeLastError: "c-Fn11YwnwAM",
      mentionedText: "c--ALyg1zRv7",
      mentionedEmails: "c-zVrmjipNV9",
      mentionNotificationStatus: "c-IL3xtmQ7PR",
      lastMessagePreview: "c-A4sdJnRCrM",
      lastMessageAt: "c-UCLIvj9i07",
      lastMessageAuthorInitials: "c-aIkCR_mcHa",
      messageCountFast: "c-ZS0liYrwyC",
      legacyCommentLogFrozen: "c-8f8edAnIHF",
      anchorMatchStrategy: "c-IrKsOVXIyV",
      anchorMatchScore: "c-TVViuYZt4W",
      anchorNearestHeading: "c-3Fgbff7FmZ",
      anchorBlockExcerpt: "c-goFScxmKiz",
      anchorPreviousSentence: "c-GjZyd9H3gS",
      anchorNextSentence: "c-xAEw9uhLGX",
      anchorNormalizedSignature: "c-3pwGoo7y3j",
      anchorRareTokens: "c-uqHLtP_d6k",
      anchorSourceTableName: "c-fkQ3gxqO51",
      anchorSourceColumnName: "c-zjmJSZfJiW",
      anchorSourceRowDisplay: "c-CySmKGJxcq",
      anchorDomFingerprint: "c-_dGfJMAm6B",
      anchorBlockIndex: "c-ALwxP0NY45",
      anchorContextCapturedAt: "c-tfqaCVS8nz"
    },
    messages: {
      message: "c-5CADGTTWpy",
      chat: "c-c0s-lFpui2",
      parentMessage: "c-dm6o_7kAbU",
      authorName: "c-LxSE2MSOpO",
      authorEmail: "c-QrAWObrkxG",
      messageType: "c-AI6UEfcH-O",
      createdAt: "c-ZgznEAv-wV",
      editedAt: "c-dACd9Lnzd3",
      mentionedEmails: "c-VarzVyyPsW",
      nativeSyncStatus: "c-fVyocg6NRe",
      nativeThreadUri: "c-fbhsLsCtmS",
      nativeLastError: "c-zx377iVxF2",
      extensionMessageId: "c-jyM0NNtjC7",
      chatRowId: "c-LkxPc_OaL4",
      messageText: "c-O2zAESUaHi"
    }
  };

  const CHAT_ENGINE = {
    docId: "vVCvCSY3jx",
    threadsTableId: "grid-TzMLOYO0fU",
    messagesTableId: "grid-Tb0THna6ie",
    accessTableId: "grid-ARo8r4rHYO",
    threads: {
      threadId: "c-0yz1kz58jp",
      sourceDocId: "c-X-2OMqhRgQ",
      sourceDocName: "c-eyleBhnRgR",
      sourcePageUrl: "c-HCweVMu5nz",
      sourcePageName: "c-eI2ydC-bQu",
      sourceBrowserUrl: "c-mKQ_BM8qnf",
      resolved: "c-n7jDEA0FsN",
      anchorStatus: "c-li5LH5DW6O",
      anchorExactText: "c-Ev3AjrQo4F",
      anchorPrefix: "c-4MlQv4VuOo",
      anchorSuffix: "c-dV4hKlhHVO",
      currentMatchedText: "c-MO-tVfeuFG",
      anchorTextHash: "c-fAxM5H6LLj",
      anchorMatchStrategy: "c-Fw4XRxEMbB",
      anchorMatchScore: "c-Ne6yyqkLmU",
      createdByName: "c-Yz7XX8PtQw",
      createdByEmail: "c-JHFsVDeDEK",
      createdAt: "c-3pGvLJZnvf",
      lastMessagePreview: "c-eRyANX4Nfw",
      lastMessageAt: "c-beMcw_mRc1",
      lastMessageAuthorInitials: "c-rDjG0K-iWx",
      messageCount: "c-oh33mfaoAh",
      resolvedByName: "c-pKVNs_doIs",
      resolvedByEmail: "c-eU4nVX9yZX",
      resolvedAt: "c-UzBnG6Ai1Q",
      nearestHeading: "c-tdmLx4MW-T",
      blockExcerpt: "c-rRQn6faGVd",
      previousSentence: "c-k8HAOtRoth",
      nextSentence: "c-LrbHObzl7X",
      normalizedSignature: "c-5OopNyF7nV",
      rareTokens: "c-ggNDhkHNEr",
      domFingerprint: "c-N0Vw0Wr0tF",
      blockIndex: "c-CI0YcSHS8P",
      contextCapturedAt: "c-cYVdLvM9D_",
      sourceTableName: "c-9kNJm9MrP5",
      sourceRowId: "c-oaD7gmrV25",
      sourceColumnName: "c-M7RjzAuhjq",
      sourceRowDisplay: "c-Vebh_WuzAu",
      fieldLabel: "c-ZVy9lW9wtm",
      anchorApproxTop: "c-lfDEueqmfd",
      anchorApproxLeft: "c-attiZRm0D9",
      anchorApproxHeight: "c-u7i4Ysk61v",
      anchorApproxWidth: "c-wuWNUzOhKj",
      anchorApproxCapturedAt: "c-iXQSjWXwIN",
      anchorApproxPageHeight: "c-dJjYz4Q_-f",
      anchorApproxViewportHeight: "c-V8Pk52i7hb",
      anchorApproxScrollContainer: "c--aIVn9m_15",
      anchorApproxSource: "c-VVjair8UgE",
      anchorApproxConfidence: "c-7KTYVjHEKc"
    },
    messages: {
      messageId: "c-39mx10Y-Ht",
      threadId: "c-5C7IEoEz0Q",
      parentMessageId: "c-Y6ZLJfnAFZ",
      authorName: "c-nvZlX7Rwso",
      authorEmail: "c-_OxABOEKHU",
      authorInitials: "c-Y2f28FZCFl",
      bodyText: "c-FdowNO2FYu",
      messageType: "c-CBcrgslppN",
      createdAt: "c-ZvzD9RwVRi",
      editedAt: "c-C68z6qOpFX",
      deletedAt: "c-yhlQqS95MO",
      mentionedEmails: "c-FIhMhIc3z7",
      clientCreatedAt: "c-S7aLkAxOZb",
      sourceDocId: "c-boK8ZO4dqf",
      sourcePageUrl: "c-10dsl56D5l"
    }
  };

  // In comment-engine mode we intentionally point the existing rendering/access helpers
  // at the lean _Threads schema. Legacy production-doc columns remain below only for
  // target/field discovery while reviewers write comments to the Chat Engine doc.
  Object.assign(COL.chats, {
    commentTarget: "",
    whatsOnYourMind: "",
    commentLog: "",
    pageName: CHAT_ENGINE.threads.sourcePageName,
    resolved: CHAT_ENGINE.threads.resolved,
    currentThreadCount: CHAT_ENGINE.threads.messageCount,
    chatLabel: CHAT_ENGINE.threads.threadId,
    latestChats: CHAT_ENGINE.threads.lastMessagePreview,
    textAnchor: CHAT_ENGINE.threads.anchorExactText,
    threadType: "",
    extensionCreated: "",
    lastAnchorMatchConfidence: "",
    currentMatchedText: CHAT_ENGINE.threads.currentMatchedText,
    extSourceBrowserUrl: CHAT_ENGINE.threads.sourceBrowserUrl,
    extSourcePageUrl: CHAT_ENGINE.threads.sourcePageUrl,
    targetSourceBrowserUrl: CHAT_ENGINE.threads.sourceBrowserUrl,
    targetSourcePageUrl: CHAT_ENGINE.threads.sourcePageUrl,
    targetPageUrl: CHAT_ENGINE.threads.sourcePageUrl,
    targetAnchorExactText: CHAT_ENGINE.threads.anchorExactText,
    targetAnchorPrefix: CHAT_ENGINE.threads.anchorPrefix,
    targetAnchorSuffix: CHAT_ENGINE.threads.anchorSuffix,
    targetAnchorStatus: CHAT_ENGINE.threads.anchorStatus,
    targetAnchorTextHash: CHAT_ENGINE.threads.anchorTextHash,
    extPageUrl: CHAT_ENGINE.threads.sourcePageUrl,
    extAnchorExactText: CHAT_ENGINE.threads.anchorExactText,
    extAnchorPrefix: CHAT_ENGINE.threads.anchorPrefix,
    extAnchorSuffix: CHAT_ENGINE.threads.anchorSuffix,
    extAnchorTextHash: CHAT_ENGINE.threads.anchorTextHash,
    extFieldLabel: CHAT_ENGINE.threads.fieldLabel,
    extTargetRowId: CHAT_ENGINE.threads.sourceRowId,
    extAnchorStatus: CHAT_ENGINE.threads.anchorStatus,
    extPendingSync: "",
    nativeThreadUri: "",
    nativeThreadUrl: "",
    nativeSyncStatus: "",
    nativeLastSyncedAt: "",
    nativeLastError: "",
    mentionedText: "",
    mentionedEmails: "",
    mentionNotificationStatus: "",
    lastMessagePreview: CHAT_ENGINE.threads.lastMessagePreview,
    lastMessageAt: CHAT_ENGINE.threads.lastMessageAt,
    lastMessageAuthorInitials: CHAT_ENGINE.threads.lastMessageAuthorInitials,
    messageCountFast: CHAT_ENGINE.threads.messageCount,
    legacyCommentLogFrozen: "",
    anchorMatchStrategy: CHAT_ENGINE.threads.anchorMatchStrategy,
    anchorMatchScore: CHAT_ENGINE.threads.anchorMatchScore,
    anchorNearestHeading: CHAT_ENGINE.threads.nearestHeading,
    anchorBlockExcerpt: CHAT_ENGINE.threads.blockExcerpt,
    anchorPreviousSentence: CHAT_ENGINE.threads.previousSentence,
    anchorNextSentence: CHAT_ENGINE.threads.nextSentence,
    anchorNormalizedSignature: CHAT_ENGINE.threads.normalizedSignature,
    anchorRareTokens: CHAT_ENGINE.threads.rareTokens,
    anchorSourceTableName: CHAT_ENGINE.threads.sourceTableName,
    anchorSourceColumnName: CHAT_ENGINE.threads.sourceColumnName,
    anchorSourceRowDisplay: CHAT_ENGINE.threads.sourceRowDisplay,
    anchorDomFingerprint: CHAT_ENGINE.threads.domFingerprint,
    anchorBlockIndex: CHAT_ENGINE.threads.blockIndex,
    anchorContextCapturedAt: CHAT_ENGINE.threads.contextCapturedAt,
    anchorApproxTop: CHAT_ENGINE.threads.anchorApproxTop,
    anchorApproxLeft: CHAT_ENGINE.threads.anchorApproxLeft,
    anchorApproxHeight: CHAT_ENGINE.threads.anchorApproxHeight,
    anchorApproxWidth: CHAT_ENGINE.threads.anchorApproxWidth,
    anchorApproxCapturedAt: CHAT_ENGINE.threads.anchorApproxCapturedAt,
    anchorApproxPageHeight: CHAT_ENGINE.threads.anchorApproxPageHeight,
    anchorApproxViewportHeight: CHAT_ENGINE.threads.anchorApproxViewportHeight,
    anchorApproxScrollContainer: CHAT_ENGINE.threads.anchorApproxScrollContainer,
    anchorApproxSource: CHAT_ENGINE.threads.anchorApproxSource,
    anchorApproxConfidence: CHAT_ENGINE.threads.anchorApproxConfidence,
    sourceDocId: CHAT_ENGINE.threads.sourceDocId,
    sourceDocName: CHAT_ENGINE.threads.sourceDocName,
    sourceTableName: CHAT_ENGINE.threads.sourceTableName,
    sourceRowId: CHAT_ENGINE.threads.sourceRowId,
    sourceColumnName: CHAT_ENGINE.threads.sourceColumnName,
    sourceRowDisplay: CHAT_ENGINE.threads.sourceRowDisplay,
    createdByName: CHAT_ENGINE.threads.createdByName,
    createdByEmail: CHAT_ENGINE.threads.createdByEmail,
    createdAt: CHAT_ENGINE.threads.createdAt
  });

  Object.assign(COL.messages, {
    message: CHAT_ENGINE.messages.bodyText,
    chat: CHAT_ENGINE.messages.threadId,
    parentMessage: CHAT_ENGINE.messages.parentMessageId,
    authorName: CHAT_ENGINE.messages.authorName,
    authorEmail: CHAT_ENGINE.messages.authorEmail,
    messageType: CHAT_ENGINE.messages.messageType,
    createdAt: CHAT_ENGINE.messages.createdAt,
    editedAt: CHAT_ENGINE.messages.editedAt,
    mentionedEmails: CHAT_ENGINE.messages.mentionedEmails,
    nativeSyncStatus: "",
    nativeThreadUri: "",
    nativeLastError: "",
    extensionMessageId: CHAT_ENGINE.messages.messageId,
    chatRowId: CHAT_ENGINE.messages.threadId,
    messageText: CHAT_ENGINE.messages.bodyText
  });

  const DEFAULTS = {
    // Source doc is the Coda doc the extension is running against. It can be overridden.
    docId: "zR7eW6CJsf",
    sourceDocId: "zR7eW6CJsf",
    commentEngineDocId: CHAT_ENGINE.docId,
    targetTableId: "grid-GYhi07Ef8b",
    chatsTableId: CHAT_ENGINE.threadsTableId,
    chatMessagesTableId: CHAT_ENGINE.messagesTableId,
    fieldsTableId: "grid-vUUFPHUJhv",
    engineThreadsTableId: CHAT_ENGINE.threadsTableId,
    engineMessagesTableId: CHAT_ENGINE.messagesTableId,
    engineAccessTableId: CHAT_ENGINE.accessTableId,
    panelWidth: "390"
  };


  // NATIVE_CODA_MENTION_NOTE:
  // The @mention picker resolves people from _Users GURPS and stores metadata.
  // Coda notifications require native Coda comment mirroring via the bridge/MCP;
  // plain table/canvas text like "@Keith Punches" will not trigger native notifications.

  const NATIVE_BRIDGE_CONTRACT_VERSION = "2026-05-12.v1";
  const INITIAL_COMMENT_MENTION_KEY = "__initial_comment__";

  const MENTION_NOTIFICATION_QUEUE = {
    tableId: "grid-RHSxTkVqtL",
    columns: {
      notificationId: "c-dmJPq5XQXM",
      status: "c-Lm8C4f905b",
      mentionedName: "c-LMqAZ3cfaq",
      mentionedEmail: "c-Y3XLWXsjTP",
      mentionedCodaPersonId: "c-s7vIIA33jr",
      mentionText: "c-Sxm1upIs_C",
      commentContent: "c-qmjTlf97FM",
      senderName: "c-hW152eq8qH",
      senderEmail: "c-Ne-Z6alZEw",
      chatRowId: "c-W-LX_dvyUP",
      targetRowId: "c-YAequBO8xl",
      sourceField: "c-lEusbisZ6O",
      sourcePageUrl: "c-dvBNcwwxYJ",
      nativeThreadUri: "c-gejhXHLrO0",
      nativeThreadUrl: "c-cjQ6bg-D8-",
      createdAt: "c-FBrsXERLqm",
      sentAt: "c-2VuUKRDGV5",
      lastError: "c-gdSVuQdFnm"
    }
  };

  const NOTIFY_ROUTER_WINDOW_MS = 45 * 60 * 1000;
  const NOTIFY_ROUTER_STORAGE_KEY = "wguNotifyRouterHandledIds";

  const OPTIONAL_EXTENSION_COLUMNS = {
    target: {
      extPageName: "Extension Page Name",
      extPageKey: "Extension Page Key",
      extFieldName: "Extension Field Name",
      extTableName: "Extension Table Name",
      extTableId: "Extension Table ID",
      extViewId: "Extension View ID",
      extColumnName: "Extension Column Name",
      extColumnId: "Extension Column ID",
      sourceBrowserUrl: "Source Browser URL",
      sourcePageUrl: "Source Page URL"
    },
    chats: {
      extPageName: "Extension Page Name",
      extPageKey: "Extension Page Key",
      extTableName: "Extension Table Name",
      extTableId: "Extension Table ID",
      extViewId: "Extension View ID",
      extColumnName: "Extension Column Name",
      extColumnId: "Extension Column ID",
      extSourceBrowserUrl: "Extension Source Browser URL",
      extSourcePageUrl: "Extension Source Page URL"
    }
  };
  const optionalColumnIds = { target: {}, chats: {} };
  const tableColumnCache = new Map();
  const tableInfoCache = new Map();


  const MENTION_DIRECTORY = {
    tableId: "grid--6TaQFCH4e",
    columns: {
      personName: "c-IIIoxmRWmj",
      personCodaEmail: "c-tCLY6b8aHV",
      personEmailManual: "c-j-rM9OHRSp",
      associatedCodaAccount: "c-MJrtCKnxqw",
      userName: "c-GnJdBcHXEX",
      isActive: "c-ukuX2maNtD",
      workspaceMembership: "c-Ks-nX2ZItB",
      docRole: "c-GYKGjGNgG1",
      roleAcronym: "c-kgomAl2QgY",
      image: "c-MGvHOP91H7"
    }
  };

  let selectionPayload = null;
  let lastLoadAt = 0;
  let selectionButton = null;
  let sidebar = null;
  let discussableFields = [];
  let fieldsLoadedAt = 0;
  let activeAnchorHash = "";
  let lastPulseHash = "";
  const anchorCacheByHash = new Map();
  // Runtime registry keyed by the comment/thread row id. This is intentionally
  // separate from anchorCacheByHash: several cards can share the same anchor hash,
  // but card/icon focus must be deterministic by thread id.
  const anchorRegistryByThreadId = new Map();
  const anchorRegistryByHash = new Map();
  const cardRegistryByThreadId = new Map();
  const anchorResolutionSyncCache = new Map();
  const anchorApproxSyncCache = new Map();
  // v1.11.0: keep the just-selected live range available briefly so a new
  // optimistic comment can paint real text immediately instead of waiting for
  // Coda/API formula consistency. Entries are short-lived and never persisted.
  const optimisticAnchorRangeByHash = new Map();
  let stagedAnchorFocusTxn = 0;
  const expandedReplyIds = new Set();
  // v1.9.42: full thread history is no longer shown in card UI; keep state internal only.
  const optimisticChats = new Map();
  const optimisticReplyOverrides = new Map();
  const optimisticStatusOverrides = new Map();
  const optimisticResolvedIds = new Set();

  // v1.11.1: Local-first runtime store. This is the intentional middle layer
  // between durable Coda tables and Coda's volatile/virtualized SPA DOM. The UI
  // should render from this memory-first store; Coda sync reconciles into it in
  // the background. DOM references are short-lived hints only.
  const runtimeStore = {
    threadsByKey: new Map(),
    pendingThreadsByHash: new Map(),
    anchorSnapshotsByHash: new Map(),
    liveRangesByHash: new Map(),
    lastCodaSyncAt: 0,
    lastRuntimeMutationAt: 0,
    lastAuthoritativeEmptyAt: 0,
    lastSessionSaveAt: 0,
    anchorPositionsByHash: new Map()
  };
  const replyDrafts = new Map();
  let focusedReplyRowId = "";
  let replyFocusLocked = false;
  let intentionalReplyBlurUntil = 0;
  let openDropdownKey = "";
  let mentionDirectoryCache = [];
  let mentionDirectoryLoadedAt = 0;
  let mentionDirectoryLoaded = false;
  let mentionDirectoryLoadFailedAt = 0;
  const selectedMentionsByRowId = new Map();
  const mentionSelectionIndexByRowId = new Map();
  const mentionSuppressByRowId = new Map();
  let stableCardRowId = "";
  let stableCardTop = null;
  let currentSidebarTab = "comments";
  let savedHighlightsPreference = true;
  let highlightsVisible = false;
  let textHighlightDeferredUntil = 0;
  let textHighlightCommitTimer = null;
  let focusOnlyAnchorHash = "";
  const nativeTextHighlightRanges = [];
  const nativeActiveTextHighlightRanges = [];
  let currentAnchorFocusTxn = 0;
  let shortcutAltClickEnabled = false;
  let cellCommentTrigger = null;
  let cellCommentTriggerSurface = null;
  let cellCommentTriggerRaf = 0;

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function cleanToken(token) {
    return String(token || "").trim().replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "").trim();
  }

  async function readStore(area) {
    try {
      return await chrome.storage[area].get(["sourceApiToken", "sourceCodaApiToken", "commentEngineApiToken", "engineCodaApiToken", "apiToken", "codaApiToken", "token", "docId", "sourceDocId", "commentEngineDocId", "targetTableId", "chatsTableId", "chatMessagesTableId", "engineThreadsTableId", "engineMessagesTableId", "engineAccessTableId", "fieldsTableId", "panelWidth", "panelOpen", "nativeBridgeUrl"]);
    } catch { return {}; }
  }


  async function getAllExtensionStorage() {
    const local = await chrome.storage.local.get(null);
    const sync = await chrome.storage.sync.get(null);
    return { local, sync };
  }

  function findTokenInStorage(local = {}, sync = {}) {
    const candidates = [
      local.apiToken,
      local.codaApiToken,
      local.token,
      local.CODA_API_TOKEN,
      local.codaToken,
      local.coda_api_key,
      local.apiKey,
      sync.apiToken,
      sync.codaApiToken,
      sync.token,
      sync.CODA_API_TOKEN,
      sync.codaToken,
      sync.coda_api_key,
      sync.apiKey
    ].map(v => String(v || "").trim()).filter(Boolean);

    return candidates[0] || "";
  }

  async function repairTokenAliasesIfNeeded(token) {
    if (!token) return;
    const updates = {
      apiToken: token,
      codaApiToken: token,
      token: token
    };
    await chrome.storage.local.set(updates);
    await chrome.storage.sync.set(updates);
  }


  function getTokenFromStorageShape(local = {}, sync = {}) {
    const keys = ["apiToken", "codaApiToken", "token", "CODA_API_TOKEN", "codaToken", "coda_api_key", "apiKey"];
    for (const source of [local, sync]) {
      for (const key of keys) {
        const v = String(source?.[key] || "").trim();
        if (v) return v;
      }
    }
    for (const source of [local, sync]) {
      for (const [key, value] of Object.entries(source || {})) {
        const v = String(value || "").trim();
        if (key.toLowerCase().includes("token") && v.length >= 20) return v;
      }
    }
    return "";
  }

  async function repairTokenAliases(token) {
    if (!token) return;
    const aliases = { apiToken: token, codaApiToken: token, token };
    chrome.storage.local.set(aliases).catch(() => {});
    chrome.storage.sync.set(aliases).catch(() => {});
  }

  function firstStoredValue(...values) {
    for (const v of values) {
      const s = String(v || "").trim();
      if (s) return s;
    }
    return "";
  }

  function getSourceTokenFromStorageShape(local = {}, sync = {}) {
    return firstStoredValue(
      local.sourceApiToken, local.sourceCodaApiToken,
      sync.sourceApiToken, sync.sourceCodaApiToken,
      getTokenFromStorageShape(local, sync)
    );
  }

  function getCommentEngineTokenFromStorageShape(local = {}, sync = {}) {
    return firstStoredValue(
      local.commentEngineApiToken, local.engineCodaApiToken,
      sync.commentEngineApiToken, sync.engineCodaApiToken,
      getSourceTokenFromStorageShape(local, sync)
    );
  }

  async function repairTwoTokenAliases(sourceToken, engineToken) {
    const updates = {};
    if (sourceToken) Object.assign(updates, {
      sourceApiToken: sourceToken,
      sourceCodaApiToken: sourceToken,
      // Legacy aliases point to source doc token for source-doc reads.
      apiToken: sourceToken,
      codaApiToken: sourceToken,
      token: sourceToken
    });
    if (engineToken) Object.assign(updates, {
      commentEngineApiToken: engineToken,
      engineCodaApiToken: engineToken
    });
    if (!Object.keys(updates).length) return;
    chrome.storage.local.set(updates).catch(() => {});
    chrome.storage.sync.set(updates).catch(() => {});
  }

  async function getConfig() {
    if (extensionContextInvalidated || !chrome?.runtime?.id) {
      markExtensionContextInvalidated(new Error("Extension context invalidated."));
      throw new Error("Extension context invalidated.");
    }

    const local = await chrome.storage.local.get(null);
    const sync = await chrome.storage.sync.get(null);
    const sourceToken = getSourceTokenFromStorageShape(local, sync);
    const commentEngineToken = getCommentEngineTokenFromStorageShape(local, sync);
    if (sourceToken || commentEngineToken) repairTwoTokenAliases(sourceToken, commentEngineToken);

    return {
      apiToken: sourceToken,
      codaApiToken: sourceToken,
      token: sourceToken,
      sourceApiToken: sourceToken,
      sourceCodaApiToken: sourceToken,
      commentEngineApiToken: commentEngineToken,
      engineCodaApiToken: commentEngineToken,
      docId: local.docId || sync.docId || local.sourceDocId || sync.sourceDocId || DEFAULTS.docId,
      sourceDocId: local.sourceDocId || sync.sourceDocId || local.docId || sync.docId || DEFAULTS.sourceDocId,
      commentEngineDocId: local.commentEngineDocId || sync.commentEngineDocId || DEFAULTS.commentEngineDocId,
      targetTableId: local.targetTableId || sync.targetTableId || DEFAULTS.targetTableId,
      chatsTableId: local.engineThreadsTableId || sync.engineThreadsTableId || DEFAULTS.chatsTableId,
      chatMessagesTableId: local.engineMessagesTableId || sync.engineMessagesTableId || DEFAULTS.chatMessagesTableId,
      engineThreadsTableId: local.engineThreadsTableId || sync.engineThreadsTableId || DEFAULTS.engineThreadsTableId,
      engineMessagesTableId: local.engineMessagesTableId || sync.engineMessagesTableId || DEFAULTS.engineMessagesTableId,
      engineAccessTableId: local.engineAccessTableId || sync.engineAccessTableId || DEFAULTS.engineAccessTableId,
      fieldsTableId: local.fieldsTableId || sync.fieldsTableId || DEFAULTS.fieldsTableId,
      panelWidth: local.panelWidth || sync.panelWidth || DEFAULTS.panelWidth,
      nativeBridgeUrl: local.nativeBridgeUrl || sync.nativeBridgeUrl || "",
      panelOpen: local.panelOpen ?? sync.panelOpen ?? true,
      highlightsVisible: local.highlightsVisible ?? sync.highlightsVisible ?? true,
      shortcutAltClickEnabled: local.shortcutAltClickEnabled ?? sync.shortcutAltClickEnabled ?? false
    };
  }

  function normalizeWhitespace(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
  function truncate(s, n = 120) { s = normalizeWhitespace(s); return s.length <= n ? s : s.slice(0, n - 1) + "…"; }

  function runtimeKeyForThread(row) {
    try { return stableThreadIdForChat(row) || rowId(row) || valueFirst(row, COL.chats.extAnchorTextHash, COL.chats.targetAnchorTextHash) || ""; }
    catch { return rowId(row) || row?.rowId || row?.id || ""; }
  }

  function runtimeHashForRow(row) {
    try { return valueFirst(row, COL.chats.extAnchorTextHash, COL.chats.targetAnchorTextHash) || ""; }
    catch { return ""; }
  }

  function runtimeTouch(reason = "") {
    runtimeStore.lastRuntimeMutationAt = Date.now();
    try { wguPerf.runtimeStoreMutations = (wguPerf.runtimeStoreMutations || 0) + 1; wguPerf.lastRuntimeStoreReason = reason; } catch {}
  }


  function clampNumber(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function readableViewportHeight(viewport) {
    return Math.max(1, Number(viewport?.height) || Math.max(1, (Number(viewport?.bottom) || 0) - (Number(viewport?.top) || 0)) || window.innerHeight || 800);
  }

  function preferredViewportYFromGeometry(geom = {}, viewport = null) {
    const v = viewport || (getReadableViewport({ reason: "preferred anchor landing", maxAgeMs: 800 })?.readableViewport) || { top: 0, bottom: window.innerHeight || 800, height: window.innerHeight || 800 };
    const h = readableViewportHeight(v);
    const padTop = Math.min(160, Math.max(80, Number(geom.preferredLandingPaddingTop) || 100));
    const padBottom = Math.min(160, Math.max(80, Number(geom.preferredLandingPaddingBottom) || 100));
    const sameHeight = geom.viewportHeight && Math.abs(Number(geom.viewportHeight) - h) <= Math.max(48, h * 0.08);
    const capturedY = Number(geom.viewportYAtCapture ?? geom.viewportTopAtCapture ?? geom.preferredViewportY);
    const capturedRatio = Number(geom.viewportYRatioAtCapture ?? geom.preferredViewportYRatio);
    let preferred = sameHeight && Number.isFinite(capturedY)
      ? capturedY
      : (Number.isFinite(capturedRatio) && capturedRatio > 0 && capturedRatio < 1 ? capturedRatio * h : h * 0.35);
    preferred = clampNumber(preferred, padTop, Math.max(padTop, h - padBottom));
    return { preferredY: preferred, viewportHeight: h, padTop, padBottom, ratio: preferred / h };
  }

  function runtimeStoreUpdateAnchorPosition(hash, patch = {}, reason = "position") {
    if (!hash) return null;
    const prev = runtimeStore.anchorPositionsByHash.get(hash) || {};
    const next = { ...prev, ...patch, hash, updatedAt: Date.now(), reason };
    runtimeStore.anchorPositionsByHash.set(hash, next);
    try { wguPerf.anchorRuntimePositionUpdates = (wguPerf.anchorRuntimePositionUpdates || 0) + 1; } catch {}
    return next;
  }

  function anchorDocumentYFromApprox(geom) {
    if (!geom || geom.top == null) return null;
    const canvas = largestVisibleCodaCanvasRect();
    const docCanvasTop = (window.scrollY || document.documentElement.scrollTop || 0) + (canvas?.top || 0);
    return Math.round(docCanvasTop + Number(geom.top || 0));
  }

  function runtimeStoreClear(reason = "clear") {
    runtimeStore.threadsByKey.clear();
    runtimeStore.pendingThreadsByHash.clear();
    runtimeStore.anchorSnapshotsByHash.clear();
    runtimeStore.liveRangesByHash.clear();
    runtimeStore.anchorPositionsByHash.clear();
    runtimeStore.lastAuthoritativeEmptyAt = Date.now();
    runtimeTouch(reason);
  }

  function runtimeStoreUpsertThread(row, reason = "upsert") {
    const key = runtimeKeyForThread(row);
    if (!key) return;
    runtimeStore.threadsByKey.set(key, row);
    const hash = runtimeHashForRow(row);
    if (hash && isSyntheticRow(row)) runtimeStore.pendingThreadsByHash.set(hash, row);
    if (hash) {
      const existing = runtimeStore.anchorSnapshotsByHash.get(hash) || {};
      runtimeStore.anchorSnapshotsByHash.set(hash, { ...existing, row, hash, updatedAt: Date.now() });
    }
    runtimeTouch(reason);
  }

  function runtimeStoreSetCodaThreads(rows = [], reason = "coda sync") {
    for (const row of rows || []) runtimeStoreUpsertThread(row, reason);
    runtimeStore.lastCodaSyncAt = Date.now();
  }

  function runtimeStoreRows() {
    return Array.from(runtimeStore.threadsByKey.values());
  }

  function runtimeStoreRememberAnchorSnapshot(hash, payload = {}, row = null) {
    if (!hash) return;
    const snap = {
      hash,
      exact: payload.exact || "",
      prefix: payload.prefix || "",
      suffix: payload.suffix || "",
      surfaceType: payload.surfaceType || "",
      sourceRowId: payload.sourceRowId || "",
      tableId: payload.tableId || "",
      columnId: payload.columnId || "",
      approxGeometry: {
        top: payload.anchorApproxTop,
        left: payload.anchorApproxLeft,
        height: payload.anchorApproxHeight,
        width: payload.anchorApproxWidth,
        pageHeight: payload.anchorApproxPageHeight,
        viewportHeight: payload.anchorApproxViewportHeight,
        viewportYAtCapture: payload.anchorApproxViewportYAtCapture,
        viewportYRatioAtCapture: payload.anchorApproxViewportYRatioAtCapture,
        preferredLandingPaddingTop: payload.anchorPreferredLandingPaddingTop || 100,
        preferredLandingPaddingBottom: payload.anchorPreferredLandingPaddingBottom || 100,
        scrollContainer: payload.anchorApproxScrollContainer,
        source: payload.anchorApproxSource,
        confidence: payload.anchorApproxConfidence
      },
      row,
      createdAt: Date.now()
    };
    runtimeStore.anchorSnapshotsByHash.set(hash, snap);
    try {
      if (payload.liveRange?.cloneRange) runtimeStore.liveRangesByHash.set(hash, { range: payload.liveRange.cloneRange(), exact: payload.exact || "", createdAt: Date.now() });
    } catch {}
    runtimeTouch("anchor snapshot");
  }

  function runtimeStoreReport() {
    return {
      threads: runtimeStore.threadsByKey.size,
      pendingThreads: runtimeStore.pendingThreadsByHash.size,
      anchorSnapshots: runtimeStore.anchorSnapshotsByHash.size,
      liveRanges: runtimeStore.liveRangesByHash.size,
      anchorPositions: runtimeStore.anchorPositionsByHash.size,
      positionSamples: Array.from(runtimeStore.anchorPositionsByHash.values()).slice(0, 12),
      lastCodaSyncAt: runtimeStore.lastCodaSyncAt ? new Date(runtimeStore.lastCodaSyncAt).toISOString() : null,
      lastRuntimeMutationAt: runtimeStore.lastRuntimeMutationAt ? new Date(runtimeStore.lastRuntimeMutationAt).toISOString() : null,
      lastAuthoritativeEmptyAt: runtimeStore.lastAuthoritativeEmptyAt ? new Date(runtimeStore.lastAuthoritativeEmptyAt).toISOString() : null
    };
  }

  try { window.__wguRuntimeStoreReport = runtimeStoreReport; } catch {}
  function extractMentions(text) {
    const raw = String(text || "");
    const emails = Array.from(new Set((raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(x => x.toLowerCase())));

    // Conservative display-token extraction. This does not resolve identity; it captures user intent.
    const tokens = [];
    const mentionRegex = /(^|\s)@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[A-Za-z][A-Za-z0-9 ._'’-]{1,80})/g;
    let match;
    while ((match = mentionRegex.exec(raw)) !== null) {
      let token = match[2].trim();
      token = token.replace(/[.,;:!?)]$/, "").trim();
      if (token && !tokens.includes(`@${token}`)) tokens.push(`@${token}`);
    }

    return { tokens, emails };
  }

  function rawCellValue(row, colId) {
    const raw = row?.values?.[colId];
    return raw && typeof raw === "object" && Object.prototype.hasOwnProperty.call(raw, "content") ? raw.content : raw;
  }

  function simpleCellContent(row, colId) {
    return normalizeCodaValue(rawCellValue(row, colId));
  }

  function booleanCellValue(row, colId) {
    const raw = rawCellValue(row, colId);
    if (raw === true) return true;
    if (raw === false) return false;
    const s = normalizeCodaValue(raw).toLowerCase();
    return ["true", "yes", "y", "1", "checked", "active"].includes(s);
  }

  function normalizeCodaValue(value) {
    if (value == null) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return value.map(normalizeCodaValue).filter(Boolean).join(", ");
    if (typeof value === "object") {
      if (value.url && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value.url).trim())) return String(value.url).trim();
      if (value.name) return String(value.name).trim();
      if (value.content != null) return normalizeCodaValue(value.content);
      if (value.value != null) return normalizeCodaValue(value.value);
      if (value.url) return String(value.url).trim();
    }
    return "";
  }

  function normalizeEmail(value) {
    const s = normalizeCodaValue(value).trim();
    const match = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? match[0].toLowerCase() : "";
  }

  function initialsFor(name) {
    return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase() || "?";
  }

  function photoUrlFromRow(row) {
    const raw = rawCellValue(row, MENTION_DIRECTORY.columns.image);
    if (raw && typeof raw === "object" && raw.url) return raw.url;
    const s = normalizeCodaValue(raw);
    return /^https?:\/\//i.test(s) ? s : "";
  }

  function associatedPersonIdFromRow(row) {
    const raw = rawCellValue(row, MENTION_DIRECTORY.columns.associatedCodaAccount);
    if (raw && typeof raw === "object") return raw.identifier || raw.id || "";
    return "";
  }

  function makeMentionDirectoryEntry(row) {
    const c = MENTION_DIRECTORY.columns;
    const displayName = simpleCellContent(row, c.personName) || simpleCellContent(row, c.userName);
    const email = normalizeEmail(rawCellValue(row, c.personCodaEmail)) || normalizeEmail(rawCellValue(row, c.personEmailManual));
    const userName = simpleCellContent(row, c.userName);
    const roleAcronym = simpleCellContent(row, c.roleAcronym);
    const isActive = booleanCellValue(row, c.isActive);
    const workspaceMembership = simpleCellContent(row, c.workspaceMembership);
    const docRole = simpleCellContent(row, c.docRole);
    const codaPersonId = associatedPersonIdFromRow(row);
    const photoUrl = photoUrlFromRow(row);
    const isWorkspaceMember = workspaceMembership === "IS a member of WGU Coda Workspace";
    const mentionMode = codaPersonId && isWorkspaceMember ? "native" : "fallback";

    if (!isActive || !displayName || displayName === "Waiting on Share" || (!email && !codaPersonId)) return null;

    const search = [
      displayName,
      email,
      userName,
      roleAcronym,
      docRole,
      workspaceMembership
    ].join(" ").toLowerCase();

    return {
      rowId: row.rowId || row.id || "",
      displayName,
      email,
      userName,
      roleAcronym,
      docRole,
      codaPersonId,
      photoUrl,
      isActive,
      isWorkspaceMember,
      mentionMode,
      search
    };
  }

  function mergeResolvedMentions(text, rowIdValue = "") {
    const base = extractMentions(text);
    const selected = selectedMentionsByRowId.get(rowIdValue) || [];
    for (const m of selected) {
      const token = `@${m.displayName}`;
      if (m.displayName && !base.tokens.includes(token)) base.tokens.push(token);
      if (m.email && !base.emails.includes(m.email.toLowerCase())) base.emails.push(m.email.toLowerCase());
    }
    return base;
  }

  function selectedMentionPills(rowIdValue = "") {
    const selected = selectedMentionsByRowId.get(rowIdValue) || [];
    return selected.map(m => `@${m.displayName}`).join(", ");
  }

  function selectedMentionIdentities(rowIdValue = "") {
    const selected = selectedMentionsByRowId.get(rowIdValue) || [];
    return selected.map(m => ({
      rowId: m.rowId || "",
      displayName: m.displayName || "",
      email: m.email || "",
      codaPersonId: m.codaPersonId || "",
      userName: m.userName || "",
      roleAcronym: m.roleAcronym || "",
      mentionMode: m.mentionMode || "fallback",
      isWorkspaceMember: Boolean(m.isWorkspaceMember)
    }));
  }

  function mentionChipPreviewHtml(rowIdValue = "") {
    const selected = selectedMentionsByRowId.get(rowIdValue) || [];
    return selected.map(m => `<span class="wgu-rich-mention-chip" title="${escapeHtml(m.email || "")}">@${escapeHtml(m.displayName)}</span>`).join("");
  }

  function notificationIdFor(chatRowId, mentionIdentity, content) {
    const seed = `${chatRowId || "new"}|${mentionIdentity.email || mentionIdentity.displayName}|${content || ""}|${Date.now()}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    return `mn-${Date.now()}-${Math.abs(hash)}`;
  }

  async function getCurrentCodaUserSafe() {
    try {
      const data = await codaFetch("/whoami");
      return {
        name: data.name || data.displayName || "",
        email: data.email || ""
      };
    } catch {
      return { name: "", email: "" };
    }
  }

  function mentionStatusFor(mentions, nativeStatus) {
    if (!mentions.tokens.length && !mentions.emails.length) return "None";
    if (nativeStatus === "Synced") return "Native Coda Synced";
    if (nativeStatus === "Pending") return "Pending Native Coda";
    if (nativeStatus === "Disabled") return "Fallback Needed";
    if (nativeStatus === "Failed") return "Fallback Needed";
    return "Pending Native Coda";
  }

  function sanitizeBridgeUrl(url) {
    const s = String(url || "").trim();
    if (!s) return "";
    try {
      const u = new URL(s);
      if (u.protocol !== "https:") return "";
      if (!u.hostname.endsWith(".wgu.edu") && u.hostname !== "wgu.edu") return "";
      return u.toString();
    } catch {
      return "";
    }
  }

  function nativeSyncSummary(row) {
    const status = valueFirst(row, COL.chats.nativeSyncStatus) || "Not Synced";
    const mentionStatus = valueFirst(row, COL.chats.mentionNotificationStatus) || "None";
    const mentions = valueFirst(row, COL.chats.mentionedText);
    return { status, mentionStatus, mentions };
  }

  function nativeStatusHtmlFor(row) {
    // 1.7.7: status/mention diagnostics are intentionally hidden from the card UI.
    // The data still exists in _Chats and _Mention Notification Queue.
    return "";
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch]));
  }

  function formatHistoryText(raw) {
    const text = normalizeWhitespace(raw) ? String(raw) : "No chat history yet.";
    return escapeHtml(text);
  }

  function latestSingleComment(raw) {
    const text = String(raw || "").trim();
    if (!text) return "";

    // Comment Log is newest-first and separated by the long horizontal rule.
    // Only show the latest single entry, never enough prior history to "fill" the character limit.
    const first = normalizeWhitespace(text.split("────────────────────────")[0].trim());
    return formatLatestCommentForCard(first);
  }

  function formatLatestCommentForCard(entry) {
    const text = normalizeWhitespace(entry);
    if (!text) return "";

    // Convert noisy field-context comments like:
    // KP: 5/14/2026, 10:39:15 AM -- Data on Market Value: "Selected anchor" test 5
    // into the Word-like card preview:
    // KP: 5/14/2026, 10:39:15 AM -- "test 5"
    const contextual = text.match(/^(.*?--\s*)(?:[^:"]{1,120}:\s*)?"[^"]*"\s*(.+)$/);
    if (contextual && normalizeWhitespace(contextual[2])) {
      return `${normalizeWhitespace(contextual[1])} "${normalizeWhitespace(contextual[2])}"`;
    }

    // If the latest entry has a field label after the timestamp but no quoted anchor,
    // strip just the field label and keep the actual comment content.
    const labeled = text.match(/^(.*?--\s*)[^:]{1,120}:\s*(.+)$/);
    if (labeled && normalizeWhitespace(labeled[2])) {
      return `${normalizeWhitespace(labeled[1])}${normalizeWhitespace(labeled[2])}`;
    }

    return text;
  }


  function messageRowChatId(messageRow) {
    const direct = simpleText(cell(messageRow, COL.messages.chatRowId));
    if (direct) return direct;
    const lookup = cell(messageRow, COL.messages.chat);
    if (typeof lookup === "string") return lookup;
    if (lookup && typeof lookup === "object") {
      return lookup.rowId || lookup.id || lookup.objectId || lookup.identifier || simpleText(lookup);
    }
    return simpleText(lookup);
  }

  function messageCreatedMs(messageRow) {
    return rowDateMs(messageRow, COL.messages.createdAt) || Date.parse(messageRow?.createdAt || "") || 0;
  }

  function sortMessagesChronological(messages = []) {
    return (messages || []).slice().sort((a, b) => {
      const am = messageCreatedMs(a);
      const bm = messageCreatedMs(b);
      if (am !== bm) return am - bm;
      return String(rowId(a)).localeCompare(String(rowId(b)));
    });
  }

  function formatMessageTimestamp(ms) {
    if (!ms) return "";
    try {
      return new Date(ms).toLocaleString([], { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
    } catch {
      return new Date(ms).toLocaleString();
    }
  }

  function initialsForMessage(messageRow) {
    const author = simpleText(cell(messageRow, COL.messages.authorName)) || simpleText(cell(messageRow, COL.messages.authorEmail)) || currentCodaUserCache?.name || currentCodaUserCache?.email || "You";
    return initialsFor(author);
  }

  function latestMessageForChat(chat) {
    const messages = sortMessagesChronological(chat?.__wguMessages || []);
    return messages[messages.length - 1] || null;
  }

  function messagePreviewForChat(chat, fallbackText = "") {
    const summary = normalizeWhitespace(simpleText(cell(chat, COL.chats.lastMessagePreview)));
    if (summary) {
      const initials = normalizeWhitespace(simpleText(cell(chat, COL.chats.lastMessageAuthorInitials)) || currentUserInitialsForAvatar());
      const ms = rowDateMs(chat, COL.chats.lastMessageAt);
      const prefix = `${initials}${ms ? `: ${formatMessageTimestamp(ms)}` : ""} -- `;
      return `${prefix}"${summary}"`;
    }
    const msg = latestMessageForChat(chat);
    if (!msg) return latestSingleComment(fallbackText) || simpleText(cell(chat, COL.chats.whatsOnYourMind));
    const body = normalizeWhitespace(simpleText(cell(msg, COL.messages.messageText)) || simpleText(cell(msg, COL.messages.message)));
    if (!body) return latestSingleComment(fallbackText) || "";
    const ms = messageCreatedMs(msg);
    const prefix = `${initialsForMessage(msg)}${ms ? `: ${formatMessageTimestamp(ms)}` : ""} -- `;
    return `${prefix}"${body}"`;
  }

  function attachMessagesToChats(chats = [], messages = []) {
    const byChatId = new Map();
    for (const msg of messages || []) {
      const chatId = messageRowChatId(msg);
      if (!chatId) continue;
      if (!byChatId.has(chatId)) byChatId.set(chatId, []);
      byChatId.get(chatId).push(msg);
    }
    return (chats || []).map(chat => {
      const id = rowId(chat);
      const attached = id ? sortMessagesChronological(byChatId.get(id) || []) : [];
      if (!attached.length) return chat;
      return { ...chat, __wguMessages: attached };
    });
  }

  function isExtensionUiTarget(target) {
    return Boolean(target?.closest?.(
      "#wgu-coda-comment-sidebar,#wgu-comment-modal-backdrop,#wgu-coda-comment-btn,#wgu-coda-comment-tab,#wgu-coda-cell-selection-overlay,#wgu-coda-cell-selection-toolbar,#wgu-cell-comment-trigger"
    ));
  }

  function isInteractiveCardTarget(target) {
    return Boolean(target?.closest?.(
      "textarea,input,select,button,.wgu-dd,.wgu-dd-menu,.wgu-reply-box,.wgu-comment-card-actions,.wgu-chat-history,.wgu-chat-history-body"
    ));
  }

  function shieldExtensionEvent(ev) {
    // Stop Coda's React/canvas keyboard and mouse handlers from seeing extension UI events.
    // Let explicit card action buttons reach their own direct listeners.
    if (ev.target?.closest?.("button[data-action],select[data-action],.wgu-dd")) return;
    ev.stopPropagation();
    if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
  }

  function preserveReplyDraft(rowIdValue, textarea) {
    if (!rowIdValue || !textarea) return;
    replyDrafts.set(rowIdValue, textarea.value || "");
    focusedReplyRowId = rowIdValue;
  }

  function restoreReplyFocusSoon(rowIdValue) {
    if (!rowIdValue || focusedReplyRowId !== rowIdValue) return;
    setTimeout(() => {
      const card = document.querySelector(`.wgu-comment-card[data-wgu-chat-row-id="${CSS.escape(rowIdValue)}"]`);
      const ta = card?.querySelector(".wgu-reply-box textarea");
      if (!ta) return;
      const val = replyDrafts.get(rowIdValue) || ta.value || "";
      if (ta.value !== val) ta.value = val;
      ta.focus({ preventScroll: true });
      const end = ta.value.length;
      try { ta.setSelectionRange(end, end); } catch {}
    }, 30);
  }

  function getFocusedReplyTextarea() {
    if (!focusedReplyRowId) return null;
    const card = document.querySelector(`.wgu-comment-card[data-wgu-chat-row-id="${CSS.escape(focusedReplyRowId)}"]`);
    return card?.querySelector(".wgu-reply-box textarea") || null;
  }

  function lockReplyFocus(rowIdValue) {
    if (!rowIdValue) return;
    focusedReplyRowId = rowIdValue;
    replyFocusLocked = true;
    const card = document.querySelector(`.wgu-comment-card[data-wgu-chat-row-id="${CSS.escape(rowIdValue)}"]`);
    card?.classList.add("wgu-reply-focus-locked");
  }

  function unlockReplyFocus(rowIdValue = "") {
    if (rowIdValue && focusedReplyRowId && rowIdValue !== focusedReplyRowId) return;
    replyFocusLocked = false;
    const id = rowIdValue || focusedReplyRowId;
    if (id) {
      const card = document.querySelector(`.wgu-comment-card[data-wgu-chat-row-id="${CSS.escape(id)}"]`);
      card?.classList.remove("wgu-reply-focus-locked");
    }
    if (!rowIdValue || rowIdValue === focusedReplyRowId) focusedReplyRowId = "";
  }

  function shouldRestoreReplyFocus() {
    return replyFocusLocked && focusedReplyRowId && Date.now() > intentionalReplyBlurUntil;
  }

  function restoreReplyFocusIfNeeded() {
    if (!shouldRestoreReplyFocus()) return;
    const ta = getFocusedReplyTextarea();
    if (!ta) return;
    if (document.activeElement !== ta) restoreReplyFocusSoon(focusedReplyRowId);
  }

  function getCurrentMentionQuery(textarea) {
    if (!textarea) return null;
    const pos = textarea.selectionStart ?? textarea.value.length;
    const before = textarea.value.slice(0, pos);

    // If the caret is after whitespace, the user has completed the mention/token.
    // This prevents the picker from reopening after inserting "@Keith Punches ".
    if (/\s$/.test(before)) return null;

    const match = before.match(/(^|\s)@([A-Za-z0-9._%+\-'’]{0,80})$/);
    if (!match) return null;

    return {
      start: before.length - match[2].length - 1,
      end: pos,
      query: match[2] || ""
    };
  }

  function closeMentionHelper(card) {
    const helper = card?.querySelector?.(".wgu-mention-helper");
    if (helper) helper.classList.remove("wgu-mention-open");
  }

  function mentionResultHtml(m, idx, selectedIdx) {
    const avatar = m.photoUrl
      ? `<span class="wgu-mention-avatar"><img src="${escapeHtml(m.photoUrl)}" alt=""></span>`
      : `<span class="wgu-mention-avatar">${escapeHtml(initialsFor(m.displayName))}</span>`;

    return `
      <button type="button"
        class="wgu-mention-result${idx === selectedIdx ? " wgu-mention-selected" : ""}"
        data-action="mention-select"
        data-mention-index="${idx}"
        aria-label="Mention ${escapeHtml(m.displayName)}">
        ${avatar}
        <span>
          <span class="wgu-mention-person-main">${escapeHtml(m.displayName)}</span>
          <span class="wgu-mention-person-sub">${escapeHtml(m.email || "")}</span>
        </span>
      </button>`;
  }

  async function openMentionHelper(card, textarea) {
    const helper = card?.querySelector?.(".wgu-mention-helper");
    if (!helper || !textarea) return;
    const mention = getCurrentMentionQuery(textarea);
    if (!mention) {
      helper.classList.remove("wgu-mention-open");
      return;
    }

    const rowIdValue = card?.dataset?.wguMentionRowId || card?.dataset?.wguChatRowId || focusedReplyRowId || "";
    const suppressUntil = mentionSuppressByRowId.get(rowIdValue) || 0;
    if (Date.now() < suppressUntil) {
      helper.classList.remove("wgu-mention-open");
      return;
    }

    const q = mention.query.trim();
    const qEl = helper.querySelector(".wgu-mention-query");
    if (qEl) qEl.textContent = q ? `@${q}` : "@";
    helper.classList.add("wgu-mention-open");

    const resultsEl = helper.querySelector(".wgu-mention-results");
    if (!resultsEl) return;

    if (!mentionDirectoryLoaded && !mentionDirectoryCache.length) {
      if (mentionDirectoryLoadFailedAt && Date.now() - mentionDirectoryLoadFailedAt < 5000) {
        resultsEl.innerHTML = `<div class="wgu-mention-empty">Could not load people. Check token/options.</div>`;
        return;
      }
      resultsEl.innerHTML = `<div class="wgu-mention-loading">Loading people…</div>`;
      loadMentionDirectory(false).then(() => openMentionHelper(card, textarea)).catch(err => {
        console.error(err);
        mentionDirectoryLoadFailedAt = Date.now();
        const msg = String(err?.message || err || "");
        resultsEl.innerHTML = `<div class="wgu-mention-empty">${escapeHtml(msg.toLowerCase().includes("token") ? "Coda API token is missing. Re-save the token in extension options, then refresh this tab." : "Could not load people.")}</div>`;
      });
      return;
    }

    if (mentionDirectoryLoaded && !mentionDirectoryCache.length) {
      resultsEl.innerHTML = `<div class="wgu-mention-empty">No active mentionable people were found.</div>`;
      return;
    }

    const results = searchMentionDirectory(q, 8);
    helper.dataset.mentionResults = JSON.stringify(results.map(x => x.rowId));
    let selectedIdx = mentionSelectionIndexByRowId.get(rowIdValue) || 0;
    if (selectedIdx >= results.length) selectedIdx = Math.max(0, results.length - 1);
    mentionSelectionIndexByRowId.set(rowIdValue, selectedIdx);

    resultsEl.innerHTML = results.length
      ? results.map((m, idx) => mentionResultHtml(m, idx, selectedIdx)).join("")
      : `<div class="wgu-mention-empty">No people found for <strong>${escapeHtml(q || "@")}</strong>.</div>`;
  }



  function getMentionResultsForHelper(card) {
    const helper = card?.querySelector?.(".wgu-mention-helper");
    const ids = JSON.parse(helper?.dataset?.mentionResults || "[]");
    return ids.map(id => mentionDirectoryCache.find(m => m.rowId === id)).filter(Boolean);
  }

  function insertMentionFromHelper(card, textarea, explicitIndex = null) {
    if (!textarea) return;
    const mention = getCurrentMentionQuery(textarea);
    if (!mention) return;

    const rowIdValue = card?.dataset?.wguMentionRowId || card?.dataset?.wguChatRowId || focusedReplyRowId || "";
    const results = getMentionResultsForHelper(card);
    const idx = explicitIndex != null ? explicitIndex : (mentionSelectionIndexByRowId.get(rowIdValue) || 0);
    const selected = results[idx];

    if (!selected) {
      openMentionHelper(card, textarea);
      return;
    }

    const token = `@${selected.displayName}`;
    textarea.value = textarea.value.slice(0, mention.start) + token + " " + textarea.value.slice(mention.end);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
    const caret = mention.start + token.length + 1;
    textarea.focus({ preventScroll: true });
    try { textarea.setSelectionRange(caret, caret); } catch {}

    const existing = selectedMentionsByRowId.get(rowIdValue) || [];
    if (!existing.some(x => x.email === selected.email || x.rowId === selected.rowId)) {
      selectedMentionsByRowId.set(rowIdValue, existing.concat([selected]));
    }

    if (rowIdValue !== INITIAL_COMMENT_MENTION_KEY) preserveReplyDraft(rowIdValue, textarea);
    mentionSuppressByRowId.set(rowIdValue, Date.now() + 1200);
    mentionSelectionIndexByRowId.delete(rowIdValue);
    if (rowIdValue !== INITIAL_COMMENT_MENTION_KEY) lockReplyFocus(rowIdValue);
    closeMentionHelper(card);
  }



  function mentionTextareaForHost(host) {
    return host?.querySelector?.(".wgu-reply-box textarea, #wgu-comment-textarea, textarea[data-wgu-mention-textarea='1']");
  }

  function wireMentionResultDelegation(card, rowIdValue) {
    const results = card?.querySelector?.(".wgu-mention-results");
    if (!results || results.dataset.wguMentionDelegated === "1") return;
    results.dataset.wguMentionDelegated = "1";

    results.addEventListener("mousedown", ev => {
      const btn = ev.target?.closest?.("button[data-action='mention-select']");
      if (!btn) return;
      intentionalReplyBlurUntil = Date.now() + 900;
      ev.preventDefault();
      ev.stopPropagation();
    }, true);

    results.addEventListener("click", ev => {
      const btn = ev.target?.closest?.("button[data-action='mention-select']");
      if (!btn) return;

      intentionalReplyBlurUntil = Date.now() + 900;
      ev.preventDefault();
      ev.stopPropagation();

      const ta = mentionTextareaForHost(card);
      const idx = Number(btn.dataset.mentionIndex || "0") || 0;
      insertMentionFromHelper(card, ta, idx);
      if (rowIdValue !== INITIAL_COMMENT_MENTION_KEY) restoreReplyFocusSoon(rowIdValue);
      else safeSetTimeout(() => ta?.focus?.({ preventScroll: true }), 0);
    }, true);
  }

  function wireMentionHelper(card, rowIdValue) {
    if (card) card.dataset.wguMentionRowId = rowIdValue || "";
    wireMentionResultDelegation(card, rowIdValue);

    const textarea = mentionTextareaForHost(card);
    if (!textarea) return;

    textarea.addEventListener("input", ev => {
      if (rowIdValue !== INITIAL_COMMENT_MENTION_KEY) lockReplyFocus(rowIdValue);
      if (rowIdValue !== INITIAL_COMMENT_MENTION_KEY) preserveReplyDraft(rowIdValue, textarea);
      openMentionHelper(card, textarea);
      shieldExtensionEvent(ev);
    }, true);

    textarea.addEventListener("keyup", ev => {
      openMentionHelper(card, textarea);
      shieldExtensionEvent(ev);
    }, true);

    textarea.addEventListener("keydown", ev => {
      if (rowIdValue !== INITIAL_COMMENT_MENTION_KEY) lockReplyFocus(rowIdValue);
      const mention = getCurrentMentionQuery(textarea);
      const helperOpen = card.querySelector(".wgu-mention-helper")?.classList.contains("wgu-mention-open");
      if (mention && helperOpen && (ev.key === "ArrowDown" || ev.key === "ArrowUp")) {
        ev.preventDefault();
        const count = getMentionResultsForHelper(card).length || 1;
        const current = mentionSelectionIndexByRowId.get(rowIdValue) || 0;
        const next = ev.key === "ArrowDown" ? (current + 1) % count : (current - 1 + count) % count;
        mentionSelectionIndexByRowId.set(rowIdValue, next);
        openMentionHelper(card, textarea);
        shieldExtensionEvent(ev);
        return;
      }
      if (mention && helperOpen && (ev.key === "Enter" || ev.key === "Tab")) {
        ev.preventDefault();
        insertMentionFromHelper(card, textarea);
        shieldExtensionEvent(ev);
        return;
      }
      if (ev.key === "Escape") closeMentionHelper(card);
      shieldExtensionEvent(ev);
    }, true);

    textarea.addEventListener("focus", ev => {
      if (rowIdValue !== INITIAL_COMMENT_MENTION_KEY) lockReplyFocus(rowIdValue);
      openMentionHelper(card, textarea);
      shieldExtensionEvent(ev);
    }, true);

    textarea.addEventListener("blur", () => {
      if (rowIdValue !== INITIAL_COMMENT_MENTION_KEY) preserveReplyDraft(rowIdValue, textarea);
      setTimeout(() => {
        if (shouldRestoreReplyFocus() && focusedReplyRowId === rowIdValue) if (rowIdValue !== INITIAL_COMMENT_MENTION_KEY) restoreReplyFocusSoon(rowIdValue);
      }, 0);
    }, true);
  }


  function normalizePageUrl(urlLike) {
    if (!urlLike || typeof urlLike !== "string") return "";
    try { const u = new URL(urlLike, location.href); u.search = ""; return u.toString().replace(/\/$/, ""); }
    catch { return ""; }
  }
  function stripHash(url) {
    try { const u = new URL(url, location.href); u.hash = ""; return u.toString().replace(/\/$/, ""); }
    catch { return ""; }
  }
  function currentPageUrl() { return normalizePageUrl(stableCurrentCodaPageUrl() || location.href); }
  function currentSourceBrowserUrl() {
    try { return new URL(location.href).toString(); }
    catch { return String(location.href || ""); }
  }
  function currentSourcePageUrl() { return currentPageUrl(); }
  function currentCodaDocIdFromLocation() {
    try {
      const m = new URL(location.href).pathname.match(/\/d\/_d([^/]+)/);
      return m?.[1] || "";
    } catch { return ""; }
  }
  function sourceDocIdForRuntime(cfg) {
    return currentCodaDocIdFromLocation() || cfg.sourceDocId || cfg.docId || DEFAULTS.sourceDocId;
  }
  function useCommentEngine(cfg) {
    return Boolean(cfg?.commentEngineDocId && cfg?.engineThreadsTableId && cfg?.engineMessagesTableId);
  }
  function commentsDocId(cfg) { return useCommentEngine(cfg) ? cfg.commentEngineDocId : cfg.docId; }
  function commentsThreadsTableId(cfg) { return useCommentEngine(cfg) ? cfg.engineThreadsTableId : cfg.chatsTableId; }
  function commentsMessagesTableId(cfg) { return useCommentEngine(cfg) ? cfg.engineMessagesTableId : cfg.chatMessagesTableId; }

  function codaPageSegmentFromUrl(urlLike = location.href) {
    try {
      const u = new URL(urlLike, location.href);
      const parts = u.pathname.split("/").filter(Boolean);
      const dIdx = parts.indexOf("d");
      if (dIdx >= 0 && parts[dIdx + 1] && parts[dIdx + 2]) return parts[dIdx + 2];
      return "";
    } catch { return ""; }
  }

  function stableCodaPageUrl(urlLike = location.href) {
    try {
      const u = new URL(urlLike, location.href);
      const parts = u.pathname.split("/").filter(Boolean);
      const dIdx = parts.indexOf("d");
      if (dIdx >= 0 && parts[dIdx + 1] && parts[dIdx + 2]) {
        u.pathname = `/${parts.slice(0, dIdx + 3).join("/")}`;
        u.search = "";
        u.hash = "";
        return u.toString().replace(/\/$/, "");
      }
      u.search = "";
      u.hash = "";
      return u.toString().replace(/\/$/, "");
    } catch { return normalizePageUrl(urlLike); }
  }

  function stableCurrentCodaPageUrl() { return stableCodaPageUrl(location.href); }

  function pageNameFromSegment(segment) {
    segment = String(segment || "");
    if (!segment) return "";
    const slug = segment.replace(/_[^_]+$/, "");
    return decodeURIComponent(slug).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function pageNameFromTitle() {
    const title = String(document.title || "").replace(/\s+-\s*Coda\s*$/i, "").trim();
    const parts = title.split("·").map(x => x.trim()).filter(Boolean);
    const candidate = parts.length ? parts[parts.length - 1] : title;
    return candidate && !/coda$/i.test(candidate) ? candidate : "";
  }

  function currentPageName() {
    return normalizeWhitespace(pageNameFromTitle() || pageNameFromSegment(codaPageSegmentFromUrl(location.href)) || "Current page");
  }

  function codaPageKeyFromUrl(urlLike = location.href) {
    const stable = stableCodaPageUrl(urlLike);
    if (!stable) return "";
    try {
      const u = new URL(stable, location.href);
      return `${u.origin}${u.pathname}`.replace(/\/$/, "");
    } catch { return stable; }
  }

  function currentPageKey() { return codaPageKeyFromUrl(location.href); }

  function pageNameFromUrl(urlLike) {
    return normalizeWhitespace(pageNameFromSegment(codaPageSegmentFromUrl(urlLike)) || "");
  }

  function addWguDeepLinkParams(urlLike, { hash = "", chatRowId = "", targetRowId = "" } = {}) {
    const base = normalizePageUrl(urlLike || location.href);
    try {
      const u = new URL(base);
      if (hash) u.searchParams.set("wguCommentHash", hash);
      if (chatRowId) u.searchParams.set("wguChatRowId", chatRowId);
      if (targetRowId) u.searchParams.set("wguTargetRowId", targetRowId);
      return u.toString();
    } catch {
      return base;
    }
  }

  function getWguDeepLinkParams() {
    try {
      const u = new URL(location.href);
      return {
        hash: u.searchParams.get("wguCommentHash") || "",
        chatRowId: u.searchParams.get("wguChatRowId") || "",
        targetRowId: u.searchParams.get("wguTargetRowId") || ""
      };
    } catch {
      return { hash: "", chatRowId: "", targetRowId: "" };
    }
  }

  function isLikelyNotifyButtonLandingPage() {
    const href = decodeURIComponent(location.href || "").toLowerCase();
    // The Coda Notify wrapper currently routes to the page/control that ran Notify().
    // In this sandbox that is the CCW/Chats or Chat Engine page. Keep this conservative
    // so regular source pages do not unexpectedly auto-redirect.
    return href.includes("ccw-chats") ||
      href.includes("chat-engine") ||
      href.includes("chat_engine") ||
      href.includes("mention-notification") ||
      href.includes("notification-queue") ||
      href.includes("canvas-a2kiv8v3du");
  }

  function getHandledNotifyRouterIds() {
    try {
      return new Set(JSON.parse(sessionStorage.getItem(NOTIFY_ROUTER_STORAGE_KEY) || "[]"));
    } catch {
      return new Set();
    }
  }

  function markHandledNotifyRouterId(id) {
    if (!id) return;
    try {
      const handled = getHandledNotifyRouterIds();
      handled.add(id);
      sessionStorage.setItem(NOTIFY_ROUTER_STORAGE_KEY, JSON.stringify(Array.from(handled).slice(-50)));
    } catch {}
  }

  function rowDateMs(row, colId) {
    const raw = simpleText(cell(row, colId));
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : 0;
  }

  function canonicalPageKey(urlLike) {
    return codaPageKeyFromUrl(urlLike);
  }
  function codaPageTokenFromUrl(urlLike = location.href) {
    const segment = codaPageSegmentFromUrl(urlLike);
    if (!segment) return "";
    const m = segment.match(/_([^_]+)$/);
    return normalizePageToken(m ? m[1] : segment);
  }

  function normalizePageToken(value) {
    value = String(value || "").trim();
    if (!value) return "";
    // Accept raw object refs (canvas-abc, section-abc), URLs, and Coda path suffixes.
    value = value.replace(/^https?:\/\/[^/]+/i, "");
    value = value.replace(/[?#].*$/, "");
    const last = value.split("/").filter(Boolean).pop() || value;
    const suffix = (last.match(/_([^_]+)$/) || [])[1] || last;
    return suffix.replace(/^(canvas|section|page|pages)-/i, "").replace(/[^A-Za-z0-9_-]/g, "");
  }

  function pageTokensEquivalent(a, b) {
    a = normalizePageToken(a);
    b = normalizePageToken(b);
    if (!a || !b) return false;
    return a === b || a.endsWith(b) || b.endsWith(a);
  }

  function pageNameFromTextAnchor(row) {
    const t = valueFirst(row, COL.chats.textAnchor);
    if (!t || !t.includes("/")) return "";
    return normalizeWhitespace(t.split("/")[0]);
  }

  function namesEquivalent(a, b) {
    a = normalizeWhitespace(a).toLowerCase();
    b = normalizeWhitespace(b).toLowerCase();
    return Boolean(a && b && a === b);
  }

  function codaPageMatches(rowPageUrl) {
    if (!rowPageUrl) return false;
    const a = canonicalPageKey(rowPageUrl), b = currentPageKey();
    if (a && b && (a === b || stripHash(a) === stripHash(b))) return true;
    return pageTokensEquivalent(rowPageUrl, codaPageTokenFromUrl(location.href));
  }

  function rowPageKey(row) {
    const target = targetRowForChat(row);
    return valueFirst(row, optionalColumnIds.chats.extPageKey, COL.chats.extPageUrl, COL.chats.targetPageUrl) ||
      (target ? valueFirst(target, optionalColumnIds.target.extPageKey, COL.target.pageUrl, COL.target.sourceRowUrl) : "");
  }

  function rowPageName(row) {
    const target = targetRowForChat(row);
    return valueFirst(row, optionalColumnIds.chats.extPageName, COL.chats.pageName) ||
      (target ? valueFirst(target, optionalColumnIds.target.extPageName, "c-ueArm_tFPW") : "") ||
      pageNameFromUrl(valueFirst(row, COL.chats.extPageUrl, COL.chats.targetPageUrl)) ||
      (target ? pageNameFromUrl(valueFirst(target, COL.target.pageUrl, COL.target.sourceRowUrl)) : "") ||
      pageNameFromTextAnchor(row) ||
      currentPageName();
  }

  function commentTargetIdFromChat(row) {
    const raw = rawCellValue(row, COL.chats.commentTarget);
    if (raw && typeof raw === "object") return raw.identifier || raw.rowId || raw.id || "";
    const text = simpleText(cell(row, COL.chats.commentTarget));
    return /^i-[A-Za-z0-9_-]+$/.test(text) ? text : "";
  }

  function targetRowForChat(row) {
    const id = commentTargetIdFromChat(row) || valueFirst(row, COL.chats.extTargetRowId);
    return id ? commentTargetsById.get(id) : null;
  }

  function targetPageMatchesCurrent(target) {
    if (!target) return false;
    const targetKey = valueFirst(target, optionalColumnIds.target.extPageKey);
    const currentKey = currentPageKey();
    const currentToken = codaPageTokenFromUrl(location.href);
    if (targetKey && currentKey && targetKey === currentKey) return true;
    if (targetKey && pageTokensEquivalent(targetKey, currentToken)) return true;
    const urlOrObjRef = valueFirst(target, COL.target.pageUrl, COL.target.sourceRowUrl, COL.target.contextViewUrl);
    if (urlOrObjRef && codaPageMatches(urlOrObjRef)) return true;
    const pageName = valueFirst(target, optionalColumnIds.target.extPageName, "c-ueArm_tFPW") || pageNameFromUrl(urlOrObjRef);
    return namesEquivalent(pageName, currentPageName());
  }

  function codaPageMatchesRow(row) {
    const target = targetRowForChat(row);
    if (targetPageMatchesCurrent(target)) return true;

    const currentKey = currentPageKey();
    const currentToken = codaPageTokenFromUrl(location.href);
    const explicitKey = valueFirst(row, optionalColumnIds.chats.extPageKey);
    if (explicitKey && currentKey && explicitKey === currentKey) return true;
    if (explicitKey && pageTokensEquivalent(explicitKey, currentToken)) return true;

    const urlOrObjRef = valueFirst(row, COL.chats.extPageUrl, COL.chats.targetPageUrl);
    if (urlOrObjRef && codaPageMatches(urlOrObjRef)) return true;

    // Coda can return page URL/link cells as canvas object refs and formula columns may lag after row creation.
    // Fall back through the linked _CommentTarget row before hiding a valid fresh comment.
    const rowName = valueFirst(row, optionalColumnIds.chats.extPageName, COL.chats.pageName) ||
      (target ? valueFirst(target, optionalColumnIds.target.extPageName, "c-ueArm_tFPW") : "") ||
      pageNameFromUrl(urlOrObjRef) || pageNameFromTextAnchor(row);
    if (namesEquivalent(rowName, currentPageName())) return true;

    return false;
  }

  function enrichChatFromTarget(row) {
    const target = targetRowForChat(row);
    if (!target) return row;
    const patch = {};
    const targetPageName = valueFirst(target, optionalColumnIds.target.extPageName, "c-ueArm_tFPW");
    const targetFieldName = firstNonIdLabel(
      valueFirst(target, optionalColumnIds.target.extFieldName, "c-n0oz4XVmKl", COL.target.columnId),
      valueFirst(row, COL.chats.extFieldLabel, COL.chats.chatLabel)
    );
    const targetPageUrl = valueFirst(target, COL.target.pageUrl, COL.target.sourceRowUrl, COL.target.contextViewUrl);
    const targetHash = valueFirst(target, COL.target.anchorTextHash);
    const targetExact = valueFirst(target, COL.target.anchorExactText);
    const targetPrefix = valueFirst(target, COL.target.anchorPrefix);
    const targetSuffix = valueFirst(target, COL.target.anchorSuffix);

    if (targetPageName && !valueFirst(row, COL.chats.pageName)) patch[COL.chats.pageName] = targetPageName;
    if (targetFieldName && !valueFirst(row, COL.chats.extFieldLabel, COL.chats.chatLabel)) patch[COL.chats.extFieldLabel] = targetFieldName;
    if (targetFieldName && !valueFirst(row, COL.chats.chatLabel)) patch[COL.chats.chatLabel] = targetFieldName;
    if (targetPageUrl && !valueFirst(row, COL.chats.extPageUrl, COL.chats.targetPageUrl)) patch[COL.chats.extPageUrl] = targetPageUrl;
    if (targetHash && !valueFirst(row, COL.chats.extAnchorTextHash, COL.chats.targetAnchorTextHash)) patch[COL.chats.extAnchorTextHash] = targetHash;
    if (targetExact && !valueFirst(row, COL.chats.extAnchorExactText, COL.chats.targetAnchorExactText)) patch[COL.chats.extAnchorExactText] = targetExact;
    if (targetPrefix && !valueFirst(row, COL.chats.extAnchorPrefix, COL.chats.targetAnchorPrefix)) patch[COL.chats.extAnchorPrefix] = targetPrefix;
    if (targetSuffix && !valueFirst(row, COL.chats.extAnchorSuffix, COL.chats.targetAnchorSuffix)) patch[COL.chats.extAnchorSuffix] = targetSuffix;
    return Object.keys(patch).length ? cloneRowWithValues(row, patch) : row;
  }

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function docIdFromCodaPath(path) {
    const m = String(path || "").match(/^\/docs\/([^\/?#]+)/);
    if (!m) return "";
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  }

  function tokenForCodaPath(cfg, path, tokenRole = "auto") {
    if (tokenRole === "commentEngine") return String(cfg?.commentEngineApiToken || cfg?.engineCodaApiToken || "").trim();
    if (tokenRole === "source") return String(cfg?.sourceApiToken || cfg?.apiToken || cfg?.token || "").trim();
    const pathDocId = docIdFromCodaPath(path);
    if (pathDocId && cfg?.commentEngineDocId && pathDocId === cfg.commentEngineDocId) {
      return String(cfg?.commentEngineApiToken || cfg?.engineCodaApiToken || cfg?.sourceApiToken || cfg?.apiToken || cfg?.token || "").trim();
    }
    return String(cfg?.sourceApiToken || cfg?.apiToken || cfg?.token || "").trim();
  }

  function requireToken(cfg, tokenRole = "source") {
    const token = tokenRole === "commentEngine"
      ? String(cfg?.commentEngineApiToken || cfg?.engineCodaApiToken || "").trim()
      : String(cfg?.sourceApiToken || cfg?.apiToken || cfg?.token || "").trim();
    if (!token) {
      const label = tokenRole === "commentEngine" ? "Comment Engine API key" : "Source / Extension Doc API key";
      throw new Error(`Missing ${label}. Open extension options, paste both Coda API keys, click Save + Test API Keys, then refresh this Coda tab.`);
    }
    return token;
  }

  async function codaFetch(path, options = {}) {
    return enqueueCodaRequest(async () => {
      const cfg = await getConfig();
      if (!(cfg.sourceApiToken || cfg.apiToken || cfg.token) || !(cfg.commentEngineApiToken || cfg.engineCodaApiToken)) {
        const { local, sync } = await getAllExtensionStorage();
        const repairedSourceToken = getSourceTokenFromStorageShape(local, sync);
        const repairedEngineToken = getCommentEngineTokenFromStorageShape(local, sync);
        if (repairedSourceToken) {
          cfg.sourceApiToken = repairedSourceToken;
          cfg.apiToken = repairedSourceToken;
          cfg.token = repairedSourceToken;
        }
        if (repairedEngineToken) cfg.commentEngineApiToken = repairedEngineToken;
        await repairTwoTokenAliases(repairedSourceToken, repairedEngineToken);
      }

      const { tokenRole = "auto", wguReason = "", ...fetchOptions } = options || {};
      const requestMethod = methodForCodaOptions(fetchOptions);
      if (isCodaWriteMethod(requestMethod)) {
        auditCodaWrite(path, { ...fetchOptions, wguReason });
        if (wguWriteLock) {
          auditCodaWrite(path, { ...fetchOptions, wguReason }, { blocked: true });
          throw new Error("Diagnostic write lock is enabled. Coda write was blocked by window.__wguSetWriteLock(true).");
        }
      }
      const requestToken = tokenForCodaPath(cfg, path, tokenRole);
      if (!requestToken) {
        const role = tokenRole === "commentEngine" || docIdFromCodaPath(path) === cfg.commentEngineDocId ? "Comment Engine API key" : "Source / Extension Doc API key";
        throw new Error(`Missing ${role}. Open extension options, paste both Coda API keys, click Save + Test API Keys, then refresh this Coda tab.`);
      }

      let lastPayload = null;
      let lastStatusText = "";
      for (let attempt = 0; attempt <= CODA_MAX_RETRIES; attempt += 1) {
        await throttleCodaRequest();
        const res = await fetch(`https://coda.io/apis/v1${path}`, {
          ...fetchOptions,
          cache: "no-store",
          headers: {
            "Authorization": `Bearer ${requestToken}`,
            "Content-Type": "application/json",
            "Cache-Control": "no-cache, no-store, max-age=0",
            "Pragma": "no-cache",
            ...(fetchOptions.headers || {})
          }
        });
        const text = await res.text();
        let payload = null;
        if (text) { try { payload = JSON.parse(text); } catch { payload = { raw: text }; } }
        if (res.ok) return payload || {};

        lastPayload = payload;
        lastStatusText = res.statusText;
        const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
        if (!retryable || attempt >= CODA_MAX_RETRIES) {
          const message = payload?.message || payload?.raw || res.statusText;
          if (res.status === 429) throw new Error("Coda is rate-limiting requests right now. Wait a few seconds and try again; the extension now backs off automatically, but Coda rejected this request after retries.");
          throw new Error(`${res.status}: ${message}`);
        }

        const retryAfterMs = parseRetryAfterMs(res.headers.get("Retry-After"));
        const exponentialMs = 900 * Math.pow(2, attempt);
        const delayMs = jitter(Math.max(retryAfterMs, exponentialMs));
        console.debug(`[WGU Coda Comments] Coda API ${res.status}; backing off for ${delayMs}ms before retry ${attempt + 1}/${CODA_MAX_RETRIES}.`);
        await sleep(delayMs);
      }
      throw new Error(`${lastPayload?.message || lastPayload?.raw || lastStatusText || "Coda API request failed"}`);
    });
  }

  async function listRowsInDoc(docId, tableId, limit = 100, pageToken = "") {
    const qp = new URLSearchParams({ useColumnNames: "false", valueFormat: "simple", limit: String(limit) });
    // Coda data can change outside the extension. Keep GETs deliberately fresh.
    qp.set("_wguNoCache", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    if (pageToken) qp.set("pageToken", pageToken);
    return codaFetch(`/docs/${encodeURIComponent(docId)}/tables/${encodeURIComponent(tableId)}/rows?${qp}`);
  }

  async function listRows(tableId, limit = 100, pageToken = "") {
    const cfg = await getConfig();
    return listRowsInDoc(cfg.docId, tableId, limit, pageToken);
  }

  function isTransientFetchError(err) {
    const msg = String(err?.message || err || "").toLowerCase();
    return msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("load failed") || msg.includes("network request failed");
  }

  async function listRowsPagedInDoc(docId, tableId, totalLimit = 500, pageSize = 100, options = {}) {
    const items = [];
    let pageToken = "";
    const retries = Number.isFinite(options.retries) ? options.retries : 2;
    while (items.length < totalLimit) {
      let resp = null;
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          resp = await listRowsInDoc(docId, tableId, Math.min(pageSize, totalLimit - items.length), pageToken);
          break;
        } catch (err) {
          if (!isTransientFetchError(err) || attempt >= retries) throw err;
          const delayMs = jitter(550 * Math.pow(2, attempt));
          console.warn(`[WGU Coda Comments] Transient Coda rows fetch failed for ${docId}/${tableId}; retrying in ${Math.round(delayMs)}ms.`, err);
          await sleep(delayMs);
        }
      }
      items.push(...(resp.items || []));
      pageToken = resp.nextPageToken || resp.nextPageLink?.match(/[?&]pageToken=([^&]+)/)?.[1] || "";
      if (!pageToken || !(resp.items || []).length) break;
    }
    return { items };
  }

  async function listRowsPaged(tableId, totalLimit = 500, pageSize = 100, options = {}) {
    const cfg = await getConfig();
    return listRowsPagedInDoc(cfg.docId, tableId, totalLimit, pageSize, options);
  }


  async function listColumns(tableId) {
    if (!tableId) return [];
    if (tableColumnCache.has(tableId)) return tableColumnCache.get(tableId);
    try {
      const cfg = await getConfig();
      const resp = await codaFetch(`/docs/${encodeURIComponent(cfg.docId)}/tables/${encodeURIComponent(tableId)}/columns?useColumnNames=false&limit=200`);
      const cols = resp.items || [];
      tableColumnCache.set(tableId, cols);
      return cols;
    } catch (err) {
      console.debug("[WGU Coda Comments] Could not load Coda columns", tableId, err);
      tableColumnCache.set(tableId, []);
      return [];
    }
  }

  async function loadOptionalExtensionColumns() {
    try {
      const cfg = await getConfig();
      const [targetCols, chatCols] = await Promise.all([listColumns(cfg.targetTableId), listColumns(cfg.chatsTableId)]);
      const byName = cols => new Map(cols.map(c => [normalizeWhitespace(c.name).toLowerCase(), c.id || c.columnId || c.name]).filter(x => x[0] && x[1]));
      const targetNames = byName(targetCols);
      const chatNames = byName(chatCols);
      for (const [key, name] of Object.entries(OPTIONAL_EXTENSION_COLUMNS.target)) {
        optionalColumnIds.target[key] = targetNames.get(name.toLowerCase()) || optionalColumnIds.target[key] || "";
      }
      for (const [key, name] of Object.entries(OPTIONAL_EXTENSION_COLUMNS.chats)) {
        optionalColumnIds.chats[key] = chatNames.get(name.toLowerCase()) || optionalColumnIds.chats[key] || "";
      }
    } catch (err) {
      console.debug("[WGU Coda Comments] Optional extension page columns unavailable", err);
    }
    return optionalColumnIds;
  }

  function addIfColumn(cells, colId, value) {
    if (colId) cells[colId] = value;
  }

  async function codaColumnName(tableId, columnId) {
    if (!tableId || !columnId) return "";
    const cols = await listColumns(tableId);
    const col = cols.find(c => (c.id || c.columnId || c.name) === columnId);
    return normalizeWhitespace(col?.name || "");
  }

  async function codaTableInfo(tableId) {
    if (!tableId) return null;
    if (tableInfoCache.has(tableId)) return tableInfoCache.get(tableId);
    try {
      const cfg = await getConfig();
      const info = await codaFetch(`/docs/${encodeURIComponent(cfg.docId)}/tables/${encodeURIComponent(tableId)}?useColumnNames=false`);
      const clean = {
        id: info.id || info.tableId || tableId,
        name: normalizeWhitespace(info.name || info.displayName || info.browserLink || ""),
        browserLink: info.browserLink || info.href || ""
      };
      tableInfoCache.set(tableId, clean);
      return clean;
    } catch (err) {
      console.debug("[WGU Coda Comments] Could not load Coda table info", tableId, err);
      const clean = { id: tableId, name: "", browserLink: "" };
      tableInfoCache.set(tableId, clean);
      return clean;
    }
  }

  async function codaTableName(tableId) {
    const info = await codaTableInfo(tableId);
    return normalizeWhitespace(info?.name || "");
  }

  async function loadMentionDirectory(force = false) {
    const now = Date.now();
    if (!force && mentionDirectoryCache.length && now - mentionDirectoryLoadedAt < 5 * 60 * 1000) return mentionDirectoryCache;

    const resp = await listRows(MENTION_DIRECTORY.tableId, 150);
    const entries = (resp.items || []).map(makeMentionDirectoryEntry).filter(Boolean);

    entries.sort((a, b) => {
      if (a.mentionMode !== b.mentionMode) return a.mentionMode === "native" ? -1 : 1;
      return a.displayName.localeCompare(b.displayName);
    });

    mentionDirectoryCache = entries;
    mentionDirectoryLoadedAt = now;
    mentionDirectoryLoaded = true;
    console.log(`[WGU Coda Comments] Loaded ${entries.length} mentionable _Users GURPS users.`);
    return mentionDirectoryCache;
  }

  function searchMentionDirectory(query, limit = 8) {
    const q = String(query || "").trim().toLowerCase();
    const all = mentionDirectoryCache || [];
    if (!q) return all.slice(0, limit);

    const starts = [];
    const contains = [];
    for (const m of all) {
      const name = m.displayName.toLowerCase();
      const email = (m.email || "").toLowerCase();
      const userName = (m.userName || "").toLowerCase();
      const role = (m.roleAcronym || "").toLowerCase();

      if (name.startsWith(q) || email.startsWith(q) || userName.startsWith(q) || role.startsWith(q)) starts.push(m);
      else if (m.search.includes(q)) contains.push(m);
    }

    return starts.concat(contains).slice(0, limit);
  }

  async function addRowInDoc(docId, tableId, cells) {
    const cleanCells = Object.entries(cells || {})
      .filter(([column, value]) => column && value !== undefined)
      .map(([column, value]) => ({ column, value }));
    const body = { rows: [{ cells: cleanCells }] };
    return codaFetch(`/docs/${encodeURIComponent(docId)}/tables/${encodeURIComponent(tableId)}/rows`, { method: "POST", body: JSON.stringify(body), wguReason: "addRowInDoc" });
  }

  async function addRow(tableId, cells) {
    const cfg = await getConfig();
    return addRowInDoc(cfg.docId, tableId, cells);
  }

  async function addRows(tableId, columnIds, rows) {
    const cfg = await getConfig();
    const body = {
      rows: rows.map(values => ({
        cells: columnIds.map((column, idx) => ({ column, value: values[idx] })).filter(cell => cell.column)
      }))
    };
    return codaFetch(`/docs/${encodeURIComponent(cfg.docId)}/tables/${encodeURIComponent(tableId)}/rows`, {
      method: "POST",
      body: JSON.stringify(body),
      wguReason: "addRows"
    });
  }

  function extensionMessageIdFor(chatRowId, messageType = "reply") {
    const seed = `${chatRowId || "new"}|${messageType}|${Date.now()}|${Math.random().toString(36).slice(2, 8)}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    return `msg-${Date.now()}-${Math.abs(hash)}`;
  }

  async function addChatMessage({ chatRowId, body = "", messageType = "reply", mentionedEmails = [], nativeSyncStatus = "Not Synced", nativeThreadUri = "", nativeLastError = "", extensionMessageId = "", sourceDocId = "", sourcePageUrl = "" }) {
    const text = normalizeWhitespace(body);
    if (!chatRowId || !text) return null;
    const cfg = await getConfig();
    const messagesTableId = commentsMessagesTableId(cfg);
    if (!messagesTableId) return null;
    const sender = await getCurrentCodaUserSafe();
    const c = COL.messages;
    const msgId = extensionMessageId || extensionMessageIdFor(chatRowId, messageType);
    const cells = {
      [c.messageText]: text,
      [c.message]: text,
      [c.chat]: chatRowId,
      [c.chatRowId]: chatRowId,
      [c.authorName]: sender.name || "",
      [c.authorEmail]: sender.email || "",
      [CHAT_ENGINE.messages.authorInitials]: currentUserInitialsForAvatar(),
      [c.messageType]: messageType || "reply",
      [c.createdAt]: new Date().toISOString(),
      [CHAT_ENGINE.messages.clientCreatedAt]: new Date().toISOString(),
      [c.mentionedEmails]: Array.isArray(mentionedEmails) ? mentionedEmails.join(", ") : String(mentionedEmails || ""),
      [c.nativeSyncStatus]: nativeSyncStatus || "Not Synced",
      [c.nativeThreadUri]: nativeThreadUri || "",
      [c.nativeLastError]: nativeLastError || "",
      [c.extensionMessageId]: msgId,
      [CHAT_ENGINE.messages.sourceDocId]: sourceDocId || sourceDocIdForRuntime(cfg),
      [CHAT_ENGINE.messages.sourcePageUrl]: sourcePageUrl || currentSourcePageUrl()
    };
    return addRowInDoc(commentsDocId(cfg), messagesTableId, cells);
  }

  async function updateRowInDoc(docId, tableId, rowId, cells) {
    const cleanCells = Object.entries(cells || {})
      .filter(([column, value]) => column && value !== undefined)
      .map(([column, value]) => ({ column, value }));
    const body = { row: { cells: cleanCells } };
    return codaFetch(`/docs/${encodeURIComponent(docId)}/tables/${encodeURIComponent(tableId)}/rows/${encodeURIComponent(rowId)}`, {
      method: "PUT",
      body: JSON.stringify(body),
      wguReason: "updateRow"
    });
  }

  async function updateRow(tableId, rowId, cells) {
    const cfg = await getConfig();
    return updateRowInDoc(cfg.docId, tableId, rowId, cells);
  }

  async function enqueueMentionNotifications({ chatRowId, targetRowId = "", anchorHash = "", content = "", sourceField = "", pageUrl = "", nativeThreadUri = "", nativeThreadUrl = "", resolvedMentions = null }) {
    const cfg = await getConfig();
    if (useCommentEngine(cfg)) return { queued: 0, skipped: "comment_engine_mode" };
    if (!mentionDirectoryLoaded) await loadMentionDirectory(false).catch(() => {});

    let identities = selectedMentionIdentities(chatRowId);

    // Defensive fallback: initial comments create the chat row after the modal selection.
    // If the selected identity map is somehow empty, resolve from the stored mention
    // tokens/emails against the already-loaded GURPS directory.
    if (!identities.length && resolvedMentions) {
      const emails = (resolvedMentions.emails || []).map(x => String(x || "").toLowerCase());
      const tokens = (resolvedMentions.tokens || []).map(t => String(t || "").replace(/^@/, "").trim().toLowerCase());

      identities = mentionDirectoryCache.filter(m => {
        const emailMatch = m.email && emails.includes(m.email.toLowerCase());
        const tokenMatch = tokens.some(t => t && m.displayName.toLowerCase() === t);
        return emailMatch || tokenMatch;
      }).map(m => ({
        rowId: m.rowId || "",
        displayName: m.displayName || "",
        email: m.email || "",
        codaPersonId: m.codaPersonId || "",
        userName: m.userName || "",
        roleAcronym: m.roleAcronym || "",
        mentionMode: m.mentionMode || "fallback",
        isWorkspaceMember: Boolean(m.isWorkspaceMember)
      }));
    }

    if (!identities.length) {
      console.log("[WGU Coda Comments] No resolved mention identities to enqueue.", { chatRowId, resolvedMentions });
      return { queued: 0 };
    }

    const sender = await getCurrentCodaUserSafe();
    const q = MENTION_NOTIFICATION_QUEUE;
    const notificationUrl = addWguDeepLinkParams(pageUrl || currentPageUrl(), {
      hash: anchorHash,
      chatRowId,
      targetRowId
    });
    const rows = identities
      .filter(m => m.email)
      .map(m => {
        const notificationId = notificationIdFor(chatRowId, m, content);
        return [
          notificationId,
          "Pending",
          m.displayName || "",
          m.email || "",
          m.codaPersonId || "",
          `@${m.displayName || m.email}`,
          content || "",
          sender.name || "",
          sender.email || "",
          chatRowId || "",
          targetRowId || "",
          sourceField || "",
          notificationUrl,
          nativeThreadUri || "",
          nativeThreadUrl || "",
          new Date().toISOString(),
          "",
          ""
        ];
      });

    if (!rows.length) return { queued: 0 };

    await addRows(q.tableId, [
      q.columns.notificationId,
      q.columns.status,
      q.columns.mentionedName,
      q.columns.mentionedEmail,
      q.columns.mentionedCodaPersonId,
      q.columns.mentionText,
      q.columns.commentContent,
      q.columns.senderName,
      q.columns.senderEmail,
      q.columns.chatRowId,
      q.columns.targetRowId,
      q.columns.sourceField,
      q.columns.sourcePageUrl,
      q.columns.nativeThreadUri,
      q.columns.nativeThreadUrl,
      q.columns.createdAt,
      q.columns.sentAt,
      q.columns.lastError
    ], rows);

    console.log(`[WGU Coda Comments] Queued ${rows.length} mention notification row(s).`, { chatRowId, sourceField });
    return { queued: rows.length };
  }

  async function callNativeCommentBridge(payload) {
    const cfg = await getConfig();
    const bridgeUrl = sanitizeBridgeUrl(cfg.nativeBridgeUrl);
    if (!bridgeUrl) {
      return {
        enabled: false,
        nativeSyncStatus: "Disabled",
        mentionNotificationStatus: payload.mentions?.tokens?.length || payload.mentions?.emails?.length ? "Fallback Needed" : "None",
        error: "Native Coda Comment Bridge URL is not configured."
      };
    }

    const res = await fetch(bridgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...payload,
        extensionVersion: VERSION,
        bridgeContractVersion: NATIVE_BRIDGE_CONTRACT_VERSION,
        requestedAt: new Date().toISOString()
      })
    });

    const text = await res.text();
    let body = {};
    if (text) {
      try { body = JSON.parse(text); } catch { body = { raw: text }; }
    }

    if (!res.ok) {
      throw new Error(body.message || body.error || body.raw || `${res.status} ${res.statusText}`);
    }

    return {
      enabled: true,
      nativeSyncStatus: body.nativeSyncStatus || "Synced",
      mentionNotificationStatus: body.mentionNotificationStatus || mentionStatusFor(payload.mentions || { tokens: [], emails: [] }, "Synced"),
      threadUri: body.threadUri || "",
      threadUrl: body.threadUrl || "",
      raw: body
    };
  }

  async function syncNativeCommentForChat({ chatRowId, action, content, fieldLabel, exact, hash, pageUrl, threadUri = "", resolvedMentions = null }) {
    const cfg = await getConfig();
    if (useCommentEngine(cfg)) {
      return { nativeSyncStatus: "Disabled", mentionNotificationStatus: "None", mentions: resolvedMentions || extractMentions(content) };
    }
    const mentions = resolvedMentions || extractMentions(content);
    const bridgeUrl = sanitizeBridgeUrl(cfg.nativeBridgeUrl);

    const preStatus = bridgeUrl ? "Pending" : "Disabled";
    const preMentionStatus = mentionStatusFor(mentions, preStatus);

    if (chatRowId) {
      await updateRow(cfg.chatsTableId, chatRowId, {
        [COL.chats.nativeSyncStatus]: preStatus,
        [COL.chats.mentionedText]: mentions.tokens.join(", "),
        [COL.chats.mentionedEmails]: mentions.emails.join(", "),
        [COL.chats.mentionNotificationStatus]: preMentionStatus,
        [COL.chats.nativeLastError]: ""
      });
    }

    if (!bridgeUrl) {
      return { nativeSyncStatus: "Disabled", mentionNotificationStatus: preMentionStatus, mentions };
    }

    try {
      const result = await callNativeCommentBridge({
        docId: cfg.docId,
        action,
        content,
        fieldLabel,
        exact,
        hash,
        pageUrl,
        threadUri,
        mentions,
        mentionIdentities: chatRowId ? selectedMentionIdentities(chatRowId) : [],
        source: {
          app: "wgu-coda-comment-assistant",
          extensionVersion: VERSION,
          bridgeContractVersion: NATIVE_BRIDGE_CONTRACT_VERSION,
          url: location.href
        }
      });

      if (chatRowId) {
        await updateRow(cfg.chatsTableId, chatRowId, {
          [COL.chats.nativeThreadUri]: result.threadUri || threadUri || "",
          [COL.chats.nativeThreadUrl]: result.threadUrl || "",
          [COL.chats.nativeSyncStatus]: result.nativeSyncStatus,
          [COL.chats.nativeLastSyncedAt]: new Date().toISOString(),
          [COL.chats.nativeLastError]: "",
          [COL.chats.mentionedText]: mentions.tokens.join(", "),
          [COL.chats.mentionedEmails]: mentions.emails.join(", "),
          [COL.chats.mentionNotificationStatus]: result.mentionNotificationStatus
        });
      }

      return { ...result, mentions };
    } catch (err) {
      if (chatRowId) {
        await updateRow(cfg.chatsTableId, chatRowId, {
          [COL.chats.nativeSyncStatus]: "Failed",
          [COL.chats.nativeLastError]: err.message || String(err),
          [COL.chats.mentionedText]: mentions.tokens.join(", "),
          [COL.chats.mentionedEmails]: mentions.emails.join(", "),
          [COL.chats.mentionNotificationStatus]: mentions.tokens.length || mentions.emails.length ? "Fallback Needed" : "Failed"
        });
      }
      return { nativeSyncStatus: "Failed", mentionNotificationStatus: mentions.tokens.length || mentions.emails.length ? "Fallback Needed" : "Failed", error: err.message || String(err), mentions };
    }
  }

  function cell(row, columnId) { return row?.values?.[columnId]; }
  function simpleText(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return value.map(simpleText).join(", ");
    if (typeof value === "object") {
      if ("content" in value) return simpleText(value.content);
      if ("name" in value) return simpleText(value.name);
      if ("display" in value) return simpleText(value.display);
      if ("value" in value) return simpleText(value.value);
      if ("url" in value) return simpleText(value.url);
      // Coda link/object reference cells can be returned as {type:"objref", refType:"canvas", objectId:"canvas-..."}.
      // Treat objectId as readable metadata so page filtering does not drop valid rows.
      if ("objectId" in value) return simpleText(value.objectId);
      if ("identifier" in value) return simpleText(value.identifier);
    }
    return "";
  }
  function rowId(row) { return row?.id || row?.rowId || row?.name || ""; }

  function stableThreadIdForChat(row) {
    // In Comment Engine mode, the human/display Thread ID is the durable thread key,
    // while Coda row IDs can differ after optimistic rows are replaced by saved rows.
    // Keep rowId for Coda updates, but use both IDs for anchor/card/icon navigation.
    return valueFirst(row, COL.chats.chatLabel) || row?.threadId || row?.name || rowId(row);
  }

  function threadKeyCandidatesForChat(row) {
    return Array.from(new Set([stableThreadIdForChat(row), rowId(row)].filter(Boolean)));
  }

  function isSyntheticRow(row) {
    return Boolean(row?.synthetic);
  }

  function makeSyntheticChat({ hash, exact, prefix, suffix, pageUrl, fieldLabel, targetId, message, payload = {} }) {
    const id = `pending-${hash}-${Date.now()}`;
    return {
      id,
      rowId: id,
      synthetic: true,
      createdAtMs: Date.now(),
      __wguLiveRange: payload.liveRange || null,
      values: {
        [COL.chats.extAnchorTextHash]: hash,
        [COL.chats.extAnchorExactText]: exact,
        [COL.chats.extAnchorPrefix]: prefix,
        [COL.chats.extAnchorSuffix]: suffix,
        [COL.chats.currentMatchedText]: exact,
        [COL.chats.extPageUrl]: pageUrl,
        [COL.chats.extFieldLabel]: fieldLabel,
        [COL.chats.extTargetRowId]: targetId || "",
        [COL.chats.extAnchorStatus]: "Active",
        [COL.chats.extPendingSync]: true,
        [COL.chats.textAnchor]: `${pageNameFromUrl(pageUrl) || currentPageName()} / ${fieldLabel}: ${exact}`,
        [COL.chats.commentLog]: message || "",
        [COL.chats.whatsOnYourMind]: message || "",
        [COL.chats.lastMessagePreview]: message || "",
        [COL.chats.lastMessageAt]: message ? new Date().toISOString() : "",
        [COL.chats.lastMessageAuthorInitials]: currentUserInitialsForAvatar(),
        [COL.chats.messageCountFast]: message ? 1 : 0,
        [COL.chats.legacyCommentLogFrozen]: true,
        [COL.chats.currentThreadCount]: message ? 1 : 0,
        [COL.chats.extPageName]: payload.pageName || currentPageName(),
        [COL.chats.extPageKey]: payload.pageKey || currentPageKey(),
        [COL.chats.anchorNearestHeading]: payload.nearestHeading || payload.headingLabel || "",
        [COL.chats.anchorBlockExcerpt]: payload.blockExcerpt || payload.snapshot || "",
        [COL.chats.anchorPreviousSentence]: payload.previousSentence || "",
        [COL.chats.anchorNextSentence]: payload.nextSentence || "",
        [COL.chats.anchorNormalizedSignature]: payload.normalizedSignature || "",
        [COL.chats.anchorRareTokens]: payload.rareTokens || "",
        [COL.chats.anchorSourceTableName]: payload.sourceTableName || payload.tableName || payload.tableId || "",
        [COL.chats.anchorSourceColumnName]: payload.sourceColumnName || payload.columnName || fieldLabel || "",
        [COL.chats.anchorSourceRowDisplay]: payload.sourceRowDisplay || payload.rowText || payload.cellText || "",
        [COL.chats.anchorDomFingerprint]: payload.domFingerprint || payload.domPathHint || "",
        [COL.chats.anchorBlockIndex]: Number(payload.blockIndex || 0),
        [COL.chats.anchorContextCapturedAt]: payload.capturedAt || new Date().toISOString(),
        [COL.chats.anchorApproxTop]: payload.anchorApproxTop,
        [COL.chats.anchorApproxLeft]: payload.anchorApproxLeft,
        [COL.chats.anchorApproxHeight]: payload.anchorApproxHeight,
        [COL.chats.anchorApproxWidth]: payload.anchorApproxWidth,
        [COL.chats.anchorApproxCapturedAt]: payload.anchorApproxCapturedAt || new Date().toISOString(),
        [COL.chats.anchorApproxPageHeight]: payload.anchorApproxPageHeight,
        [COL.chats.anchorApproxViewportHeight]: payload.anchorApproxViewportHeight || window.innerHeight,
        [COL.chats.anchorApproxScrollContainer]: payload.anchorApproxScrollContainer || "window",
        [COL.chats.anchorApproxSource]: payload.anchorApproxSource || "selection_payload",
        [COL.chats.anchorApproxConfidence]: payload.anchorApproxConfidence || "Medium"
      }
    };
  }

  function valueFirst(row, ...columnIds) {
    for (const id of columnIds) {
      const v = simpleText(cell(row, id));
      if (v) return v;
    }
    return "";
  }

  function cloneRowWithValues(row, patchValues = {}) {
    return {
      ...row,
      values: {
        ...(row?.values || {}),
        ...patchValues
      }
    };
  }

  function getChatLog(row) {
    const override = optimisticReplyOverrides.get(rowId(row));
    if (override?.commentLog != null) return override.commentLog;
    return simpleText(cell(row, COL.chats.commentLog));
  }

  function getThreadCount(row) {
    const override = optimisticReplyOverrides.get(rowId(row));
    if (override?.threadCount != null) return override.threadCount;
    return Number(simpleText(cell(row, COL.chats.messageCountFast))) || Number(simpleText(cell(row, COL.chats.currentThreadCount))) || 0;
  }

  function isResolvedValue(value) {
    const v = simpleText(value).trim().toLowerCase();
    return v === "true" || v === "yes" || v === "1" || v === "checked";
  }

  function applyOptimisticReplyOverride(row) {
    const id = rowId(row);
    const replyOverride = optimisticReplyOverrides.get(id);
    const statusOverride = optimisticStatusOverrides.get(id);
    const patch = {};
    if (replyOverride) {
      patch[COL.chats.commentLog] = replyOverride.commentLog;
      patch[COL.chats.currentThreadCount] = replyOverride.threadCount;
      patch[COL.chats.messageCountFast] = replyOverride.threadCount;
      if (replyOverride.lastMessagePreview != null) patch[COL.chats.lastMessagePreview] = replyOverride.lastMessagePreview;
      if (replyOverride.lastMessageAt != null) patch[COL.chats.lastMessageAt] = replyOverride.lastMessageAt;
      if (replyOverride.lastMessageAuthorInitials != null) patch[COL.chats.lastMessageAuthorInitials] = replyOverride.lastMessageAuthorInitials;
      patch[COL.chats.extPendingSync] = replyOverride.pending;
    }
    if (statusOverride?.resolved) patch[COL.chats.resolved] = true;
    if (statusOverride?.pending) patch[COL.chats.extPendingSync] = true;
    return Object.keys(patch).length ? cloneRowWithValues(row, patch) : row;
  }


  function getPanelWidthPx() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--wgu-comments-width").trim();
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : 390;
  }

  function rememberStyle(el) {
    if (el.dataset.wguRememberedStyle === "true") return;
    el.dataset.wguRememberedStyle = "true";
    el.dataset.wguOrigWidth = el.style.width || "";
    el.dataset.wguOrigMaxWidth = el.style.maxWidth || "";
    el.dataset.wguOrigRight = el.style.right || "";
    el.dataset.wguOrigFlexBasis = el.style.flexBasis || "";
    el.dataset.wguOrigMarginRight = el.style.marginRight || "";
    el.dataset.wguOrigPaddingRight = el.style.paddingRight || "";
  }

  function restoreStyle(el) {
    if (el.dataset.wguRememberedStyle !== "true") return;
    el.style.width = el.dataset.wguOrigWidth || "";
    el.style.maxWidth = el.dataset.wguOrigMaxWidth || "";
    el.style.right = el.dataset.wguOrigRight || "";
    el.style.flexBasis = el.dataset.wguOrigFlexBasis || "";
    el.style.marginRight = el.dataset.wguOrigMarginRight || "";
    el.style.paddingRight = el.dataset.wguOrigPaddingRight || "";
    delete el.dataset.wguRememberedStyle;
    delete el.dataset.wguOrigWidth;
    delete el.dataset.wguOrigMaxWidth;
    delete el.dataset.wguOrigRight;
    delete el.dataset.wguOrigFlexBasis;
    delete el.dataset.wguOrigMarginRight;
    delete el.dataset.wguOrigPaddingRight;
    delete el.dataset.wguPushed;
    el.removeAttribute("data-wgu-push-candidate");
  }

  function markPushCandidates(open) {
    // v1.9.15: the comments panel is a true overlay. Never resize,
    // cap, shift, or otherwise restyle Coda containers to make room for it.
    // Still restore anything touched by older builds in this session.
    qsa("[data-wgu-pushed='true'],[data-wgu-push-candidate='true']").forEach(restoreStyle);
  }

  function ensureSidebar() {
    if (sidebar && document.body.contains(sidebar)) return sidebar;
    sidebar = document.createElement("aside");
    sidebar.id = "wgu-coda-comment-sidebar";
    sidebar.innerHTML = `
      <div class="wgu-sidebar-head wgu-wordish-head">
        <div class="wgu-sidebar-title-row">
          <strong>Comments</strong>
          <span class="wgu-sidebar-actions">
            <button id="wgu-new-comment-top" class="wgu-word-new-comment" title="Create a new comment on selected text">☘ New</button>
            <span id="wgu-comment-count" class="wgu-comment-count">0 items</span>
            <button id="wgu-filter-comments" title="Comments settings and filters">☰</button>
            <button id="wgu-refresh-comments" title="Refresh">↻</button>
            <button id="wgu-collapse-comments" title="Collapse">×</button>
          </span>
        </div>
        <div class="wgu-sidebar-chip-row wgu-advanced-controls" role="toolbar" aria-label="Coda comment panel controls">
          <button type="button" class="wgu-nav-chip" data-wgu-tab="comments" aria-selected="true">Comments</button>
          <button type="button" class="wgu-nav-chip wgu-highlights-chip" data-wgu-toggle="highlights" aria-pressed="true">✓ Highlights</button>
          <button type="button" class="wgu-nav-chip" data-wgu-tab="shortcuts" aria-selected="false">Shortcuts</button>
          <button type="button" class="wgu-nav-chip" data-wgu-tab="settings" aria-selected="false">Settings</button>
        </div>
      </div>
      <div id="wgu-comments-list"></div>
    `;
    document.body.appendChild(sidebar);
    qs("#wgu-refresh-comments", sidebar).addEventListener("click", () => hardReloadPageChats());
    qs("#wgu-collapse-comments", sidebar).addEventListener("click", () => setPanelOpen(false));
    qs("#wgu-filter-comments", sidebar).addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      sidebar.classList.toggle("wgu-show-advanced-controls");
    });
    qs("#wgu-new-comment-top", sidebar).addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      openCommentModal().catch(err => { console.error(err); setSidebarError(err.message || String(err)); });
    });
    qsa("[data-wgu-tab]", sidebar).forEach(btn => {
      btn.addEventListener("click", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        setSidebarTab(btn.dataset.wguTab || "comments");
      });
    });
    qs("[data-wgu-toggle='highlights']", sidebar).addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      setHighlightsVisible(!highlightsVisible);
    });
    updateSidebarChips();
    return sidebar;
  }



  function updateSidebarChips() {
    if (!sidebar) return;
    qsa("[data-wgu-tab]", sidebar).forEach(btn => {
      const active = (btn.dataset.wguTab || "") === currentSidebarTab;
      btn.classList.toggle("wgu-chip-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    const highlightsChip = qs("[data-wgu-toggle='highlights']", sidebar);
    if (highlightsChip) {
      highlightsChip.classList.toggle("wgu-highlights-on", Boolean(highlightsVisible));
      highlightsChip.classList.toggle("wgu-highlights-off", !highlightsVisible);
      highlightsChip.setAttribute("aria-pressed", highlightsVisible ? "true" : "false");
      highlightsChip.textContent = highlightsVisible ? "✓ Highlights" : "× Highlights";
      highlightsChip.title = highlightsVisible ? "Hide comment highlights on this page" : "Show comment highlights on this page";
    }
  }

  async function setHighlightsVisible(visible) {
    savedHighlightsPreference = Boolean(visible);
    highlightsVisible = savedHighlightsPreference;
    focusOnlyAnchorHash = "";
    updateSidebarChips();
    await chrome.storage.local.set({ highlightsVisible: savedHighlightsPreference }).catch(() => {});
    await chrome.storage.sync.set({ highlightsVisible: savedHighlightsPreference }).catch(() => {});
    applyHighlights(visibleActiveChats(mergeOptimisticChats(lastFetchedPageChats)));
  }

  async function setAltClickShortcutEnabled(enabled) {
    shortcutAltClickEnabled = Boolean(enabled);
    await chrome.storage.local.set({ shortcutAltClickEnabled }).catch(() => {});
    await chrome.storage.sync.set({ shortcutAltClickEnabled }).catch(() => {});
    if (currentSidebarTab === "shortcuts") renderSidebarUtilityPanel();
  }

  function setSidebarTab(tab, { render = true } = {}) {
    currentSidebarTab = ["comments", "shortcuts", "settings"].includes(tab) ? tab : "comments";
    updateSidebarChips();
    if (!render) return;
    if (currentSidebarTab === "comments") renderSidebar(visibleActiveChats(mergeOptimisticChats(lastFetchedPageChats)));
    else renderSidebarUtilityPanel();
  }

  function renderSidebarUtilityPanel() {
    ensureSidebar();
    const list = qs("#wgu-comments-list", sidebar);
    cardRegistryByThreadId.clear();
    try { window.WGU?.Sidebar?.Registry?.clearCards?.(); } catch {}
    if (!list) return;
    if (currentSidebarTab === "shortcuts") {
      list.innerHTML = `
        <div class="wgu-utility-panel">
          <h3>Shortcuts</h3>
          <p>The default interaction keeps Coda in charge. Hover a protected table cell and click the 💬 button to comment.</p>
          <label class="wgu-setting-row">
            <input type="checkbox" id="wgu-alt-click-shortcut" ${shortcutAltClickEnabled ? "checked" : ""}>
            <span><strong>Enable Alt/Option + click</strong><small>Open the 1:1 comment overlay from a protected cell without using the 💬 button.</small></span>
          </label>
          <div class="wgu-shortcut-card"><strong>Primary:</strong> Hover a cell → click 💬 → select text → comment.</div>
          <div class="wgu-shortcut-card"><strong>Optional:</strong> Alt/Option + click a protected cell.</div>
        </div>`;
      qs("#wgu-alt-click-shortcut", list)?.addEventListener("change", ev => setAltClickShortcutEnabled(ev.target.checked));
      return;
    }
    list.innerHTML = `
      <div class="wgu-utility-panel">
        <h3>Settings</h3>
        <p>Commenting is intentionally decoupled from normal Coda mouse behavior.</p>
        <div class="wgu-setting-summary"><strong>Activation:</strong> 💬 hover button${shortcutAltClickEnabled ? " + Alt/Option shortcut" : ""}</div>
        <div class="wgu-setting-summary"><strong>Highlights:</strong> ${highlightsVisible ? "Visible" : "Hidden"}</div>
        <p class="wgu-muted-note">The Highlights chip controls page clutter. Hidden highlights keep their comment anchors, but all page highlights remain hidden until the chip is turned back on.</p>
      </div>`;
  }

  function ensureTab() {
    if (qs("#wgu-coda-comment-tab")) return;
    const tab = document.createElement("button");
    tab.id = "wgu-coda-comment-tab";
    tab.textContent = "Comments";
    tab.addEventListener("click", () => setPanelOpen(true));
    document.body.appendChild(tab);
  }

  async function setPanelOpen(open) {
    ensureSidebar();
    ensureTab();
    const isOpen = Boolean(open);
    document.documentElement.classList.toggle("wgu-comments-panel-open", isOpen);
    markPushCandidates(false);
    invalidateReadableViewport("sidebar open/close");
    scheduleIconPositionReflow();

    // Sidebar open/closed state should never drive page highlight visibility.
    // The Highlights chip is the single source of truth.
    highlightsVisible = savedHighlightsPreference;
    focusOnlyAnchorHash = "";
    updateSidebarChips();
    applyHighlights(visibleActiveChats(mergeOptimisticChats(lastFetchedPageChats)));

    await chrome.storage.local.set({ panelOpen: isOpen });
    try { await chrome.storage.sync.set({ panelOpen: isOpen }); } catch {}
  }

  async function initializePanelState() {
    const cfg = await getConfig();
    savedHighlightsPreference = cfg.highlightsVisible !== false;
    highlightsVisible = savedHighlightsPreference;
    focusOnlyAnchorHash = "";
    shortcutAltClickEnabled = Boolean(cfg.shortcutAltClickEnabled);
    await primeCurrentCodaUserCache();
    ensureSidebar(); ensureTab();
    updateSidebarChips();
    // Start collapsed, but do not let sidebar state control highlights.
    await setPanelOpen(false);
  }

  function setSidebarError(message) {
    ensureSidebar();
    const list = qs("#wgu-comments-list", sidebar);
    const el = document.createElement("div");
    el.className = "wgu-small-error";
    el.textContent = message;
    list.prepend(el);
  }

  function elementText(el) {
    return normalizeWhitespace(el?.innerText || el?.textContent || "");
  }

  function looksLikeUsefulHeading(text) {
    const t = normalizeWhitespace(text);
    if (!t || t.length < 4 || t.length > 140) return false;
    if (/^[A-Z]{1,3}$/.test(t)) return false;
    if (/^(CU|OK|AM|PM)$/i.test(t)) return false;
    return true;
  }

  function visibleRect(el) {
    try {
      const rect = el.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return null;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return null;
      return rect;
    } catch {
      return null;
    }
  }

  function headingScore(el, rect, selectionRect) {
    const tag = String(el.tagName || "").toLowerCase();
    const style = getComputedStyle(el);
    const weight = parseInt(style.fontWeight || "400", 10) || 400;
    const size = parseFloat(style.fontSize || "0") || 0;
    const dy = Math.max(0, selectionRect.top - rect.bottom);
    const overlap = Math.max(0, Math.min(selectionRect.right, rect.right) - Math.max(selectionRect.left, rect.left));
    const horizontalPenalty = overlap > 0 ? 0 : Math.min(Math.abs(selectionRect.left - rect.right), Math.abs(rect.left - selectionRect.right)) * 0.25;

    let score = dy + horizontalPenalty;
    if (/^h[1-6]$/.test(tag) || el.getAttribute("role") === "heading") score -= 120;
    if (weight >= 600) score -= 45;
    if (size >= 18) score -= 45;
    if (size >= 22) score -= 35;
    if (rect.width > 850) score += 40;
    return score;
  }

  function nearestSelectionHeading(selectionRange = null) {
    const selection = window.getSelection();
    const range = selectionRange || (selection && selection.rangeCount ? selection.getRangeAt(0) : null);
    if (!range) return "";

    const selectionRect = range.getBoundingClientRect();
    if (!selectionRect || (!selectionRect.width && !selectionRect.height)) return "";

    const ancestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

    // First walk ancestors; Coda often nests text under a section/canvas container.
    let node = ancestor;
    while (node && node !== document.body) {
      const candidates = qsa("h1,h2,h3,h4,h5,h6,[role='heading'],strong,b", node.parentElement || node)
        .filter(el => el !== ancestor && !el.contains(ancestor));
      let best = null;
      for (const el of candidates) {
        if (el.closest("#wgu-coda-comment-sidebar,#wgu-comment-modal-backdrop,#wgu-coda-comment-btn,#wgu-coda-comment-tab,#wgu-coda-cell-selection-overlay,#wgu-coda-cell-selection-toolbar,#wgu-cell-comment-trigger")) continue;
        const text = elementText(el);
        if (!looksLikeUsefulHeading(text)) continue;
        const rect = visibleRect(el);
        if (!rect || rect.bottom > selectionRect.top + 8) continue;
        const score = headingScore(el, rect, selectionRect);
        if (!best || score < best.score) best = { text, score };
      }
      if (best) return best.text;
      node = node.parentElement;
    }

    // Fallback: scan visible page elements above the selection and pick the best heading-like text.
    let best = null;
    qsa("h1,h2,h3,h4,h5,h6,[role='heading'],strong,b,div,p").forEach(el => {
      if (el.closest("#wgu-coda-comment-sidebar,#wgu-comment-modal-backdrop,#wgu-coda-comment-btn,#wgu-coda-comment-tab,#wgu-coda-cell-selection-overlay,#wgu-coda-cell-selection-toolbar,#wgu-cell-comment-trigger")) return;
      if (ancestor && el.contains(ancestor)) return;
      const text = elementText(el);
      if (!looksLikeUsefulHeading(text)) return;
      const rect = visibleRect(el);
      if (!rect || rect.bottom > selectionRect.top + 8) return;
      if (selectionRect.top - rect.bottom > 900) return;
      const score = headingScore(el, rect, selectionRect);
      if (!best || score < best.score) best = { text, score };
    });

    return best?.text || "";
  }

  function findFieldByLabel(fields, label) {
    const target = normalizeWhitespace(label).toLowerCase();
    if (!target) return null;
    return fields.find(f => normalizeWhitespace(f.displayLabel).toLowerCase() === target)
      || fields.find(f => target.includes(normalizeWhitespace(f.displayLabel).toLowerCase()) || normalizeWhitespace(f.displayLabel).toLowerCase().includes(target));
  }

  function isWeakFieldLabel(label) {
    const t = normalizeWhitespace(label);
    return !t || t.length <= 3 || /^[A-Z]{1,3}$/.test(t) || /^(CU|OK|AM|PM)$/i.test(t);
  }

  async function loadDiscussableFields(force = false) {
    const now = Date.now();
    if (!force && discussableFields.length && now - fieldsLoadedAt < 60000) return discussableFields;
    const cfg = await getConfig();
    const resp = await listRows(cfg.fieldsTableId, 100);
    discussableFields = (resp.items || []).map(r => ({
      rowId: rowId(r),
      displayLabel: simpleText(cell(r, COL.fields.displayLabel)),
      sourceTableName: simpleText(cell(r, COL.fields.sourceTableName)),
      fieldKey: simpleText(cell(r, COL.fields.fieldKey)),
      pageName: simpleText(cell(r, COL.fields.pageName)),
      editTable: simpleText(cell(r, COL.fields.editTable)),
      editRowLogic: simpleText(cell(r, COL.fields.editRowLogic)),
      viewUrl: simpleText(cell(r, COL.fields.viewUrl)),
      useSnippetPicker: simpleText(cell(r, COL.fields.useSnippetPicker)) === "true"
    })).filter(f => f.displayLabel);
    fieldsLoadedAt = now;
    return discussableFields;
  }

  function selectionRect() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    return rect && (rect.width || rect.height) ? rect : null;
  }

  function findSmallElementsContaining(label) {
    const out = [];
    const safe = normalizeWhitespace(label).toLowerCase();
    if (!safe) return out;
    qsa("div,span,p,h1,h2,h3,h4,label,strong,b").forEach(el => {
      if (el.closest("#wgu-coda-comment-sidebar,#wgu-comment-modal-backdrop,#wgu-coda-comment-btn,#wgu-coda-comment-tab,#wgu-coda-cell-selection-overlay,#wgu-coda-cell-selection-toolbar,#wgu-cell-comment-trigger")) return;
      const txt = normalizeWhitespace(el.innerText || el.textContent || "");
      if (!txt || txt.length > Math.max(140, label.length + 50)) return;
      if (!txt.toLowerCase().includes(safe)) return;
      const rect = el.getBoundingClientRect();
      if (rect && (rect.width || rect.height)) out.push({ el, rect });
    });
    return out;
  }

  async function inferDiscussableField() {
    try {
      const rect = selectionRect();
      const fields = await loadDiscussableFields(false);
      const payload = selectionPayload || {};

      // Table-based comments must be scoped by table/object ID + column ID, not
      // by the human column label alone. Multiple Coda tables on the same page
      // can have identical column names, and label-only matching can attach a
      // comment to the wrong table's _DiscussableFields row.
      if (payload.surfaceType === "table_cell" || payload.surfaceType === "table_row") {
        const exact = fields.find(f => fieldMatchesCurrentTableSelection(f, payload));
        if (exact) return exact;

        const label = await resolveSelectionFieldLabel(null).catch(() => firstNonIdLabel(payload.columnName, payload.fieldLabel, "Table Cell"));
        return makeVirtualFieldForCurrentSelection(payload, label);
      }

      const headingLabel = payload.headingLabel || nearestSelectionHeading();
      const headingField = findFieldByLabel(fields, headingLabel);
      if (headingField) return { ...headingField, inferredFromHeading: true };

      if (!rect) {
        return headingLabel ? { rowId: "", displayLabel: headingLabel, virtualHeading: true } : null;
      }

      let best = null;
      for (const f of fields) {
        if (isWeakFieldLabel(f.displayLabel)) continue;
        for (const hit of findSmallElementsContaining(f.displayLabel)) {
          const dy = rect.top - hit.rect.bottom;
          const horizontalOverlap = Math.max(0, Math.min(rect.right, hit.rect.right) - Math.max(rect.left, hit.rect.left));
          const horizontalDistance = horizontalOverlap > 0 ? 0 : Math.min(Math.abs(rect.left - hit.rect.right), Math.abs(hit.rect.left - rect.right));
          if (dy < -20) continue;
          const score = Math.abs(dy) + horizontalDistance * 0.25 + (hit.rect.width > 700 ? 80 : 0);
          if (!best || score < best.score) best = { ...f, score };
        }
      }

      if (best) return best;
      if (headingLabel) return { rowId: "", displayLabel: headingLabel, virtualHeading: true };
      return null;
    } catch (err) {
      console.warn("[WGU Coda Comments] field inference failed", err);
      return null;
    }
  }

  function cssPath(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return "";
    const parts = [];
    let node = el;
    while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.body && parts.length < 8) {
      let part = node.tagName.toLowerCase();
      if (node.id) { part += `#${CSS.escape(node.id)}`; parts.unshift(part); break; }
      const cls = Array.from(node.classList || []).slice(0, 2).map(c => "." + CSS.escape(c)).join("");
      part += cls;
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === node.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function collectVisibleTextNodes(root) {
    if (!root) return [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest("#wgu-coda-comment-sidebar,#wgu-comment-modal-backdrop,#wgu-coda-comment-btn,#wgu-coda-comment-tab,#wgu-coda-cell-selection-overlay,#wgu-coda-cell-selection-toolbar,#wgu-cell-comment-trigger,script,style,textarea,input,select")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function closestReadableScope(el) {
    if (!el) return document.body;
    const selectors = [
      "[role='gridcell']",
      "[role='cell']",
      "[role='row']",
      "[role='textbox']",
      "[contenteditable='true']",
      "[data-testid*='cell']",
      "[data-testid*='row']",
      "[id*='grid-']",
      "[id*='canvas-']",
      "section",
      "article",
      "main"
    ];
    for (const sel of selectors) {
      const hit = el.closest?.(sel);
      if (hit && hit !== document.body && elementText(hit).length >= 2) return hit;
    }
    return el.closest?.("[role='main'],main") || document.body;
  }

  function rangeTextOffsetsWithin(scope, range) {
    const nodes = collectVisibleTextNodes(scope);
    let text = "";
    let startOffset = -1;
    let endOffset = -1;
    for (const node of nodes) {
      const nodeStart = text.length;
      text += node.nodeValue;
      const nodeEnd = text.length;
      if (node === range.startContainer) startOffset = nodeStart + range.startOffset;
      if (node === range.endContainer) endOffset = nodeStart + range.endOffset;
      text += "\n";
    }
    if (startOffset < 0 || endOffset < 0 || endOffset < startOffset) return null;
    return { text, startOffset, endOffset };
  }

  function getTextAroundSelectionFromRange(range, selected) {
    const exact = normalizeWhitespace(selected);
    const ancestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    const scope = closestReadableScope(ancestor);
    const scoped = rangeTextOffsetsWithin(scope, range);
    if (scoped) {
      const selectedRaw = scoped.text.slice(scoped.startOffset, scoped.endOffset);
      const exactRaw = selectedRaw || selected;
      return {
        prefix: scoped.text.slice(Math.max(0, scoped.startOffset - 280), scoped.startOffset),
        suffix: scoped.text.slice(scoped.endOffset, scoped.endOffset + 280),
        snapshot: scoped.text.slice(Math.max(0, scoped.startOffset - 400), Math.min(scoped.text.length, scoped.endOffset + 400)),
        scopeText: scoped.text,
        startOffset: scoped.startOffset,
        endOffset: scoped.endOffset,
        exactRaw
      };
    }

    // Fallback to body-level search, but prefer the occurrence nearest the selection rect.
    const bodyText = document.body.innerText || "";
    let normalizedBody = normalizeWhitespace(bodyText);
    let idx = normalizedBody.indexOf(exact);
    if (idx < 0) return { prefix: "", suffix: "", snapshot: exact, scopeText: "", startOffset: -1, endOffset: -1, exactRaw: selected };
    return {
      prefix: normalizedBody.slice(Math.max(0, idx - 280), idx),
      suffix: normalizedBody.slice(idx + exact.length, idx + exact.length + 280),
      snapshot: normalizedBody.slice(Math.max(0, idx - 400), Math.min(normalizedBody.length, idx + exact.length + 400)),
      scopeText: normalizedBody,
      startOffset: idx,
      endOffset: idx + exact.length,
      exactRaw: selected
    };
  }

  function readAllAttributes(el) {
    const values = [];
    let node = el;
    while (node && node !== document.body && values.length < 220) {
      if (node.id) values.push(node.id);
      if (node.className && typeof node.className === "string") values.push(node.className);
      if (node.getAttributeNames) {
        for (const name of node.getAttributeNames()) {
          if (/^(id|class|data-|aria-|role|href|title)/i.test(name)) {
            const v = node.getAttribute(name);
            if (v) values.push(`${name}=${v}`);
          }
        }
      }
      node = node.parentElement;
    }
    return values.join(" ");
  }

  function firstRegex(text, regex) {
    const m = String(text || "").match(regex);
    return m ? m[1] : "";
  }

  function looksLikeCodaColumnId(value) {
    return /^c-[A-Za-z0-9_-]{6,}$/.test(String(value || "").trim());
  }

  function firstNonIdLabel(...values) {
    for (const value of values) {
      const text = normalizeWhitespace(value);
      if (text && !looksLikeCodaColumnId(text)) return text;
    }
    return "";
  }

  function sameStableId(a, b) {
    a = normalizeWhitespace(a);
    b = normalizeWhitespace(b);
    return Boolean(a && b && a === b);
  }

  function fieldMatchesCurrentTableSelection(field, payload = selectionPayload || {}) {
    if (!field || !payload) return false;
    const tableOk = sameStableId(field.sourceTableName, payload.tableId);
    const keyOk = sameStableId(field.fieldKey, payload.columnId) || sameStableId(field.fieldKey, payload.fieldLabel);
    return tableOk && keyOk;
  }

  function makeVirtualFieldForCurrentSelection(payload = selectionPayload || {}, label = "") {
    const displayLabel = firstNonIdLabel(label, payload.columnName, payload.fieldLabel, payload.headingLabel, currentPageName()) || "Comment Field";
    return {
      rowId: "",
      displayLabel,
      sourceTableName: payload.tableId || "Coda Canvas",
      fieldKey: payload.columnId || `canvas:${currentPageKey() || codaPageTokenFromUrl(location.href)}:${displayLabel}`,
      pageName: payload.pageName || currentPageName(),
      viewUrl: currentPageUrl(),
      virtualHeading: payload.surfaceType !== "table_cell" && payload.surfaceType !== "table_row"
    };
  }

  function directCodaCellIdentity(cell, row, grid) {
    const attr = (el, name) => el?.getAttribute?.(name) || "";
    return {
      tableId: attr(cell, "data-object-id") || attr(row, "data-object-id") || attr(grid, "data-object-id"),
      viewId: attr(cell, "data-view-id") || attr(row, "data-view-id") || attr(grid, "data-view-id"),
      rowId: attr(cell, "data-row-id") || attr(row, "data-row-id"),
      columnId: attr(cell, "data-column-id")
    };
  }


  const CODA_CELL_SELECTOR = [
    "[role='gridcell']",
    "[role='cell']",
    "[data-reference-type='cell']",
    "[data-coda-ui-id='cellView']",
    "[data-column-id]",
    ".kr-cell",
    "[data-testid*='cell']",
    "[class*='cell']",
    "[class*='Cell']"
  ].join(",");

  const CODA_ROW_SELECTOR = [
    "[role='row']",
    "[data-reference-type='row']",
    "[data-coda-ui-id='row']",
    ".kr-row",
    "[data-testid*='row']",
    "[class*='row']",
    "[class*='Row']"
  ].join(",");

  const CODA_GRID_SELECTOR = [
    "[role='grid']",
    "[data-kr-grid-values='true']",
    "[data-table-dimensional-child='true']",
    "[id*='grid-']",
    "[data-testid*='grid']",
    "[class*='grid']",
    "[class*='Grid']"
  ].join(",");

  function closestElementFromNode(node) {
    return node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement || null;
  }

  function closestCodaCellFromElement(el) {
    return closestElementFromNode(el)?.closest?.(CODA_CELL_SELECTOR) || null;
  }

  function closestCodaCellFromRangeOrPoint(range) {
    const ancestor = closestElementFromNode(range?.commonAncestorContainer);
    const direct = closestCodaCellFromElement(ancestor) || closestCodaCellFromElement(range?.startContainer) || closestCodaCellFromElement(range?.endContainer);
    if (direct) return direct;

    const rects = Array.from(range?.getClientRects?.() || []).filter(r => r && (r.width || r.height));
    const box = range?.getBoundingClientRect?.();
    if (box && (box.width || box.height)) rects.unshift(box);

    const points = [];
    for (const rect of rects.slice(0, 8)) {
      const midY = rect.top + Math.min(Math.max(rect.height / 2, 1), Math.max(rect.height - 1, 1));
      points.push([rect.left + Math.min(Math.max(rect.width / 2, 1), Math.max(rect.width - 1, 1)), midY]);
      points.push([rect.left + 3, midY]);
      points.push([rect.right - 3, midY]);
      points.push([rect.left + Math.min(Math.max(rect.width / 2, 1), Math.max(rect.width - 1, 1)), rect.top + 3]);
      points.push([rect.left + Math.min(Math.max(rect.width / 2, 1), Math.max(rect.width - 1, 1)), rect.bottom - 3]);
    }

    for (const [x, y] of points) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const stack = document.elementsFromPoint(x, y).filter(el => el instanceof HTMLElement && !isExtensionUiTarget(el));
      for (const el of stack) {
        const cell = closestCodaCellFromElement(el);
        if (cell && (hasUsableTextSurface(cell) || cell.getAttribute?.("data-column-id") || cell.getAttribute?.("aria-colindex"))) return cell;
      }
    }
    return null;
  }

  function closestCodaRowFromElement(el) {
    return closestElementFromNode(el)?.closest?.(CODA_ROW_SELECTOR) || null;
  }

  function closestCodaGridFromElement(el) {
    return closestElementFromNode(el)?.closest?.(CODA_GRID_SELECTOR) || null;
  }

  function visibleTableNameFromDom(source) {
    try {
      const grid = closestCodaGridFromElement(source);
      const tableRoot = grid?.closest?.("[data-table-dimensional-child='true']") || grid?.parentElement || source;
      const rootRect = visibleRect(tableRoot) || visibleRect(grid) || visibleRect(source);
      const candidates = [];
      qsa("h1,h2,h3,h4,[role='heading'],[data-coda-ui-id*='title'],[class*='title'],[class*='Title'],[class*='table'],[class*='Table']").forEach(el => {
        if (isExtensionUiTarget(el)) return;
        const txt = firstNonIdLabel(elementText(el));
        if (!txt || txt.length > 120) return;
        const r = visibleRect(el);
        if (!r) return;
        const nearAbove = rootRect && r.bottom <= rootRect.top + 8 && rootRect.top - r.bottom < 180;
        const nearInsideTop = rootRect && r.top >= rootRect.top - 20 && r.top <= rootRect.top + 90;
        const horizontallyClose = !rootRect || Math.max(0, Math.min(r.right, rootRect.right) - Math.max(r.left, rootRect.left)) > Math.min(r.width, rootRect.width || r.width) * 0.25;
        if ((nearAbove || nearInsideTop) && horizontallyClose) candidates.push({ txt, score: Math.abs((rootRect?.top || 0) - r.bottom) + (nearInsideTop ? 15 : 0) });
      });
      candidates.sort((a, b) => a.score - b.score);
      return candidates[0]?.txt || "";
    } catch {
      return "";
    }
  }


  function capAnchorText(text, max = 500) {
    return truncate(normalizeWhitespace(text || ""), max);
  }

  function splitSentencesLoose(text) {
    return normalizeWhitespace(text || "")
      .split(/(?<=[.!?])\s+|\n+/)
      .map(s => normalizeWhitespace(s))
      .filter(Boolean);
  }

  function sentenceContextFromScopedText(scopeText = "", startOffset = -1, endOffset = -1) {
    const normalized = normalizeWhitespace(scopeText || "");
    if (!normalized || startOffset < 0 || endOffset < 0) return { previousSentence: "", nextSentence: "" };
    const before = normalized.slice(Math.max(0, startOffset - 900), startOffset);
    const after = normalized.slice(endOffset, Math.min(normalized.length, endOffset + 900));
    const beforeSentences = splitSentencesLoose(before);
    const afterSentences = splitSentencesLoose(after);
    return {
      previousSentence: capAnchorText(beforeSentences[beforeSentences.length - 1] || before.slice(-250), 250),
      nextSentence: capAnchorText(afterSentences[0] || after.slice(0, 250), 250)
    };
  }

  function normalizedAnchorSignature(text) {
    return normalizeWhitespace(text || "")
      .toLowerCase()
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[^a-z0-9@#._/\-\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
  }

  const COMMON_ANCHOR_WORDS = new Set("about above after again against all also and are because been before being below between both but can cannot could did does doing down during each few for from further had has have having here hers herself him himself his how into its itself just more most not now off once only other our ours ourselves out over own same she should some such than that the their theirs them themselves then there these they this those through too under until very was were what when where which while who whom why will with you your yours yourself yourselves course program student students learning data value review status progress link coda".split(" "));

  function rareAnchorTokens(...parts) {
    const text = parts.filter(Boolean).join(" ");
    const tokens = normalizeWhitespace(text).match(/\b[A-Za-z][A-Za-z0-9._-]{2,}\b/g) || [];
    const scored = [];
    for (const token of tokens) {
      const lower = token.toLowerCase();
      if (COMMON_ANCHOR_WORDS.has(lower)) continue;
      let score = 1;
      if (/[A-Z]/.test(token.slice(1))) score += 3;
      if (/\d/.test(token)) score += 2;
      if (token.length >= 8) score += 1;
      if (/^[A-Z0-9_-]{3,}$/.test(token)) score += 3;
      scored.push({ token, lower, score });
    }
    const seen = new Set();
    return scored
      .sort((a, b) => b.score - a.score || b.token.length - a.token.length)
      .filter(x => !seen.has(x.lower) && seen.add(x.lower))
      .slice(0, 18)
      .map(x => x.token)
      .join(", ");
  }

  function nearestHeadingElement(range = null) {
    const node = range?.commonAncestorContainer;
    const startEl = node ? (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) : null;
    const headings = qsa('h1,h2,h3,h4,[role="heading"],[data-testid*="heading"],[class*="heading"],[class*="Heading"]')
      .filter(el => elementText(el).length > 0)
      .map(el => ({ el, rect: el.getBoundingClientRect() }))
      .filter(x => x.rect.top < (range?.getBoundingClientRect?.().top ?? window.innerHeight))
      .sort((a, b) => b.rect.top - a.rect.top);
    if (headings[0]?.el) return headings[0].el;
    return startEl?.closest?.('section,article,[data-coda-ui-id="canvas"]')?.querySelector?.('h1,h2,h3,h4,[role="heading"]') || null;
  }

  function anchorBlockIndexUnderHeading(range = null) {
    try {
      const rect = range?.getBoundingClientRect?.();
      if (!rect) return 0;
      const headingEl = nearestHeadingElement(range);
      const headingTop = headingEl?.getBoundingClientRect?.().top ?? -Infinity;
      const blocks = qsa('p,li,[contenteditable="true"],[data-testid*="block"],[role="row"],[role="gridcell"],[role="cell"]')
        .filter(el => {
          const r = el.getBoundingClientRect();
          return r.top >= headingTop && r.top <= rect.top && elementText(el).length > 0;
        })
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      return Math.max(0, blocks.length - 1);
    } catch { return 0; }
  }

  function stableDomFingerprintForElement(el) {
    const parts = [];
    let cur = el;
    let depth = 0;
    while (cur && cur !== document.body && depth < 6) {
      const tag = (cur.tagName || "").toLowerCase();
      const attrs = [
        cur.getAttribute?.('data-coda-ui-id'),
        cur.getAttribute?.('data-testid'),
        cur.getAttribute?.('role'),
        cur.getAttribute?.('aria-label'),
        cur.id && /^(grid|row|table|canvas|page|section|i-|c-|v-)/.test(cur.id) ? cur.id : ""
      ].filter(Boolean).join('|');
      if (tag || attrs) parts.push(`${tag}${attrs ? '[' + attrs.slice(0, 90) + ']' : ''}`);
      cur = cur.parentElement;
      depth++;
    }
    return parts.join(' > ').slice(0, 700);
  }

  function captureRichAnchorContext(range, around = {}, codaContext = {}, headingLabel = "") {
    const sentenceCtx = sentenceContextFromScopedText(around.scopeText || codaContext.scopeText || "", around.startOffset, around.endOffset);
    const blockText = capAnchorText(around.snapshot || codaContext.cellText || codaContext.rowText || codaContext.scopeText || "", 500);
    const exact = capAnchorText(around.exactRaw || "", 500);
    const prefix = capAnchorText(around.prefix || "", 280);
    const suffix = capAnchorText(around.suffix || "", 280);
    const heading = capAnchorText(headingLabel || elementText(nearestHeadingElement(range)) || "", 250);
    const ancestor = range?.commonAncestorContainer ? closestElementFromNode(range.commonAncestorContainer) : null;
    return {
      nearestHeading: heading,
      blockExcerpt: blockText,
      previousSentence: sentenceCtx.previousSentence,
      nextSentence: sentenceCtx.nextSentence,
      normalizedSignature: normalizedAnchorSignature([heading, prefix, exact, suffix, blockText].filter(Boolean).join(" ")),
      rareTokens: rareAnchorTokens(exact, blockText, heading, codaContext.tableName, codaContext.columnName),
      sourceTableName: capAnchorText(codaContext.tableName || codaContext.tableId || "", 180),
      sourceColumnName: capAnchorText(codaContext.columnName || codaContext.fieldLabel || "", 180),
      sourceRowDisplay: capAnchorText(codaContext.rowText || codaContext.cellText || "", 320),
      domFingerprint: stableDomFingerprintForElement(ancestor),
      blockIndex: anchorBlockIndexUnderHeading(range),
      capturedAt: new Date().toISOString()
    };
  }

  function closestCodaElementContext(range) {
    const ancestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    const cell = closestCodaCellFromRangeOrPoint(range);
    const row = closestCodaRowFromElement(cell || ancestor);
    const grid = closestCodaGridFromElement(cell || row || ancestor);
    const attrs = [readAllAttributes(cell), readAllAttributes(row), readAllAttributes(grid), readAllAttributes(ancestor)].filter(Boolean).join(" ");
    const urlText = location.href + " " + attrs;
    const directIds = directCodaCellIdentity(cell, row, grid);
    const tableId = directIds.tableId || firstRegex(urlText, /\b(grid-[A-Za-z0-9_-]{6,})\b/) || firstRegex(urlText, /tables\/(grid-[A-Za-z0-9_-]+)/);
    const viewId = directIds.viewId || firstRegex(urlText, /\b(v-[A-Za-z0-9_-]{6,})\b/) || firstRegex(urlText, /views\/(v-[A-Za-z0-9_-]+)/);
    const rowId = directIds.rowId || firstRegex(urlText, /\b(i-[A-Za-z0-9_-]{6,})\b/) || firstRegex(urlText, /\b(row-[A-Za-z0-9_-]{6,})\b/);
    const columnId = directIds.columnId || firstRegex(urlText, /\b(c-[A-Za-z0-9_-]{6,})\b/);
    const tableishByIdentity = Boolean(tableId || viewId || rowId || columnId || grid);
    const surfaceType = (cell || (tableishByIdentity && columnId)) ? "table_cell" : ((row || tableishByIdentity) ? "table_row" : "canvas_text");
    const scope = cell || row || closestReadableScope(ancestor);
    const columnName = bestColumnHeaderTextFromDom(tableId, columnId, cell || ancestor);
    const tableName = visibleTableNameFromDom(cell || row || grid || ancestor);
    return {
      surfaceType,
      tableId,
      tableName,
      viewId,
      rowId,
      columnId,
      columnName,
      fieldLabel: columnName || (surfaceType === "canvas_text" ? fieldLabelForCanvasSelection(range) : ""),
      pageName: currentPageName(),
      pageKey: currentPageKey(),
      cellText: elementText(cell),
      rowText: elementText(row),
      scopeText: elementText(scope),
      domPathHint: cssPath(cell || ancestor),
      domContextHint: truncate(attrs, 500)
    };
  }

  function codaSurfaceTypeForTarget(surfaceType) {
    return ["table_cell", "canvas_text", "canvas_image", "page", "table_row"].includes(surfaceType) ? surfaceType : "canvas_text";
  }

  function codaThreadTypeForSurface(surfaceType, field) {
    if (surfaceType === "table_cell") return "Table Cell";
    if (surfaceType === "table_row") return "Table Row";
    if (surfaceType === "page") return "Page";
    if (field?.useSnippetPicker) return "Snippet";
    return "Canvas Text";
  }

  function isCodaCellSurface(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    return Boolean(el.matches?.(CODA_CELL_SELECTOR));
  }

  function isCodaRowSurface(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    return Boolean(el.matches?.(CODA_ROW_SELECTOR));
  }

  function hasUsableTextSurface(el) {
    const rect = visibleRect(el);
    const text = elementText(el);
    return Boolean(rect && rect.width >= 20 && rect.height >= 12 && text && text.length >= 2);
  }

  function findProtectedReadableSurfaceFromPoint(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const stack = document.elementsFromPoint(x, y).filter(el => el instanceof HTMLElement && !isExtensionUiTarget(el));

    // Coda protected tables do expose real gridcell elements, but the original click target
    // is often a child text div with user-select:none. Prefer the nearest true cell.
    for (const el of stack) {
      const cell = closestCodaCellFromElement(el);
      if (cell && hasUsableTextSurface(cell)) return cell;
    }

    // Fallback: pick the smallest useful text-bearing element in the Coda table stack.
    const candidates = [];
    for (const el of stack) {
      if (!hasUsableTextSurface(el)) continue;
      const inCodaGrid = Boolean(el.closest?.(CODA_GRID_SELECTOR));
      if (el.closest?.("textarea,input,select,button") || (el.closest?.("a") && !inCodaGrid)) continue;
      const rect = el.getBoundingClientRect();
      candidates.push({ el, rect, area: rect.width * rect.height, inCodaGrid, isCell: isCodaCellSurface(el), isRow: isCodaRowSurface(el) });
    }
    candidates.sort((a, b) => {
      if (a.isCell !== b.isCell) return a.isCell ? -1 : 1;
      if (a.inCodaGrid !== b.inCodaGrid) return a.inCodaGrid ? -1 : 1;
      if (a.isRow !== b.isRow) return a.isRow ? 1 : -1;
      return a.area - b.area;
    });
    return candidates[0]?.el || null;
  }

  function closestProtectedReadableSurface(target, ev = null) {
    if (!target || isExtensionUiTarget(target)) return null;
    const targetInCodaGrid = Boolean(target.closest?.(CODA_GRID_SELECTOR));
    if (target.closest?.("textarea,input,select,button") || (target.closest?.("a") && !targetInCodaGrid)) return null;

    const pointSurface = ev ? findProtectedReadableSurfaceFromPoint(ev.clientX, ev.clientY) : null;
    if (pointSurface && !isExtensionUiTarget(pointSurface)) return pointSurface;

    const surface = target.closest?.([CODA_CELL_SELECTOR, CODA_ROW_SELECTOR].join(","));
    if (!surface || surface.closest?.("#wgu-coda-comment-sidebar,#wgu-comment-modal-backdrop")) return null;
    if (!hasUsableTextSurface(surface)) return null;
    return surface;
  }

  let protectedSelectionSurface = null;
  let pendingProtectedOverlaySurface = null;
  let pendingProtectedOverlayTs = 0;
  function enableProtectedSurfaceSelection(target, ev = null) {
    const surface = closestProtectedReadableSurface(target, ev);
    if (!surface) return null;
    protectedSelectionSurface = surface;
    document.documentElement.classList.add("wgu-coda-selection-mode");
    let node = surface;
    let depth = 0;
    while (node && node !== document.body && depth < 8) {
      node.classList?.add?.("wgu-coda-selectable-surface");
      node.style.userSelect = "text";
      node.style.webkitUserSelect = "text";
      node.style.cursor = "text";
      node = node.parentElement;
      depth += 1;
    }
    return surface;
  }

  function releaseProtectedSurfaceSelectionSoon() {
    safeSetTimeout(() => {
      if (window.getSelection()?.toString()) return;
      document.documentElement.classList.remove("wgu-coda-selection-mode");
      qsa(".wgu-coda-selectable-surface").forEach(el => el.classList.remove("wgu-coda-selectable-surface"));
      protectedSelectionSurface = null;
    }, 1200);
  }

  let activeCellSelectionSession = null;
  let activeCellSelectionRaf = 0;

  function isLikelyEditableSurface(surface) {
    if (!surface) return false;
    // Coda may wrap read-only/protected grid cells in broader editor/canvas containers.
    // Treat the actual gridcell/cellView as protected-readable unless the cell itself is
    // a real input/contenteditable surface. Otherwise the hover 💬 trigger gets suppressed.
    if (isCodaCellSurface(surface)) {
      const ownEditable = surface.matches?.("textarea,input,select,[contenteditable='true'],[contenteditable='plaintext-only']");
      return Boolean(ownEditable);
    }
    return Boolean(surface.closest?.("textarea,input,select,[contenteditable='true'],[contenteditable='plaintext-only']"));
  }

  function destroyCellSelectionOverlay() {
    if (activeCellSelectionRaf) cancelAnimationFrame(activeCellSelectionRaf);
    activeCellSelectionRaf = 0;
    qs("#wgu-coda-cell-selection-overlay")?.remove();
    qs("#wgu-coda-cell-selection-toolbar")?.remove();
    activeCellSelectionSession = null;
    document.documentElement.classList.remove("wgu-coda-cell-overlay-active");
    if (!document.querySelector("#wgu-comment-modal-backdrop")) {
      if (visibleActiveChats(mergeOptimisticChats(lastFetchedPageChats)).length) enterActiveMode("cell overlay destroyed");
      else enterIdleMode("cell overlay destroyed with no active threads");
    }
  }

  function overlayCopyTextStyles(source, overlayText) {
    const s = getComputedStyle(source);
    const props = [
      "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight",
      "letterSpacing", "textAlign", "whiteSpace", "wordBreak", "overflowWrap",
      "textTransform", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "boxSizing"
    ];
    for (const prop of props) overlayText.style[prop] = s[prop];
    overlayText.style.whiteSpace = s.whiteSpace === "nowrap" ? "pre-wrap" : (s.whiteSpace || "pre-wrap");
    overlayText.style.overflowWrap = s.overflowWrap || "anywhere";
    overlayText.style.wordBreak = s.wordBreak || "normal";
  }

  function isTransparentCssColor(value) {
    if (!value) return true;
    const v = String(value).trim().toLowerCase();
    if (v === "transparent") return true;
    const m = v.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const parts = m[1].split(",").map(x => x.trim());
    if (parts.length >= 4 && Number.parseFloat(parts[3]) <= 0.05) return true;
    return false;
  }

  function readableOverlayColorsForSurface(source) {
    let bg = "";
    let color = "";
    let cur = source;
    for (let depth = 0; cur && depth < 12; depth++, cur = cur.parentElement) {
      const s = getComputedStyle(cur);
      if (!color && !isTransparentCssColor(s.color)) color = s.color;
      if (!bg && !isTransparentCssColor(s.backgroundColor)) bg = s.backgroundColor;
      if (bg && color) break;
    }
    if (!bg) bg = getComputedStyle(document.body || document.documentElement).backgroundColor || "#fff";
    if (!color) color = getComputedStyle(source).color || "#1f2937";
    return { bg, color };
  }

  function applyCellOverlaySurfaceColors(source, overlay, textEl) {
    const { bg, color } = readableOverlayColorsForSurface(source);
    overlay.style.background = bg;
    textEl.style.background = bg;
    textEl.style.color = color;
  }

  function syncCellSelectionOverlay() {
    if (!activeCellSelectionSession) return;
    const { sourceElement, overlay, toolbar } = activeCellSelectionSession;
    if (!sourceElement || !document.contains(sourceElement)) {
      destroyCellSelectionOverlay();
      return;
    }

    const rect = sourceElement.getBoundingClientRect();
    const visible = rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth && rect.width > 0 && rect.height > 0;
    if (!visible) {
      overlay.style.display = "none";
      toolbar.style.display = "none";
      return;
    }

    overlay.style.display = "block";
    toolbar.style.display = "flex";
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    const toolbarTop = Math.max(8, rect.top - 38);
    const toolbarLeft = Math.min(window.innerWidth - 280, Math.max(8, rect.left));
    toolbar.style.left = `${toolbarLeft}px`;
    toolbar.style.top = `${toolbarTop}px`;
  }

  function scheduleCellSelectionOverlaySync() {
    if (!activeCellSelectionSession || activeCellSelectionRaf) return;
    activeCellSelectionRaf = requestAnimationFrame(() => {
      activeCellSelectionRaf = 0;
      syncCellSelectionOverlay();
    });
  }

  function rangeOffsetsWithinElement(root, range) {
    try {
      const before = document.createRange();
      before.selectNodeContents(root);
      before.setEnd(range.startContainer, range.startOffset);
      const start = before.toString().length;
      const selected = range.toString();
      return { startOffset: start, endOffset: start + selected.length, selectedRaw: selected };
    } catch {
      return null;
    }
  }

  function visibleDetailFieldLabelNearCell(sourceCell) {
    try {
      if (!sourceCell) return "";
      const cellRect = visibleRect(sourceCell);
      if (!cellRect) return "";
      const cellText = normalizeWhitespace(elementText(sourceCell));
      const fieldRoot = (() => {
        let node = sourceCell;
        let best = sourceCell.parentElement;
        let depth = 0;
        while (node?.parentElement && node.parentElement !== document.body && depth < 8) {
          const parent = node.parentElement;
          const r = visibleRect(parent);
          if (r && r.width >= cellRect.width * 0.75 && r.height <= Math.max(900, cellRect.height + 420)) best = parent;
          node = parent;
          depth += 1;
        }
        return best || document.body;
      })();

      const selector = [
        "label",
        "strong",
        "b",
        "[role='heading']",
        "[aria-label]",
        "[data-coda-ui-id*='label']",
        "[data-testid*='label']",
        "[class*='label']",
        "[class*='Label']",
        "div",
        "span"
      ].join(",");
      const candidates = [];
      const els = Array.from(new Set([...qsa(selector, fieldRoot), ...qsa(selector)]));
      for (const el of els) {
        if (!(el instanceof HTMLElement)) continue;
        if (isExtensionUiTarget(el)) continue;
        if (el === sourceCell || sourceCell.contains(el) || el.contains(sourceCell)) continue;
        if (el.closest?.("#wgu-coda-comment-sidebar,#wgu-comment-modal-backdrop,#wgu-coda-cell-selection-overlay,#wgu-coda-cell-selection-toolbar,#wgu-cell-comment-trigger")) continue;
        const text = firstNonIdLabel(elementText(el) || el.getAttribute("aria-label") || "");
        if (!text || text.length > 80 || looksLikeCodaColumnId(text)) continue;
        if (cellText && normalizeWhitespace(text) === cellText) continue;
        if (/^(comment|post comment|cancel|selected text|your comment|field)$/i.test(text)) continue;
        const r = visibleRect(el);
        if (!r || r.width < 8 || r.height < 6) continue;
        const horizontalOverlap = Math.max(0, Math.min(r.right, cellRect.right) - Math.max(r.left, cellRect.left));
        const verticalOverlap = Math.max(0, Math.min(r.bottom, cellRect.bottom) - Math.max(r.top, cellRect.top));
        const aboveGap = cellRect.top - r.bottom;
        const leftGap = cellRect.left - r.right;
        const isAbove = aboveGap >= -4 && aboveGap <= 120 && (horizontalOverlap >= Math.min(r.width, cellRect.width) * 0.2 || Math.abs(r.left - cellRect.left) <= 90);
        const isLeft = leftGap >= -8 && leftGap <= 220 && verticalOverlap >= Math.min(r.height, cellRect.height) * 0.25;
        const isBoldish = /label|Label|heading/i.test(`${el.className || ""} ${el.getAttribute("data-coda-ui-id") || ""} ${el.getAttribute("data-testid") || ""}`) || ["LABEL", "STRONG", "B"].includes(el.tagName) || (Number(getComputedStyle(el).fontWeight) || 400) >= 600;
        if (!isAbove && !isLeft) continue;
        const score = (isAbove ? aboveGap : leftGap + 35) + Math.abs(r.left - cellRect.left) * 0.08 + (isBoldish ? -25 : 0) + (fieldRoot.contains(el) ? -20 : 0) + (text.length > 45 ? 20 : 0);
        candidates.push({ text, score });
      }
      candidates.sort((a, b) => a.score - b.score);
      return candidates[0]?.text || "";
    } catch {
      return "";
    }
  }

  function bestColumnHeaderTextFromDom(tableId, columnId, sourceCell) {
    if (!columnId && !sourceCell) return "";
    const selector = columnId ? `[data-column-id="${CSS.escape(columnId)}"]` : "";
    const candidates = selector ? qsa(selector).filter(el => el !== sourceCell && !(sourceCell && el.contains(sourceCell))) : [];
    let best = "";
    for (const el of candidates) {
      if (el.closest("#wgu-coda-comment-sidebar,#wgu-comment-modal-backdrop,#wgu-coda-cell-selection-overlay,#wgu-coda-cell-selection-toolbar,#wgu-cell-comment-trigger")) continue;
      if (tableId && el.getAttribute("data-object-id") && el.getAttribute("data-object-id") !== tableId) continue;
      const text = elementText(el).replace(/\s*Sort.*$/i, "");
      const r = visibleRect(el);
      const role = el.getAttribute("role") || "";
      const isHeaderish = /columnheader|header/i.test(role + " " + el.className + " " + el.getAttribute("data-coda-ui-id"));
      if (!text || text.length > 120 || !r || looksLikeCodaColumnId(text)) continue;
      if (isHeaderish) return text;
      if (!best && r.height <= 80) best = text;
    }

    // In detail/card layouts Coda may show one exposed cell with a visual field
    // label above or to the left of it. That label may be a layout override, not
    // the real column name. Use it for display, while keeping columnId as identity.
    const detailLabel = visibleDetailFieldLabelNearCell(sourceCell);
    if (detailLabel) return detailLabel;

    // Coda protected grids sometimes put the human column label in a header cell
    // that does not share data-column-id with the body cell. Fall back to the
    // visible aria-colindex so table fields get human names, not c-... IDs.
    try {
      const cell = sourceCell?.closest?.("[role='gridcell'],[data-reference-type='cell'],[data-coda-ui-id='cellView'],.kr-cell") || sourceCell;
      const colIndex = cell?.getAttribute?.("aria-colindex");
      const grid = cell?.closest?.("[role='grid'],[data-kr-grid-values='true'],[data-table-dimensional-child='true']");
      if (colIndex) {
        const headerCandidates = qsa(`[aria-colindex="${CSS.escape(colIndex)}"], [role='columnheader']`).filter(el => {
          if (el === cell || (cell && el.contains(cell))) return false;
          if (el.closest("#wgu-coda-comment-sidebar,#wgu-comment-modal-backdrop,#wgu-coda-cell-selection-overlay,#wgu-coda-cell-selection-toolbar,#wgu-cell-comment-trigger")) return false;
          if (tableId && el.getAttribute("data-object-id") && el.getAttribute("data-object-id") !== tableId) return false;
          if (grid && !grid.contains(el) && !el.closest("[data-table-dimensional-child='true']")) return false;
          return true;
        });
        for (const el of headerCandidates) {
          const txt = elementText(el).replace(/\s*Sort.*$/i, "");
          const role = el.getAttribute("role") || "";
          if (!txt || txt.length > 120 || looksLikeCodaColumnId(txt)) continue;
          if (/columnheader|header/i.test(role + " " + el.className + " " + el.getAttribute("data-coda-ui-id"))) return txt;
        }
      }
    } catch {}

    return firstNonIdLabel(best);
  }

  function fieldLabelForCanvasSelection(range = null) {
    return normalizeWhitespace(nearestSelectionHeading(range) || currentPageName() || "Page Canvas");
  }

  function cellSelectionContextFromSurface(surface) {
    const fakeRange = {
      commonAncestorContainer: surface
    };
    const cell = closestCodaCellFromElement(surface) || surface;
    const row = closestCodaRowFromElement(surface) || null;
    const grid = closestCodaGridFromElement(surface) || null;
    const attrs = [readAllAttributes(cell), readAllAttributes(row), readAllAttributes(grid), readAllAttributes(surface)].filter(Boolean).join(" ");
    const urlText = location.href + " " + attrs;
    const directIds = directCodaCellIdentity(cell, row, grid);
    const tableId = directIds.tableId || firstRegex(urlText, /\b(grid-[A-Za-z0-9_-]{6,})\b/) || firstRegex(urlText, /tables\/(grid-[A-Za-z0-9_-]+)/);
    const columnId = directIds.columnId || firstRegex(urlText, /\b(c-[A-Za-z0-9_-]{6,})\b/);
    const columnName = bestColumnHeaderTextFromDom(tableId, columnId, cell || surface);
    const tableName = visibleTableNameFromDom(cell || row || grid || surface);
    return {
      surfaceType: (cell || columnId) ? "table_cell" : (row || tableId ? "table_row" : "canvas_text"),
      tableId,
      tableName,
      viewId: directIds.viewId || firstRegex(urlText, /\b(v-[A-Za-z0-9_-]{6,})\b/) || firstRegex(urlText, /views\/(v-[A-Za-z0-9_-]+)/),
      rowId: directIds.rowId || firstRegex(urlText, /\b(i-[A-Za-z0-9_-]{6,})\b/) || firstRegex(urlText, /\b(row-[A-Za-z0-9_-]{6,})\b/),
      columnId,
      columnName,
      fieldLabel: columnName || "Table Cell",
      pageName: currentPageName(),
      pageKey: currentPageKey(),
      cellText: elementText(cell),
      rowText: elementText(row),
      scopeText: elementText(cell || row || surface),
      domPathHint: cssPath(surface),
      domContextHint: truncate(attrs, 500)
    };
  }

  function buildSelectionPayloadFromCellOverlay(range) {
    const session = activeCellSelectionSession;
    if (!session || !range || range.collapsed || !session.textEl.contains(range.commonAncestorContainer)) return null;
    const offsets = rangeOffsetsWithinElement(session.textEl, range);
    if (!offsets || !normalizeWhitespace(offsets.selectedRaw)) return null;
    const sourceText = session.visibleText || session.textEl.innerText || "";
    const start = Math.max(0, Math.min(offsets.startOffset, sourceText.length));
    const end = Math.max(start, Math.min(offsets.endOffset, sourceText.length));
    const exactRaw = sourceText.slice(start, end) || offsets.selectedRaw;
    const exact = normalizeWhitespace(exactRaw);
    if (!exact || exact.length < 2) return null;
    const around = {
      exactRaw,
      prefix: sourceText.slice(Math.max(0, start - 280), start),
      suffix: sourceText.slice(end, end + 280),
      snapshot: sourceText,
      scopeText: sourceText,
      startOffset: start,
      endOffset: end
    };
    const richAnchorContext = captureRichAnchorContext(range, around, session.codaContext || {}, session.codaContext?.fieldLabel || nearestSelectionHeading());
    const approxContext = captureApproxGeometryFromElement(session.sourceElement || session.textEl, "cell_overlay_source");
    return {
      exact,
      exactRaw,
      liveRange: (() => { try { return range.cloneRange(); } catch { return null; } })(),
      prefix: around.prefix,
      suffix: around.suffix,
      snapshot: around.snapshot,
      scopeText: around.scopeText,
      startOffset: around.startOffset,
      endOffset: around.endOffset,
      pageUrl: currentPageUrl(),
      domPathHint: session.codaContext.domPathHint,
      domContextHint: ["1:1 overlay", session.codaContext.domContextHint].filter(Boolean).join(" | "),
      headingLabel: session.codaContext.fieldLabel || nearestSelectionHeading(),
      fieldLabel: session.codaContext.fieldLabel || session.codaContext.columnName || "Table Cell",
      pageName: session.codaContext.pageName || currentPageName(),
      pageKey: session.codaContext.pageKey || currentPageKey(),
      surfaceType: session.codaContext.surfaceType || "table_cell",
      tableId: session.codaContext.tableId,
      tableName: session.codaContext.tableName,
      viewId: session.codaContext.viewId,
      sourceRowId: session.codaContext.rowId,
      columnId: session.codaContext.columnId,
      columnName: session.codaContext.columnName,
      cellText: session.codaContext.cellText || sourceText,
      rowText: session.codaContext.rowText || "",
      ...richAnchorContext,
      ...Object.fromEntries(Object.entries(approxContext || {}).map(([k, v]) => [`anchorApprox${k.charAt(0).toUpperCase()}${k.slice(1)}`, v]))
    };
  }

  function showSelectionButtonAtRect(rect) {
    if (!selectionButton) {
      selectionButton = document.createElement("button");
      selectionButton.id = "wgu-coda-comment-btn";
      selectionButton.textContent = "Comment";
      selectionButton.addEventListener("mousedown", ev => {
        ev.preventDefault();
        ev.stopPropagation();
      }, true);
      selectionButton.addEventListener("click", async () => {
        try {
          selectionButton.disabled = true;
          selectionButton.textContent = "Opening...";
          await openCommentModal();
          destroyCellSelectionOverlay();
          hideButton();
        } catch (err) {
          console.error(err);
          alert(err.message || String(err));
        } finally {
          selectionButton.disabled = false;
          selectionButton.textContent = "Comment";
        }
      });
      document.body.appendChild(selectionButton);
    }
    selectionButton.style.left = `${Math.min(window.innerWidth - 170, Math.max(8, rect.left))}px`;
    selectionButton.style.top = `${Math.max(8, rect.top - 42)}px`;
    selectionButton.style.display = "block";
  }

  function openCellSelectionOverlay(surface) {
    if (!surface || isLikelyEditableSurface(surface)) return false;
    const visibleText = surface.innerText || surface.textContent || "";
    if (!normalizeWhitespace(visibleText) || normalizeWhitespace(visibleText).length < 2) return false;

    destroyCellSelectionOverlay();
    const overlay = document.createElement("div");
    overlay.id = "wgu-coda-cell-selection-overlay";
    overlay.setAttribute("role", "region");
    overlay.setAttribute("aria-label", "Selectable protected Coda cell text");

    const textEl = document.createElement("div");
    textEl.className = "wgu-cell-selection-text";
    textEl.textContent = visibleText;
    textEl.tabIndex = 0;
    overlayCopyTextStyles(surface, textEl);
    applyCellOverlaySurfaceColors(surface, overlay, textEl);
    overlay.appendChild(textEl);

    const toolbar = document.createElement("div");
    toolbar.id = "wgu-coda-cell-selection-toolbar";
    toolbar.innerHTML = `
      <span class="wgu-cell-selection-toolbar-note">Comment on</span>
      <button type="button" class="wgu-cell-selection-selected" data-action="selected-text" disabled>Selected Text</button>
      <span class="wgu-cell-selection-toolbar-note wgu-cell-selection-toolbar-or">or</span>
      <button type="button" class="wgu-cell-selection-whole" data-action="whole-cell">This Cell</button>
      <span class="wgu-cell-selection-hint" aria-live="polite"></span>
      <button type="button" class="wgu-cell-selection-close" data-action="close" aria-label="Close">×</button>
    `;

    // Do not let toolbar clicks steal focus/selection from the mirror text.
    // Without preventDefault(), clicking Selected Text can collapse the mirror
    // selection before the click handler reads it, which triggered a browser alert.
    ["pointerdown", "mousedown"].forEach(type => {
      toolbar.addEventListener(type, ev => {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
      }, true);
    });
    toolbar.addEventListener("click", async ev => {
      ev.stopPropagation();
      const action = ev.target?.dataset?.action;
      if (action === "close") { destroyCellSelectionOverlay(); hideButton(); return; }
      if (action === "selected-text") {
        const sel = window.getSelection();
        const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
        const livePayload = range && activeCellSelectionSession?.textEl?.contains(range.commonAncestorContainer)
          ? buildSelectionPayloadFromCellOverlay(range)
          : null;
        const payload = livePayload || activeCellSelectionSession?.lastSelectionPayload || null;
        if (!payload) {
          showCellSelectionHint("Select text first");
          updateCellSelectionToolbarState(false);
          return;
        }
        selectionPayload = payload;
        await openCommentModal();
        destroyCellSelectionOverlay();
        hideButton();
      }
      if (action === "whole-cell") {
        const ctx = cellSelectionContextFromSurface(surface);
        const exact = normalizeWhitespace(visibleText);
        selectionPayload = {
          exact,
          exactRaw: visibleText,
          prefix: "",
          suffix: "",
          snapshot: visibleText,
          scopeText: visibleText,
          startOffset: 0,
          endOffset: visibleText.length,
          pageUrl: currentPageUrl(),
          domPathHint: ctx.domPathHint,
          domContextHint: ["whole protected cell via 1:1 overlay", ctx.domContextHint].filter(Boolean).join(" | "),
          headingLabel: ctx.fieldLabel || nearestSelectionHeading(),
          fieldLabel: ctx.fieldLabel || ctx.columnName || "Table Cell",
          pageName: ctx.pageName || currentPageName(),
          pageKey: ctx.pageKey || currentPageKey(),
          surfaceType: ctx.surfaceType || "table_cell",
          tableId: ctx.tableId,
          viewId: ctx.viewId,
          sourceRowId: ctx.rowId,
          columnId: ctx.columnId,
          cellText: ctx.cellText || visibleText,
          rowText: ctx.rowText || "",
          ...Object.fromEntries(Object.entries(captureApproxGeometryFromElement(surface, "whole_cell_source") || {}).map(([k, v]) => [`anchorApprox${k.charAt(0).toUpperCase()}${k.slice(1)}`, v]))
        };
        await openCommentModal();
        destroyCellSelectionOverlay();
        hideButton();
      }
    }, true);

    setWguRuntimeMode(WGU_RUNTIME_MODE.COMMENTING, "cell selection overlay");
    document.body.appendChild(overlay);
    document.body.appendChild(toolbar);
    const codaContext = cellSelectionContextFromSurface(surface);
    activeCellSelectionSession = { sourceElement: surface, overlay, toolbar, textEl, visibleText, codaContext };
    updateCellSelectionToolbarState(false);
    document.documentElement.classList.add("wgu-coda-cell-overlay-active");
    syncCellSelectionOverlay();
    textEl.focus({ preventScroll: true });
    return true;
  }

  function showCellSelectionHint(message) {
    const toolbar = qs("#wgu-coda-cell-selection-toolbar");
    const hint = toolbar?.querySelector?.(".wgu-cell-selection-hint");
    if (!hint) return;
    hint.textContent = message || "";
    hint.classList.toggle("active", Boolean(message));
    clearTimeout(showCellSelectionHint._timer);
    if (message) {
      showCellSelectionHint._timer = setTimeout(() => {
        hint.textContent = "";
        hint.classList.remove("active");
      }, 1600);
    }
  }

  function updateCellSelectionToolbarState(hasSelection) {
    const btn = qs("#wgu-coda-cell-selection-toolbar [data-action='selected-text']");
    if (!btn) return;
    btn.disabled = !hasSelection;
    btn.setAttribute("aria-disabled", hasSelection ? "false" : "true");
  }

  function handleCellOverlaySelection(range) {
    const payload = buildSelectionPayloadFromCellOverlay(range);
    if (!payload) {
      if (activeCellSelectionSession) activeCellSelectionSession.lastSelectionPayload = null;
      updateCellSelectionToolbarState(false);
      return false;
    }
    selectionPayload = payload;
    if (activeCellSelectionSession) activeCellSelectionSession.lastSelectionPayload = payload;
    showCellSelectionHint("");
    updateCellSelectionToolbarState(true);
    return true;
  }



  function isProtectedOverlayShortcutEvent(ev) {
    return Boolean(shortcutAltClickEnabled && (ev.altKey || ev.getModifierState?.("Alt") || ev.getModifierState?.("AltGraph")));
  }

  function ensureCellCommentTrigger() {
    if (cellCommentTrigger && document.body.contains(cellCommentTrigger)) return cellCommentTrigger;
    cellCommentTrigger = document.createElement("button");
    cellCommentTrigger.id = "wgu-cell-comment-trigger";
    cellCommentTrigger.type = "button";
    cellCommentTrigger.textContent = "💬";
    cellCommentTrigger.title = "Comment on this cell";
    cellCommentTrigger.setAttribute("aria-label", "Comment on this cell");
    cellCommentTrigger.addEventListener("mousedown", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
    }, true);
    cellCommentTrigger.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
      const surface = cellCommentTriggerSurface;
      if (surface && document.contains(surface)) {
        setPanelOpen(true).catch(() => {});
        openCellSelectionOverlay(surface);
      }
    }, true);
    document.body.appendChild(cellCommentTrigger);
    return cellCommentTrigger;
  }

  function hideCellCommentTrigger() {
    if (cellCommentTrigger) cellCommentTrigger.style.display = "none";
    cellCommentTriggerSurface = null;
  }

  function syncCellCommentTriggerToSurface(surface) {
    const btn = ensureCellCommentTrigger();
    if (!surface || !document.contains(surface)) return hideCellCommentTrigger();
    const rect = surface.getBoundingClientRect();
    const visible = rect.width > 24 && rect.height > 18 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
    if (!visible) return hideCellCommentTrigger();
    cellCommentTriggerSurface = surface;
    btn.style.display = "flex";
    const size = 28;
    // Keep the trigger inside the visible page area. If the sidebar is open, avoid
    // placing the 💬 under it; Coda cells can extend underneath the fixed panel.
    const sidebar = qs("#wgu-coda-comment-sidebar");
    const sidebarRect = sidebar && getComputedStyle(sidebar).display !== "none" ? sidebar.getBoundingClientRect() : null;
    const rightLimit = sidebarRect && sidebarRect.left > 0 ? sidebarRect.left - 8 : window.innerWidth - 8;
    const left = Math.min(rightLimit - size, Math.max(8, rect.right - size - 6));
    const top = Math.min(window.innerHeight - size - 8, Math.max(8, rect.top + 6));
    btn.style.left = `${left}px`;
    btn.style.top = `${top}px`;
  }

  function scheduleCellCommentTriggerSync(surface) {
    if (cellCommentTriggerRaf) cancelAnimationFrame(cellCommentTriggerRaf);
    cellCommentTriggerRaf = requestAnimationFrame(() => {
      cellCommentTriggerRaf = 0;
      syncCellCommentTriggerToSurface(surface || cellCommentTriggerSurface);
    });
  }

  let lastCellCommentHoverProbeAt = 0;
  let lastCellCommentHoverX = -9999;
  let lastCellCommentHoverY = -9999;

  function handleCellCommentHover(ev) {
    // v1.10.10: keep the cell comment trigger available when the sidebar is open,
    // but continue to suppress page-wide hover probing when the extension is idle.
    // The previous COMMENTING-only gate made the sidebar load while the activation
    // chat bubble/toolbar never appeared.
    const sidebarOpen = document.documentElement.classList.contains("wgu-comments-panel-open");
    const explicitShortcut = isProtectedOverlayShortcutEvent(ev);
    if (!sidebarOpen && !explicitShortcut && wguRuntimeMode === WGU_RUNTIME_MODE.IDLE) {
      wguPerfInc("hoverSuppressions");
      return;
    }
    if (activeCellSelectionSession || isExtensionUiTarget(ev.target)) return;
    const now = performance.now ? performance.now() : Date.now();
    const dx = Math.abs((ev.clientX || 0) - lastCellCommentHoverX);
    const dy = Math.abs((ev.clientY || 0) - lastCellCommentHoverY);
    if ((now - lastCellCommentHoverProbeAt) < 90 && dx < 14 && dy < 14) return;
    lastCellCommentHoverProbeAt = now;
    lastCellCommentHoverX = ev.clientX || 0;
    lastCellCommentHoverY = ev.clientY || 0;
    wguPerfInc("hoverSurfaceChecks");
    const surface = findProtectedReadableSurfaceFromPoint(ev.clientX, ev.clientY);
    if (!surface || isLikelyEditableSurface(surface)) return hideCellCommentTrigger();
    const isTableish = isCodaCellSurface(surface) || Boolean(surface.closest?.("[data-kr-grid-values='true'],[data-table-dimensional-child='true']"));
    if (!isTableish || !hasUsableTextSurface(surface)) return hideCellCommentTrigger();
    syncCellCommentTriggerToSurface(surface);
  }

  function handleProtectedSurfacePointerDown(ev) {
    if (isExtensionUiTarget(ev.target)) return;
    if (!isProtectedOverlayShortcutEvent(ev)) return;
    const surface = enableProtectedSurfaceSelection(ev.target, ev);
    if (!surface) return;
    pendingProtectedOverlaySurface = surface;
    pendingProtectedOverlayTs = Date.now();
    // Stop Coda's grid handler from turning this into row/cell focus. We do not call
    // preventDefault, because the browser should still be free to produce text selection
    // when a surface allows it.
    ev.stopPropagation();
    if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
  }

  function maybeOpenPendingProtectedOverlay(ev) {
    if (isExtensionUiTarget(ev.target)) return false;
    if (!isProtectedOverlayShortcutEvent(ev)) { pendingProtectedOverlaySurface = null; return false; }
    const selection = window.getSelection();
    if (selection && normalizeWhitespace(selection.toString()).length >= 2) return false;
    const surface = pendingProtectedOverlaySurface || closestProtectedReadableSurface(ev.target, ev);
    pendingProtectedOverlaySurface = null;
    if (!surface || isLikelyEditableSurface(surface)) return false;
    // Only deterministic-mirror Coda table-ish surfaces. Normal page/canvas text can use native selection.
    const isTableish = isCodaCellSurface(surface) || isCodaRowSurface(surface) || Boolean(surface.closest?.("[data-kr-grid-values='true'],[data-table-dimensional-child='true']"));
    if (!isTableish) return false;
    if (openCellSelectionOverlay(surface)) {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
      return true;
    }
    return false;
  }

  function handleProtectedSurfacePointerUp(ev) {
    if (!pendingProtectedOverlaySurface) return;
    // Use pointerup/mouseup rather than pointerdown so the user can finish the click before
    // the mirror takes over the cell surface.
    maybeOpenPendingProtectedOverlay(ev);
  }

  function handleProtectedSurfaceClick(ev) {
    maybeOpenPendingProtectedOverlay(ev);
  }

  function showButtonForSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return hideButton();
    const range = selection.getRangeAt(0);
    if (activeCellSelectionSession) {
      if (range && activeCellSelectionSession.textEl.contains(range.commonAncestorContainer)) {
        handleCellOverlaySelection(range);
        return;
      }
      if (isExtensionUiTarget(document.activeElement)) return;
    }
    if (isExtensionUiTarget(document.activeElement)) return hideButton();
    if (!range || range.collapsed) return hideButton();
    const exact = normalizeWhitespace(selection.toString());
    if (!exact || exact.length < 2) return hideButton();
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return hideButton();
    const around = getTextAroundSelectionFromRange(range, selection.toString());
    const codaContext = closestCodaElementContext(range);
    const headingLabel = nearestSelectionHeading(range);
    const richAnchorContext = captureRichAnchorContext(range, around, codaContext, headingLabel);
    selectionPayload = {
      exact,
      exactRaw: around.exactRaw || selection.toString(),
      liveRange: (() => { try { return range.cloneRange(); } catch { return null; } })(),
      prefix: around.prefix,
      suffix: around.suffix,
      snapshot: around.snapshot,
      scopeText: around.scopeText || codaContext.scopeText || "",
      startOffset: around.startOffset,
      endOffset: around.endOffset,
      pageUrl: currentPageUrl(),
      domPathHint: codaContext.domPathHint,
      domContextHint: codaContext.domContextHint,
      headingLabel,
      fieldLabel: codaContext.fieldLabel || (codaContext.surfaceType === "table_cell" ? codaContext.columnName : fieldLabelForCanvasSelection(range)),
      pageName: codaContext.pageName || currentPageName(),
      pageKey: codaContext.pageKey || currentPageKey(),
      surfaceType: codaContext.surfaceType,
      tableId: codaContext.tableId,
      tableName: codaContext.tableName,
      viewId: codaContext.viewId,
      sourceRowId: codaContext.rowId,
      columnId: codaContext.columnId,
      columnName: codaContext.columnName,
      cellText: codaContext.cellText,
      rowText: codaContext.rowText,
      ...richAnchorContext,
      ...Object.fromEntries(Object.entries(captureApproxGeometryFromRange(range, "selection_range") || {}).map(([k, v]) => [`anchorApprox${k.charAt(0).toUpperCase()}${k.slice(1)}`, v]))
    };
    showSelectionButtonAtRect(rect);
  }

  function hideButton() { if (selectionButton) selectionButton.style.display = "none"; }

  async function openCommentModal() {
    if (!selectionPayload) throw new Error("No selected text captured.");
    setWguRuntimeMode(WGU_RUNTIME_MODE.COMMENTING, "openCommentModal");
    await setPanelOpen(true);
    const fields = await loadDiscussableFields(false);
    const inferred = await inferDiscussableField();
    qs("#wgu-comment-modal-backdrop")?.remove();
    const backdrop = document.createElement("div");
    backdrop.id = "wgu-comment-modal-backdrop";
    const optionFields = fields.slice();
    const inferredIsVirtual = inferred?.displayLabel && !inferred?.rowId;
    if (inferredIsVirtual && !findFieldByLabel(optionFields, inferred.displayLabel)) {
      optionFields.unshift({ ...inferred, rowId: "__inferred__" });
    }
    const inferredRowId = inferredIsVirtual ? "__inferred__" : (inferred?.rowId || "");
    const options = [`<option value="">Unknown / page canvas</option>`].concat(optionFields.map(f =>
      `<option value="${escapeHtml(f.rowId)}"${inferredRowId === f.rowId ? " selected" : ""}>${escapeHtml(f.displayLabel)}</option>`
    )).join("");
    backdrop.innerHTML = `
      <div id="wgu-comment-modal" role="dialog" aria-modal="true">
        <div class="wgu-modal-head"><h2>Add comment</h2></div>
        <div class="wgu-modal-body">
          <label class="wgu-modal-label" for="wgu-field-select">Field</label>
          <select id="wgu-field-select">${options}</select>
          <div class="wgu-modal-hint">Change this if the detected field is wrong.</div>
          <label class="wgu-modal-label">Selected text</label>
          <div class="wgu-selected-preview">${escapeHtml(selectionPayload.exact)}</div>
          <label class="wgu-modal-label" for="wgu-comment-textarea">Your comment</label>
          <div class="wgu-modal-comment-wrap">
            <textarea id="wgu-comment-textarea" data-wgu-mention-textarea="1" placeholder="Type your comment..."></textarea>
            <div class="wgu-mention-helper" role="dialog" aria-label="Mention picker">
              <div class="wgu-mention-results"><div class="wgu-mention-loading">Loading people…</div></div>
            </div>
          </div>
        </div>
        <div class="wgu-modal-actions">
          <button id="wgu-cancel-comment">Cancel</button>
          <button id="wgu-post-comment">Post Comment</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    selectedMentionsByRowId.delete(INITIAL_COMMENT_MENTION_KEY);
    mentionSelectionIndexByRowId.delete(INITIAL_COMMENT_MENTION_KEY);
    mentionSuppressByRowId.delete(INITIAL_COMMENT_MENTION_KEY);
    const textarea = qs("#wgu-comment-textarea", backdrop);
    wireMentionHelper(backdrop, INITIAL_COMMENT_MENTION_KEY);
    const closeModal = () => {
      selectedMentionsByRowId.delete(INITIAL_COMMENT_MENTION_KEY);
      mentionSelectionIndexByRowId.delete(INITIAL_COMMENT_MENTION_KEY);
      mentionSuppressByRowId.delete(INITIAL_COMMENT_MENTION_KEY);
      if (focusedReplyRowId === INITIAL_COMMENT_MENTION_KEY) focusedReplyRowId = "";
      backdrop.remove();
      if (visibleActiveChats(mergeOptimisticChats(lastFetchedPageChats)).length) enterActiveMode("comment modal closed");
      else enterIdleMode("comment modal closed with no active threads");
    };
    qs("#wgu-cancel-comment", backdrop).addEventListener("click", closeModal);
    backdrop.addEventListener("click", ev => { if (ev.target === backdrop) closeModal(); });
    qs("#wgu-post-comment", backdrop).addEventListener("click", async ev => {
      const post = ev.currentTarget;
      try {
        post.disabled = true; post.textContent = "Posting...";
        const fieldRowId = qs("#wgu-field-select", backdrop).value;
        let field = fields.find(f => f.rowId === fieldRowId) || null;
        if (!field && fieldRowId === "__inferred__" && inferred?.displayLabel) {
          field = { ...inferred, rowId: "", displayLabel: inferred.displayLabel };
        }
        await createAnchoredComment(textarea.value.trim(), field);
        closeModal();
      } catch (err) { console.error(err); alert(err.message || String(err)); }
      finally { post.disabled = false; post.textContent = "Post Comment"; }
    });
    backdrop.addEventListener("keydown", ev => {
      if (ev.key === "Escape") closeModal();
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") qs("#wgu-post-comment", backdrop).click();
    });
    safeSetTimeout(() => textarea.focus(), 50);
  }

  async function findTargetByHash(hash) {
    const cfg = await getConfig();
    const resp = await listRowsPaged(cfg.targetTableId, 500, 100);
    return (resp.items || []).find(r => simpleText(cell(r, COL.target.anchorTextHash)) === hash) || null;
  }

  async function resolveSelectionFieldLabel(field) {
    const payload = selectionPayload || {};
    if (payload.surfaceType === "table_cell" || payload.surfaceType === "table_row") {
      // v1.11.0: keep comment creation local-first. Human labels captured from
      // the live Coda DOM are good enough for immediate UX; Coda API lookups are
      // a slow fallback only, not part of the critical path.
      const localLabel = normalizeWhitespace(firstNonIdLabel(payload.columnName, payload.fieldLabel, field?.displayLabel));
      if (localLabel) return localLabel;
      let apiName = "";
      try { apiName = await codaColumnName(payload.tableId, payload.columnId); } catch {}
      return normalizeWhitespace(firstNonIdLabel(apiName) || "Table Cell");
    }
    return normalizeWhitespace(firstNonIdLabel(payload.fieldLabel, payload.headingLabel, fieldLabelForCanvasSelection(), field?.displayLabel, currentPageName()) || "Page Canvas");
  }

  async function resolveSelectionTableName() {
    const payload = selectionPayload || {};
    if (!(payload.surfaceType === "table_cell" || payload.surfaceType === "table_row")) return "";
    const localName = normalizeWhitespace(firstNonIdLabel(payload.tableName, payload.sourceTableName));
    if (localName) return localName;
    let apiName = "";
    try { apiName = await codaTableName(payload.tableId); } catch {}
    return normalizeWhitespace(firstNonIdLabel(apiName, payload.tableId ? `Table ${payload.tableId}` : ""));
  }

  function tableScopedFieldDisplay(tableName, fieldLabel) {
    const f = firstNonIdLabel(fieldLabel) || "Table Field";
    const t = firstNonIdLabel(tableName);
    return t ? `${t} / ${f}` : f;
  }

  function discussableKeyForSelection(fieldLabel) {
    const payload = selectionPayload || {};
    if (payload.surfaceType === "table_cell" || payload.surfaceType === "table_row") {
      return payload.columnId || fieldLabel || "table_field";
    }
    return `canvas:${currentPageKey() || codaPageTokenFromUrl(location.href)}:${fieldLabel || currentPageName()}`;
  }

  function discussableSourceForSelection() {
    const payload = selectionPayload || {};
    if (payload.surfaceType === "table_cell" || payload.surfaceType === "table_row") return payload.tableId || "Coda Table";
    return "Coda Canvas";
  }

  async function ensureDiscussableFieldForSelection(field, fieldLabel, pageName) {
    const cleanLabel = firstNonIdLabel(fieldLabel, field?.displayLabel, currentPageName()) || "Comment Field";
    const cleanPage = normalizeWhitespace(pageName || currentPageName());

    // Existing real _DiscussableFields row: use it. This is what populates
    // _CommentTarget.[Page Name] and _Chats.[Page Name] formula columns.
    if (field?.rowId && field.rowId !== "__heading__") {
      const payload = selectionPayload || {};
      if ((payload.surfaceType === "table_cell" || payload.surfaceType === "table_row") && !fieldMatchesCurrentTableSelection(field, payload)) {
        // Same display label, wrong table/column. Ignore it and create/reuse the
        // correctly scoped _DiscussableFields row below.
      } else {
        return { ...field, displayLabel: firstNonIdLabel(field.displayLabel, cleanLabel) || cleanLabel, pageName: field.pageName || cleanPage };
      }
    }

    const sourceTableName = discussableSourceForSelection();
    const fieldKey = discussableKeyForSelection(cleanLabel);
    let fields = await loadDiscussableFields(false);
    let found = fields.find(f =>
      normalizeWhitespace(f.sourceTableName) === normalizeWhitespace(sourceTableName) &&
      normalizeWhitespace(f.fieldKey) === normalizeWhitespace(fieldKey) &&
      namesEquivalent(f.pageName || cleanPage, cleanPage)
    );
    if (!found) {
      found = fields.find(f =>
        normalizeWhitespace(f.sourceTableName) === normalizeWhitespace(sourceTableName) &&
        normalizeWhitespace(f.fieldKey) === normalizeWhitespace(fieldKey)
      );
    }
    if (found?.rowId) return found;

    try {
      const cfg = await getConfig();
      const cells = {
        [COL.fields.displayLabel]: cleanLabel,
        [COL.fields.sourceTableName]: sourceTableName,
        [COL.fields.fieldKey]: fieldKey,
        [COL.fields.pageName]: cleanPage,
        [COL.fields.viewUrl]: currentPageUrl(),
        [COL.fields.useSnippetPicker]: false
      };
      const resp = await addRow(cfg.fieldsTableId, cells);
      const newId = resp.addedRowIds?.[0] || resp.items?.[0]?.id || resp.items?.[0]?.rowId || "";
      if (newId) {
        const created = {
          rowId: newId,
          displayLabel: cleanLabel,
          sourceTableName,
          fieldKey,
          pageName: cleanPage,
          viewUrl: currentPageUrl(),
          useSnippetPicker: false
        };
        discussableFields.unshift(created);
        fieldsLoadedAt = Date.now();
        return created;
      }
    } catch (err) {
      console.debug("[WGU Coda Comments] Could not auto-create _DiscussableFields row for page/field context", err);
    }

    return { ...(field || {}), rowId: "", displayLabel: cleanLabel, sourceTableName, fieldKey, pageName: cleanPage, viewUrl: currentPageUrl() };
  }

  async function createAnchoredCommentInEngine({ message, hash, pageName, sourceBrowserUrl, sourcePageUrl, fieldLabel, tableName, fieldContextLabel, initialResolvedMentions }) {
    const cfg = await getConfig();
    const sender = await getCurrentCodaUserSafe();
    const threadPublicId = `thr-${hash.slice(0, 12)}-${Date.now().toString(36)}`;
    const nowIso = new Date().toISOString();
    const sourceDocId = sourceDocIdForRuntime(cfg);
    const sourceDocName = document.title ? document.title.replace(/\s+-\s*Coda\s*$/i, "").trim() : "";
    const t = CHAT_ENGINE.threads;
    const cells = {
      [t.threadId]: threadPublicId,
      [t.sourceDocId]: sourceDocId,
      [t.sourceDocName]: sourceDocName,
      [t.sourcePageUrl]: sourcePageUrl || currentSourcePageUrl(),
      [t.sourcePageName]: pageName || currentPageName(),
      [t.sourceBrowserUrl]: sourceBrowserUrl || currentSourceBrowserUrl(),
      [t.resolved]: false,
      [t.anchorStatus]: "Active",
      [t.anchorExactText]: selectionPayload.exact,
      [t.anchorPrefix]: selectionPayload.prefix,
      [t.anchorSuffix]: selectionPayload.suffix,
      [t.currentMatchedText]: selectionPayload.exact,
      [t.anchorTextHash]: hash,
      [t.anchorMatchStrategy]: "created",
      [t.anchorMatchScore]: 100,
      [t.createdByName]: sender.name || "",
      [t.createdByEmail]: sender.email || "",
      [t.createdAt]: nowIso,
      [t.lastMessagePreview]: normalizeWhitespace(message || ""),
      [t.lastMessageAt]: nowIso,
      [t.lastMessageAuthorInitials]: currentUserInitialsForAvatar(),
      [t.messageCount]: message ? 1 : 0,
      [t.nearestHeading]: selectionPayload.nearestHeading || selectionPayload.headingLabel || "",
      [t.blockExcerpt]: selectionPayload.blockExcerpt || selectionPayload.snapshot || "",
      [t.previousSentence]: selectionPayload.previousSentence || "",
      [t.nextSentence]: selectionPayload.nextSentence || "",
      [t.normalizedSignature]: selectionPayload.normalizedSignature || "",
      [t.rareTokens]: selectionPayload.rareTokens || "",
      [t.domFingerprint]: selectionPayload.domFingerprint || selectionPayload.domPathHint || "",
      [t.blockIndex]: Number(selectionPayload.blockIndex || 0),
      [t.contextCapturedAt]: selectionPayload.capturedAt || nowIso,
      [t.sourceTableName]: selectionPayload.sourceTableName || tableName || selectionPayload.tableName || selectionPayload.tableId || "",
      [t.sourceRowId]: selectionPayload.sourceRowId || "",
      [t.sourceColumnName]: selectionPayload.sourceColumnName || selectionPayload.columnName || fieldLabel || "",
      [t.sourceRowDisplay]: selectionPayload.sourceRowDisplay || selectionPayload.rowText || selectionPayload.cellText || "",
      [t.fieldLabel]: fieldContextLabel || fieldLabel || "",
      [t.anchorApproxTop]: selectionPayload.anchorApproxTop,
      [t.anchorApproxLeft]: selectionPayload.anchorApproxLeft,
      [t.anchorApproxHeight]: selectionPayload.anchorApproxHeight,
      [t.anchorApproxWidth]: selectionPayload.anchorApproxWidth,
      [t.anchorApproxCapturedAt]: selectionPayload.anchorApproxCapturedAt || nowIso,
      [t.anchorApproxPageHeight]: selectionPayload.anchorApproxPageHeight,
      [t.anchorApproxViewportHeight]: selectionPayload.anchorApproxViewportHeight || window.innerHeight,
      [t.anchorApproxScrollContainer]: selectionPayload.anchorApproxScrollContainer || "window",
      [t.anchorApproxSource]: selectionPayload.anchorApproxSource || "selection_range",
      [t.anchorApproxConfidence]: selectionPayload.anchorApproxConfidence || "Medium"
    };
    const resp = await addRowInDoc(cfg.commentEngineDocId, cfg.engineThreadsTableId, cells);
    const addedId = resp.addedRowIds?.[0] || resp.items?.[0]?.id || resp.items?.[0]?.rowId || "";
    if (addedId) {
      const initialSelected = selectedMentionsByRowId.get(INITIAL_COMMENT_MENTION_KEY) || [];
      if (initialSelected.length) selectedMentionsByRowId.set(addedId, initialSelected);
      await addChatMessage({
        chatRowId: threadPublicId,
        body: message || "",
        messageType: "comment",
        mentionedEmails: initialResolvedMentions?.emails || [],
        sourceDocId,
        sourcePageUrl
      }).catch(err => console.warn("[WGU Coda Comments] Comment Engine _Messages initial write failed", err));
    }
    return { addedId, threadPublicId };
  }

  async function createAnchoredComment(message, field) {
    if (!selectionPayload) throw new Error("No selection captured.");
    const cfg = await getConfig();
    requireToken(cfg);
    const hash = await sha256Hex([selectionPayload.prefix, selectionPayload.exact, selectionPayload.suffix].map(normalizeWhitespace).join("|"));
    try {
      if (selectionPayload.liveRange?.cloneRange) optimisticAnchorRangeByHash.set(hash, { range: selectionPayload.liveRange.cloneRange(), exact: selectionPayload.exact, createdAt: Date.now() });
    } catch {}
    if (!useCommentEngine(cfg)) await loadOptionalExtensionColumns();
    const pageName = selectionPayload.pageName || currentPageName();
    const pageKey = selectionPayload.pageKey || currentPageKey();
    const sourceBrowserUrl = selectionPayload.sourceBrowserUrl || currentSourceBrowserUrl();
    const sourcePageUrl = selectionPayload.sourcePageUrl || currentSourcePageUrl();
    const fieldLabel = await resolveSelectionFieldLabel(field);
    const tableName = await resolveSelectionTableName();
    const fieldContextLabel = tableScopedFieldDisplay(tableName, fieldLabel);
    const fieldForLookup = useCommentEngine(cfg)
      ? { ...(field || {}), rowId: "", displayLabel: fieldLabel, sourceTableName: selectionPayload.tableId || selectionPayload.sourceTableName || "Coda Canvas", fieldKey: selectionPayload.columnId || fieldLabel, pageName, viewUrl: currentPageUrl() }
      : await ensureDiscussableFieldForSelection(field, fieldLabel, pageName);
    const initialResolvedMentions = mergeResolvedMentions(message || "", INITIAL_COMMENT_MENTION_KEY);
    const initialAuthorInitials = currentUserInitialsForAvatar();
    const logEntry = message ? `${initialAuthorInitials}: ${new Date().toLocaleString()} -- ${fieldLabel}: "${truncate(selectionPayload.exact, 160)}"\n${message}` : "";

    const pendingChat = makeSyntheticChat({
      hash,
      exact: selectionPayload.exact,
      prefix: selectionPayload.prefix,
      suffix: selectionPayload.suffix,
      pageUrl: currentPageUrl(),
      fieldLabel: fieldContextLabel,
      targetId: "",
      message: logEntry || message,
      status: "Saving…",
      payload: selectionPayload
    });
    optimisticChats.set(hash, pendingChat);
    runtimeStoreRememberAnchorSnapshot(hash, selectionPayload, pendingChat);
    runtimeStoreUpsertThread(pendingChat, "local pending comment");
    activeAnchorHash = hash;
    focusOnlyAnchorHash = hash;
    await renderCurrentPageFromCache(true);
    // v1.10.11: do not wait for Coda API formula/eventual consistency before
    // showing the newly-created anchor. The synthetic row has the selected text,
    // context, and approximate geometry, so render it immediately from local state.
    try {
      enterActiveMode("new optimistic comment anchor");
      // v1.11.0: the user just selected this text, so highlight it immediately
      // from the optimistic live range instead of honoring any stale scroll defer.
      textHighlightDeferredUntil = 0;
      applyHighlights(visibleActiveChats(mergeOptimisticChats(lastFetchedPageChats)));
      scheduleIconPositionReflow();
    } catch (err) {
      console.debug("[WGU Coda Comments] Immediate optimistic anchor render skipped", err);
    }

    if (useCommentEngine(cfg)) {
      const engineResult = await createAnchoredCommentInEngine({
        message,
        hash,
        pageName,
        sourceBrowserUrl,
        sourcePageUrl,
        fieldLabel,
        tableName,
        fieldContextLabel,
        initialResolvedMentions
      });
      const synced = optimisticChats.get(hash);
      if (synced && engineResult.addedId) {
        synced.id = engineResult.addedId;
        synced.rowId = engineResult.addedId;
        synced.synthetic = false;
        synced.values[COL.chats.chatLabel] = engineResult.threadPublicId;
        synced.values[COL.chats.extPendingSync] = false;
      }
      selectedMentionsByRowId.delete(INITIAL_COMMENT_MENTION_KEY);
      await loadPageChats(true);
      return engineResult;
    }

    let target = await findTargetByHash(hash);
    if (!target) {
      const surfaceType = codaSurfaceTypeForTarget(selectionPayload.surfaceType || (field ? "table_cell" : "canvas_text"));
      const sourceTableName = fieldForLookup?.sourceTableName || selectionPayload.tableId || "Coda Canvas";
      const sourceRowId = selectionPayload.sourceRowId || "";
      const sourceRowUrl = sourceRowId ? addWguDeepLinkParams(currentPageUrl(), { hash, targetRowId: sourceRowId }) : "";
      const cells = {
        [COL.target.sourceTableName]: sourceTableName,
        [COL.target.sourceRowId]: sourceRowId,
        [COL.target.sourceRowUrl]: sourceRowUrl,
        [COL.target.initialValueSnapshot]: selectionPayload.exact,
        [COL.target.contextViewUrl]: fieldForLookup?.viewUrl || selectionPayload.viewId || sourceBrowserUrl,
        [COL.target.pageUrl]: sourcePageUrl,
        [COL.target.surfaceType]: surfaceType,
        [COL.target.columnId]: selectionPayload.columnId || fieldForLookup?.fieldKey || "",
        [COL.target.anchorExactText]: selectionPayload.exact,
        [COL.target.anchorPrefix]: selectionPayload.prefix,
        [COL.target.anchorSuffix]: selectionPayload.suffix,
        [COL.target.anchorTextHash]: hash,
        [COL.target.anchorStatus]: "Active",
        [COL.target.domPathHint]: [selectionPayload.domPathHint, selectionPayload.domContextHint, tableName ? `table-name=${tableName}` : "", selectionPayload.tableId ? `table-id=${selectionPayload.tableId}` : "", selectionPayload.viewId ? `view-id=${selectionPayload.viewId}` : "", selectionPayload.columnName ? `column-name=${selectionPayload.columnName}` : ""].filter(Boolean).join(" | ").slice(0, 1000),
        [COL.target.anchorMatchConfidence]: "High",
        [COL.target.createdByExtension]: true,
        [COL.target.sourceBrowserUrl]: sourceBrowserUrl,
        [COL.target.sourcePageUrl]: sourcePageUrl
      };
      addIfColumn(cells, optionalColumnIds.target.extPageName, pageName);
      addIfColumn(cells, optionalColumnIds.target.extPageKey, pageKey);
      addIfColumn(cells, optionalColumnIds.target.extFieldName, fieldLabel);
      addIfColumn(cells, optionalColumnIds.target.extTableName, tableName);
      addIfColumn(cells, optionalColumnIds.target.extTableId, selectionPayload.tableId || "");
      addIfColumn(cells, optionalColumnIds.target.extViewId, selectionPayload.viewId || "");
      addIfColumn(cells, optionalColumnIds.target.extColumnName, selectionPayload.columnName || fieldLabel || "");
      addIfColumn(cells, optionalColumnIds.target.extColumnId, selectionPayload.columnId || "");
      addIfColumn(cells, optionalColumnIds.target.sourceBrowserUrl, sourceBrowserUrl);
      addIfColumn(cells, optionalColumnIds.target.sourcePageUrl, sourcePageUrl);
      if (fieldForLookup?.rowId) cells[COL.target.commentField] = fieldForLookup.rowId;
      const targetResp = await addRow(cfg.targetTableId, cells);
      const newId = targetResp.addedRowIds?.[0] || targetResp.items?.[0]?.id || targetResp.items?.[0]?.rowId;
      target = { id: newId, rowId: newId, values: { [COL.target.anchorTextHash]: hash } };
    }
    const targetId = rowId(target);
    if (!targetId) throw new Error("Created/found target but could not determine Coda row ID.");
    const optimistic = optimisticChats.get(hash);
    if (optimistic) optimistic.values[COL.chats.extTargetRowId] = targetId;
    await renderCurrentPageFromCache(true);

    const chatCells = {
      [COL.chats.commentTarget]: targetId,
      [COL.chats.whatsOnYourMind]: message || "",
      [COL.chats.lastMessagePreview]: message || "",
      [COL.chats.lastMessageAt]: new Date().toISOString(),
      [COL.chats.lastMessageAuthorInitials]: currentUserInitialsForAvatar(),
      [COL.chats.messageCountFast]: message ? 1 : 0,
      [COL.chats.legacyCommentLogFrozen]: true,
      [COL.chats.currentThreadCount]: message ? 1 : 0,
      [COL.chats.textAnchor]: `${pageName}${tableName ? " / " + tableName : ""} / ${fieldLabel}: ${selectionPayload.exact}`,
      [COL.chats.threadType]: codaThreadTypeForSurface(selectionPayload.surfaceType, fieldForLookup || field),
      [COL.chats.extensionCreated]: true,
      [COL.chats.lastAnchorMatchConfidence]: "High",
      [COL.chats.currentMatchedText]: selectionPayload.exact,
      [COL.chats.extSourceBrowserUrl]: sourceBrowserUrl,
      [COL.chats.extSourcePageUrl]: sourcePageUrl,
      [COL.chats.extPageUrl]: sourcePageUrl,
      [COL.chats.extAnchorExactText]: selectionPayload.exact,
      [COL.chats.extAnchorPrefix]: selectionPayload.prefix,
      [COL.chats.extAnchorSuffix]: selectionPayload.suffix,
      [COL.chats.extAnchorTextHash]: hash,
      [COL.chats.extFieldLabel]: fieldContextLabel,
      [COL.chats.extTargetRowId]: targetId,
      [COL.chats.extAnchorStatus]: "Active",
      [COL.chats.extPendingSync]: false,
      [COL.chats.nativeSyncStatus]: "Not Synced",
      [COL.chats.mentionedText]: initialResolvedMentions.tokens.join(", "),
      [COL.chats.mentionedEmails]: initialResolvedMentions.emails.join(", "),
      [COL.chats.mentionNotificationStatus]: mentionStatusFor(initialResolvedMentions, "Not Synced"),
      [COL.chats.anchorMatchStrategy]: "created",
      [COL.chats.anchorMatchScore]: 100,
      [COL.chats.anchorNearestHeading]: selectionPayload.nearestHeading || selectionPayload.headingLabel || "",
      [COL.chats.anchorBlockExcerpt]: selectionPayload.blockExcerpt || selectionPayload.snapshot || "",
      [COL.chats.anchorPreviousSentence]: selectionPayload.previousSentence || "",
      [COL.chats.anchorNextSentence]: selectionPayload.nextSentence || "",
      [COL.chats.anchorNormalizedSignature]: selectionPayload.normalizedSignature || "",
      [COL.chats.anchorRareTokens]: selectionPayload.rareTokens || "",
      [COL.chats.anchorSourceTableName]: selectionPayload.sourceTableName || tableName || selectionPayload.tableName || selectionPayload.tableId || "",
      [COL.chats.anchorSourceColumnName]: selectionPayload.sourceColumnName || selectionPayload.columnName || fieldLabel || "",
      [COL.chats.anchorSourceRowDisplay]: selectionPayload.sourceRowDisplay || selectionPayload.rowText || selectionPayload.cellText || "",
      [COL.chats.anchorDomFingerprint]: selectionPayload.domFingerprint || selectionPayload.domPathHint || "",
      [COL.chats.anchorBlockIndex]: Number(selectionPayload.blockIndex || 0),
      [COL.chats.anchorContextCapturedAt]: selectionPayload.capturedAt || new Date().toISOString()
    };
    addIfColumn(chatCells, optionalColumnIds.chats.extPageName, pageName);
    addIfColumn(chatCells, optionalColumnIds.chats.extPageKey, pageKey);
    addIfColumn(chatCells, optionalColumnIds.chats.extTableName, tableName);
    addIfColumn(chatCells, optionalColumnIds.chats.extTableId, selectionPayload.tableId || "");
    addIfColumn(chatCells, optionalColumnIds.chats.extViewId, selectionPayload.viewId || "");
    addIfColumn(chatCells, optionalColumnIds.chats.extColumnName, selectionPayload.columnName || fieldLabel || "");
    addIfColumn(chatCells, optionalColumnIds.chats.extColumnId, selectionPayload.columnId || "");
    addIfColumn(chatCells, optionalColumnIds.chats.extSourceBrowserUrl, sourceBrowserUrl);
    addIfColumn(chatCells, optionalColumnIds.chats.extSourcePageUrl, sourcePageUrl);
    const chatResp = await addRow(cfg.chatsTableId, chatCells);
    const addedChatId = chatResp.addedRowIds?.[0] || chatResp.items?.[0]?.id || chatResp.items?.[0]?.rowId || "";
    const synced = optimisticChats.get(hash);
    if (addedChatId) {
      const initialSelected = selectedMentionsByRowId.get(INITIAL_COMMENT_MENTION_KEY) || [];
      if (initialSelected.length) {
        selectedMentionsByRowId.set(addedChatId, initialSelected);
        console.log(`[WGU Coda Comments] Initial mention transfer: ${initialSelected.length} mention(s) moved to chat ${addedChatId}.`);
      } else {
        console.log("[WGU Coda Comments] Initial comment had no selected mention identities to transfer.");
      }
    }
    if (synced && addedChatId) {
      synced.id = addedChatId;
      synced.rowId = addedChatId;
      synced.synthetic = false;
      synced.values[COL.chats.extPendingSync] = false;
      synced.values[COL.chats.nativeSyncStatus] = "Pending";
      synced.values[COL.chats.mentionNotificationStatus] = mentionStatusFor(initialResolvedMentions, "Pending");
    }

    if (addedChatId) {
      addChatMessage({
        chatRowId: addedChatId,
        body: message || "",
        messageType: "comment",
        mentionedEmails: mergeResolvedMentions(message || "", addedChatId).emails,
        nativeSyncStatus: "Pending"
      }).catch(err => console.warn("[WGU Coda Comments] _ChatMessages initial write failed", err));

      syncNativeCommentForChat({
        chatRowId: addedChatId,
        action: "create_thread",
        content: message || "",
        fieldLabel,
        exact: selectionPayload.exact,
        hash,
        pageUrl: currentPageUrl(),
        threadUri: "",
        resolvedMentions: mergeResolvedMentions(message || "", addedChatId)
      }).then(() => loadPageChats(true)).catch(err => { if (isExtensionContextError(err)) markExtensionContextInvalidated(err); else loadPageChats(true); });

      enqueueMentionNotifications({
        chatRowId: addedChatId,
        targetRowId: targetId,
        anchorHash: hash,
        content: message || "",
        sourceField: fieldLabel,
        pageUrl: currentPageUrl(),
        nativeThreadUri: "",
        nativeThreadUrl: "",
        resolvedMentions: mergeResolvedMentions(message || "", addedChatId)
      }).then(result => {
        if (result?.queued) console.log(`[WGU Coda Comments] Queued initial mention notification(s): ${result.queued}.`);
      }).catch(err => console.error("[WGU Coda Comments] Initial mention notification queue failed", err));
    }
    selectedMentionsByRowId.delete(INITIAL_COMMENT_MENTION_KEY);
    mentionSelectionIndexByRowId.delete(INITIAL_COMMENT_MENTION_KEY);
    mentionSuppressByRowId.delete(INITIAL_COMMENT_MENTION_KEY);

    await renderCurrentPageFromCache(true);
    safeSetTimeout(() => loadPageChats(true), 700);
    safeSetTimeout(() => activateByHash(hash, { scrollCard: true, scrollHighlight: true, forcePulse: true }), 250);
  }

  function clearNativeTextHighlights() {
    nativeTextHighlightRanges.length = 0;
    nativeActiveTextHighlightRanges.length = 0;
    try {
      if (CSS?.highlights) {
        CSS.highlights.delete("wgu-coda-comment-text");
        CSS.highlights.delete("wgu-coda-comment-text-active");
      }
    } catch {}
  }

  function commitNativeTextHighlights() {
    try {
      if (!CSS?.highlights || typeof Highlight !== "function") return false;

      // v1.10.1: delay text background/color highlights until scrolling settles.
      // Icons may appear immediately, but text paint should not chase Coda while
      // virtualized content is still moving/mounting.
      const remaining = Math.max(0, textHighlightDeferredUntil - Date.now());
      if (remaining > 0) {
        if (textHighlightCommitTimer) clearTimeout(textHighlightCommitTimer);
        textHighlightCommitTimer = safeSetTimeout(() => {
          textHighlightCommitTimer = null;
          commitNativeTextHighlights();
        }, Math.min(900, remaining + 25));
        return true;
      }

      CSS.highlights.delete("wgu-coda-comment-text");
      CSS.highlights.delete("wgu-coda-comment-text-active");
      if (nativeTextHighlightRanges.length) CSS.highlights.set("wgu-coda-comment-text", new Highlight(...nativeTextHighlightRanges));
      if (nativeActiveTextHighlightRanges.length) CSS.highlights.set("wgu-coda-comment-text-active", new Highlight(...nativeActiveTextHighlightRanges));
      return true;
    } catch (err) {
      console.debug("[WGU Coda Comments] Native text highlight failed", err);
      return false;
    }
  }

  function addNativeTextHighlight(range, meta = {}) {
    if (!range || !range.cloneRange) return false;
    try {
      const clone = range.cloneRange();
      if ((activeAnchorHash || focusOnlyAnchorHash || "") === (meta.hash || "")) nativeActiveTextHighlightRanges.push(clone);
      else nativeTextHighlightRanges.push(clone);
      return true;
    } catch { return false; }
  }


  function numberOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function captureApproxGeometryFromRect(rect, source = "fallback", confidence = "Medium") {
    if (!rect || (!rect.width && !rect.height)) return null;
    if (isRectInTopCodaChromeZone(rect)) return null;
    const canvas = largestVisibleCodaCanvasRect();
    const canvasTop = canvas ? canvas.top : 0;
    const canvasLeft = canvas ? canvas.left : 0;
    const pageHeight = canvas ? canvas.height : Math.max(document.documentElement.scrollHeight || 0, document.body?.scrollHeight || 0);
    const top = Math.round(rect.top - canvasTop);
    const left = Math.round(rect.left - canvasLeft);
    if (!Number.isFinite(top) || top < -200) return null;
    const readable = getReadableViewport({ reason: "capture approximate anchor geometry", maxAgeMs: 800 })?.readableViewport || { top: 0, bottom: window.innerHeight || 800, height: window.innerHeight || 800 };
    const viewportHeight = readableViewportHeight(readable);
    const viewportYAtCapture = Math.round(rect.top - (Number(readable.top) || 0));
    const viewportYRatioAtCapture = clampNumber(viewportYAtCapture / viewportHeight, 0.05, 0.95);
    return {
      top,
      left: Number.isFinite(left) ? left : 0,
      height: Math.max(1, Math.round(rect.height || 1)),
      width: Math.max(1, Math.round(rect.width || 1)),
      capturedAt: new Date().toISOString(),
      pageHeight: Math.max(1, Math.round(pageHeight || 1)),
      viewportHeight,
      viewportYAtCapture,
      viewportYRatioAtCapture,
      preferredLandingPaddingTop: 100,
      preferredLandingPaddingBottom: 100,
      scrollContainer: "window",
      source,
      confidence
    };
  }

  function captureApproxGeometryFromRange(range, source = "live_range") {
    try {
      const cell = nearestCodaCellForRange(range);
      const rect = cell?.getBoundingClientRect?.() || range?.getBoundingClientRect?.();
      return captureApproxGeometryFromRect(rect, source, cell ? "High" : "Medium");
    } catch {
      return null;
    }
  }

  function captureApproxGeometryFromElement(el, source = "source_element") {
    try {
      const rect = el?.getBoundingClientRect?.();
      return captureApproxGeometryFromRect(rect, source, "Medium");
    } catch {
      return null;
    }
  }

  function captureApproxGeometryForResolved(resolved, source = "live_range") {
    const rect = rectForAnchorResolution(resolved);
    const sourceName = resolved?.range ? "live_range" : resolved?.cell ? "table_row" : resolved?.element ? "block_element" : source;
    const confidence = resolved?.range || resolved?.cell ? "High" : "Medium";
    return captureApproxGeometryFromRect(rect, sourceName, confidence);
  }

  function approxGeometryCells(geom) {
    const c = COL.chats;
    if (!geom) return {};
    return {
      [c.anchorApproxTop]: geom.top,
      [c.anchorApproxLeft]: geom.left,
      [c.anchorApproxHeight]: geom.height,
      [c.anchorApproxWidth]: geom.width,
      [c.anchorApproxCapturedAt]: geom.capturedAt,
      [c.anchorApproxPageHeight]: geom.pageHeight,
      [c.anchorApproxViewportHeight]: geom.viewportHeight,
      [c.anchorApproxScrollContainer]: geom.scrollContainer,
      [c.anchorApproxSource]: geom.source,
      [c.anchorApproxConfidence]: geom.confidence
    };
  }

  function approxGeometryFromChat(chat) {
    const top = numberOrNull(valueFirst(chat, COL.chats.anchorApproxTop));
    if (top == null) return null;
    return {
      top,
      left: numberOrNull(valueFirst(chat, COL.chats.anchorApproxLeft)) || 0,
      height: numberOrNull(valueFirst(chat, COL.chats.anchorApproxHeight)) || 1,
      width: numberOrNull(valueFirst(chat, COL.chats.anchorApproxWidth)) || 1,
      capturedAt: valueFirst(chat, COL.chats.anchorApproxCapturedAt),
      pageHeight: numberOrNull(valueFirst(chat, COL.chats.anchorApproxPageHeight)) || 0,
      viewportHeight: numberOrNull(valueFirst(chat, COL.chats.anchorApproxViewportHeight)) || numberOrNull(chat?.anchorApproxViewportHeight) || 0,
      viewportYAtCapture: numberOrNull(chat?.anchorApproxViewportYAtCapture),
      viewportYRatioAtCapture: numberOrNull(chat?.anchorApproxViewportYRatioAtCapture),
      preferredLandingPaddingTop: numberOrNull(chat?.anchorPreferredLandingPaddingTop) || 100,
      preferredLandingPaddingBottom: numberOrNull(chat?.anchorPreferredLandingPaddingBottom) || 100,
      scrollContainer: valueFirst(chat, COL.chats.anchorApproxScrollContainer) || chat?.anchorApproxScrollContainer || "window",
      source: valueFirst(chat, COL.chats.anchorApproxSource) || "stored",
      confidence: valueFirst(chat, COL.chats.anchorApproxConfidence) || "Medium"
    };
  }

  function applyApproxGeometryToRowObject(chat, geom) {
    if (!chat || !geom) return;
    if (!chat.values) chat.values = {};
    const c = COL.chats;
    chat.values[c.anchorApproxTop] = geom.top;
    chat.values[c.anchorApproxLeft] = geom.left;
    chat.values[c.anchorApproxHeight] = geom.height;
    chat.values[c.anchorApproxWidth] = geom.width;
    chat.values[c.anchorApproxCapturedAt] = geom.capturedAt;
    chat.values[c.anchorApproxPageHeight] = geom.pageHeight;
    chat.values[c.anchorApproxViewportHeight] = geom.viewportHeight;
    chat.values[c.anchorApproxScrollContainer] = geom.scrollContainer;
    chat.values[c.anchorApproxSource] = geom.source;
    chat.values[c.anchorApproxConfidence] = geom.confidence;
    chat.anchorApproxViewportYAtCapture = geom.viewportYAtCapture;
    chat.anchorApproxViewportYRatioAtCapture = geom.viewportYRatioAtCapture;
    chat.anchorPreferredLandingPaddingTop = geom.preferredLandingPaddingTop || 100;
    chat.anchorPreferredLandingPaddingBottom = geom.preferredLandingPaddingBottom || 100;
  }

  function maybeSyncApproxGeometryForAnchor(anchor = {}, resolved = {}) {
    try {
      const chat = anchor.primaryChat;
      if (!chat || isSyntheticRow(chat)) return;
      const id = rowId(chat);
      if (!id) return;
      const geom = captureApproxGeometryForResolved(resolved);
      if (!geom || geom.confidence === "Low") return;
      const existing = approxGeometryFromChat(chat);
      if (existing && Math.abs((existing.top || 0) - geom.top) < 32 && Math.abs((existing.height || 0) - geom.height) < 24) return;
      const signature = `${id}|${geom.top}|${geom.left}|${geom.height}|${geom.width}`;
      if (anchorApproxSyncCache.get(id) === signature) return;
      anchorApproxSyncCache.set(id, signature);
      applyApproxGeometryToRowObject(chat, geom);
      safeSetTimeout(() => {
        updateChatRow(chat, approxGeometryCells(geom)).catch(err => {
          anchorApproxSyncCache.delete(id);
          if (isExtensionContextError(err)) markExtensionContextInvalidated(err);
          else console.debug("[WGU Coda Comments] Approx anchor geometry sync skipped", err);
        });
      }, 50);
    } catch (err) {
      console.debug("[WGU Coda Comments] Approx anchor geometry capture failed", err);
    }
  }

  function clearHighlights() {
    // V1 wrapped Coda text nodes with <span>. Keep cleanup for old injected spans,
    // but v1.9.50 uses native CSS text highlights + largest-canvas margin icons so Coda's React DOM stays editable.
    clearNativeTextHighlights();
    qsa("span.wgu-coda-highlight:not(.wgu-coda-highlight-overlay)").forEach(span => span.replaceWith(document.createTextNode(span.textContent)));
    qsa(".wgu-coda-highlight-overlay,.wgu-coda-anchor-soft-fill,.wgu-coda-bracket-anchor,.wgu-coda-comment-icon").forEach(el => el.remove());
    clearAnchorRegistry();
  }

  function clearAnchorRegistry() {
    anchorRegistryByThreadId.clear();
    anchorRegistryByHash.clear();
    try { window.WGU?.Anchors?.clearAnchors?.(); } catch {}
  }

  let iconPositionReflowRaf = 0;

  function hideTrackedIcon(icon, reason = "offscreen") {
    if (!(icon instanceof HTMLElement)) return;
    if (icon.style.visibility !== "hidden") wguPerfInc("iconPositionHides");
    icon.style.visibility = "hidden";
    icon.style.pointerEvents = "none";
    icon.dataset.wguHiddenReason = reason;
  }

  function showTrackedIcon(icon) {
    if (!(icon instanceof HTMLElement)) return;
    if (icon.style.visibility === "hidden") wguPerfInc("iconPositionShows");
    icon.style.visibility = "visible";
    icon.style.pointerEvents = "auto";
    delete icon.dataset.wguHiddenReason;
  }

  function updateExistingIconPositionForRecord(record) {
    const icon = record?.iconElement;
    if (!(icon instanceof HTMLElement) || !icon.isConnected || isRogueTopCommentIcon(icon)) return false;
    let iconRect = null;
    try {
      if (record.status === "approx") {
        iconRect = viewportRectFromApproxGeometry(record.approxGeometry || approxGeometryFromChat(record.primaryChat || null));
      } else {
        const rects = rectsForResolvedAnchor(record);
        iconRect = iconAnchorRectForResolved(record, rects);
      }
      if (!iconRect) {
        hideTrackedIcon(icon, "no-live-anchor-rect");
        return false;
      }
      const top = Math.round(iconRect.top + (iconRect.height / 2) - 11);
      // Do not leave an icon frozen at the top/bottom chrome boundary while its
      // text continues scrolling. Hide it while the live anchor is outside the
      // readable Coda viewport, then reveal it again as soon as a valid rect returns.
      const bounds = codaContentViewportBounds();
      if (!rectTouchesContentViewport(iconRect, -4) || top < bounds.top + 4 || top > bounds.bottom + 80) {
        hideTrackedIcon(icon, "outside-readable-viewport");
        try { runtimeStoreUpdateAnchorPosition(record.hash, { visible: false, hiddenReason: "outside-readable-viewport" }, "icon hide"); } catch {}
        return false;
      }
      const left = Math.max(bounds.left + 4, Math.min(bounds.right - 28, Math.round(iconRect.left + 10)));
      icon.style.left = `${left}px`;
      icon.style.top = `${top}px`;
      showTrackedIcon(icon);
      record.anchorRect = { left: iconRect.left, right: iconRect.right, top: iconRect.top, bottom: iconRect.bottom, width: iconRect.width, height: iconRect.height };
      try {
        runtimeStoreUpdateAnchorPosition(record.hash, {
          threadIds: (record.threadIds || []).slice(),
          documentY: Math.round((window.scrollY || document.documentElement.scrollTop || 0) + iconRect.top),
          viewportY: Math.round(iconRect.top - bounds.top),
          iconY: Math.round(top - bounds.top),
          visible: true,
          approxTop: record.approxGeometry?.top ?? null
        }, "icon reflow");
      } catch {}
      wguPerfInc("iconPositionUpdates");
      return true;
    } catch {
      hideTrackedIcon(icon, "position-error");
      return false;
    }
  }

  function reflowRegisteredMarginIcons() {
    if (!hasActiveThreadWork()) { suppressIdleDomWork("iconPositionReflow"); return; }
    const seen = new Set();
    let count = 0;
    for (const record of anchorRegistryByHash.values()) {
      if (!record || seen.has(record)) continue;
      seen.add(record);
      if (++count > 40) break;
      updateExistingIconPositionForRecord(record);
    }
    wguPerfInc("iconPositionReflows");
  }

  function scheduleIconPositionReflow() {
    if (!hasActiveThreadWork()) { suppressIdleDomWork("scheduleIconPositionReflow"); return; }
    if (iconPositionReflowRaf) return;
    iconPositionReflowRaf = requestAnimationFrame(() => {
      iconPositionReflowRaf = 0;
      reflowRegisteredMarginIcons();
    });
  }

  let anchorVisibilityRepairTimer = null;

  function pruneHiddenIconsForHash(hash) {
    if (!hash) return;
    try {
      qsa(`.wgu-coda-comment-icon[data-wgu-anchor-hash="${CSS.escape(hash)}"]`).forEach(icon => {
        if (!(icon instanceof HTMLElement)) return;
        if (!icon.isConnected || icon.style.visibility === "hidden" || icon.dataset.wguHiddenReason) {
          try { icon.remove(); } catch {}
        }
      });
    } catch {}
  }

  function registeredIconLooksVisible(record) {
    const icon = record?.iconElement || bestSafeIconForRecord(record);
    if (!(icon instanceof HTMLElement) || !icon.isConnected) return false;
    if (icon.style.visibility === "hidden" || icon.dataset.wguHiddenReason) return false;
    try {
      const r = icon.getBoundingClientRect();
      const bounds = codaContentViewportBounds();
      return r.width > 0 && r.height > 0 && r.bottom >= bounds.top && r.top <= bounds.bottom + 80;
    } catch { return false; }
  }

  function repairMissingVisibleAnchors() {
    if (!hasActiveThreadWork()) { suppressIdleDomWork("anchorVisibilityRepair"); return; }
    wguPerfInc("anchorVisibilityRepairRuns");
    let attempts = 0;
    for (const anchor of anchorCacheByHash.values()) {
      if (!anchor?.hash) continue;
      const record = getResolvedAnchorByHash(anchor.hash);
      if (registeredIconLooksVisible(record)) continue;
      // Limit this to a tiny, idle-time repair pass. It is intentionally not a
      // full clear-and-rebuild, because that was causing icons to disappear when
      // Coda had virtualized the anchor during scroll.
      if (++attempts > 3) break;
      wguPerfInc("anchorVisibilityRepairAttempts");
      pruneHiddenIconsForHash(anchor.hash);
      const before = qsa(`.wgu-coda-comment-icon[data-wgu-anchor-hash="${CSS.escape(anchor.hash)}"]`).length;
      try { highlightAnchor(anchor); } catch (err) { console.debug("[WGU Coda Comments] anchor visibility repair skipped", err); }
      const after = qsa(`.wgu-coda-comment-icon[data-wgu-anchor-hash="${CSS.escape(anchor.hash)}"]`).length;
      if (after > before) wguPerfInc("anchorVisibilityRepairSuccesses");
    }
    commitNativeTextHighlights();
  }

  function scheduleAnchorVisibilityRepair(delay = 650) {
    if (!hasActiveThreadWork()) { suppressIdleDomWork("scheduleAnchorVisibilityRepair"); return; }
    if (anchorVisibilityRepairTimer) clearTimeout(anchorVisibilityRepairTimer);
    anchorVisibilityRepairTimer = safeSetTimeout(() => {
      anchorVisibilityRepairTimer = null;
      requestAnimationFrame(repairMissingVisibleAnchors);
    }, Math.max(250, Number(delay) || 650));
  }

  function threadIdsForAnchor(anchor = {}) {
    const ids = Array.isArray(anchor.chatIds) ? anchor.chatIds.slice() : [];
    for (const id of threadKeyCandidatesForChat(anchor.primaryChat)) {
      if (id && !ids.includes(id)) ids.unshift(id);
    }
    return Array.from(new Set(ids.filter(Boolean)));
  }

  function makeResolvedAnchorRecord(anchor = {}, resolved = {}, iconElement = null) {
    const rect = rectForAnchorResolution(resolved) || resolved?.anchorRect || null;
    return {
      hash: anchor.hash || "",
      threadIds: threadIdsForAnchor(anchor),
      status: (resolved?.range || resolved?.element || resolved?.cell) ? "resolved" : (resolved?.status || (iconElement ? "approx" : "orphaned")),
      strategy: resolved?.method || resolved?.strategy || "none",
      confidence: Number(resolved?.score || resolved?.confidence || 0),
      range: resolved?.range || null,
      element: resolved?.element || null,
      cell: resolved?.cell || null,
      iconElement: iconElement || null,
      anchorRect: rect || null,
      lastResolvedAt: Date.now(),
      failureReason: resolved?.failureReason || "",
      approxGeometry: anchor.approxGeometry || approxGeometryFromChat(anchor.primaryChat || null),
      primaryChat: anchor.primaryChat || null
    };
  }

  function registerResolvedAnchor(anchor = {}, resolved = {}, iconElement = null) {
    if (iconElement && isRogueTopCommentIcon(iconElement)) {
      try { iconElement.remove(); } catch {}
      iconElement = null;
    }
    const record = makeResolvedAnchorRecord(anchor, resolved, iconElement);
    if (!record.hash && !record.threadIds.length) return record;
    if (record.hash) anchorRegistryByHash.set(record.hash, record);
    for (const id of record.threadIds) anchorRegistryByThreadId.set(id, record);
    try {
      const viewport = getReadableViewport({ reason: "register anchor position", maxAgeMs: 800 })?.readableViewport;
      const rect = record.anchorRect || rectForAnchorResolution(record);
      const geom = record.approxGeometry || approxGeometryFromChat(record.primaryChat || null);
      const docY = rect ? Math.round((window.scrollY || document.documentElement.scrollTop || 0) + rect.top) : anchorDocumentYFromApprox(geom);
      const viewportY = rect && viewport ? Math.round(rect.top - viewport.top) : null;
      runtimeStoreUpdateAnchorPosition(record.hash, {
        threadIds: record.threadIds.slice(),
        documentY: docY,
        viewportY,
        iconY: iconElement ? Math.round(iconElement.getBoundingClientRect().top - (viewport?.top || 0)) : null,
        visible: rect && viewport ? rectTouchesContentViewport(rect, -4) : false,
        approxTop: geom?.top ?? null,
        preferred: preferredViewportYFromGeometry(geom || {}, viewport)
      }, "registerResolvedAnchor");
    } catch {}
    try { window.WGU?.Anchors?.setAnchor?.({ ...record, threadId: record.threadIds[0] || "" }); } catch {}
    if (iconElement) {
      iconElement.dataset.wguThreadIds = record.threadIds.join(",");
      iconElement.dataset.wguThreadId = record.threadIds[0] || "";
    }
    if (record.status === "resolved") maybeSyncApproxGeometryForAnchor(anchor, resolved);
    return record;
  }

  function getResolvedAnchorByThreadId(threadId) {
    if (!threadId) return null;
    return anchorRegistryByThreadId.get(threadId) || window.WGU?.Anchors?.getAnchor?.(threadId) || null;
  }

  function getResolvedAnchorByHash(hash) {
    if (!hash) return null;
    return anchorRegistryByHash.get(hash) || window.WGU?.Anchors?.getAnchorByHash?.(hash) || null;
  }

  function pulseIconElement(icon) {
    if (!icon) return;
    icon.classList.add("wgu-anchor-registry-focus");
    safeSetTimeout(() => icon.classList.remove("wgu-anchor-registry-focus"), 1200);
  }

  function scrollRegisteredAnchorIntoView(record, behavior = "smooth") {
    if (!record) return false;
    try {
      const resolved = {
        range: record.range || null,
        element: record.element || null,
        cell: record.cell || null
      };
      if (resolved.range || resolved.element || resolved.cell) {
        scrollResolvedAnchorOnce(resolved, behavior);
        scheduleHighlightReflow(0);
        if (card) {
          try { card.classList.remove("wgu-anchor-not-mounted"); delete card.dataset.wguAnchorStatus; card.removeAttribute("title"); } catch {}
        }
        safeSetTimeout(() => {
          removeRogueTopCommentIcons();
          const latest = getResolvedAnchorByThreadId(record.threadIds?.[0] || "") || getResolvedAnchorByHash(record.hash) || record;
          pulseIconElement(bestSafeIconForRecord(latest) || bestSafeIconForRecord(record));
        }, behavior === "smooth" ? 300 : 60);
        return true;
      }
    } catch {}
    if (record.iconElement && !isRogueTopCommentIcon(record.iconElement)) {
      // v1.10.10: an icon without a live text range is not a trustworthy navigation
      // target. If the icon/anchor is outside the readable viewport, return false so
      // card navigation can use stored approximate geometry instead of scrolling a
      // stale overlay element.
      try {
        const r = record.iconElement.getBoundingClientRect();
        if (rectTouchesContentViewport(r, -2)) {
          pulseIconElement(record.iconElement);
          return true;
        }
      } catch {}
      return false;
    }
    return false;
  }

  function scrollIconIntoView(icon, behavior = "smooth") {
    if (!icon) return false;
    const ids = String(icon.dataset?.wguThreadIds || icon.dataset?.wguThreadId || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);
    const hash = icon.dataset?.wguAnchorHash || "";
    const registered = ids.map(getResolvedAnchorByThreadId).find(Boolean) || getResolvedAnchorByHash(hash);
    if (registered && scrollRegisteredAnchorIntoView(registered, behavior)) return true;

    try {
      // Fallback only. Margin icons are fixed overlays, so native scrollIntoView is
      // often a no-op; the registered anchor path above is the real navigation path.
      icon.scrollIntoView({ behavior, block: "center", inline: "nearest" });
      pulseIconElement(icon);
      return true;
    } catch {
      const r = icon.getBoundingClientRect();
      if (!r) return false;
      window.scrollTo({ top: Math.max(0, window.scrollY + r.top - window.innerHeight * 0.45), behavior });
      pulseIconElement(icon);
      return true;
    }
  }

  function textNodesUnder(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest("#wgu-coda-comment-sidebar,#wgu-comment-modal-backdrop,#wgu-coda-comment-btn,#wgu-coda-comment-tab,#wgu-coda-cell-selection-overlay,#wgu-coda-cell-selection-toolbar,#wgu-cell-comment-trigger,script,style,textarea,input,select")) return NodeFilter.FILTER_REJECT;
        if (parent.closest(".wgu-coda-highlight")) return NodeFilter.FILTER_REJECT;
        if (isLikelyCodaChromeOrToolbarElement(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    wguPerfInc("textNodesScanned", nodes.length);
    return nodes;
  }

  function buildTextIndex(root = document.body) {
    wguPerfInc("textIndexBuilds");
    const nodes = textNodesUnder(root || document.body);
    let text = "";
    const map = [];
    for (const node of nodes) {
      const start = text.length;
      text += node.nodeValue;
      const end = text.length;
      map.push({ node, start, end });
      text += "\n";
    }
    return { text, map };
  }

  function buildNormalizedTextIndex(root = document.body) {
    wguPerfInc("textIndexBuilds");
    const nodes = textNodesUnder(root || document.body);
    let text = "";
    const map = [];
    let lastWasSpace = true;
    for (const node of nodes) {
      const raw = node.nodeValue || "";
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (/\s/.test(ch)) {
          if (!lastWasSpace) {
            map.push({ node, offset: i });
            text += " ";
            lastWasSpace = true;
          }
        } else {
          map.push({ node, offset: i });
          text += ch;
          lastWasSpace = false;
        }
      }
      if (!lastWasSpace) {
        map.push({ node, offset: raw.length });
        text += " ";
        lastWasSpace = true;
      }
    }
    return { text: text.trim(), map };
  }

  function normalizedOffsetToDom(map, offset) {
    if (!map.length) return null;
    const entry = map[Math.max(0, Math.min(map.length - 1, offset))];
    return entry ? { node: entry.node, offset: Math.max(0, Math.min(entry.node.nodeValue.length, entry.offset)) } : null;
  }

  function findBestTextRangeNormalized(exact, prefix = "", suffix = "", root = document.body) {
    exact = normalizeWhitespace(exact);
    if (!exact) return null;
    const index = buildNormalizedTextIndex(root || document.body);
    const positions = [];
    const hay = index.text;
    let start = 0;
    while (true) {
      const pos = hay.indexOf(exact, start);
      if (pos < 0) break;
      positions.push(pos);
      start = pos + Math.max(1, exact.length);
      if (positions.length > 80) break;
    }
    if (!positions.length) return null;
    positions.sort((a, b) => scoreCandidate(hay, b, exact, prefix, suffix) - scoreCandidate(hay, a, exact, prefix, suffix));
    const best = positions[0];
    const startLoc = normalizedOffsetToDom(index.map, best);
    const endLoc = normalizedOffsetToDom(index.map, best + exact.length);
    if (!startLoc || !endLoc) return null;
    const range = document.createRange();
    try {
      range.setStart(startLoc.node, startLoc.offset);
      range.setEnd(endLoc.node, endLoc.offset);
      return range;
    } catch { return null; }
  }

  function locateOffset(map, offset) {
    for (const entry of map) {
      if (offset >= entry.start && offset <= entry.end) return { node: entry.node, offset: Math.max(0, Math.min(entry.node.nodeValue.length, offset - entry.start)) };
    }
    return null;
  }

  function scoreCandidate(text, pos, exact, prefix, suffix) {
    const before = normalizeWhitespace(text.slice(Math.max(0, pos - 320), pos)).toLowerCase();
    const after = normalizeWhitespace(text.slice(pos + exact.length, pos + exact.length + 320)).toLowerCase();
    let score = 0;
    const p = normalizeWhitespace(prefix).toLowerCase();
    const s = normalizeWhitespace(suffix).toLowerCase();
    if (p && before.endsWith(p.slice(-80))) score += 80; else if (p && before.includes(p.slice(-50))) score += 35;
    if (s && after.startsWith(s.slice(0, 80))) score += 80; else if (s && after.includes(s.slice(0, 50))) score += 35;
    return score;
  }

  function findBestTextRange(exact, prefix = "", suffix = "", root = document.body) {
    exact = String(exact || "");
    if (!exact) return null;
    const index = buildTextIndex(root || document.body);
    const positions = [];
    let start = 0;
    while (true) {
      const pos = index.text.indexOf(exact, start);
      if (pos < 0) break;
      positions.push(pos);
      start = pos + Math.max(1, exact.length);
      if (positions.length > 50) break;
    }
    if (!positions.length) return findBestTextRangeNormalized(exact, prefix, suffix, root);
    positions.sort((a, b) => scoreCandidate(index.text, b, exact, prefix, suffix) - scoreCandidate(index.text, a, exact, prefix, suffix));
    const best = positions[0];
    const startLoc = locateOffset(index.map, best);
    const endLoc = locateOffset(index.map, best + exact.length);
    if (!startLoc || !endLoc) return findBestTextRangeNormalized(exact, prefix, suffix, root);
    const range = document.createRange();
    try { range.setStart(startLoc.node, startLoc.offset); range.setEnd(endLoc.node, endLoc.offset); return range; }
    catch { return findBestTextRangeNormalized(exact, prefix, suffix, root); }
  }



  function cssEscapeMaybe(value) {
    try { return CSS.escape(String(value || "")); }
    catch { return String(value || "").replace(/(["'\\\[\]#. :])/g, "\\$1"); }
  }

  function firstContentStringFromRow(row, ...cols) {
    for (const c of cols) {
      const v = cell(row, c);
      const txt = simpleText(v);
      if (txt) return txt;
      const content = v?.content;
      if (typeof content === "string" && content) return content;
      if (content?.url) return content.url;
      if (content?.objectId) return content.objectId;
      if (content?.identifier) return content.identifier;
    }
    return "";
  }

  function refIdentifierFromCellValue(v) {
    const c = v?.content;
    if (!c) return "";
    if (typeof c === "string") return c;
    return c.identifier || c.rowId || c.id || c.objectId || "";
  }

  function chatTargetRowId(chat) {
    return refIdentifierFromCellValue(cell(chat, COL.chats.commentTarget)) || valueFirst(chat, COL.chats.extTargetRowId) || "";
  }

  function targetRowForChat(chat) {
    const id = chatTargetRowId(chat);
    return id ? commentTargetsById.get(id) || null : null;
  }

  function parseDomPathCellHints(text = "") {
    const out = { rowIds: [], columnIds: [], tableIds: [], viewIds: [] };
    const add = (key, value) => {
      value = String(value || "").trim();
      if (value && !out[key].includes(value)) out[key].push(value);
    };
    const source = String(text || "");
    source.replace(/data-row-id=["']?([A-Za-z0-9_-]+)/g, (_, v) => add("rowIds", v));
    source.replace(/data-column-id=["']?([A-Za-z0-9_-]+)/g, (_, v) => add("columnIds", v));
    source.replace(/data-object-id=["']?([A-Za-z0-9_-]+)/g, (_, v) => add("tableIds", v));
    source.replace(/data-view-id=["']?([A-Za-z0-9_-]+)/g, (_, v) => add("viewIds", v));
    source.replace(/::row:([^:|\s]+)::col:([^:|\s]+)/g, (_, r, c) => { add("rowIds", r); add("columnIds", c); });
    // Coda canvas/table rich-text cells often expose the useful identity only in
    // data-editable-id, e.g. cl-grid-UzXQWFhDTK::i-LbfoLEby3E::c-ILLHqtRPzZ-0.
    // Parse that too so comment-card navigation can resolve anchors without
    // falling back to brittle full-page text search or URL mutation.
    source.replace(/cl-([A-Za-z0-9_-]+)::([A-Za-z0-9_-]+)::(c-[A-Za-z0-9_-]+)/g, (_, t, r, c) => {
      add("tableIds", t);
      add("rowIds", r);
      add("columnIds", c);
    });
    // Also catch escaped CSS id fragments that contain row/col identity.
    source.replace(/row\?:?([A-Za-z0-9_-]+)\?:?\?:?col\?:?([A-Za-z0-9_-]+)/g, (_, r, c) => {
      add("rowIds", r);
      add("columnIds", c);
    });
    return out;
  }

  function sourceHintsForAnchor(anchor = {}) {
    const target = anchor.targetRow || null;
    const domHint = anchor.domPathHint || firstContentStringFromRow(target, COL.target.domPathHint);
    const parsed = parseDomPathCellHints(domHint || "");
    const rowIds = [anchor.sourceRowId, firstContentStringFromRow(target, COL.target.sourceRowId), ...parsed.rowIds].filter(Boolean);
    const columnIds = [anchor.columnId, firstContentStringFromRow(target, COL.target.columnId), ...parsed.columnIds].filter(Boolean);
    const tableIds = [anchor.sourceTableName, firstContentStringFromRow(target, COL.target.sourceTableName), ...parsed.tableIds].filter(Boolean);
    const viewIds = [anchor.viewId, firstContentStringFromRow(target, COL.target.contextViewUrl), ...parsed.viewIds].filter(Boolean);
    const uniq = arr => Array.from(new Set(arr.map(v => String(v || "").trim()).filter(Boolean)));
    return { rowIds: uniq(rowIds), columnIds: uniq(columnIds), tableIds: uniq(tableIds), viewIds: uniq(viewIds), domHint };
  }

  function firstVisibleElementForSelectors(selectors = []) {
    for (const sel of selectors) {
      try {
        const els = Array.from(document.querySelectorAll(sel));
        for (const el of els) {
          const rect = el.getBoundingClientRect();
          const text = normalizeWhitespace(el.innerText || el.textContent || "");
          if (el && rect.width && rect.height && text) return el;
        }
      } catch {}
    }
    return null;
  }

  function queryCodaCellByHints(hints = {}) {
    const rowIds = hints.rowIds || [];
    const colIds = hints.columnIds || [];
    const tableIds = hints.tableIds || [];
    const selectors = [];
    rowIds.forEach(r => colIds.forEach(c => {
      selectors.push(`[data-reference-type="cell"][data-row-id="${cssEscapeMaybe(r)}"][data-column-id="${cssEscapeMaybe(c)}"]`);
      selectors.push(`[role="gridcell"][data-row-id="${cssEscapeMaybe(r)}"][data-column-id="${cssEscapeMaybe(c)}"]`);
      selectors.push(`[id*="::row:${cssEscapeMaybe(r)}::col:${cssEscapeMaybe(c)}"]`);
      selectors.push(`[data-editable-id*="${cssEscapeMaybe(r)}"][data-editable-id*="${cssEscapeMaybe(c)}"]`);
    }));
    tableIds.forEach(t => rowIds.forEach(r => colIds.forEach(c => {
      selectors.push(`[data-object-id="${cssEscapeMaybe(t)}"][data-row-id="${cssEscapeMaybe(r)}"][data-column-id="${cssEscapeMaybe(c)}"]`);
      selectors.push(`[data-editable-id*="${cssEscapeMaybe(t)}"][data-editable-id*="${cssEscapeMaybe(r)}"][data-editable-id*="${cssEscapeMaybe(c)}"]`);
    })));
    return firstVisibleElementForSelectors(selectors);
  }

  function queryCodaRowsByHints(hints = {}) {
    const rowIds = hints.rowIds || [];
    const tableIds = hints.tableIds || [];
    const selectors = [];
    rowIds.forEach(r => {
      selectors.push(`[data-reference-type="row"][data-row-id="${cssEscapeMaybe(r)}"]`);
      selectors.push(`[role="row"][data-row-id="${cssEscapeMaybe(r)}"]`);
      selectors.push(`[data-row-id="${cssEscapeMaybe(r)}"]`);
    });
    tableIds.forEach(t => rowIds.forEach(r => {
      selectors.push(`[data-object-id="${cssEscapeMaybe(t)}"][data-row-id="${cssEscapeMaybe(r)}"]`);
    }));
    return Array.from(new Set(selectors.flatMap(sel => {
      try { return Array.from(document.querySelectorAll(sel)); } catch { return []; }
    }))).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width && r.height && normalizeWhitespace(el.innerText || el.textContent || "");
    });
  }

  function elementTextCandidates(el) {
    if (!el) return [];
    const values = [
      el.innerText,
      el.textContent,
      el.getAttribute?.("aria-label"),
      el.getAttribute?.("title"),
      el.getAttribute?.("alt"),
      el.getAttribute?.("data-title"),
      el.getAttribute?.("data-value"),
      el.getAttribute?.("href")
    ];
    return Array.from(new Set(values.map(v => normalizeWhitespace(v)).filter(Boolean)));
  }

  function elementLooksLikeAnchorText(el, exact, prefix = "", suffix = "") {
    const target = normalizeWhitespace(exact).toLowerCase();
    if (!target) return false;
    for (const txt of elementTextCandidates(el)) {
      const low = txt.toLowerCase();
      if (low === target || low.includes(target) || target.includes(low)) return true;
    }
    return false;
  }

  function findBestElementForAnchorText(exact, prefix = "", suffix = "", root = document.body) {
    const scope = root || document.body;
    const selectors = [
      "a",
      "[href]",
      "[role='link']",
      "[data-coda-ui-id*='link' i]",
      "[class*='link' i]",
      "[title]",
      "[aria-label]"
    ].join(",");
    const candidates = [];
    try {
      qsa(selectors, scope).forEach(el => {
        if (el.closest("#wgu-coda-comment-sidebar,#wgu-comment-modal-backdrop,#wgu-coda-comment-btn,#wgu-coda-comment-tab,#wgu-coda-cell-selection-overlay,#wgu-coda-cell-selection-toolbar,#wgu-cell-comment-trigger")) return;
        if (isLikelyCodaChromeOrToolbarElement(el)) return;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        if (!elementLooksLikeAnchorText(el, exact, prefix, suffix)) return;
        const txt = elementTextCandidates(el).join(" ");
        candidates.push({ el, score: scoreCandidate(txt, Math.max(0, txt.toLowerCase().indexOf(normalizeWhitespace(exact).toLowerCase())), exact, prefix, suffix) + (el.matches("a,[href],[role='link']") ? 25 : 0) });
      });
    } catch {}
    candidates.sort((a,b) => b.score - a.score);
    return candidates[0]?.el || null;
  }

  function rectsForResolvedAnchor(resolved) {
    if (resolved?.range) {
      const rects = Array.from(resolved.range.getClientRects()).filter(rect => rect && rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight && rect.right >= 0 && rect.left <= window.innerWidth);
      if (rects.length) return rects;
    }
    if (resolved?.element) {
      const r = resolved.element.getBoundingClientRect();
      if (r.width && r.height && r.bottom >= 0 && r.top <= window.innerHeight && r.right >= 0 && r.left <= window.innerWidth) return [r];
    }
    return [];
  }


  function textFromResolved(resolved) {
    if (resolved?.matchedText !== undefined) return normalizeWhitespace(resolved.matchedText);
    try {
      if (resolved?.range) return normalizeWhitespace(resolved.range.toString());
    } catch {}
    if (resolved?.element) return truncate(normalizeWhitespace(resolved.element.innerText || resolved.element.textContent || ""), 1200);
    return "";
  }

  function isLikelySameAnchorText(expected, actual, threshold = 0.72) {
    const a = normalizeWhitespace(expected || "");
    const b = normalizeWhitespace(actual || "");
    if (!a || !b) return false;
    if (a === b) return true;
    const minLen = Math.min(a.length, b.length);
    const maxLen = Math.max(a.length, b.length);
    if (minLen >= 24 && (a.includes(b) || b.includes(a)) && maxLen <= Math.max(2400, minLen * 2.4)) return true;
    const dice = tokenDice(a, b);
    const lengthOk = Math.abs(a.length - b.length) <= Math.max(140, a.length * 0.70);
    return dice >= threshold && lengthOk;
  }

  function currentMatchedTextIfSafe(currentMatched, originalExact) {
    const current = normalizeWhitespace(currentMatched || "");
    const original = normalizeWhitespace(originalExact || "");
    if (!current) return "";
    if (!original || isLikelySameAnchorText(original, current, 0.62)) return current;
    wguPerfInc("staleCurrentMatchSuppressions");
    return "";
  }

  function shouldApplyNativeTextHighlight(resolved, meta = {}) {
    if (!resolved?.range) return false;
    const expected = normalizeWhitespace(meta.storedExact || meta.originalExact || meta.exact || "");
    let actual = normalizeWhitespace(meta.matchedText || "");
    try { actual = normalizeWhitespace(resolved.range.toString() || actual); } catch {}
    if (!expected || !actual) return false;
    if (isLikelySameAnchorText(expected, actual, 0.78)) return true;
    wguPerfInc("nativeHighlightSuppressions");
    return false;
  }

  function makeRangeFromNormalizedOffsets(index, start, end) {
    const startLoc = normalizedOffsetToDom(index.map, start);
    const endLoc = normalizedOffsetToDom(index.map, end);
    if (!startLoc || !endLoc) return null;
    const range = document.createRange();
    try {
      range.setStart(startLoc.node, startLoc.offset);
      range.setEnd(endLoc.node, endLoc.offset);
      return range;
    } catch { return null; }
  }

  function findContextRelocatedRange(exact, prefix = "", suffix = "", root = document.body) {
    const original = normalizeWhitespace(exact);
    const p = normalizeWhitespace(prefix);
    const s = normalizeWhitespace(suffix);
    if (!original || !p || !s) return null;

    const index = buildNormalizedTextIndex(root || document.body);
    const hay = index.text;
    if (!hay) return null;

    const pNeedle = p.slice(Math.max(0, p.length - 120));
    const sNeedle = s.slice(0, 120);
    if (!pNeedle || !sNeedle) return null;

    const maxCapture = Math.min(2200, Math.max(240, original.length * 3));
    const candidates = [];
    let pAt = 0;
    while (true) {
      pAt = hay.indexOf(pNeedle, pAt);
      if (pAt < 0) break;
      const start = pAt + pNeedle.length;
      const sAt = hay.indexOf(sNeedle, start);
      if (sAt >= 0) {
        const len = sAt - start;
        if (len > 0 && len <= maxCapture) {
          const matchedText = normalizeWhitespace(hay.slice(start, sAt));
          if (matchedText && matchedText.length <= maxCapture) {
            const range = makeRangeFromNormalizedOffsets(index, start, sAt);
            if (range) {
              const lengthPenalty = Math.abs(matchedText.length - original.length);
              candidates.push({ range, matchedText, score: 1000 - lengthPenalty });
            }
          }
        }
      }
      pAt += Math.max(1, pNeedle.length);
      if (candidates.length > 20) break;
    }
    candidates.sort((a,b) => b.score - a.score);
    return candidates[0] || null;
  }


  function findRangeNearContextNeedle(primaryNeedle, contextNeedles = [], root = document.body, method = "Context") {
    const needle = normalizeWhitespace(primaryNeedle || "");
    const index = buildNormalizedTextIndex(root || document.body);
    const hay = index.text;
    if (!hay || (!needle && !(contextNeedles || []).some(Boolean))) return null;

    const normalizedContexts = (contextNeedles || [])
      .map(x => normalizeWhitespace(x || ""))
      .filter(x => x.length >= 10)
      .map(x => x.length > 220 ? x.slice(0, 220) : x);

    const candidates = [];
    if (needle && needle.length >= 2) {
      let at = 0;
      while (true) {
        at = hay.indexOf(needle, at);
        if (at < 0) break;
        let score = 80;
        for (const ctx of normalizedContexts) {
          const before = hay.slice(Math.max(0, at - 1000), at);
          const after = hay.slice(at + needle.length, Math.min(hay.length, at + needle.length + 1000));
          if (before.includes(ctx) || after.includes(ctx)) score += 12;
          else score += Math.round(tokenDice(ctx, before + " " + after) * 8);
        }
        candidates.push({ start: at, end: at + needle.length, matchedText: needle, score });
        at += Math.max(1, needle.length);
        if (candidates.length > 25) break;
      }
    }

    // If the exact/current text changed too far, use sentence/block context as a bounded fallback.
    if (!candidates.length && normalizedContexts.length) {
      for (const ctx of normalizedContexts) {
        let at = hay.indexOf(ctx);
        if (at >= 0) {
          const start = Math.max(0, at);
          const end = Math.min(hay.length, at + ctx.length);
          candidates.push({ start, end, matchedText: hay.slice(start, end), score: 62 });
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best) return null;
    const range = makeRangeFromNormalizedOffsets(index, best.start, best.end);
    return range ? { range, matchedText: best.matchedText, score: best.score, method } : null;
  }

  function findRichContextRange(anchor = {}, root = document.body) {
    const exact = currentMatchedTextIfSafe(anchor.currentMatchedText, anchor.exact) || anchor.exact || "";
    const block = anchor.blockExcerpt || "";
    const prev = anchor.previousSentence || "";
    const next = anchor.nextSentence || "";
    const heading = anchor.nearestHeading || "";
    const rare = anchor.rareTokens || "";

    const sentenceResult = findRangeNearContextNeedle(exact, [prev, next, heading], root, "Sentence Context");
    if (sentenceResult?.range && sentenceResult.score >= 68) return sentenceResult;

    const blockResult = findRangeNearContextNeedle(exact, [block, heading], root, "Heading/Block");
    if (blockResult?.range && blockResult.score >= 65) return blockResult;

    if (rare) {
      const tokens = rare.split(/\s*,\s*/).filter(Boolean).slice(0, 10);
      const index = buildNormalizedTextIndex(root || document.body);
      const hay = index.text;
      if (hay && tokens.length) {
        let best = null;
        const windowSize = Math.max(160, Math.min(1200, (exact || block || "").length * 2 || 300));
        const step = Math.max(40, Math.floor(windowSize / 3));
        for (let start = 0; start < hay.length; start += step) {
          const end = Math.min(hay.length, start + windowSize);
          const candidate = hay.slice(start, end);
          const tokenHits = tokens.filter(t => candidate.toLowerCase().includes(t.toLowerCase())).length;
          if (!tokenHits) continue;
          const score = tokenHits * 10 + Math.round(tokenDice(candidate, [exact, block, heading].join(" ")) * 40);
          if (!best || score > best.score) best = { start, end, matchedText: candidate, score };
        }
        if (best && best.score >= 35) {
          const range = makeRangeFromNormalizedOffsets(index, best.start, best.end);
          if (range) return { range, matchedText: normalizeWhitespace(best.matchedText), score: best.score, method: "Token Fallback" };
        }
      }
    }
    return null;
  }

  function tokenSet(text) {
    return new Set(normalizeWhitespace(text).toLowerCase().split(/[^a-z0-9]+/i).filter(t => t.length > 2));
  }

  function tokenDice(a, b) {
    const A = tokenSet(a), B = tokenSet(b);
    if (!A.size || !B.size) return 0;
    let shared = 0;
    for (const t of A) if (B.has(t)) shared++;
    return (2 * shared) / (A.size + B.size);
  }

  function snapToWordBoundary(text, pos, dir) {
    pos = Math.max(0, Math.min(text.length, pos));
    const limit = dir < 0 ? Math.max(0, pos - 20) : Math.min(text.length, pos + 20);
    if (dir < 0) {
      while (pos > limit && /\S/.test(text[pos - 1] || "")) pos--;
    } else {
      while (pos < limit && /\S/.test(text[pos] || "")) pos++;
    }
    return pos;
  }

  function findFuzzyTextRange(exact, root = document.body) {
    const original = normalizeWhitespace(exact);
    if (original.length < 18) return null;
    const index = buildNormalizedTextIndex(root || document.body);
    const hay = index.text;
    if (!hay) return null;

    const maxHay = hay.length > 30000 ? hay.slice(0, 30000) : hay;
    const n = original.length;
    const sizes = Array.from(new Set([
      Math.round(n * 0.70),
      Math.round(n * 0.90),
      n,
      Math.round(n * 1.15),
      Math.round(n * 1.40)
    ].map(x => Math.max(12, Math.min(1600, x)))));
    const step = Math.max(4, Math.round(n / 8));
    let best = null;

    for (const size of sizes) {
      for (let start = 0; start < maxHay.length; start += step) {
        let end = Math.min(maxHay.length, start + size);
        let s0 = snapToWordBoundary(maxHay, start, -1);
        let e0 = snapToWordBoundary(maxHay, end, 1);
        if (e0 <= s0) continue;
        const candidate = normalizeWhitespace(maxHay.slice(s0, e0));
        if (candidate.length < 8 || candidate.length > Math.max(1800, n * 2.2)) continue;
        const score = tokenDice(original, candidate);
        if (!best || score > best.score) best = { start: s0, end: e0, matchedText: candidate, score };
      }
    }

    if (!best || best.score < 0.64) return null;
    const range = makeRangeFromNormalizedOffsets(index, best.start, best.end);
    return range ? { range, matchedText: best.matchedText, score: best.score } : null;
  }

  function resolveAnchorInScope(anchor, root, reasonPrefix) {
    const exact = anchor.exact || "";
    const prefix = anchor.prefix || "";
    const suffix = anchor.suffix || "";

    const exactRange = findBestTextRange(exact, prefix, suffix, root);
    if (exactRange) return { range: exactRange, element: null, matchedText: normalizeWhitespace(exactRange.toString()), status: "Active", confidence: "High", method: "Exact", reason: `${reasonPrefix} exact` };

    const linkish = findBestElementForAnchorText(exact, prefix, suffix, root);
    if (linkish) return { range: null, element: linkish, matchedText: normalizeWhitespace(linkish.innerText || linkish.textContent || exact), status: "Active", confidence: "High", method: "Exact", reason: `${reasonPrefix} link element` };

    const relocated = findContextRelocatedRange(exact, prefix, suffix, root);
    if (relocated?.range) return { range: relocated.range, element: null, matchedText: relocated.matchedText, status: "Rehydrated", confidence: "High", method: "Prefix/Suffix", reason: `${reasonPrefix} prefix/suffix relocated` };

    const rich = findRichContextRange(anchor, root);
    if (rich?.range) return { range: rich.range, element: null, matchedText: rich.matchedText, status: "Rehydrated", confidence: rich.method === "Token Fallback" ? "Low" : "Medium", method: rich.method, reason: `${reasonPrefix} rich context` };

    const fuzzy = findFuzzyTextRange(exact, root);
    if (fuzzy?.range) return { range: fuzzy.range, element: null, matchedText: fuzzy.matchedText, status: "Rehydrated", confidence: "Medium", method: "Fuzzy", reason: `${reasonPrefix} fuzzy` };

    return null;
  }

  function queueAnchorResolutionSync(anchor, resolved) {
    const chat = anchor?.primaryChat;
    const id = rowId(chat);
    if (!chat || !id || isSyntheticRow(chat)) return;

    let matchedText = textFromResolved(resolved);
    const status = resolved?.status || "Orphaned";
    const confidence = resolved?.confidence || "Failed";
    const method = resolved?.method || "Missing";
    const originalExact = anchor?.exact || "";
    if (matchedText && originalExact && !isLikelySameAnchorText(originalExact, matchedText, 0.62) && method !== "Exact" && method !== "Prefix/Suffix") {
      wguPerfInc("staleCurrentMatchSuppressions");
      matchedText = originalExact;
    }
    const score = method === "Exact" ? 100 : method === "Prefix/Suffix" ? 90 : method === "Structural" ? 80 : method === "Heading/Block" ? 72 : method === "Sentence Context" ? 68 : method === "Token Fallback" ? 58 : method === "Fuzzy" ? 55 : method === "Cell Only" || method === "Row Only" ? 45 : 0;
    const signature = `${status}|${confidence}|${method}|${score}|${matchedText}`;
    if (anchorResolutionSyncCache.get(id) === signature) return;

    const currentStatus = valueFirst(chat, COL.chats.extAnchorStatus, COL.chats.targetAnchorStatus);
    const currentConfidence = valueFirst(chat, COL.chats.lastAnchorMatchConfidence);
    const currentMatched = valueFirst(chat, COL.chats.currentMatchedText);
    const currentMethod = valueFirst(chat, COL.chats.anchorMatchStrategy);
    if (currentStatus === status && currentConfidence === confidence && currentMatched === matchedText && currentMethod === method) {
      anchorResolutionSyncCache.set(id, signature);
      return;
    }

    anchorResolutionSyncCache.set(id, signature);
    const cells = {
      [COL.chats.currentMatchedText]: matchedText,
      [COL.chats.extAnchorStatus]: status,
      [COL.chats.lastAnchorMatchConfidence]: confidence,
      [COL.chats.anchorMatchStrategy]: method,
      [COL.chats.anchorMatchScore]: score
    };

    updateChatRow(chat, cells).then(() => {
      if (chat.values) {
        chat.values[COL.chats.currentMatchedText] = matchedText;
        chat.values[COL.chats.extAnchorStatus] = status;
        chat.values[COL.chats.lastAnchorMatchConfidence] = confidence;
        chat.values[COL.chats.anchorMatchStrategy] = method;
        chat.values[COL.chats.anchorMatchScore] = score;
      }
    }).catch(err => {
      anchorResolutionSyncCache.delete(id);
      if (isExtensionContextError(err)) markExtensionContextInvalidated(err);
      else console.debug("[WGU Coda Comments] Anchor resolution sync skipped", err);
    });
  }

  function findAnchorRange(anchor = {}) {
    wguPerfInc("anchorResolveCalls");
    if (!hasActiveThreadWork()) {
      suppressIdleDomWork("findAnchorRange");
      return { range: null, cell: null, element: null, matchedText: "", status: "Idle", confidence: "Skipped", method: "Idle", reason: "idle runtime" };
    }
    if (!anchor?.exact) return { range: null, cell: null, reason: "missing exact", status: "Orphaned", confidence: "Failed", matchedText: "" };

    // v1.11.0: new comments should be able to paint their selected text
    // immediately from the live selection range. This avoids waiting minutes for
    // Coda/API formulas to return the row in a fully rehydrated state. Keep it
    // short-lived and verify the text before trusting it.
    try {
      const optimistic = optimisticAnchorRangeByHash.get(anchor.hash || "") || runtimeStore.liveRangesByHash.get(anchor.hash || "") || (anchor.primaryChat?.__wguLiveRange ? { range: anchor.primaryChat.__wguLiveRange, exact: anchor.exact, createdAt: Date.now() } : null);
      if (optimistic?.range?.cloneRange) {
        const age = Date.now() - Number(optimistic.createdAt || 0);
        const text = normalizeWhitespace(optimistic.range.toString?.() || "");
        const expected = normalizeWhitespace(anchor.exact || optimistic.exact || "");
        const rect = optimistic.range.getBoundingClientRect?.();
        if (age < 10 * 60 * 1000 && text && expected && (text === expected || text.includes(expected) || expected.includes(text)) && rect && (rect.width || rect.height)) {
          return { range: optimistic.range.cloneRange(), cell: nearestCodaCellForRange(optimistic.range), element: elementForRangeStart(optimistic.range), matchedText: text, status: "Active", confidence: "High", method: "Optimistic Live Selection", reason: "new comment live selection range" };
        }
      }
    } catch {}

    const hints = sourceHintsForAnchor(anchor);
    const cellEl = queryCodaCellByHints(hints);

    if (cellEl) {
      const scoped = resolveAnchorInScope(anchor, cellEl, "cell scoped");
      if (scoped) return { ...scoped, cell: cellEl };

      // Durable table identity still succeeded, so degrade to a cell-level marker
      // instead of making the comment disappear just because the phrase moved or changed too far.
      return {
        range: null,
        cell: cellEl,
        element: cellEl,
        matchedText: truncate(normalizeWhitespace(cellEl.innerText || cellEl.textContent || ""), 1200),
        status: "Active",
        confidence: "Low",
        method: "Cell Only",
        reason: "cell found; text not found"
      };
    }

    for (const rowEl of queryCodaRowsByHints(hints)) {
      const scopedRow = resolveAnchorInScope(anchor, rowEl, "row scoped");
      if (scopedRow) return { ...scopedRow, cell: nearestCodaCellForRange(scopedRow.range || { startContainer: scopedRow.element }) || rowEl };

      return {
        range: null,
        cell: rowEl,
        element: rowEl,
        matchedText: truncate(normalizeWhitespace(rowEl.innerText || rowEl.textContent || ""), 1200),
        status: "Active",
        confidence: "Low",
        method: "Row Only",
        reason: "row found; text not found"
      };
    }

    const whole = resolveAnchorInScope(anchor, document.body, "page");
    if (whole) return { ...whole, cell: nearestCodaCellForRange(whole.range || { startContainer: whole.element }) };

    return { range: null, cell: null, element: null, matchedText: "", status: "Orphaned", confidence: "Failed", method: "Missing", reason: "not found" };
  }

  function usableSourceUrlForAnchor(anchor = {}) {
    const target = anchor.targetRow || null;
    const values = [anchor.sourceRowUrl, firstContentStringFromRow(target, COL.target.sourceRowUrl), firstContentStringFromRow(target, COL.target.contextViewUrl), firstContentStringFromRow(target, COL.target.pageUrl)].filter(Boolean);
    for (const v of values) {
      const s = String(v || "").trim();
      // Only full canonical Coda doc URLs are safe. Relative Coda URLs such as
      // /_suDCsmUP can throw the user onto the wrong Coda page and truncate the
      // address bar. Never use those for automatic route assist.
      if (/^https?:\/\/coda\.io\/d\//i.test(s)) return s;
    }
    return "";
  }

  function sameCodaDocUrl(a, b) {
    try {
      const ua = new URL(a, location.href);
      const ub = new URL(b, location.href);
      const da = ua.pathname.match(/_d([^/]+)/i)?.[1] || ua.pathname.match(/\/d\/[^/]+_d([^/]+)/i)?.[1] || "";
      const db = ub.pathname.match(/_d([^/]+)/i)?.[1] || ub.pathname.match(/\/d\/[^/]+_d([^/]+)/i)?.[1] || "";
      return ua.origin === ub.origin && da && db && da === db;
    } catch { return false; }
  }

  function maybeNavigateCodaToAnchorSource(anchor = {}) {
    const url = usableSourceUrlForAnchor(anchor);
    if (!url) return false;
    try {
      const next = new URL(url, location.href);
      const cur = new URL(location.href);
      if (!sameCodaDocUrl(next.href, cur.href)) return false;
      if (!next.hash) return false;
      // Only adjust the hash/fragment inside the current canonical doc. Avoid
      // history.pushState(pathname) entirely; Coda has short internal URLs that
      // can otherwise jump to the wrong page.
      if (next.hash !== cur.hash) {
        try { history.replaceState({}, "", cur.pathname + cur.search + next.hash); }
        catch { location.hash = next.hash; }
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      }
      return true;
    } catch { return false; }
  }

  function temporarilyRevealHighlight(hash, durationMs = 2400) {
    // Native text-color anchors plus margin icons do not wrap Coda text; there is no text wrapper to temporarily remove.
    if (!hash) return;
    qsa(`.wgu-coda-comment-icon[data-wgu-anchor-hash="${CSS.escape(hash)}"]`).forEach(el => {
      el.classList.add("wgu-highlight-revealing");
      safeSetTimeout(() => el.classList.remove("wgu-highlight-revealing"), durationMs);
    });
  }

  function ensureHighlightLayer() {
    let layer = qs("#wgu-coda-highlight-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "wgu-coda-highlight-layer";
      document.body.appendChild(layer);
    }
    return layer;
  }

  function elementForResolvedAnchor(resolved) {
    try {
      if (resolved?.element instanceof HTMLElement) return resolved.element;
      if (resolved?.cell instanceof HTMLElement) return resolved.cell;
      const node = resolved?.range?.startContainer;
      return node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement || null;
    } catch { return null; }
  }

  function closestVisibleCommentTarget(el) {
    if (!el) return null;
    return el.closest?.([
      '[role="row"]',
      '[data-row-id]',
      '[data-reference-type="cell"]',
      '[role="gridcell"]',
      '.kr-cell',
      'p',
      'li',
      '[contenteditable="true"]',
      '[data-coda-ui-id]',
      '[data-testid*="block" i]',
      '[data-testid*="cell" i]'
    ].join(',')) || el;
  }

  function pageContentContainerForRect(rect) {
    const candidates = qsa([
      '[role="main"]',
      'main',
      '#content-container',
      '#document-root-route',
      '[class*="docContent" i]',
      '[class*="DocContent" i]',
      '[class*="canvas" i]',
      '[data-testid*="canvas" i]'
    ].join(','));
    let best = null;
    for (const el of candidates) {
      if (!(el instanceof HTMLElement)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (rect && (rect.top < r.top - 120 || rect.bottom > r.bottom + 120 || rect.left < r.left - 80 || rect.right > r.right + 80)) continue;
      if (!best || r.width < best.rect.width) best = { el, rect: r };
    }
    return best?.el || null;
  }

  function largestVisibleCodaCanvasRect() {
    try {
      const canvases = qsa('[data-coda-ui-id="canvas"]')
        .map(el => {
          const rect = el.getBoundingClientRect();
          return { el, rect, area: Math.max(0, rect.width) * Math.max(0, rect.height) };
        })
        .filter(({ rect }) =>
          rect.width > 400 &&
          rect.height > 200 &&
          rect.top < window.innerHeight &&
          rect.bottom > 0
        )
        .sort((a, b) => b.area - a.area);
      return canvases[0]?.rect || null;
    } catch {
      return null;
    }
  }

  function isRectInTopCodaChromeZone(rect) {
    if (!rect) return false;
    const centerY = rect.top + (rect.height || 0) / 2;
    // Hard viewport guard: Coda's page mode banner, avatar, native comments toggle,
    // and page toolbars live here. A comment anchor may be near the top of a page,
    // but a margin icon in this band is more likely to be Coda chrome than content.
    if (centerY < 96) return true;
    const canvas = largestVisibleCodaCanvasRect();
    if (!canvas) return false;
    return centerY < canvas.top + 48 && rect.height < 80;
  }

  function isRogueTopCommentIcon(icon) {
    if (!icon || !(icon instanceof HTMLElement)) return false;
    try {
      const r = icon.getBoundingClientRect();
      if (!r.width && !r.height) return false;
      return isRectInTopCodaChromeZone(r);
    } catch {
      return false;
    }
  }

  function removeRogueTopCommentIcons() {
    qsa('.wgu-coda-comment-icon').forEach(icon => {
      if (isRogueTopCommentIcon(icon)) {
        try { icon.remove(); } catch {}
      }
    });
  }

  function safeIconCandidatesForRecord(record) {
    const seen = new Set();
    const out = [];
    const add = (el) => {
      if (!(el instanceof HTMLElement) || seen.has(el)) return;
      seen.add(el);
      if (isRogueTopCommentIcon(el)) return;
      out.push(el);
    };
    const ids = Array.isArray(record?.threadIds) ? record.threadIds.filter(Boolean) : [];
    for (const id of ids) {
      qsa(`.wgu-coda-comment-icon[data-wgu-thread-id="${cssEscapeMaybe(id)}"], .wgu-coda-comment-icon[data-wgu-thread-ids*="${cssEscapeMaybe(id)}"], .wgu-coda-comment-icon[data-wgu-chat-row-ids*="${cssEscapeMaybe(id)}"]`).forEach(add);
    }
    if (record?.hash) qsa(`.wgu-coda-comment-icon[data-wgu-anchor-hash="${cssEscapeMaybe(record.hash)}"]`).forEach(add);
    return out;
  }

  function bestSafeIconForRecord(record) {
    const icons = safeIconCandidatesForRecord(record);
    if (!icons.length) return null;
    const expected = record?.anchorRect || rectForAnchorResolution(record || {});
    if (!expected) return icons[0];
    const y = expected.top + (expected.height || 0) / 2;
    icons.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const ay = ar.top + ar.height / 2;
      const by = br.top + br.height / 2;
      return Math.abs(ay - y) - Math.abs(by - y);
    });
    return icons[0] || null;
  }

  function isLikelyCodaChromeOrToolbarElement(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (isExtensionUiElement(el)) return true;
    try {
      if (el.closest('[role="toolbar"], [data-testid*="toolbar" i], [class*="toolbar" i], [aria-label*="toolbar" i], [aria-label*="Page options" i], [aria-label*="Open comments" i], [aria-label*="comments" i]')) return true;
      let cur = el;
      while (cur && cur !== document.body && cur !== document.documentElement) {
        const style = getComputedStyle(cur);
        const r = cur.getBoundingClientRect();
        const hasEditableContent = Boolean(cur.matches?.('[contenteditable="true"],[role="gridcell"],[role="row"],p,li') || cur.querySelector?.('[contenteditable="true"],[role="gridcell"],p,li'));
        if ((style.position === 'fixed' || style.position === 'sticky') && !hasEditableContent && r.height < 140) return true;
        cur = cur.parentElement;
      }
    } catch {}
    return false;
  }

  function largestVisibleCodaCanvasRight() {
    const rect = largestVisibleCodaCanvasRect();
    if (rect?.right) return rect.right;
    const fallback = pageContentContainerForRect(null)?.getBoundingClientRect?.();
    return fallback?.right || null;
  }

  function isReasonableIconTargetRect(targetRect, primaryRect) {
    if (!targetRect || !primaryRect) return false;
    if (targetRect.width <= 0 || targetRect.height <= 0) return false;

    // Avoid anchoring to Coda chrome, entire canvases, giant containers, or
    // floating toolbars. Those usually begin near the top of the page and caused
    // the first card to register against a random blue icon near Coda's own UI.
    const hugeComparedToAnchor = targetRect.height > Math.max(220, primaryRect.height * 12);
    const verticallyDetached = primaryRect.top < targetRect.top - 6 || primaryRect.bottom > targetRect.bottom + 6;
    const farFromAnchorCenter = Math.abs((targetRect.top + targetRect.height / 2) - (primaryRect.top + primaryRect.height / 2)) > Math.max(90, primaryRect.height * 6);
    return !hugeComparedToAnchor && !verticallyDetached && !farFromAnchorCenter;
  }

  function iconAnchorRectForResolved(resolved, rects) {
    const primary = rects?.[0] || rectForAnchorResolution(resolved);
    if (!primary) return null;
    if (isRectInTopCodaChromeZone(primary)) return null;

    const startEl = elementForResolvedAnchor(resolved);
    const targetEl = closestVisibleCommentTarget(resolved?.cell || startEl);
    let targetRect = null;
    try {
      if (targetEl instanceof HTMLElement) {
        const r = targetEl.getBoundingClientRect();
        if (isReasonableIconTargetRect(r, primary)) targetRect = r;
      }
    } catch {}

    // v1.9.56: X belongs on the canvas margin rail, but Y must be tied to the
    // actual matched text/range. A broad parent container may be useful for row
    // height, but it should never drag the icon up to the page toolbar/header.
    const yRect = targetRect || primary;
    const visible = codaContentViewportBounds();
    const canvasRight = largestVisibleCodaCanvasRight();
    let right = canvasRight || primary.right;
    right = Math.max(right, primary.right);
    right = Math.min(right, visible.right - 34);

    return {
      left: right,
      top: yRect.top,
      bottom: yRect.bottom,
      height: Math.max(18, yRect.height || primary.height || 18),
      width: Math.max(1, yRect.width || primary.width || 1)
    };
  }

  function makeAnchorSoftFill(layer, meta, rect) {
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const fill = document.createElement('span');
    fill.className = 'wgu-coda-anchor-soft-fill';
    fill.dataset.wguAnchorHash = meta.hash || '';
    fill.dataset.wguChatRowIds = meta.chatIds || '';
    fill.dataset.wguTargetRowId = meta.targetId || '';
    fill.setAttribute('aria-hidden', 'true');
    // Keep the fill slightly inset vertically so it reads as a background, not a block.
    const top = Math.max(0, rect.top + Math.max(1, Math.min(3, rect.height * 0.12)));
    const height = Math.max(2, rect.height - Math.max(2, Math.min(6, rect.height * 0.24)));
    fill.style.left = `${Math.max(0, rect.left - 1)}px`;
    fill.style.top = `${top}px`;
    fill.style.width = `${Math.min(window.innerWidth, Math.max(2, rect.width + 2))}px`;
    fill.style.height = `${height}px`;
    layer.appendChild(fill);
    return fill;
  }

  function makeBracketMarker(layer, meta, side, rect) {
    const bracket = document.createElement('span');
    bracket.className = `wgu-coda-bracket-anchor wgu-coda-bracket-${side}`;
    bracket.dataset.wguAnchorHash = meta.hash || '';
    bracket.dataset.wguChatRowIds = meta.chatIds || '';
    bracket.dataset.wguTargetRowId = meta.targetId || '';
    bracket.textContent = side === 'start' ? '[' : ']';
    bracket.title = meta.fieldLabel ? `${meta.fieldLabel}: ${truncate(meta.exact, 80)}` : truncate(meta.exact, 90);
    bracket.style.left = `${side === 'start' ? Math.max(0, rect.left - 8) : Math.min(window.innerWidth - 10, rect.right + 1)}px`;
    bracket.style.top = `${Math.max(0, rect.top - 2)}px`;
    layer.appendChild(bracket);
    return bracket;
  }

  function commentIconAssetUrl() {
    try {
      return chrome?.runtime?.getURL ? chrome.runtime.getURL('assets/comment-icon.ico') : '';
    } catch {
      return '';
    }
  }

  function viewportRectFromApproxGeometry(geom) {
    if (!geom || geom.top == null) return null;
    const canvas = largestVisibleCodaCanvasRect();
    if (!canvas) return null;
    let approxTop = Number(geom.top);
    const currentPageHeight = canvas.height || 0;
    if (geom.pageHeight && currentPageHeight && Math.abs(currentPageHeight - geom.pageHeight) > Math.max(800, geom.pageHeight * 0.18)) {
      approxTop = approxTop * (currentPageHeight / geom.pageHeight);
    }
    const top = canvas.top + approxTop;
    const height = Math.max(18, Number(geom.height) || 22);
    const right = Math.min(Math.max(largestVisibleCodaCanvasRight() || canvas.right, canvas.right), codaContentViewportBounds().right - 34);
    const rect = { left: right, right, top, bottom: top + height, width: Math.max(1, Number(geom.width) || 1), height };
    if (isRectInTopCodaChromeZone(rect)) return null;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return null;
    return rect;
  }

  function makeApproxMarginCommentIcon(layer, anchor, meta = {}) {
    const geom = anchor?.approxGeometry || approxGeometryFromChat(anchor?.primaryChat || null);
    const iconRect = viewportRectFromApproxGeometry(geom);
    if (!iconRect) return null;
    const icon = document.createElement('button');
    icon.type = 'button';
    icon.className = 'wgu-coda-comment-icon wgu-coda-comment-icon-approx';
    icon.dataset.wguAnchorHash = meta.hash || anchor?.hash || '';
    icon.dataset.wguChatRowIds = meta.chatIds || (anchor?.chatIds || []).join(',');
    icon.dataset.wguThreadIds = icon.dataset.wguChatRowIds || '';
    icon.dataset.wguThreadId = String(icon.dataset.wguChatRowIds || '').split(',').filter(Boolean)[0] || '';
    icon.dataset.wguTargetRowId = meta.targetId || anchor?.targetId || '';
    icon.dataset.wguFieldLabel = meta.fieldLabel || anchor?.fieldLabel || '';
    icon.setAttribute('aria-label', 'View comment');
    icon.title = 'View comment';
    const asset = commentIconAssetUrl();
    if (asset) icon.style.backgroundImage = `url("${asset}")`;
    const computedLeft = Math.round(iconRect.left + 10);
    const computedTop = Math.round(iconRect.top + (iconRect.height / 2) - 11);
    const bounds = codaContentViewportBounds();
    if (computedTop < bounds.top + 4 || computedTop > bounds.bottom + 80) return null;
    icon.style.left = `${computedLeft}px`;
    icon.style.top = `${computedTop}px`;
    ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "auxclick"].forEach(type => {
      icon.addEventListener(type, routeHighlightPointerEvent, true);
      icon.addEventListener(type, routeHighlightPointerEvent, false);
    });
    layer.appendChild(icon);
    wguPerfInc("approxIconsRendered");
    wguPerfInc("iconsRendered");
    return icon;
  }

  function makeMarginCommentIcon(layer, resolved, meta, rects) {
    const iconRect = iconAnchorRectForResolved(resolved, rects);
    if (!iconRect) return null;
    const icon = document.createElement('button');
    icon.type = 'button';
    icon.className = 'wgu-coda-comment-icon';
    icon.dataset.wguAnchorHash = meta.hash || '';
    icon.dataset.wguChatRowIds = meta.chatIds || '';
    icon.dataset.wguThreadIds = meta.chatIds || '';
    icon.dataset.wguThreadId = String(meta.chatIds || '').split(',').filter(Boolean)[0] || '';
    icon.dataset.wguTargetRowId = meta.targetId || '';
    icon.dataset.wguFieldLabel = meta.fieldLabel || '';
    icon.setAttribute('aria-label', 'View comment');
    icon.title = meta.fieldLabel ? `View comment: ${meta.fieldLabel}` : 'View comment';
    icon.textContent = '';
    try {
      const iconUrl = commentIconAssetUrl();
      if (iconUrl) icon.style.backgroundImage = `url("${iconUrl}")`;
    } catch {}
    const computedLeft = Math.round(iconRect.left + 10);
    const computedTop = Math.round(iconRect.top + (iconRect.height / 2) - 11);
    const bounds = codaContentViewportBounds();
    if (computedTop < bounds.top + 4 || computedTop > bounds.bottom + 80) return null;
    icon.style.left = `${computedLeft}px`;
    icon.style.top = `${computedTop}px`;
    ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "auxclick"].forEach(type => {
      icon.addEventListener(type, routeHighlightPointerEvent, true);
      icon.addEventListener(type, routeHighlightPointerEvent, false);
    });
    layer.appendChild(icon);
    wguPerfInc("iconsRendered");
    return icon;
  }

  function wrapRangeFragments(rangeOrResolved, meta) {
    const layer = ensureHighlightLayer();
    const wrappers = [];
    const resolved = rangeOrResolved?.getClientRects ? { range: rangeOrResolved } : (rangeOrResolved || {});
    const rects = rangeOrResolved?.getClientRects
      ? Array.from(rangeOrResolved.getClientRects()).filter(rect => rect && rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight && rect.right >= 0 && rect.left <= window.innerWidth)
      : rectsForResolvedAnchor(resolved);

    // v1.9.50: use Chrome's native CSS Custom Highlight API to color the actual
    // resolved text range without inserting spans or overlay fill/brackets. This is
    // far more stable while scrolling/editing than rectangle overlays.
    if (resolved?.range) {
      if (shouldApplyNativeTextHighlight(resolved, meta)) addNativeTextHighlight(resolved.range, meta);
      else wguPerfInc("nativeHighlightSuppressions");
    }

    const icon = makeMarginCommentIcon(layer, resolved, meta, rects);
    if (icon) wrappers.push(icon);
    return wrappers.filter(Boolean);
  }

  function makeCellBlockAnchorVisual(layer, anchor, resolved) {
    const el = resolved?.cell instanceof HTMLElement ? resolved.cell : (resolved?.element instanceof HTMLElement ? resolved.element : null);
    if (!el) return [];
    let rect = null;
    try { rect = el.getBoundingClientRect(); } catch {}
    if (!rect || !rect.width || !rect.height || rect.bottom < 0 || rect.top > window.innerHeight) return [];
    const wrappers = [];
    const fill = makeAnchorSoftFill(layer, anchor, rect);
    if (fill) wrappers.push(fill);
    const icon = makeMarginCommentIcon(layer, { ...resolved, cell: el, element: el, anchorRect: rect }, anchor, [rect]);
    if (icon) wrappers.push(icon);
    return wrappers;
  }

  function highlightAnchor(anchor) {
    const resolved = findAnchorRange(anchor);
    queueAnchorResolutionSync(anchor, resolved);
    if (!isUsableLiveAnchorResolution(resolved)) {
      // v1.11.0: for cell/block comments, a durable cell-level overlay is lighter
      // and more reliable than trying to re-find exact text inside Coda's virtualized
      // grid. Use it before falling back to an approximate margin-only icon.
      const layer = ensureHighlightLayer();
      const cellVisuals = makeCellBlockAnchorVisual(layer, anchor, resolved);
      if (cellVisuals.length) {
        const icon = cellVisuals.find(el => el?.classList?.contains("wgu-coda-comment-icon")) || null;
        registerResolvedAnchor(anchor, { ...(resolved || {}), status: "cell-block", anchorRect: rectForAnchorResolution(resolved), failureReason: resolved?.failureReason || "cell/block-level anchor" }, icon);
        return cellVisuals;
      }
      // v1.10.1: if Coda has not mounted the actual range yet, render only a
      // safe approximate margin icon from stored geometry. Do not color text and
      // do not invent a top-page fallback.
      const approxIcon = makeApproxMarginCommentIcon(layer, anchor, { ...anchor, exact: anchor.exact });
      registerResolvedAnchor(anchor, { ...(resolved || {}), status: approxIcon ? "approx" : (resolved?.status || "not-mounted"), anchorRect: approxIcon ? approxIcon.getBoundingClientRect() : null, failureReason: resolved?.failureReason || "No valid live DOM anchor" }, approxIcon);
      return approxIcon ? [approxIcon] : [];
    }
    const wrappers = wrapRangeFragments(resolved.range || resolved, { ...anchor, exact: anchor.exact, storedExact: anchor.exact, matchedText: textFromResolved(resolved), matchMethod: resolved.method, anchorStatus: resolved.status });
    const icon = wrappers.find(el => el?.classList?.contains("wgu-coda-comment-icon")) || null;
    registerResolvedAnchor(anchor, resolved, icon);
    return wrappers;
  }

  function applyHighlights(chats) {
    wguPerfInc("highlightApplyCalls");
    if (!hasActiveThreadWork() || !(chats || []).length) {
      if (!hasActiveThreadWork()) suppressIdleDomWork("applyHighlights");
      clearHighlights();
      anchorCacheByHash.clear();
      clearAnchorRegistry();
      commitNativeTextHighlights();
      return;
    }
    clearHighlights();
    anchorCacheByHash.clear();
    const anchors = new Map();
    for (const chat of chats || []) {
      const hash = valueFirst(chat, COL.chats.extAnchorTextHash, COL.chats.targetAnchorTextHash);
      const exact = valueFirst(chat, COL.chats.extAnchorExactText, COL.chats.targetAnchorExactText, COL.chats.textAnchor);
      if (!hash || !exact) continue;
      const targetRow = targetRowForChat(chat);
      if (!anchors.has(hash)) {
        anchors.set(hash, {
          hash,
          exact,
          primaryChat: chat,
          currentMatchedText: currentMatchedTextIfSafe(valueFirst(chat, COL.chats.currentMatchedText), exact),
          prefix: valueFirst(chat, COL.chats.extAnchorPrefix, COL.chats.targetAnchorPrefix),
          suffix: valueFirst(chat, COL.chats.extAnchorSuffix, COL.chats.targetAnchorSuffix),
          chatIds: [],
          targetId: chatTargetRowId(chat),
          targetRow,
          sourceRowId: firstContentStringFromRow(targetRow, COL.target.sourceRowId),
          sourceTableName: firstContentStringFromRow(targetRow, COL.target.sourceTableName),
          sourceRowUrl: firstContentStringFromRow(targetRow, COL.target.sourceRowUrl),
          columnId: firstContentStringFromRow(targetRow, COL.target.columnId),
          viewId: firstContentStringFromRow(targetRow, COL.target.contextViewUrl),
          domPathHint: firstContentStringFromRow(targetRow, COL.target.domPathHint),
          nearestHeading: valueFirst(chat, COL.chats.anchorNearestHeading),
          blockExcerpt: valueFirst(chat, COL.chats.anchorBlockExcerpt),
          previousSentence: valueFirst(chat, COL.chats.anchorPreviousSentence),
          nextSentence: valueFirst(chat, COL.chats.anchorNextSentence),
          normalizedSignature: valueFirst(chat, COL.chats.anchorNormalizedSignature),
          rareTokens: valueFirst(chat, COL.chats.anchorRareTokens),
          sourceColumnName: valueFirst(chat, COL.chats.anchorSourceColumnName),
          sourceRowDisplay: valueFirst(chat, COL.chats.anchorSourceRowDisplay),
          domFingerprint: valueFirst(chat, COL.chats.anchorDomFingerprint),
          blockIndex: valueFirst(chat, COL.chats.anchorBlockIndex),
          approxGeometry: approxGeometryFromChat(chat),
          fieldLabel: valueFirst(chat, COL.chats.extFieldLabel, COL.chats.anchorSourceColumnName) || fieldFromTitle(simpleText(cell(chat, COL.chats.chatLabel))) || ""
        });
      }
      for (const id of threadKeyCandidatesForChat(chat)) {
        if (id && !anchors.get(hash).chatIds.includes(id)) anchors.get(hash).chatIds.push(id);
      }
    }

    const shouldShowFocusOnly = !highlightsVisible && Boolean(focusOnlyAnchorHash);
    for (const anchor of anchors.values()) {
      anchorCacheByHash.set(anchor.hash, anchor);
      if (highlightsVisible || (shouldShowFocusOnly && anchor.hash === focusOnlyAnchorHash)) {
        highlightAnchor(anchor);
      }
    }

    const activeHash = activeAnchorHash || focusOnlyAnchorHash || "";
    if (activeHash) {
      qsa(`.wgu-coda-comment-icon[data-wgu-anchor-hash="${CSS.escape(activeHash)}"]`).forEach(h => h.classList.add("wgu-active-highlight"));
    }
    commitNativeTextHighlights();
  }

  function pulse(el, cls) {
    // v1.9.11: anchors should stay visually calm — no pulse/animation when navigating.
    if (!el || !cls) return;
    el.classList.remove(cls);
  }

  function isScrollableElement(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    try {
      const s = getComputedStyle(el);
      const overflow = `${s.overflow} ${s.overflowX} ${s.overflowY}`;
      const canScroll = el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
      return canScroll && /(auto|scroll|overlay)/i.test(overflow);
    } catch {
      return false;
    }
  }

  function isExtensionUiElement(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    return Boolean(el.closest?.(
      '#wgu-coda-comment-sidebar, #wgu-coda-comment-tab, #wgu-coda-comment-btn, #wgu-comment-modal, #wgu-coda-highlight-layer, #wgu-coda-cell-selection-overlay, .wgu-cell-selection-toolbar, #wgu-cell-comment-trigger'
    ));
  }

  function snapshotPageScroll(options = {}) {
    const seen = new Set();
    const items = [];
    const excludeExtensionUi = options.excludeExtensionUi !== false;
    const add = el => {
      if (!el || seen.has(el)) return;
      if (excludeExtensionUi && el !== window && isExtensionUiElement(el)) return;
      seen.add(el);
      try {
        if (el === window) items.push({ el, x: window.scrollX || 0, y: window.scrollY || 0 });
        else items.push({ el, x: el.scrollLeft || 0, y: el.scrollTop || 0 });
      } catch {}
    };

    add(window);
    add(document.scrollingElement || document.documentElement);
    add(document.documentElement);
    add(document.body);

    try {
      // Coda uses nested scroll containers, including horizontal table scrollers
      // and app-level panes. Snapshot every scrollable container, not just the
      // ones currently non-zero, so a focus/click-induced scroll can be rolled
      // back deterministically.
      qsa('body *').forEach(el => {
        if (!(el instanceof HTMLElement)) return;
        if (
          el.id?.startsWith('scroll-container-') ||
          el.dataset?.scroll != null ||
          el.dataset?.krGridValues != null ||
          el.dataset?.referenceType === 'cell' ||
          el.dataset?.referenceType === 'row' ||
          el.classList?.contains('EmutnaVK') ||
          isScrollableElement(el)
        ) add(el);
      });
    } catch {}
    return items;
  }

  function restorePageScroll(snapshot) {
    if (!snapshot) return;
    for (const item of snapshot) {
      try {
        if (item.el === window) window.scrollTo(item.x, item.y);
        else if (item.el && !isExtensionUiElement(item.el) && (item.el === document.body || item.el === document.documentElement || document.contains(item.el))) {
          item.el.scrollLeft = item.x;
          item.el.scrollTop = item.y;
        }
      } catch {}
    }
  }

  function restorePageScrollAggressively(snapshot, durationMs = 700) {
    if (!snapshot) return;
    restorePageScroll(snapshot);
    let start = 0;
    const tick = ts => {
      if (!start) start = ts || performance.now();
      restorePageScroll(snapshot);
      if ((ts || performance.now()) - start < durationMs) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    [0, 50, 120, 250, 500, durationMs].forEach(ms => safeSetTimeout(() => restorePageScroll(snapshot), ms));
  }


  function highlightFromPoint(x, y) {
    if (!hasActiveThreadWork()) return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const direct = document.elementFromPoint(x, y)?.closest?.(".wgu-coda-comment-icon[data-wgu-anchor-hash],.wgu-coda-highlight[data-wgu-anchor-hash]");
    if (direct) return direct;

    // Layering/mix-blend/fixed overlay oddities can let the underlying Coda cell
    // become the event target. Treat the highlight rectangles themselves as the
    // hit-test source of truth so Coda never receives clicks meant for comments.
    const hits = [];
    qsa(".wgu-coda-comment-icon[data-wgu-anchor-hash],.wgu-coda-highlight[data-wgu-anchor-hash]").forEach(el => {
      wguPerfInc("layoutReads");
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        hits.push({ el, area: Math.max(1, r.width * r.height) });
      }
    });
    hits.sort((a, b) => a.area - b.area);
    return hits[0]?.el || null;
  }

  let pendingHighlightPointerHash = "";
  let pendingHighlightPointerUntil = 0;

  function consumeHighlightNavigationEvent(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
  }

  function routeHighlightPointerEvent(ev) {
    if (!ev || ev.defaultPrevented) return false;
    if (!hasActiveThreadWork()) return false;
    if (isExtensionUiTarget(ev.target) && !ev.target?.closest?.(".wgu-coda-highlight,.wgu-coda-comment-icon")) return false;

    const hit = highlightFromPoint(ev.clientX, ev.clientY);
    const hash = hit?.dataset?.wguAnchorHash || pendingHighlightPointerHash || "";
    const hitThreadId = hit?.dataset?.wguThreadId || String(hit?.dataset?.wguThreadIds || hit?.dataset?.wguChatRowIds || "").split(",").filter(Boolean)[0] || "";
    if (!hash) return false;

    consumeHighlightNavigationEvent(ev);

    if (ev.type === "pointerdown" || ev.type === "mousedown" || ev.type === "touchstart") {
      pendingHighlightPointerHash = hash;
      pendingHighlightPointerUntil = Date.now() + 1000;
      // Activate on down, before Coda can focus/scroll the underlying gridcell.
      activateByHash(hash, {
        scrollCard: true,
        scrollHighlight: false,
        forcePulse: false,
        preservePageScroll: true,
        behavior: "auto",
        restoreDurationMs: 0
      }).then(() => {
        if (hitThreadId) {
          const exactCard = cardRegistryByThreadId.get(hitThreadId) || document.querySelector(`.wgu-comment-card[data-wgu-thread-id="${CSS.escape(hitThreadId)}"], .wgu-comment-card[data-wgu-chat-row-id="${CSS.escape(hitThreadId)}"]`);
          if (exactCard) {
            qsa(".wgu-active-card").forEach(c => c.classList.remove("wgu-active-card"));
            exactCard.classList.add("wgu-active-card");
            scrollCardIntoSidebar(exactCard, "auto");
          }
        }
      }).catch(err => console.error(err));
      return true;
    }

    if (pendingHighlightPointerHash && Date.now() > pendingHighlightPointerUntil) {
      pendingHighlightPointerHash = "";
    }

    if (ev.type === "click" || ev.type === "pointerup" || ev.type === "mouseup" || ev.type === "dblclick" || ev.type === "auxclick") {
      if (ev.type === "click" || ev.type === "pointerup" || ev.type === "mouseup") {
        // A second activation is cheap and repairs cases where the sidebar was
        // rerendered between pointerdown and click.
        activateByHash(hash, {
          scrollCard: true,
          scrollHighlight: false,
          forcePulse: false,
          preservePageScroll: true,
          behavior: "auto",
          restoreDurationMs: 0
        }).catch(err => console.error(err));
      }
      pendingHighlightPointerHash = "";
      pendingHighlightPointerUntil = 0;
      return true;
    }

    return true;
  }

  function scrollCardIntoSidebar(card, behavior = "smooth") {
    const list = qs("#wgu-comments-list", sidebar || document);
    if (!card || !list) return false;

    const listRect = list.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const targetTop = list.scrollTop + (cardRect.top - listRect.top) - Math.max(12, (list.clientHeight - card.offsetHeight) / 2);

    try {
      list.scrollTo({ top: Math.max(0, targetTop), behavior });
    } catch {
      list.scrollTop = Math.max(0, targetTop);
    }
    return true;
  }

  let readableViewportCache = null;
  let readableViewportCacheReason = "never";
  let readableViewportCapturedAt = 0;
  let readableViewportRefreshTimer = null;

  function plainRect(rect) {
    if (!rect) return null;
    return {
      top: Math.round(Number(rect.top) || 0),
      left: Math.round(Number(rect.left) || 0),
      right: Math.round(Number(rect.right) || 0),
      bottom: Math.round(Number(rect.bottom) || 0),
      width: Math.round(Number(rect.width) || Math.max(0, (Number(rect.right) || 0) - (Number(rect.left) || 0))),
      height: Math.round(Number(rect.height) || Math.max(0, (Number(rect.bottom) || 0) - (Number(rect.top) || 0)))
    };
  }

  function intersectRects(a, b) {
    if (!a || !b) return null;
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    if (right <= left || bottom <= top) return null;
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function rectIntersectsViewport(rect, viewport, pad = 0) {
    if (!rect || !viewport) return false;
    return rect.bottom > viewport.top + pad &&
      rect.top < viewport.bottom - pad &&
      rect.right > viewport.left + pad &&
      rect.left < viewport.right - pad;
  }

  function browserViewportRect() {
    const vv = window.visualViewport;
    if (vv && Number.isFinite(vv.width) && Number.isFinite(vv.height)) {
      const left = Number(vv.offsetLeft) || 0;
      const top = Number(vv.offsetTop) || 0;
      return plainRect({ left, top, right: left + vv.width, bottom: top + vv.height, width: vv.width, height: vv.height });
    }
    return plainRect({ top: 0, left: 0, right: window.innerWidth || 0, bottom: window.innerHeight || 0, width: window.innerWidth || 0, height: window.innerHeight || 0 });
  }

  function detectedCodaViewportBaseRect() {
    const browser = browserViewportRect();
    let base = null;
    const canvas = largestVisibleCodaCanvasRect();
    if (canvas) base = plainRect(canvas);
    if (!base) {
      const container = pageContentContainerForRect(null);
      if (container) base = plainRect(container.getBoundingClientRect());
    }
    if (!base) {
      base = { ...browser, top: Math.max(72, browser.top), left: Math.max(12, browser.left + 12), right: Math.max(160, browser.right - 12), bottom: Math.max(140, browser.bottom - 12) };
      base.width = Math.max(0, base.right - base.left);
      base.height = Math.max(0, base.bottom - base.top);
    }
    return intersectRects(base, browser) || browser;
  }

  function computeReadableViewport(reason = "compute") {
    const browser = browserViewportRect();
    let readable = detectedCodaViewportBaseRect();
    // Keep a small gutter so icons do not sit on top of Coda/extension chrome.
    readable = {
      top: Math.max(browser.top + 76, readable.top + 4),
      left: Math.max(browser.left + 8, readable.left + 8),
      right: Math.min(browser.right - 8, readable.right - 8),
      bottom: Math.min(browser.bottom - 8, readable.bottom - 8)
    };

    const sidebarEl = qs("#wgu-coda-comment-sidebar");
    const sidebarOpen = document.documentElement.classList.contains("wgu-comments-panel-open");
    if (sidebarOpen && sidebarEl instanceof HTMLElement) {
      const sr = sidebarEl.getBoundingClientRect();
      if (sr.width > 30 && sr.left > browser.left && sr.left < browser.right) {
        readable.right = Math.min(readable.right, Math.max(readable.left + 120, sr.left - 10));
      } else {
        readable.right = Math.min(readable.right, Math.max(readable.left + 120, browser.right - getPanelWidthPx() - 18));
      }
    }

    if (readable.right <= readable.left + 80) readable.right = Math.min(browser.right - 8, readable.left + 160);
    if (readable.bottom <= readable.top + 80) readable.bottom = Math.min(browser.bottom - 8, readable.top + 140);
    readable.width = Math.max(0, readable.right - readable.left);
    readable.height = Math.max(0, readable.bottom - readable.top);

    readableViewportCache = {
      reason,
      capturedAt: new Date().toISOString(),
      capturedAtMs: performance.now(),
      browserViewport: browser,
      visualViewport: window.visualViewport ? {
        top: Math.round(window.visualViewport.offsetTop || 0),
        left: Math.round(window.visualViewport.offsetLeft || 0),
        width: Math.round(window.visualViewport.width || 0),
        height: Math.round(window.visualViewport.height || 0),
        scale: window.visualViewport.scale || 1
      } : null,
      readableViewport: plainRect(readable),
      sidebar: sidebarOpen && sidebarEl instanceof HTMLElement ? { open: true, rect: plainRect(sidebarEl.getBoundingClientRect()) } : { open: false, rect: null },
      scrollContainer: describeActiveScrollContainer()
    };
    readableViewportCapturedAt = performance.now();
    readableViewportCacheReason = reason;
    wguPerfInc("readableViewportRefreshes");
    return readableViewportCache;
  }

  function getReadableViewport(opts = {}) {
    const force = !!opts.force;
    const maxAgeMs = Number(opts.maxAgeMs) || 500;
    const now = performance.now();
    if (!force && readableViewportCache && now - readableViewportCapturedAt <= maxAgeMs) {
      wguPerfInc("readableViewportCacheHits");
      return readableViewportCache;
    }
    wguPerfInc("readableViewportCacheMisses");
    return computeReadableViewport(opts.reason || (force ? "force" : "stale"));
  }

  function invalidateReadableViewport(reason = "layout change") {
    readableViewportCache = null;
    readableViewportCapturedAt = 0;
    readableViewportCacheReason = reason;
    wguPerfInc("readableViewportInvalidations");
  }

  function scheduleReadableViewportRefresh(reason = "scheduled") {
    invalidateReadableViewport(reason);
    if (readableViewportRefreshTimer) clearTimeout(readableViewportRefreshTimer);
    readableViewportRefreshTimer = safeSetTimeout(() => {
      readableViewportRefreshTimer = null;
      getReadableViewport({ force: true, reason });
      if (hasActiveThreadWork()) scheduleIconPositionReflow();
    }, 80);
  }

  function codaContentViewportBounds() {
    return getReadableViewport({ reason: "bounds" }).readableViewport;
  }

  function rectIsInsideContentViewport(rect, pad = 0) {
    if (!rect) return false;
    const v = codaContentViewportBounds();
    return rect.top >= v.top + pad &&
      rect.bottom <= v.bottom - pad &&
      rect.left >= v.left + pad &&
      rect.right <= v.right - pad;
  }

  function rectTouchesContentViewport(rect, pad = -2) {
    return rectIntersectsViewport(rect, codaContentViewportBounds(), pad);
  }


  function describeActiveScrollContainer() {
    wguPerfInc("scrollContainerDetections");
    try {
      const candidates = [
        document.scrollingElement,
        document.documentElement,
        document.body,
        pageContentContainerForRect(null),
        qs('[data-coda-ui-id="canvas"]')?.parentElement
      ].filter(Boolean);
      for (const el of candidates) {
        if (!(el instanceof Element)) continue;
        const maxScroll = Math.max(0, (el.scrollHeight || 0) - (el.clientHeight || 0));
        if (maxScroll > 20) {
          return {
            tag: el.tagName || '',
            id: el.id || '',
            className: String(el.className || '').slice(0, 140),
            scrollTop: Math.round(el.scrollTop || 0),
            clientHeight: Math.round(el.clientHeight || 0),
            scrollHeight: Math.round(el.scrollHeight || 0)
          };
        }
      }
      return { tag: 'window', scrollTop: Math.round(window.scrollY || 0), clientHeight: Math.round(window.innerHeight || 0), scrollHeight: Math.round(document.documentElement?.scrollHeight || 0) };
    } catch {
      return null;
    }
  }

  function nearestCodaCellForRange(range) {
    try {
      const node = range?.startContainer;
      const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
      return el?.closest?.('[data-reference-type="cell"],[role="gridcell"],.kr-cell') || null;
    } catch { return null; }
  }

  function sourceCellRectForRange(range) {
    const cell = nearestCodaCellForRange(range);
    return cell ? cell.getBoundingClientRect() : null;
  }


  function scrollElementToRevealRange(scroller, rangeRect, behavior = "smooth") {
    if (!scroller || !rangeRect) return false;
    try {
      const visible = codaContentViewportBounds();
      if (scroller === window || scroller === document || scroller === document.documentElement || scroller === document.body || scroller === document.scrollingElement) {
        let y = window.scrollY || document.documentElement.scrollTop || 0;
        let x = window.scrollX || document.documentElement.scrollLeft || 0;
        let changed = false;
        if (rangeRect.top < visible.top || rangeRect.bottom > visible.bottom) {
          y += rangeRect.top - Math.max(visible.top, window.innerHeight * 0.35);
          changed = true;
        }
        if (rangeRect.left < visible.left || rangeRect.right > visible.right) {
          x += rangeRect.left - Math.max(visible.left, visible.right * 0.35);
          changed = true;
        }
        if (!changed) return false;
        try { window.scrollTo({ left: Math.max(0, x), top: Math.max(0, y), behavior }); }
        catch { window.scrollTo(Math.max(0, x), Math.max(0, y)); }
        return true;
      }

      if (!(scroller instanceof HTMLElement)) return false;
      const sr = scroller.getBoundingClientRect();
      const targetBox = {
        top: Math.max(sr.top + 24, visible.top),
        bottom: Math.min(sr.bottom - 24, visible.bottom),
        left: Math.max(sr.left + 12, visible.left),
        right: Math.min(sr.right - 12, visible.right)
      };
      let top = scroller.scrollTop || 0;
      let left = scroller.scrollLeft || 0;
      let changed = false;

      if (rangeRect.top < targetBox.top || rangeRect.bottom > targetBox.bottom) {
        top += rangeRect.top - targetBox.top - Math.max(0, (targetBox.bottom - targetBox.top) * 0.25);
        changed = true;
      }
      if (rangeRect.left < targetBox.left || rangeRect.right > targetBox.right) {
        left += rangeRect.left - targetBox.left - Math.max(0, (targetBox.right - targetBox.left) * 0.25);
        changed = true;
      }
      if (!changed) return false;
      try { scroller.scrollTo({ top: Math.max(0, top), left: Math.max(0, left), behavior }); }
      catch { scroller.scrollTop = Math.max(0, top); scroller.scrollLeft = Math.max(0, left); }
      return true;
    } catch {
      return false;
    }
  }

  function nativeScrollRangeIntoView(range, behavior = "smooth") {
    try {
      const el = nearestCodaCellForRange(range) ||
        (range.startContainer?.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer?.parentElement);
      if (!el?.scrollIntoView) return false;
      el.scrollIntoView({ block: "center", inline: "center", behavior });
      return true;
    } catch { return false; }
  }

  function elementForRangeStart(range) {
    try {
      return range?.startContainer?.nodeType === Node.ELEMENT_NODE
        ? range.startContainer
        : range?.startContainer?.parentElement || null;
    } catch { return null; }
  }

  function rectForAnchorResolution(resolved) {
    try {
      if (resolved?.element) {
        const er = resolved.element.getBoundingClientRect();
        if (er.width || er.height) return er;
      }
      if (resolved?.cell) {
        const cr = resolved.cell.getBoundingClientRect();
        if (cr.width || cr.height) return cr;
      }
      if (resolved?.range) {
        const rr = resolved.range.getBoundingClientRect();
        if (rr.width || rr.height) return rr;
      }
    } catch {}
    return null;
  }

  function scrollResolvedAnchorOnce(resolved, behavior = "smooth") {
    const rect = rectForAnchorResolution(resolved);
    if (!rect) return false;
    if (rectIsInsideContentViewport(rect, -2)) return true;

    const startEl = resolved?.element || resolved?.cell || elementForRangeStart(resolved?.range);
    const ancestors = [];
    let cur = startEl;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (isScrollableElement(cur) || cur.id?.startsWith?.('scroll-container-') || cur.dataset?.scroll != null) ancestors.push(cur);
      cur = cur.parentElement;
    }

    let moved = false;
    let currentRect = rect;
    // Scroll inner Coda containers first. Do not also call native scrollIntoView;
    // competing scroll systems caused the visible up/down shake.
    for (const scroller of ancestors) {
      moved = scrollElementToRevealRange(scroller, currentRect, behavior) || moved;
      currentRect = rectForAnchorResolution(resolved) || currentRect;
    }
    moved = scrollElementToRevealRange(window, currentRect, behavior) || moved;
    return moved || true;
  }

  async function focusAnchorIntoView(hash, behavior = "smooth") {
    const txn = ++currentAnchorFocusTxn;
    const anchor = hash ? anchorCacheByHash.get(hash) : null;
    if (!anchor?.exact) return false;

    const resolve = () => findAnchorRange(anchor);
    let resolved = resolve();
    if (!resolved.range && !resolved.cell) return false;

    scrollResolvedAnchorOnce(resolved, behavior);
    const waitMs = behavior === "smooth" ? 220 : 40;
    await new Promise(r => safeSetTimeout(r, waitMs));
    if (txn !== currentAnchorFocusTxn) return false;

    resolved = resolve();
    if (resolved.range || resolved.cell) {
      const rect = rectForAnchorResolution(resolved);
      if (rect && !rectIsInsideContentViewport(rect, -2)) {
        // One final correction only. No retry storms, no visible shake.
        scrollResolvedAnchorOnce(resolved, "auto");
        await new Promise(r => safeSetTimeout(r, 60));
        if (txn !== currentAnchorFocusTxn) return false;
      }
    }

    scheduleHighlightReflow(0);
    scheduleIconPositionReflow();
    return true;
  }

  function scrollAnchorHashIntoViewportAggressively(hash, behavior = "smooth") {
    // Legacy synchronous wrapper retained for callers. The actual movement is
    // coordinated asynchronously so old retries cannot fight new card clicks.
    focusAnchorIntoView(hash, behavior).catch(err => console.error(err));
    return true;
  }

  function scrollRangeIntoViewport(range, behavior = "smooth") {
    if (!range) return false;
    let rect = sourceCellRectForRange(range) || range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return false;
    if (rectIsInsideContentViewport(rect)) return true;

    const startEl = range.startContainer?.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer?.parentElement;
    const ancestors = [];
    let cur = startEl;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (isScrollableElement(cur) || cur.id?.startsWith?.('scroll-container-') || cur.dataset?.scroll != null) ancestors.push(cur);
      cur = cur.parentElement;
    }

    // Inner scroll containers first, then page/window fallback. This matters in
    // Coda because tables often live inside independent horizontal/vertical panes.
    let moved = false;
    for (const scroller of ancestors) {
      moved = scrollElementToRevealRange(scroller, rect, behavior) || moved;
      rect = sourceCellRectForRange(range) || range.getBoundingClientRect();
    }
    moved = scrollElementToRevealRange(window, rect, behavior) || moved;
    scheduleHighlightReflow(0);
    return moved || true;
  }

  function scrollAnchorHashIntoViewport(hash, behavior = "smooth") {
    return scrollAnchorHashIntoViewportAggressively(hash, behavior);
  }

  function scrollHighlightIntoViewport(highlight, behavior = "smooth") {
    // Highlight overlays are fixed-position viewport rectangles. If the overlay
    // exists, use its hash to resolve the real source text range and scroll that
    // text, not the overlay rectangle. If the overlay does not exist because the
    // anchor is offscreen, activateByHash falls back to scrollAnchorHashIntoViewport().
    if (!highlight) return false;
    const hash = highlight.dataset.wguAnchorHash || "";
    return scrollAnchorHashIntoViewport(hash, behavior);
  }

  async function activateByHash(hash, opts = {}) {
    if (!hash) return false;
    setWguRuntimeMode(WGU_RUNTIME_MODE.NAVIGATING, "activateByHash");
    if (currentSidebarTab !== "comments") {
      currentSidebarTab = "comments";
      updateSidebarChips();
      renderSidebar(visibleActiveChats(mergeOptimisticChats(lastFetchedPageChats)));
    }
    const wasActive = activeAnchorHash === hash;
    const preserveScroll = opts.preservePageScroll !== false && !opts.scrollHighlight;
    const pageScrollSnapshot = preserveScroll ? snapshotPageScroll({ excludeExtensionUi: true }) : null;
    activeAnchorHash = hash;
    await setPanelOpen(true);

    qsa(".wgu-active-highlight").forEach(el => el.classList.remove("wgu-active-highlight"));
    qsa(".wgu-active-card").forEach(el => el.classList.remove("wgu-active-card"));

    // Ensure the anchor cache exists even when Highlights are off or no fixed
    // overlay rectangles are currently visible. Sidebar-card navigation should
    // resolve from stored anchor metadata, not only from rendered highlight DOM.
    if (!anchorCacheByHash.has(hash)) {
      applyHighlights(visibleActiveChats(mergeOptimisticChats(lastFetchedPageChats)));
    }

    const highlights = qsa(`.wgu-coda-comment-icon[data-wgu-anchor-hash="${CSS.escape(hash)}"]`);
    const cards = qsa(`.wgu-comment-card[data-wgu-anchor-hash="${CSS.escape(hash)}"]`);
    highlights.forEach(h => h.classList.add("wgu-active-highlight"));
    cards.forEach(c => c.classList.add("wgu-active-card"));

    const primaryHighlight = highlights[0], primaryCard = cards[0];
    if (opts.scrollHighlight) {
      const registered = getResolvedAnchorByHash(hash);
      if (registered?.iconElement) {
        scrollIconIntoView(registered.iconElement, opts.behavior || "smooth");
      } else {
        await focusAnchorIntoView(hash, opts.behavior || "smooth");
        applyHighlights(visibleActiveChats(mergeOptimisticChats(lastFetchedPageChats)));
      }
      qsa(`.wgu-coda-comment-icon[data-wgu-anchor-hash="${CSS.escape(hash)}"]`).forEach(h => h.classList.add("wgu-active-highlight"));
    }
    if (opts.scrollCard && primaryCard) scrollCardIntoSidebar(primaryCard, opts.behavior || "smooth");

    // Keep highlight clicks from nudging the Coda canvas/table scroll position.
    // Sidebar scrolling is handled explicitly above through #wgu-comments-list.
    if (pageScrollSnapshot && opts.restoreDurationMs !== 0) {
      restorePageScrollAggressively(pageScrollSnapshot, opts.restoreDurationMs || 700);
    }

    lastPulseHash = hash;

    return Boolean(primaryHighlight || primaryCard);
  }

  function statusClass(status) {
    const s = String(status || "").toLowerCase();
    if (s.includes("resolved") || s.includes("closed")) return "wgu-chip-resolved";
    if (s.includes("open") || s.includes("review")) return "wgu-chip-open";
    return "";
  }
  function selectOptionsHtml(options, current) {
    const cur = String(current || "");
    return options.map(opt => `<option value="${escapeHtml(opt)}"${opt === cur ? " selected" : ""}>${escapeHtml(opt)}</option>`).join("");
  }

  function dropdownHtml({ type, rowIdValue, options, current, buttonClass = "" }) {
    const key = `${type}:${rowIdValue}`;
    const isOpen = openDropdownKey === key;
    const optionHtml = options.map(opt => `
      <button type="button"
        class="wgu-dd-option${opt === current ? " wgu-dd-selected" : ""}"
        data-action="${type}-option"
        data-value="${escapeHtml(opt)}">
        ${escapeHtml(opt)}
      </button>
    `).join("");

    return `
      <div class="wgu-dd ${isOpen ? "wgu-dd-open" : ""}" data-dd-key="${escapeHtml(key)}" data-dd-type="${escapeHtml(type)}">
        <button type="button"
          class="wgu-dd-button ${escapeHtml(buttonClass)}"
          data-action="${type}-toggle"
          aria-haspopup="listbox"
          aria-expanded="${isOpen ? "true" : "false"}">
          ${escapeHtml(current)}
        </button>
        <div class="wgu-dd-menu" role="listbox">
          ${optionHtml}
        </div>
      </div>
    `;
  }

  function closeOpenDropdown({ render = false } = {}) {
    if (!openDropdownKey) return;
    openDropdownKey = "";
    if (render) renderCurrentPageFromCache(false);
  }

  function getSidebarList() {
    return sidebar?.querySelector?.("#wgu-comments-list") || null;
  }

  function beginStableCard(rowIdValue) {
    if (!rowIdValue) return;
    const card = document.querySelector(`.wgu-comment-card[data-wgu-chat-row-id="${CSS.escape(rowIdValue)}"]`);
    if (!card) return;
    stableCardRowId = rowIdValue;
    stableCardTop = card.getBoundingClientRect().top;
  }

  function restoreStableCard() {
    if (!stableCardRowId || stableCardTop == null) return;
    const list = getSidebarList();
    const card = document.querySelector(`.wgu-comment-card[data-wgu-chat-row-id="${CSS.escape(stableCardRowId)}"]`);
    if (!list || !card) {
      stableCardRowId = "";
      stableCardTop = null;
      return;
    }
    const newTop = card.getBoundingClientRect().top;
    const delta = newTop - stableCardTop;
    if (Math.abs(delta) > 1) list.scrollTop += delta;
    stableCardRowId = "";
    stableCardTop = null;
  }

  function closeDropdownsInDom(exceptKey = "") {
    qsa(".wgu-dd.wgu-dd-open").forEach(dd => {
      if (exceptKey && dd.dataset.ddKey === exceptKey) return;
      dd.classList.remove("wgu-dd-open");
      const btn = dd.querySelector(".wgu-dd-button");
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
  }

  function toggleDropdownInDom(dd) {
    if (!dd) return;
    const key = dd.dataset.ddKey || "";
    const willOpen = !dd.classList.contains("wgu-dd-open");
    closeDropdownsInDom(key);
    dd.classList.toggle("wgu-dd-open", willOpen);
    const btn = dd.querySelector(".wgu-dd-button");
    if (btn) btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    openDropdownKey = willOpen ? key : "";
  }

  function fieldFromTitle(title) {
    const t = String(title || "");
    const idx = t.indexOf(":");
    return idx > 0 ? t.slice(0, idx).trim() : "";
  }

  async function updateChatRow(chat, cells) {
    const cfg = await getConfig();
    const id = rowId(chat);
    if (!id) throw new Error("Missing chat row ID.");
    return updateRowInDoc(commentsDocId(cfg), commentsThreadsTableId(cfg), id, cells);
  }

  async function appendReply(chat, replyText) {
    const text = normalizeWhitespace(replyText);
    if (!text) return;

    const id = rowId(chat);
    if (!id) throw new Error("Missing chat row ID.");
    if (isSyntheticRow(chat)) {
      setSidebarError("This comment is still syncing to Coda. Try again in a moment.");
      return;
    }

    const existing = getChatLog(chat);
    const entry = `${currentUserInitialsForAvatar()}: ${new Date().toLocaleString()} -- ${text}`;
    const next = existing ? `${entry}\n────────────────────────\n${existing}` : entry;
    const currentCount = getThreadCount(chat);
    const nextCount = currentCount + 1;

    // Optimistic UI update: update the visible immutable history immediately.
    optimisticReplyOverrides.set(id, {
      commentLog: next,
      threadCount: nextCount,
      lastMessagePreview: text,
      lastMessageAt: new Date().toISOString(),
      lastMessageAuthorInitials: currentUserInitialsForAvatar(),
      pending: true
    });
    expandedReplyIds.add(id);
    await renderCurrentPageFromCache(true);
    restoreStableCard();
    restoreReplyFocusSoon(id);

    try {
      const replyMentions = mergeResolvedMentions(text, id);
      await updateChatRow(chat, {
        [COL.chats.lastMessagePreview]: text,
        [COL.chats.lastMessageAt]: new Date().toISOString(),
        [COL.chats.lastMessageAuthorInitials]: currentUserInitialsForAvatar(),
        [COL.chats.messageCountFast]: nextCount,
        [COL.chats.legacyCommentLogFrozen]: true,
        [COL.chats.currentThreadCount]: nextCount,
        [COL.chats.extPendingSync]: false,
        [COL.chats.mentionedText]: replyMentions.tokens.join(", "),
        [COL.chats.mentionedEmails]: replyMentions.emails.join(", "),
        [COL.chats.mentionNotificationStatus]: mentionStatusFor(replyMentions, valueFirst(chat, COL.chats.nativeSyncStatus) || "Not Synced")
      });

      addChatMessage({
        chatRowId: valueFirst(chat, COL.chats.chatLabel) || id,
        body: text,
        messageType: "reply",
        mentionedEmails: replyMentions.emails,
        nativeSyncStatus: valueFirst(chat, COL.chats.nativeSyncStatus) || "Not Synced",
        nativeThreadUri: valueFirst(chat, COL.chats.nativeThreadUri),
        sourceDocId: valueFirst(chat, COL.chats.sourceDocId) || "",
        sourcePageUrl: valueFirst(chat, COL.chats.extPageUrl, COL.chats.targetPageUrl) || currentPageUrl()
      }).catch(err => console.warn("[WGU Coda Comments] _Messages reply write failed", err));

      syncNativeCommentForChat({
        chatRowId: id,
        action: "add_reply",
        content: text,
        fieldLabel: valueFirst(chat, COL.chats.extFieldLabel) || fieldFromTitle(simpleText(cell(chat, COL.chats.chatLabel))) || "",
        exact: valueFirst(chat, COL.chats.extAnchorExactText, COL.chats.targetAnchorExactText, COL.chats.textAnchor),
        hash: valueFirst(chat, COL.chats.extAnchorTextHash, COL.chats.targetAnchorTextHash),
        pageUrl: valueFirst(chat, COL.chats.extPageUrl, COL.chats.targetPageUrl) || currentPageUrl(),
        threadUri: valueFirst(chat, COL.chats.nativeThreadUri),
        resolvedMentions: mergeResolvedMentions(text, id)
      }).then(() => loadPageChats(true)).catch(err => { if (isExtensionContextError(err)) markExtensionContextInvalidated(err); else loadPageChats(true); });

      enqueueMentionNotifications({
        chatRowId: id,
        targetRowId: valueFirst(chat, COL.chats.targetRowId, COL.chats.extTargetRowId) || "",
        anchorHash: valueFirst(chat, COL.chats.extAnchorTextHash, COL.chats.targetAnchorTextHash) || "",
        content: text,
        sourceField: valueFirst(chat, COL.chats.extFieldLabel) || fieldFromTitle(simpleText(cell(chat, COL.chats.chatLabel))) || "",
        pageUrl: valueFirst(chat, COL.chats.extPageUrl, COL.chats.targetPageUrl) || currentPageUrl(),
        nativeThreadUri: valueFirst(chat, COL.chats.nativeThreadUri),
        nativeThreadUrl: valueFirst(chat, COL.chats.nativeThreadUrl),
        resolvedMentions: mergeResolvedMentions(text, id)
      }).then(result => {
        if (result?.queued) console.log(`[WGU Coda Comments] Queued ${result.queued} mention notification(s).`);
      }).catch(err => console.error("[WGU Coda Comments] Mention notification queue failed", err));

      optimisticReplyOverrides.set(id, {
        commentLog: next,
        threadCount: nextCount,
        lastMessagePreview: text,
        lastMessageAt: new Date().toISOString(),
        lastMessageAuthorInitials: currentUserInitialsForAvatar(),
        pending: false
      });

      // Keep it visible instantly, then let Coda confirm in the background.
      await renderCurrentPageFromCache(true);
      restoreStableCard();
      restoreReplyFocusSoon(id);
      setTimeout(() => loadPageChats(true), 800);
    } catch (err) {
      optimisticReplyOverrides.set(id, {
        commentLog: `${next}\n\n[Sync failed: ${err.message || String(err)}]`,
        threadCount: nextCount,
        stage: "Sync Failed",
        pending: false
      });
      await renderCurrentPageFromCache(true);
      restoreStableCard();
      throw err;
    }
  }

  async function updateResolvedStatus(chat, resolved = true) {
    const id = rowId(chat);
    if (!id || isSyntheticRow(chat)) {
      setSidebarError("This comment is still syncing to Coda. Try again in a moment.");
      return;
    }

    const current = optimisticStatusOverrides.get(id) || {};
    optimisticStatusOverrides.set(id, {
      ...current,
      resolved: Boolean(resolved),
      pending: true
    });

    await renderCurrentPageFromCache(true);
    restoreStableCard();

    try {
      await updateChatRow(chat, { [COL.chats.resolved]: Boolean(resolved), [COL.chats.extPendingSync]: false });
      optimisticStatusOverrides.set(id, {
        ...current,
        resolved: Boolean(resolved),
        pending: false
      });
      await renderCurrentPageFromCache(true);
      restoreStableCard();
      setTimeout(() => loadPageChats(true), 800);
    } catch (err) {
      optimisticStatusOverrides.delete(id);
      await renderCurrentPageFromCache(true);
      restoreStableCard();
      throw err;
    }
  }


  async function handleCardAction(action, card, chat) {
    const hash = card.dataset.wguAnchorHash;
    if (isSyntheticRow(chat) && ["post-reply", "resolve"].includes(action)) {
      setSidebarError("This comment is still syncing to Coda. Try again in a moment.");
      return;
    }
    if (action === "toggle-card" || action === "toggle-history") {
      // v1.9.42: the card-level history/details dropdowns were removed.
      // Reply still expands the card intentionally.
      return;
    }

    if (action === "mention-close") {
      closeMentionHelper(card);
      restoreReplyFocusSoon(card.dataset.wguChatRowId || rowId(chat));
      return;
    }

    if (action === "mention-insert") {
      const ta = qs(".wgu-reply-box textarea", card);
      insertMentionFromHelper(card, ta);
      return;
    }

    if (action === "mention-select") {
      const ta = qs(".wgu-reply-box textarea", card);
      const idx = Number(card.dataset.pendingMentionIndex || "0") || 0;
      insertMentionFromHelper(card, ta, idx);
      restoreReplyFocusSoon(card.dataset.wguChatRowId || rowId(chat));
      return;
    }

    if (action === "reply") {
      const id = card.dataset.wguChatRowId || rowId(chat);
      if (id) {
        expandedReplyIds.add(id);
        selectedMentionsByRowId.delete(id);
        mentionSelectionIndexByRowId.delete(id);
        mentionSuppressByRowId.delete(id);
        lockReplyFocus(id);
      }
      const hash = card.dataset.wguAnchorHash;
      if (hash) await activateByHash(hash, { scrollHighlight: false, scrollCard: false });
      card.classList.add("wgu-active-card");
      card.classList.add("wgu-card-expanded");
      restoreReplyFocusSoon(id);
      loadMentionDirectory(false).catch(console.error);
      return;
    }
    if (action === "cancel-reply") {
      const id = card.dataset.wguChatRowId || rowId(chat);
      if (id) {
        expandedReplyIds.delete(id);
        replyDrafts.delete(id);
        selectedMentionsByRowId.delete(id);
        mentionSelectionIndexByRowId.delete(id);
        mentionSuppressByRowId.delete(id);
        unlockReplyFocus(id);
      }
      card.classList.remove("wgu-card-expanded");
      const ta = qs(".wgu-reply-box textarea", card);
      if (ta) ta.value = "";
      closeMentionHelper(card);
      return;
    }
    if (action === "post-reply") {
      const id = card.dataset.wguChatRowId || rowId(chat);
      intentionalReplyBlurUntil = Date.now() + 900;
      const ta = qs(".wgu-reply-box textarea", card);
      const text = ta?.value || replyDrafts.get(id) || "";
      if (id) {
        replyDrafts.delete(id);
        beginStableCard(id);
      }
      if (ta) ta.value = "";
      closeMentionHelper(card);
      await appendReply(chat, text);
      if (id) {
        expandedReplyIds.add(id);
        selectedMentionsByRowId.delete(id);
        mentionSelectionIndexByRowId.delete(id);
        mentionSuppressByRowId.delete(id);
        lockReplyFocus(id);
      }
      restoreReplyFocusSoon(id);
      return;
    }
    if (action === "locate") return activateByHash(hash, { scrollHighlight: true, scrollCard: false, forcePulse: true });
    if (action === "resolve") {
      const id = card.dataset.wguChatRowId || rowId(chat);
      const hash = valueFirst(chat, COL.chats.extAnchorTextHash, COL.chats.targetAnchorTextHash);
      beginStableCard(id);

      if (id) optimisticResolvedIds.add(id);
      if (hash && activeAnchorHash === hash) activeAnchorHash = "";

      // Immediate UI removal. Backend update catches up after.
      await renderCurrentPageFromCache(true);

      await updateResolvedStatus(chat, true);
      const threadUri = valueFirst(chat, COL.chats.nativeThreadUri);
      if (id && threadUri) {
        syncNativeCommentForChat({
          chatRowId: id,
          action: "resolve_thread",
          content: "Resolved from WGU Coda Comment Assistant.",
          fieldLabel: valueFirst(chat, COL.chats.extFieldLabel) || fieldFromTitle(simpleText(cell(chat, COL.chats.chatLabel))) || "",
          exact: valueFirst(chat, COL.chats.extAnchorExactText, COL.chats.targetAnchorExactText, COL.chats.textAnchor),
          hash: valueFirst(chat, COL.chats.extAnchorTextHash, COL.chats.targetAnchorTextHash),
          pageUrl: valueFirst(chat, COL.chats.extPageUrl, COL.chats.targetPageUrl) || currentPageUrl(),
          threadUri
        }).then(() => loadPageChats(true)).catch(err => { if (isExtensionContextError(err)) markExtensionContextInvalidated(err); else loadPageChats(true); });
      }
      loadPageChats(true).catch(err => {
        if (isExtensionContextError(err)) markExtensionContextInvalidated(err);
        else console.error(err);
      });
      return;
    }
  }

  function isResolvedChat(row) {
    const id = rowId(row);
    if (id && optimisticResolvedIds.has(id)) return true;
    const override = id ? optimisticStatusOverrides.get(id) : null;
    if (override?.resolved) return true;
    return isResolvedValue(cell(row, COL.chats.resolved));
  }

  function visibleActiveChats(chats = []) {
    return (chats || []).filter(row => !isResolvedChat(row));
  }

  function buildAnchorFromChatRow(chat) {
    const hash = valueFirst(chat, COL.chats.extAnchorTextHash, COL.chats.targetAnchorTextHash);
    const exact = valueFirst(chat, COL.chats.extAnchorExactText, COL.chats.targetAnchorExactText, COL.chats.textAnchor);
    const targetRow = targetRowForChat(chat);
    return {
      hash,
      exact,
      primaryChat: chat,
      currentMatchedText: valueFirst(chat, COL.chats.currentMatchedText),
      prefix: valueFirst(chat, COL.chats.extAnchorPrefix, COL.chats.targetAnchorPrefix),
      suffix: valueFirst(chat, COL.chats.extAnchorSuffix, COL.chats.targetAnchorSuffix),
      chatIds: threadKeyCandidatesForChat(chat),
      targetId: chatTargetRowId(chat),
      targetRow,
      sourceRowId: valueFirst(chat, COL.chats.extTargetRowId) || firstContentStringFromRow(targetRow, COL.target.sourceRowId),
      sourceTableName: valueFirst(chat, COL.chats.anchorSourceTableName) || firstContentStringFromRow(targetRow, COL.target.sourceTableName),
      sourceRowUrl: firstContentStringFromRow(targetRow, COL.target.sourceRowUrl),
      columnId: firstContentStringFromRow(targetRow, COL.target.columnId),
      viewId: firstContentStringFromRow(targetRow, COL.target.contextViewUrl),
      domPathHint: valueFirst(chat, COL.chats.anchorDomFingerprint) || firstContentStringFromRow(targetRow, COL.target.domPathHint),
      nearestHeading: valueFirst(chat, COL.chats.anchorNearestHeading),
      blockExcerpt: valueFirst(chat, COL.chats.anchorBlockExcerpt),
      previousSentence: valueFirst(chat, COL.chats.anchorPreviousSentence),
      nextSentence: valueFirst(chat, COL.chats.anchorNextSentence),
      normalizedSignature: valueFirst(chat, COL.chats.anchorNormalizedSignature),
      rareTokens: valueFirst(chat, COL.chats.anchorRareTokens),
      sourceColumnName: valueFirst(chat, COL.chats.anchorSourceColumnName),
      sourceRowDisplay: valueFirst(chat, COL.chats.anchorSourceRowDisplay),
      domFingerprint: valueFirst(chat, COL.chats.anchorDomFingerprint),
      blockIndex: valueFirst(chat, COL.chats.anchorBlockIndex),
      approxGeometry: approxGeometryFromChat(chat),
      fieldLabel: valueFirst(chat, COL.chats.extFieldLabel, COL.chats.anchorSourceColumnName) || fieldFromTitle(simpleText(cell(chat, COL.chats.chatLabel))) || ""
    };
  }

  function isUsableLiveAnchorResolution(resolved) {
    if (!resolved || (!resolved.range && !resolved.element && !resolved.cell)) return false;
    const rect = rectForAnchorResolution(resolved);
    if (!rect || (!rect.width && !rect.height)) return false;
    if (isRectInTopCodaChromeZone(rect)) return false;
    const el = resolved.element || resolved.cell || elementForRangeStart(resolved.range);
    if (el && isLikelyCodaChromeOrToolbarElement(el)) return false;
    return true;
  }


  function approxScrollCandidateElements() {
    const out = [];
    const add = el => {
      if (!el || out.includes(el)) return;
      if (el === window || el === document || el === document.documentElement || el === document.body || el === document.scrollingElement) { out.push(window); return; }
      if (el instanceof HTMLElement) out.push(el);
    };
    add(window);
    add(document.scrollingElement || document.documentElement);
    add(pageContentContainerForRect(null));
    add(qs('[data-coda-ui-id="canvas"]')?.parentElement);
    add(qs('#document-root-route'));
    add(qs('[role="main"]'));
    try {
      qsa('[id^="scroll-container-"],[data-scroll],[style*="overflow"],[class*="scroll" i]').forEach(el => {
        if (!(el instanceof HTMLElement)) return;
        const maxY = Math.max(0, (el.scrollHeight || 0) - (el.clientHeight || 0));
        const maxX = Math.max(0, (el.scrollWidth || 0) - (el.clientWidth || 0));
        if (maxY > 40 || maxX > 40 || isScrollableElement(el)) add(el);
      });
    } catch {}
    return Array.from(new Set(out));
  }

  function scrollWindowToApproxGeometry(geom, behavior = "auto") {
    if (!geom || geom.top == null) return false;
    const canvas = largestVisibleCodaCanvasRect();
    const currentPageHeight = canvas?.height || 0;
    let approxTop = Number(geom.top);
    if (geom.pageHeight && currentPageHeight && Math.abs(currentPageHeight - geom.pageHeight) > Math.max(800, geom.pageHeight * 0.18)) {
      approxTop = approxTop * (currentPageHeight / geom.pageHeight);
    }
    const viewport = getReadableViewport({ reason: "approx scroll" }).readableViewport || { top: 0, bottom: window.innerHeight || 800, height: window.innerHeight || 800 };
    const landing = preferredViewportYFromGeometry(geom, viewport);
    const desiredViewportTop = (Number(viewport.top) || 0) + landing.preferredY;
    const currentAnchorViewportTop = (canvas?.top || 0) + approxTop;
    const deltaY = Math.round(currentAnchorViewportTop - desiredViewportTop);
    let moved = false;

    // Absolute window fallback for normal document scrolling. v1.11.1: land the
    // anchor/icon at a cached preferred viewport Y instead of merely somewhere in
    // the viewport. This makes card-click navigation cheaper and more predictable.
    const docCanvasTop = (window.scrollY || document.documentElement.scrollTop || 0) + (canvas?.top || 0);
    const targetY = Math.max(0, Math.round(docCanvasTop + approxTop - landing.preferredY));
    try { window.scrollTo({ top: targetY, behavior }); moved = true; }
    catch { try { window.scrollTo(0, targetY); moved = true; } catch {} }

    // v1.10.11: Coda often uses nested/internal scroll containers. If the anchor is
    // above the viewport, window.scrollTo can be a no-op while Coda's pane remains
    // scrolled too far down. Apply the same viewport delta to likely Coda scroll
    // containers as a staged recovery assist. This runs only on card-click recovery,
    // not during ordinary scrolling.
    if (Math.abs(deltaY) > 8) {
      for (const scroller of approxScrollCandidateElements()) {
        try {
          if (scroller === window) continue;
          const maxY = Math.max(0, (scroller.scrollHeight || 0) - (scroller.clientHeight || 0));
          if (maxY <= 20) continue;
          const before = scroller.scrollTop || 0;
          const next = Math.max(0, Math.min(maxY, before + deltaY));
          if (Math.abs(next - before) > 1) {
            if (scroller.scrollTo) scroller.scrollTo({ top: next, behavior });
            else scroller.scrollTop = next;
            moved = true;
          }
        } catch {}
      }
    }
    wguPerf.lastApproxScrollDeltaY = deltaY;
    wguPerf.lastApproxScrollTargetY = targetY;
    wguPerf.lastApproxScrollPreferredLandingY = Math.round(landing.preferredY);
    wguPerf.lastApproxScrollPreferredLandingRatio = Number(landing.ratio.toFixed(3));
    return moved;
  }

  async function stagedScrollRecoverAnchorForChat(chat, card = null) {
    const txn = ++stagedAnchorFocusTxn;
    const anchor = buildAnchorFromChatRow(chat);
    const geom = approxGeometryFromChat(chat) || anchor.approxGeometry;
    if (!geom) {
      markCardAnchorStatus(card, "Anchor not currently rendered and no stored location is available yet.");
      return false;
    }

    markCardAnchorPending(card, "Scrolling to the expected anchor area…");
    textHighlightDeferredUntil = Math.max(textHighlightDeferredUntil, Date.now() + 900);
    scrollWindowToApproxGeometry(geom, "auto");

    // Coda often mounts below-the-fold blocks shortly after the scroll lands.
    for (const waitMs of [220, 420, 760]) {
      await new Promise(resolve => safeSetTimeout(resolve, waitMs));
      if (txn !== stagedAnchorFocusTxn) return false;
      const resolved = findAnchorRange(anchor);
      if (isUsableLiveAnchorResolution(resolved)) {
        const fresh = registerResolvedAnchor(anchor, resolved, null);
        scrollRegisteredAnchorIntoView(fresh, "smooth");
        textHighlightDeferredUntil = Math.max(textHighlightDeferredUntil, Date.now() + 500);
        scheduleApplyHighlights(visibleActiveChats(mergeOptimisticChats(lastFetchedPageChats)), 520);
        safeSetTimeout(() => {
          removeRogueTopCommentIcons();
          const latest = anchor.chatIds.map(getResolvedAnchorByThreadId).find(recordLooksUsableForCard) || fresh;
          pulseIconElement(bestSafeIconForRecord(latest));
        }, 420);
        return true;
      }
    }

    markCardAnchorStatus(card, "Anchor not found near the stored location.");
    return false;
  }

  function markCardAnchorStatus(card, message = "Anchor is not currently visible on the page.") {
    if (!card) return;
    card.dataset.wguAnchorStatus = "not-mounted";
    card.classList.add("wgu-anchor-not-mounted");
    card.title = message;
    safeSetTimeout(() => {
      try {
        card.classList.remove("wgu-anchor-not-mounted");
        delete card.dataset.wguAnchorStatus;
        card.removeAttribute("title");
      } catch {}
    }, 2400);
  }

  function markCardAnchorPending(card, message = "Finding anchor…") {
    if (!card) return;
    card.dataset.wguAnchorStatus = "pending";
    // Do not use the warning class for in-progress staged navigation; otherwise a
    // successful recovery can still look like an error until the highlight commits.
    card.classList.remove("wgu-anchor-not-mounted");
    card.title = message;
    safeSetTimeout(() => {
      try {
        if (card.dataset.wguAnchorStatus === "pending") {
          delete card.dataset.wguAnchorStatus;
          card.removeAttribute("title");
        }
      } catch {}
    }, 1800);
  }

  function recordLooksUsableForCard(record) {
    if (!record) return false;
    if (record.anchorRect && isRectInTopCodaChromeZone(record.anchorRect)) return false;
    if (record.iconElement) {
      const r = record.iconElement.getBoundingClientRect();
      if (isRectInTopCodaChromeZone(r)) return false;
    }
    return true;
  }

  function focusAnchorFromChat(chat, card = null) {
    setWguRuntimeMode(WGU_RUNTIME_MODE.NAVIGATING, "focusAnchorFromChat");
    removeRogueTopCommentIcons();
    const hash = valueFirst(chat, COL.chats.extAnchorTextHash, COL.chats.targetAnchorTextHash);
    const threadIds = threadKeyCandidatesForChat(chat);
    const threadId = card?.dataset?.wguThreadId || threadIds[0] || rowId(chat) || "";
    if (!hash && !threadId) return false;

    activeAnchorHash = hash || activeAnchorHash;
    focusOnlyAnchorHash = activeAnchorHash;
    qsa(".wgu-active-card").forEach(el => el.classList.remove("wgu-active-card"));
    if (card) card.classList.add("wgu-active-card");

    // Strictly prefer a record that belongs to THIS thread. Falling back to hash
    // caused the first/latest card to attach to a stale/rogue icon near Coda chrome.
    let registered = threadIds.map(getResolvedAnchorByThreadId).find(recordLooksUsableForCard) || null;
    if (registered) {
      qsa(".wgu-active-highlight").forEach(el => el.classList.remove("wgu-active-highlight"));
      const safeIcon = bestSafeIconForRecord(registered) || registered.iconElement;
      if (safeIcon && !isRogueTopCommentIcon(safeIcon)) safeIcon.classList.add("wgu-active-highlight");
      if (scrollRegisteredAnchorIntoView(registered, "smooth")) {
        scheduleIconPositionReflow();
        return true;
      }
      // Stale/hidden overlay records can remain after the anchor scrolls out above
      // Coda's viewport. Fall through to exact resolve / staged approximate recovery.
    }

    // Resolve this exact card's anchor from its row metadata instead of navigating by
    // hash alone. This avoids using another thread's icon when duplicate hashes or
    // stale registry entries exist.
    const anchor = buildAnchorFromChatRow(chat);
    const resolved = findAnchorRange(anchor);
    if (isUsableLiveAnchorResolution(resolved)) {
      const fresh = registerResolvedAnchor(anchor, resolved, null);
      scrollRegisteredAnchorIntoView(fresh, "smooth");
      // Render only after we know this exact card has a valid live range/block.
      textHighlightDeferredUntil = Math.max(textHighlightDeferredUntil, Date.now() + 450);
      scheduleApplyHighlights(visibleActiveChats(mergeOptimisticChats(lastFetchedPageChats)), 500);
      safeSetTimeout(() => {
        removeRogueTopCommentIcons();
        const latest = threadIds.map(getResolvedAnchorByThreadId).find(recordLooksUsableForCard) || null;
        pulseIconElement(bestSafeIconForRecord(latest));
      }, 360);
      return true;
    }

    registerResolvedAnchor(anchor, { ...(resolved || {}), status: "not-mounted", failureReason: "No valid live DOM anchor for card click" }, null);
    removeRogueTopCommentIcons();
    stagedScrollRecoverAnchorForChat(chat, card).catch(err => console.debug("[WGU Coda Comments] Staged anchor recovery failed", err));
    return true;
  }

  function focusAnchorFromCard(hash, threadId = "") {
    if (!hash && !threadId) return false;
    const threadRecord = threadId ? getResolvedAnchorByThreadId(threadId) : null;
    const registered = recordLooksUsableForCard(threadRecord) ? threadRecord : null;
    activeAnchorHash = hash || registered?.hash || activeAnchorHash;
    focusOnlyAnchorHash = activeAnchorHash;
    qsa(".wgu-active-card").forEach(el => el.classList.remove("wgu-active-card"));
    if (threadId) {
      const card = document.querySelector(`.wgu-comment-card[data-wgu-thread-id="${CSS.escape(threadId)}"], .wgu-comment-card[data-wgu-chat-row-id="${CSS.escape(threadId)}"]`);
      if (card) card.classList.add("wgu-active-card");
    }
    if (registered) {
      qsa(".wgu-active-highlight").forEach(el => el.classList.remove("wgu-active-highlight"));
      const safeIcon = bestSafeIconForRecord(registered) || registered.iconElement;
      if (safeIcon && !isRogueTopCommentIcon(safeIcon)) safeIcon.classList.add("wgu-active-highlight");
      if (scrollRegisteredAnchorIntoView(registered, "smooth")) {
        scheduleIconPositionReflow();
        return true;
      }
    }

    // v1.9.59: card navigation is deterministic. Do not trigger a broad
    // render-all or hash-only fallback from a card click; those paths can create
    // a rogue top-page icon when Coda has not mounted the real anchor yet.
    removeRogueTopCommentIcons();
    const card = threadId ? document.querySelector(`.wgu-comment-card[data-wgu-thread-id="${CSS.escape(threadId)}"], .wgu-comment-card[data-wgu-chat-row-id="${CSS.escape(threadId)}"]`) : null;
    const chat = threadId ? (lastFetchedPageChats || []).find(row => threadKeyCandidatesForChat(row).includes(threadId)) : null;
    if (chat) {
      stagedScrollRecoverAnchorForChat(chat, card).catch(err => console.debug("[WGU Coda Comments] Staged anchor recovery failed", err));
      return true;
    }
    markCardAnchorStatus(card, "Anchor not currently rendered by Coda. Scroll closer to the content and try again.");
    return false;
  }


  function anchorSortMetricForChat(chat) {
    const hash = valueFirst(chat, COL.chats.extAnchorTextHash, COL.chats.targetAnchorTextHash);
    const pos = hash ? runtimeStore.anchorPositionsByHash.get(hash) : null;
    const geom = approxGeometryFromChat(chat);
    const docY = pos?.documentY;
    if (Number.isFinite(Number(docY))) return Number(docY);
    if (geom?.top != null) return Number(geom.top);
    const created = Date.parse(valueFirst(chat, COL.chats.createdAt) || chat?.createdAt || "") || 0;
    return Number.MAX_SAFE_INTEGER - Math.min(created, Number.MAX_SAFE_INTEGER - 1);
  }

  function sortChatsByAnchorPosition(chats = []) {
    return (chats || []).slice().sort((a, b) => {
      const av = anchorSortMetricForChat(a);
      const bv = anchorSortMetricForChat(b);
      if (av !== bv) return av - bv;
      return String(rowId(a) || "").localeCompare(String(rowId(b) || ""));
    });
  }

  function renderSidebar(chats) {
    ensureSidebar();
    if (currentSidebarTab !== "comments") { renderSidebarUtilityPanel(); return; }
    updateSidebarChips();
    chats = sortChatsByAnchorPosition(visibleActiveChats(chats));
    const countEl = qs("#wgu-comment-count", sidebar);
    if (countEl) countEl.textContent = `${chats.length} ${chats.length === 1 ? "item" : "items"}`;
    const list = qs("#wgu-comments-list", sidebar);
    if (!chats.length) {
      list.innerHTML = `<div class="wgu-comment-card"><div class="wgu-comment-title">No comments found for this page.</div><div class="wgu-comment-excerpt">Select text and click Comment.</div></div>`;
      return;
    }
    list.innerHTML = `<div class="wgu-panel-nudge-note">Cards are ordered by anchor position when known. Click a card to land its icon/text near the same viewport zone.</div>`;
    chats.forEach((chat, idx) => {
      const hash = valueFirst(chat, COL.chats.extAnchorTextHash, COL.chats.targetAnchorTextHash);
      const exact = valueFirst(chat, COL.chats.extAnchorExactText, COL.chats.targetAnchorExactText, COL.chats.textAnchor);
      const fieldLabel = valueFirst(chat, COL.chats.extFieldLabel);
      const title = fieldLabel ? `${fieldLabel}: ${truncate(exact, 100)}` : (simpleText(cell(chat, COL.chats.chatLabel)) || `Comment ${idx + 1}`);
      const fullHistory = getChatLog(chat) || simpleText(cell(chat, COL.chats.latestChats)) || simpleText(cell(chat, COL.chats.whatsOnYourMind));
      const latest = messagePreviewForChat(chat, fullHistory);
      const page = rowPageName(chat);
      const field = firstNonIdLabel(fieldLabel, fieldFromTitle(title)) || "Field";
      const anchorStatus = valueFirst(chat, COL.chats.extAnchorStatus, COL.chats.targetAnchorStatus) || "Active";
      const anchorConfidence = valueFirst(chat, COL.chats.lastAnchorMatchConfidence) || "High";
      const currentMatchedText = valueFirst(chat, COL.chats.currentMatchedText);
      const showCurrentMatch = currentMatchedText && normalizeWhitespace(currentMatchedText) !== normalizeWhitespace(exact);
      const anchorNote = anchorStatus === "Rehydrated"
        ? "Text changed; relocated by context."
        : anchorStatus === "Ambiguous"
          ? "Multiple possible matches found."
          : anchorStatus === "Orphaned"
            ? "Original anchor is not currently visible."
            : (anchorConfidence === "Low" ? "Text not found; showing field/cell fallback." : "");
      const card = document.createElement("div");
      card.className = "wgu-comment-card";
      const thisRowId = rowId(chat);
      if (isSyntheticRow(chat) || simpleText(cell(chat, COL.chats.extPendingSync)) === "true") card.classList.add("wgu-pending-card");
      if (optimisticReplyOverrides.get(thisRowId)?.pending) card.classList.add("wgu-reply-syncing");
      const isActiveCard = Boolean(hash && hash === activeAnchorHash);
      if (isActiveCard) card.classList.add("wgu-active-card");
      if (expandedReplyIds.has(thisRowId)) card.classList.add("wgu-card-expanded");
      if (replyFocusLocked && focusedReplyRowId === thisRowId) card.classList.add("wgu-reply-focus-locked");
      const thisThreadKey = stableThreadIdForChat(chat) || thisRowId;
      card.dataset.wguChatRowId = thisRowId;
      card.dataset.wguThreadId = thisThreadKey;
      card.dataset.wguAnchorHash = hash;
      for (const key of threadKeyCandidatesForChat(chat)) if (key) {
        cardRegistryByThreadId.set(key, card);
        try { window.WGU?.Sidebar?.Registry?.registerCard?.(key, card); } catch {}
      }
      const nativeStatusHtml = nativeStatusHtmlFor(chat);
      const syncChip = (isSyntheticRow(chat) || simpleText(cell(chat, COL.chats.extPendingSync)) === "true" || optimisticStatusOverrides.get(thisRowId)?.pending || optimisticReplyOverrides.get(thisRowId)?.pending)
        ? '<span class="wgu-chip wgu-chip-pending">Syncing</span>'
        : "";

      card.innerHTML = `
        <div class="wgu-word-thread-head">
          <div class="wgu-author-avatar">${escapeHtml(currentUserInitialsForAvatar())}</div>
          <div class="wgu-word-thread-main">
            <div class="wgu-word-meta-line wgu-word-page-only">${escapeHtml(page)}${syncChip ? ` · ${syncChip}` : ""}</div>
          </div>
        </div>
        <div class="wgu-word-anchor-preview">${escapeHtml(truncate(exact || title || "Selected content", 210))}</div>
        <div class="wgu-card-latest-preview wgu-word-latest-preview">
          <span>${escapeHtml(truncate(latest, 220))}</span>
        </div>

        <div class="wgu-comment-card-actions">
          <button data-action="reply">Reply</button>
          <button data-action="resolve" class="wgu-success-lite">Resolve</button>
        </div>
        <div class="wgu-reply-box">
          <textarea placeholder="Reply to this thread..."></textarea>
          <div class="wgu-mention-helper" role="dialog" aria-label="Mention picker">
            <div class="wgu-mention-results"><div class="wgu-mention-loading">Loading people…</div></div>
          </div>
          <div class="wgu-reply-actions">
            <button class="wgu-cancel-reply" data-action="cancel-reply">Cancel</button>
            <button class="wgu-post-reply" data-action="post-reply">Post Reply</button>
          </div>
          <div class="wgu-reply-sync-note">Syncing reply to Coda…</div>
        </div>`;
      qsa("textarea,input,select,.wgu-reply-box,.wgu-chat-history,.wgu-chat-history-body", card).forEach(el => {
        ["click", "mousedown", "mouseup", "keypress", "compositionstart", "compositionupdate", "compositionend"].forEach(evt => {
          el.addEventListener(evt, e => shieldExtensionEvent(e), true);
        });
      });

      wireMentionHelper(card, thisRowId);

      // Buttons inside the protected reply box need direct listeners because the
      // reply box intentionally stops bubbling to the card-level handler.
      qsa("button[data-action]", card).forEach(btn => {
        btn.addEventListener("mousedown", ev => {
          // Prevent Coda from stealing focus before the mention click is processed.
          intentionalReplyBlurUntil = Date.now() + 900;
          ev.preventDefault();
          ev.stopPropagation();
        }, true);

        btn.addEventListener("click", ev => {
          intentionalReplyBlurUntil = Date.now() + 900;
          ev.preventDefault();
          ev.stopPropagation();

          const clicked = ev.target?.closest?.("button[data-action]") || btn;
          const action = clicked.dataset.action;
          card.dataset.pendingActionValue = clicked.dataset.value || "";
          card.dataset.pendingMentionIndex = clicked.dataset.mentionIndex || "0";

          handleCardAction(action, card, chat).catch(err => {
            console.error(err);
            setSidebarError(err.message || String(err));
          }).finally(() => {
            delete card.dataset.pendingActionValue;
            delete card.dataset.pendingMentionIndex;
          });
        });
      });

      card.addEventListener("click", ev => {
        const action = ev.target?.dataset?.action;
        if (action) {
          ev.stopPropagation();
          handleCardAction(action, card, chat).catch(err => { console.error(err); setSidebarError(err.message || String(err)); });
          return;
        }
        if (isInteractiveCardTarget(ev.target)) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
        focusAnchorFromChat(chat, card);
      });
      list.appendChild(card);
    });
  }


  let lastFetchedPageChats = [];
  const commentTargetsById = new Map();

  function mergeOptimisticChats(rows) {
    for (const row of rows) {
      const id = rowId(row);
      const override = optimisticReplyOverrides.get(id);
      if (override) {
        const backendLog = simpleText(cell(row, COL.chats.commentLog));
        if (backendLog && backendLog === override.commentLog) optimisticReplyOverrides.delete(id);
      }
      const statusOverride = optimisticStatusOverrides.get(id);
      if (statusOverride) {
        const resolvedOk = !statusOverride.resolved || isResolvedValue(cell(row, COL.chats.resolved));
        if (resolvedOk) optimisticStatusOverrides.delete(id);
      }
    }
    rows = rows.map(applyOptimisticReplyOverride);
    const byHash = new Set(rows.map(r => valueFirst(r, COL.chats.extAnchorTextHash, COL.chats.targetAnchorTextHash)));
    const merged = rows.slice();

    for (const [hash, opt] of optimisticChats.entries()) {
      if (byHash.has(hash) && !isSyntheticRow(opt)) {
        // Persisted row is now available; optimistic copy is no longer needed.
        optimisticChats.delete(hash);
        continue;
      }
      if (codaPageMatchesRow(opt)) merged.unshift(opt);
    }

    // De-dupe by hash + row ID, preserving newest/optimistic first.
    const seen = new Set();
    return merged.filter(row => {
      const key = `${rowId(row)}|${valueFirst(row, COL.chats.extAnchorTextHash, COL.chats.targetAnchorTextHash)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  let wguNotifyRouterAttempted = false;
  async function maybeRouteFromNotifyLanding() {
    if (wguNotifyRouterAttempted || extensionContextInvalidated) return false;
    wguNotifyRouterAttempted = true;

    const params = getWguDeepLinkParams();
    if (params.hash || params.chatRowId || params.targetRowId) return false;
    if (!isLikelyNotifyButtonLandingPage()) return false;

    try {
      const me = await getCurrentCodaUserSafe();
      const email = String(me.email || "").toLowerCase();
      if (!email) return false;

      const cfg = await getConfig();
      const q = MENTION_NOTIFICATION_QUEUE;
      const resp = await listRows(q.tableId, 100);
      const handled = getHandledNotifyRouterIds();
      const now = Date.now();

      const candidates = (resp.items || [])
        .map(row => {
          const id = simpleText(cell(row, q.columns.notificationId)) || rowId(row);
          const mentionedEmail = simpleText(cell(row, q.columns.mentionedEmail)).toLowerCase();
          const status = simpleText(cell(row, q.columns.status));
          const sourceUrl = simpleText(cell(row, q.columns.sourcePageUrl));
          const sentMs = rowDateMs(row, q.columns.sentAt);
          const createdMs = rowDateMs(row, q.columns.createdAt);
          const ts = sentMs || createdMs || 0;
          return { row, id, mentionedEmail, status, sourceUrl, ts };
        })
        .filter(x => x.id && !handled.has(x.id))
        .filter(x => x.mentionedEmail === email)
        .filter(x => x.sourceUrl && !codaPageMatches(x.sourceUrl))
        .filter(x => !x.ts || now - x.ts < NOTIFY_ROUTER_WINDOW_MS)
        .filter(x => !/^failed|suppressed$/i.test(x.status || ""))
        .sort((a, b) => (b.ts || 0) - (a.ts || 0));

      const target = candidates[0];
      if (!target) return false;

      markHandledNotifyRouterId(target.id);
      console.log("[WGU Coda Comments] Routing Coda Notify landing page to source comment.", {
        notificationId: target.id,
        sourceUrl: target.sourceUrl
      });

      location.assign(target.sourceUrl);
      return true;
    } catch (err) {
      if (isExtensionContextError(err)) markExtensionContextInvalidated(err);
      else console.debug("[WGU Coda Comments] Notify landing router skipped.", err);
      return false;
    }
  }

  let wguDeepLinkActivated = false;
  function maybeActivateDeepLink(chats = []) {
    if (wguDeepLinkActivated) return;
    const params = getWguDeepLinkParams();
    const hash = params.hash || "";
    const chatRowId = params.chatRowId || "";
    if (!hash && !chatRowId) return;

    let targetHash = hash;
    if (!targetHash && chatRowId) {
      const row = chats.find(r => rowId(r) === chatRowId);
      targetHash = row ? valueFirst(row, COL.chats.extAnchorTextHash, COL.chats.targetAnchorTextHash) : "";
    }
    if (!targetHash) return;

    wguDeepLinkActivated = true;
    safeSetTimeout(() => activateByHash(targetHash, {
      scrollCard: true,
      scrollHighlight: true,
      forcePulse: true
    }), 450);
  }

  let pendingHighlightChats = [];
  let pendingHighlightTimer = null;
  function scheduleApplyHighlights(chats, delayMs = 120) {
    const nextChats = chats || [];
    if (!nextChats.length) {
      pendingHighlightChats = [];
      if (pendingHighlightTimer) { clearTimeout(pendingHighlightTimer); pendingHighlightTimer = null; }
      applyHighlights([]);
      return;
    }
    if (!hasActiveThreadWork()) { suppressIdleDomWork("scheduleApplyHighlights"); return; }
    pendingHighlightChats = nextChats;
    if (pendingHighlightTimer) clearTimeout(pendingHighlightTimer);
    pendingHighlightTimer = setTimeout(() => {
      pendingHighlightTimer = null;
      try { applyHighlights(pendingHighlightChats); }
      catch (err) { console.warn("[WGU Coda Comments] Highlight refresh failed", err); }
    }, delayMs);
  }

  function chatApproxDistanceFromReadableViewport(chat) {
    const geom = approxGeometryFromChat(chat);
    if (!geom || geom.top == null) return Number.POSITIVE_INFINITY;
    const rect = viewportRectFromApproxGeometry(geom);
    const vp = getReadableViewport()?.readableViewport || codaContentViewportBounds();
    if (!rect || !vp) return Number.POSITIVE_INFINITY;
    if (rect.bottom >= vp.top && rect.top <= vp.bottom) return 0;
    return Math.min(Math.abs(rect.bottom - vp.top), Math.abs(rect.top - vp.bottom));
  }

  function rowsForLightweightAnchorRender(rows = []) {
    const activeHash = activeAnchorHash || focusOnlyAnchorHash || "";
    const chosen = [];
    const seen = new Set();
    const add = (row) => {
      const id = rowId(row) || runtimeKeyForThread(row) || runtimeHashForRow(row);
      if (!id || seen.has(id)) return;
      seen.add(id);
      chosen.push(row);
    };
    for (const row of rows) {
      const hash = runtimeHashForRow(row);
      if (isSyntheticRow(row) || (activeHash && hash === activeHash)) add(row);
    }
    const near = rows
      .filter(row => !seen.has(rowId(row) || runtimeKeyForThread(row) || runtimeHashForRow(row)))
      .map(row => ({ row, d: chatApproxDistanceFromReadableViewport(row) }))
      .filter(x => x.d <= 1400)
      .sort((a, b) => a.d - b.d)
      .slice(0, Math.max(0, 8 - chosen.length));
    near.forEach(x => add(x.row));
    try { wguPerf.anchorRenderCandidates = chosen.length; wguPerf.anchorRenderTotalRows = rows.length; } catch {}
    return chosen;
  }

  async function renderCurrentPageFromCache(forcePanel = false) {
    if (forcePanel) await setPanelOpen(true);
    const merged = visibleActiveChats(mergeOptimisticChats(lastFetchedPageChats));
    wguPerf.threadsLoaded = merged.length;
    renderSidebar(merged);

    if (!merged.length) {
      enterIdleMode("no visible active threads");
      clearHighlights();
      anchorCacheByHash.clear();
      clearAnchorRegistry();
      markPushCandidates(document.documentElement.classList.contains("wgu-comments-panel-open"));
      return;
    }

    enterActiveMode(`rendering ${merged.length} active thread(s)`);
    // v1.11.0: render anchors lazily. The sidebar may show many comments, but
    // page DOM work should be limited to the active/local/near-viewport set.
    scheduleApplyHighlights(rowsForLightweightAnchorRender(merged));
    maybeActivateDeepLink(merged);
    markPushCandidates(document.documentElement.classList.contains("wgu-comments-panel-open"));
    if (focusedReplyRowId && replyFocusLocked) {
      lockReplyFocus(focusedReplyRowId);
      restoreReplyFocusSoon(focusedReplyRowId);
    }
  }

  function clearEphemeralChatCaches() {
    optimisticChats.clear();
    optimisticReplyOverrides.clear();
    optimisticStatusOverrides.clear();
    optimisticResolvedIds.clear();
    optimisticAnchorRangeByHash.clear();
    anchorCacheByHash.clear();
    clearAnchorRegistry();
    commentTargetsById.clear();
    activeAnchorHash = "";
    focusOnlyAnchorHash = "";
    lastFetchedPageChats = [];
    runtimeStoreClear("clear ephemeral chat caches");
    clearHighlights();
  }

  function applyAuthoritativeEmptyThreads(reason = "authoritative empty _Threads read") {
    clearEphemeralChatCaches();
    wguPerf.rawThreadsLoaded = 0;
    wguPerf.threadsLoaded = 0;
    wguPerf.lastAuthoritativeEmptyAt = new Date().toISOString();
    wguPerf.lastAuthoritativeEmptyReason = reason;
    if (currentSidebarTab === "comments") renderSidebar([]);
    enterIdleMode(reason);
    markPushCandidates(document.documentElement.classList.contains("wgu-comments-panel-open"));
  }

  function pruneExpiredOptimisticChats(maxAgeMs = 20000) {
    const now = Date.now();
    for (const [hash, row] of optimisticChats.entries()) {
      if ((now - Number(row?.createdAtMs || 0)) > maxAgeMs) optimisticChats.delete(hash);
    }
  }

  async function hardReloadPageChats() {
    lastLoadAt = 0;
    clearEphemeralChatCaches();
    if (currentSidebarTab === "comments") renderSidebar([]);
    await loadPageChats(true);
    // Coda's rows endpoint can lag behind UI deletes/creates by a moment. One
    // follow-up fresh read avoids the “deleted rows remain until second refresh” effect.
    safeSetTimeout(() => loadPageChats(true), 900);
    safeSetTimeout(() => loadPageChats(true), 2400);
  }

  async function loadPageChats(force = false) {
    const now = Date.now();
    if (!force && now - lastLoadAt < 3500) return;
    lastLoadAt = now;
    // Deletion-safe release: a successful empty _Threads read is authoritative.
    // Keep optimistic rows only until the next successful refresh proves otherwise.
    pruneExpiredOptimisticChats(120000);
    try {
      const cfg = await getConfig();
      if (!(cfg.sourceApiToken || cfg.apiToken || cfg.token)) {
        console.warn("[WGU Coda Comments] No Source / Extension Doc API key found. Open extension options and click Save + Test API Keys.");
        return;
      }
      if (useCommentEngine(cfg) && !(cfg.commentEngineApiToken || cfg.engineCodaApiToken)) {
        console.warn("[WGU Coda Comments] No Comment Engine API key found. Open extension options and click Save + Test API Keys.");
        return;
      }
      if (!useCommentEngine(cfg)) await loadOptionalExtensionColumns();

      // Keep the critical path boring: fetch thread summaries only. In Chat Engine mode,
      // these rows live in the separate Comment Engine doc, while optional target tables
      // remain in the source/extension doc and are not required for rendering.
      let resp;
      try {
        resp = await listRowsPagedInDoc(commentsDocId(cfg), commentsThreadsTableId(cfg), 500, 100, { retries: 3 });
      } catch (err) {
        if (isTransientFetchError(err) && lastFetchedPageChats.length) {
          console.warn("[WGU Coda Comments] Could not refresh comment threads; keeping cached sidebar rows.", err);
          await renderCurrentPageFromCache(false);
          return;
        }
        throw err;
      }

      if (!useCommentEngine(cfg)) {
        const targetRespResult = await listRowsPaged(cfg.targetTableId, 500, 100, { retries: 1 })
          .catch(err => ({ __wguError: err, items: [] }));
        if (targetRespResult.__wguError) {
          console.warn("[WGU Coda Comments] Could not refresh CommentTarget cache; navigation will use chat formulas only.", targetRespResult.__wguError);
        } else {
          commentTargetsById.clear();
          (targetRespResult.items || []).forEach(row => {
            const id = rowId(row);
            if (id) commentTargetsById.set(id, row);
          });
        }
      } else {
        commentTargetsById.clear();
      }

      // Performance release: do not fetch _ChatMessages during initial sidebar load.
      // Cards render from lightweight _Chats summary fields; legacy rows fall back to Comment Log.
      const rawThreadItems = resp.items || [];
      wguPerf.rawThreadsLoaded = rawThreadItems.length;
      const enrichedPageChats = rawThreadItems
        .map(enrichChatFromTarget)
        .filter(row => codaPageMatchesRow(row));

      if (!enrichedPageChats.length) {
        applyAuthoritativeEmptyThreads(rawThreadItems.length ? "successful _Threads read returned no rows for this Coda page" : "successful _Threads read returned zero rows");
        return;
      }

      lastFetchedPageChats = enrichedPageChats;
      runtimeStoreSetCodaThreads(enrichedPageChats, "successful Coda _Threads sync");
      await renderCurrentPageFromCache(false);
    } catch (err) {
      if (isExtensionContextError(err)) {
        markExtensionContextInvalidated(err);
        return;
      }
      console.error(err);
      if (isTransientFetchError(err) && (lastFetchedPageChats.length || optimisticChats.size)) {
        console.warn("[WGU Coda Comments] Transient refresh failure; preserving current sidebar instead of replacing it with an error.", err);
        await renderCurrentPageFromCache(false);
        return;
      }
      setSidebarError(err.message || String(err));
    }
  }

  let loadTimer = null;
  function scheduleLoad() {
    clearTimeout(loadTimer);
    loadTimer = safeSetTimeout(() => loadPageChats(false), 850);
  }

  let highlightReflowTimer = null;
  let highlightReflowRaf = null;
  function scheduleHighlightReflow(delay = 0) {
    if (!hasActiveThreadWork()) {
      suppressIdleDomWork("scheduleHighlightReflow");
      return;
    }
    wguPerfInc("highlightReflows");
    if (delay && delay > 0) textHighlightDeferredUntil = Math.max(textHighlightDeferredUntil, Date.now() + delay);
    // v1.9.62 performance guard: this path is expensive because it can rebuild the
    // text index and re-render anchors. During normal scrolling, delay it until
    // scrolling settles instead of doing work every animation frame.
    if (highlightReflowTimer) {
      clearTimeout(highlightReflowTimer);
      highlightReflowTimer = null;
    }
    const run = () => {
      if (highlightReflowRaf) return;
      highlightReflowRaf = window.requestAnimationFrame(() => {
        highlightReflowRaf = null;
        try {
          const merged = visibleActiveChats(mergeOptimisticChats(lastFetchedPageChats));
          if (!merged.length) {
            applyAuthoritativeEmptyThreads("highlight reflow saw zero visible active threads");
            return;
          }
          applyHighlights(merged);
        } catch (err) {
          console.warn("[WGU Coda Comments] Highlight reflow failed", err);
        }
      });
    };
    if (delay && delay > 0) highlightReflowTimer = safeSetTimeout(run, delay);
    else run();
  }


  window.__wguCodaTokenDebug = async function () {
    const { local, sync } = await getAllExtensionStorage();
    const redact = v => {
      v = String(v || "");
      return v ? `${v.slice(0, 6)}…${v.slice(-4)} (${v.length})` : "";
    };
    const keys = ["sourceApiToken","sourceCodaApiToken","commentEngineApiToken","engineCodaApiToken","apiToken","codaApiToken","token","CODA_API_TOKEN","codaToken","coda_api_key","apiKey"];
    const report = {
      local: {},
      sync: {},
      sourceFound: redact(getSourceTokenFromStorageShape(local, sync)),
      commentEngineFound: redact(getCommentEngineTokenFromStorageShape(local, sync))
    };
    keys.forEach(k => {
      if (local[k]) report.local[k] = redact(local[k]);
      if (sync[k]) report.sync[k] = redact(sync[k]);
    });
    console.table({ ...report.local, ...Object.fromEntries(Object.entries(report.sync).map(([k,v]) => [`sync.${k}`, v])), sourceFound: report.sourceFound, commentEngineFound: report.commentEngineFound });
    return report;
  };

  window.__wguMentionDirectoryDebug = async function () {
    try {
      const rowsResp = await listRows(MENTION_DIRECTORY.tableId, 5);
      const rows = rowsResp.items || [];
      const parsed = rows.map(makeMentionDirectoryEntry);
      console.log("Raw _Users GURPS sample", rows);
      console.log("Parsed _Users GURPS sample", parsed);
      await loadMentionDirectory(true);
      console.log("Mention directory cache length", mentionDirectoryCache.length);
      console.table(mentionDirectoryCache.slice(0, 20).map(x => ({
        name: x.displayName,
        email: x.email,
        mode: x.mentionMode,
        role: x.roleAcronym,
        workspace: x.isWorkspaceMember
      })));
      return { rawSample: rows, parsedSample: parsed, cache: mentionDirectoryCache };
    } catch (err) {
      console.error(err);
      return { error: err.message || String(err) };
    }
  };

  window.addEventListener("error", ev => {
    if (isExtensionContextError(ev.error || ev.message)) {
      markExtensionContextInvalidated(ev.error || ev.message);
      ev.preventDefault();
    }
  }, true);

  window.addEventListener("unhandledrejection", ev => {
    if (isExtensionContextError(ev.reason)) {
      markExtensionContextInvalidated(ev.reason);
      ev.preventDefault();
    }
  }, true);


  function detectCodaThemeMode() {
    try {
      const root = document.documentElement;
      const body = document.body || document.documentElement;
      const rootClass = `${root.className || ""} ${body.className || ""}`.toLowerCase();
      if (rootClass.includes("dark")) return "dark";
      if (rootClass.includes("light")) return "light";

      const bg = getComputedStyle(body).backgroundColor || getComputedStyle(root).backgroundColor || "";
      const color = getComputedStyle(body).color || getComputedStyle(root).color || "";
      const nums = (value) => (value.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number);
      const luminance = (rgb) => {
        if (rgb.length < 3) return null;
        const [r, g, b] = rgb.map(v => {
          v = v / 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const bgLum = luminance(nums(bg));
      const colorLum = luminance(nums(color));
      if (bgLum !== null && bgLum < 0.22) return "dark";
      if (colorLum !== null && colorLum > 0.75 && window.matchMedia?.("(prefers-color-scheme: dark)")?.matches) return "dark";
      if (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches) return "dark";
    } catch {}
    return "light";
  }

  function applyCodaThemeMode() {
    const mode = detectCodaThemeMode();
    document.documentElement.classList.toggle("wgu-coda-theme-dark", mode === "dark");
    document.documentElement.classList.toggle("wgu-coda-theme-light", mode !== "dark");
    return mode;
  }

  async function boot() {
    applyCodaThemeMode();
    window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", applyCodaThemeMode);
    new MutationObserver(() => applyCodaThemeMode()).observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    if (document.body) new MutationObserver(() => applyCodaThemeMode()).observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
    await getConfig();
    if (await maybeRouteFromNotifyLanding()) return;
    await initializePanelState();
    // v1.9.62 performance guard: Coda mutates the page constantly. A body-wide
    // subtree observer was causing repeated API refresh/render cycles and dragging the
    // browser. Only reload automatically when the URL changes; use the sidebar refresh
    // button for explicit data refreshes.
    let wguLastObservedLocation = location.href;
    new MutationObserver(() => {
      wguPerfInc("mutationEvents");
      if (location.href !== wguLastObservedLocation) {
        wguLastObservedLocation = location.href;
        scheduleLoad();
      }
    }).observe(document.body, { childList: true, subtree: false });
    window.addEventListener("hashchange", () => hardReloadPageChats());
    window.addEventListener("resize", () => {
      scheduleReadableViewportRefresh("window resize");
      markPushCandidates(document.documentElement.classList.contains("wgu-comments-panel-open"));
    });
    ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick", "auxclick"].forEach(type => {
      document.addEventListener(type, routeHighlightPointerEvent, true);
    });
    document.addEventListener("pointerdown", handleProtectedSurfacePointerDown, true);
    document.addEventListener("mousedown", handleProtectedSurfacePointerDown, true);
    document.addEventListener("pointerup", handleProtectedSurfacePointerUp, true);
    document.addEventListener("mouseup", handleProtectedSurfacePointerUp, true);
    document.addEventListener("click", handleProtectedSurfaceClick, true);
    document.addEventListener("pointermove", handleCellCommentHover, true);
    document.addEventListener("mousemove", handleCellCommentHover, true);
    document.addEventListener("pointerover", handleCellCommentHover, true);
    document.addEventListener("dragstart", ev => {
      if (protectedSelectionSurface && protectedSelectionSurface.contains(ev.target)) ev.stopPropagation();
    }, true);
    document.addEventListener("mouseup", ev => {
      releaseProtectedSurfaceSelectionSoon();
      if (isExtensionUiTarget(ev.target)) return;
      setTimeout(showButtonForSelection, 50);
    });
    document.addEventListener("keyup", ev => {
      if (isExtensionUiTarget(ev.target)) return;
      setTimeout(showButtonForSelection, 50);
    });
    document.addEventListener("scroll", () => {
      wguPerfInc("scrollEvents");
      hideButton();
      if (hasActiveThreadWork()) {
        scheduleIconPositionReflow();
        wguPerfInc("scrollFullHighlightReflowSuppressions");
        scheduleAnchorVisibilityRepair(700);
      }
      if (wguRuntimeMode === WGU_RUNTIME_MODE.COMMENTING) {
        scheduleCellSelectionOverlaySync();
        scheduleCellCommentTriggerSync();
      } else if (!hasActiveThreadWork()) {
        suppressIdleDomWork("scroll");
      }
    }, true);
    window.addEventListener("resize", () => {
      wguPerfInc("resizeEvents");
      scheduleReadableViewportRefresh("window resize active listener");
      if (hasActiveThreadWork()) {
        scheduleIconPositionReflow();
        wguPerfInc("scrollFullHighlightReflowSuppressions");
        scheduleAnchorVisibilityRepair(700);
      }
      if (wguRuntimeMode === WGU_RUNTIME_MODE.COMMENTING) {
        scheduleCellSelectionOverlaySync();
        scheduleCellCommentTriggerSync();
      } else if (!hasActiveThreadWork()) {
        suppressIdleDomWork("resize");
      }
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", () => scheduleReadableViewportRefresh("visual viewport resize"), { passive: true });
      window.visualViewport.addEventListener("scroll", () => scheduleReadableViewportRefresh("visual viewport scroll"), { passive: true });
    }
    try {
      const ro = new ResizeObserver(() => scheduleReadableViewportRefresh("layout resize observer"));
      ro.observe(document.documentElement);
      ro.observe(document.body);
      const sidebarEl = qs("#wgu-coda-comment-sidebar");
      if (sidebarEl) ro.observe(sidebarEl);
    } catch {}
    document.addEventListener("mousedown", ev => {
      const insideSidebar = ev.target?.closest?.("#wgu-coda-comment-sidebar");
      if (insideSidebar) {
        // User is intentionally interacting with extension UI.
        intentionalReplyBlurUntil = Date.now() + 900;
      } else if (replyFocusLocked) {
        // User clicked the page, so let focus leave intentionally.
        intentionalReplyBlurUntil = Date.now() + 900;
        unlockReplyFocus();
      }
      if (ev.target?.closest?.("#wgu-coda-comment-sidebar .wgu-dd")) return;
      if (openDropdownKey) {
        openDropdownKey = "";
        closeDropdownsInDom("");
      }
    }, true);

    document.addEventListener("focusin", ev => {
      if (ev.target?.closest?.("#wgu-coda-comment-sidebar")) return;
      restoreReplyFocusIfNeeded();
    }, true);

    let selectionChangeTimer = null;
    document.addEventListener("selectionchange", () => {
      restoreReplyFocusIfNeeded();
      clearTimeout(selectionChangeTimer);
      selectionChangeTimer = setTimeout(showButtonForSelection, 90);
    });

    document.addEventListener("keydown", ev => {
      if (replyFocusLocked && !ev.target?.closest?.("#wgu-coda-comment-sidebar") && shouldRestoreReplyFocus()) {
        const ta = getFocusedReplyTextarea();
        if (ta) {
          ev.preventDefault();
          ev.stopPropagation();
          ta.focus({ preventScroll: true });
          return;
        }
      }
      if (ev.key === "Escape" && openDropdownKey) {
        ev.preventDefault();
        ev.stopPropagation();
        openDropdownKey = "";
        closeDropdownsInDom("");
      }
    }, true);
    // v1.10.3: boot once, treat successful empty _Threads reads as authoritative, and audit writes.
    // Mention/dicussable-field preloads are intentionally deferred so empty docs do not
    // pay DOM/API costs before the user actually comments.
    safeSetTimeout(() => loadPageChats(true), 900);
  }

  boot().catch(err => console.error("[WGU Coda Comments] boot failed", err));
})();
