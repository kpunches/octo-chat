"use strict";
var WGU;
(function (WGU) {
    var Logging;
    (function (Logging) {
        let debugEnabled = false;
        function setDebug(enabled) { debugEnabled = enabled; }
        Logging.setDebug = setDebug;
        function debug(message, data) {
            if (!debugEnabled)
                return;
            if (data === undefined)
                console.debug(`[WGU Coda Comments] ${message}`);
            else
                console.debug(`[WGU Coda Comments] ${message}`, data);
        }
        Logging.debug = debug;
        function warn(message, data) {
            if (data === undefined)
                console.warn(`[WGU Coda Comments] ${message}`);
            else
                console.warn(`[WGU Coda Comments] ${message}`, data);
        }
        Logging.warn = warn;
        function error(message, data) {
            if (data === undefined)
                console.error(`[WGU Coda Comments] ${message}`);
            else
                console.error(`[WGU Coda Comments] ${message}`, data);
        }
        Logging.error = error;
    })(Logging = WGU.Logging || (WGU.Logging = {}));
})(WGU || (WGU = {}));
var WGU;
(function (WGU) {
    var Ids;
    (function (Ids) {
        function stableId(prefix = "wgu") {
            const rand = Math.random().toString(36).slice(2, 10);
            return `${prefix}_${Date.now().toString(36)}_${rand}`;
        }
        Ids.stableId = stableId;
        function normalizeId(value) { return String(value || "").trim(); }
        Ids.normalizeId = normalizeId;
    })(Ids = WGU.Ids || (WGU.Ids = {}));
})(WGU || (WGU = {}));
var WGU;
(function (WGU) {
    var Config;
    (function (Config) {
        Config.COMMENT_ENGINE_SCHEMA = {
            docId: "vVCvCSY3jx",
            threads: {
                tableId: "grid-TzMLOYO0fU",
                columns: {
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
                    lastMessagePreview: "c-eRyANX4Nfw",
                    lastMessageAt: "c-beMcw_mRc1",
                    lastMessageAuthorInitials: "c-rDjG0K-iWx",
                    messageCount: "c-oh33mfaoAh",
                    approxTop: "c-lfDEueqmfd",
                    approxLeft: "c-attiZRm0D9",
                    approxHeight: "c-u7i4Ysk61v",
                    approxWidth: "c-wuWNUzOhKj",
                    approxCapturedAt: "c-iXQSjWXwIN",
                    approxPageHeight: "c-dJjYz4Q_-f",
                    approxViewportHeight: "c-V8Pk52i7hb",
                    approxScrollContainer: "c--aIVn9m_15",
                    approxSource: "c-VVjair8UgE",
                    approxConfidence: "c-7KTYVjHEKc"
                }
            },
            messages: {
                tableId: "grid-Tb0THna6ie",
                columns: {
                    messageId: "c-39mx10Y-Ht",
                    threadId: "c-5C7IEoEz0Q",
                    parentMessageId: "c-Y6ZLJfnAFZ",
                    authorName: "c-nvZlX7Rwso",
                    authorEmail: "c-_OxABOEKHU",
                    authorInitials: "c-Y2f28FZCFl",
                    bodyText: "c-FdowNO2FYu",
                    messageType: "c-CBcrgslppN",
                    createdAt: "c-ZvzD9RwVRi",
                    mentionedEmails: "c-FIhMhIc3z7",
                    sourceDocId: "c-boK8ZO4dqf",
                    sourcePageUrl: "c-10dsl56D5l"
                }
            },
            access: {
                tableId: "grid-ARo8r4rHYO",
                columns: {
                    email: "c-lrplJcP7DS",
                    personName: "c-xUVXHM8pnl",
                    role: "c-5pXbotrwm8",
                    canComment: "c-DVw7wyY3cR",
                    canEditSource: "c-feVY1XO1uV",
                    canResolve: "c-HXGvBgTfH3",
                    canManageSettings: "c-VFc6OIqZSz",
                    active: "c-jImyfN8sFO",
                    sourceScope: "c-BzYCWT8kOV"
                }
            }
        };
    })(Config = WGU.Config || (WGU.Config = {}));
})(WGU || (WGU = {}));
var WGU;
(function (WGU) {
    var Settings;
    (function (Settings) {
        Settings.DEFAULTS = {
            sourceDocId: "zR7eW6CJsf",
            sourceApiToken: "",
            commentEngineDocId: WGU.Config.COMMENT_ENGINE_SCHEMA.docId,
            commentEngineApiToken: "",
            threadsTableId: WGU.Config.COMMENT_ENGINE_SCHEMA.threads.tableId,
            messagesTableId: WGU.Config.COMMENT_ENGINE_SCHEMA.messages.tableId,
            accessTableId: WGU.Config.COMMENT_ENGINE_SCHEMA.access.tableId,
            panelWidthPx: 390
        };
        function normalizeSettings(raw = {}) {
            return { ...Settings.DEFAULTS, ...raw };
        }
        Settings.normalizeSettings = normalizeSettings;
    })(Settings = WGU.Settings || (WGU.Settings = {}));
})(WGU || (WGU = {}));
var WGU;
(function (WGU) {
    var Coda;
    (function (Coda) {
        async function requestJson(url, options) {
            const response = await fetch(url, {
                method: options.method || "GET",
                headers: {
                    "Authorization": `Bearer ${options.token}`,
                    "Content-Type": "application/json"
                },
                body: options.body === undefined ? undefined : JSON.stringify(options.body)
            });
            if (!response.ok)
                throw new Error(`Coda API ${response.status}: ${await response.text()}`);
            return response.status === 204 ? null : response.json();
        }
        Coda.requestJson = requestJson;
    })(Coda = WGU.Coda || (WGU.Coda = {}));
})(WGU || (WGU = {}));
var WGU;
(function (WGU) {
    var Coda;
    (function (Coda) {
        var SourceDocClient;
        (function (SourceDocClient) {
            function docApiBase(docId) { return `https://coda.io/apis/v1/docs/${encodeURIComponent(docId)}`; }
            SourceDocClient.docApiBase = docApiBase;
        })(SourceDocClient = Coda.SourceDocClient || (Coda.SourceDocClient = {}));
    })(Coda = WGU.Coda || (WGU.Coda = {}));
})(WGU || (WGU = {}));
var WGU;
(function (WGU) {
    var Coda;
    (function (Coda) {
        var CommentEngineClient;
        (function (CommentEngineClient) {
            function tableRowsUrl(docId, tableId) {
                return `https://coda.io/apis/v1/docs/${encodeURIComponent(docId)}/tables/${encodeURIComponent(tableId)}/rows`;
            }
            CommentEngineClient.tableRowsUrl = tableRowsUrl;
            function threadProjection() {
                const c = WGU.Config.COMMENT_ENGINE_SCHEMA.threads.columns;
                return [c.threadId, c.sourceDocId, c.sourcePageUrl, c.sourcePageName, c.resolved, c.anchorExactText, c.anchorPrefix, c.anchorSuffix, c.anchorTextHash, c.lastMessagePreview, c.lastMessageAt, c.lastMessageAuthorInitials, c.messageCount, c.approxTop, c.approxPageHeight];
            }
            CommentEngineClient.threadProjection = threadProjection;
        })(CommentEngineClient = Coda.CommentEngineClient || (Coda.CommentEngineClient = {}));
    })(Coda = WGU.Coda || (WGU.Coda = {}));
})(WGU || (WGU = {}));
var WGU;
(function (WGU) {
    var Auth;
    (function (Auth) {
        function defaultAccess(email = "") {
            return { email, role: "Viewer", canComment: false, canEditSource: false, canResolve: false, canManageSettings: false, active: false };
        }
        Auth.defaultAccess = defaultAccess;
        function isEditor(access) { return !!(access.active && access.canEditSource); }
        Auth.isEditor = isEditor;
        function canComment(access) { return !!(access.active && access.canComment); }
        Auth.canComment = canComment;
    })(Auth = WGU.Auth || (WGU.Auth = {}));
})(WGU || (WGU = {}));
var WGU;
(function (WGU) {
    var Anchors;
    (function (Anchors) {
        const byThreadId = new Map();
        const byHash = new Map();
        function idsFor(anchor) {
            const ids = Array.isArray(anchor.threadIds) ? anchor.threadIds.slice() : [];
            if (anchor.threadId && !ids.includes(anchor.threadId))
                ids.unshift(anchor.threadId);
            return Array.from(new Set(ids.filter(Boolean)));
        }
        function setAnchor(anchor) {
            const ids = idsFor(anchor);
            for (const id of ids)
                byThreadId.set(id, anchor);
            if (anchor.hash)
                byHash.set(anchor.hash, anchor);
        }
        Anchors.setAnchor = setAnchor;
        function getAnchor(threadId) {
            return byThreadId.get(threadId) || null;
        }
        Anchors.getAnchor = getAnchor;
        function getAnchorByHash(hash) {
            return byHash.get(hash) || null;
        }
        Anchors.getAnchorByHash = getAnchorByHash;
        function deleteAnchor(threadId) { byThreadId.delete(threadId); }
        Anchors.deleteAnchor = deleteAnchor;
        function clearAnchors() { byThreadId.clear(); byHash.clear(); }
        Anchors.clearAnchors = clearAnchors;
        function getAllAnchors() { return Array.from(new Set([...byThreadId.values(), ...byHash.values()])); }
        Anchors.getAllAnchors = getAllAnchors;
        function hasLiveDomTarget(anchor) {
            return !!(anchor && (anchor.range || anchor.element || anchor.cell || anchor.blockElement));
        }
        Anchors.hasLiveDomTarget = hasLiveDomTarget;
    })(Anchors = WGU.Anchors || (WGU.Anchors = {}));
})(WGU || (WGU = {}));
var WGU;
(function (WGU) {
    var Anchors;
    (function (Anchors) {
        var Capture;
        (function (Capture) {
            function geometryFromRange(range, canvasRect) {
                const rect = range.getBoundingClientRect();
                const base = canvasRect || document.body.getBoundingClientRect();
                return {
                    top: Math.round(rect.top - base.top + (window.scrollY || document.documentElement.scrollTop || 0)),
                    left: Math.round(rect.left - base.left + (window.scrollX || document.documentElement.scrollLeft || 0)),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                    pageHeight: Math.round(base.height || document.documentElement.scrollHeight || 0),
                    viewportHeight: Math.round(window.innerHeight || 0)
                };
            }
            Capture.geometryFromRange = geometryFromRange;
        })(Capture = Anchors.Capture || (Anchors.Capture = {}));
    })(Anchors = WGU.Anchors || (WGU.Anchors = {}));
})(WGU || (WGU = {}));
var WGU;
(function (WGU) {
    var Anchors;
    (function (Anchors) {
        var TextMatcher;
        (function (TextMatcher) {
            function normalizeText(value) {
                return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
            }
            TextMatcher.normalizeText = normalizeText;
            function rareTokens(value, limit = 12) {
                const stop = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "are", "was", "were", "has", "have", "will", "can", "not"]);
                return Array.from(new Set(normalizeText(value).split(/[^a-z0-9]+/).filter(t => t.length > 3 && !stop.has(t)))).slice(0, limit);
            }
            TextMatcher.rareTokens = rareTokens;
        })(TextMatcher = Anchors.TextMatcher || (Anchors.TextMatcher = {}));
    })(Anchors = WGU.Anchors || (WGU.Anchors = {}));
})(WGU || (WGU = {}));
var WGU;
(function (WGU) {
    var Anchors;
    (function (Anchors) {
        var DomRangeFinder;
        (function (DomRangeFinder) {
            function isElementVisible(el) {
                const r = el.getBoundingClientRect();
                const style = getComputedStyle(el);
                return r.width > 0 && r.height > 0 && style.display !== "none" && style.visibility !== "hidden";
            }
            DomRangeFinder.isElementVisible = isElementVisible;
        })(DomRangeFinder = Anchors.DomRangeFinder || (Anchors.DomRangeFinder = {}));
    })(Anchors = WGU.Anchors || (WGU.Anchors = {}));
})(WGU || (WGU = {}));
var WGU;
(function (WGU) {
    var Anchors;
    (function (Anchors) {
        var Scoring;
        (function (Scoring) {
            function scoreCandidate(input) {
                let score = 0;
                if (input.structural)
                    score += 100;
                if (input.exact)
                    score += 70;
                if (input.prefixSuffix)
                    score += 50;
                if (input.sameHeading)
                    score += 25;
                if (input.rareTokenOverlap)
                    score += Math.min(30, input.rareTokenOverlap * 5);
                return score;
            }
            Scoring.scoreCandidate = scoreCandidate;
        })(Scoring = Anchors.Scoring || (Anchors.Scoring = {}));
    })(Anchors = WGU.Anchors || (WGU.Anchors = {}));
})(WGU || (WGU = {}));
var WGU;
(function (WGU) {
    var Anchors;
    (function (Anchors) {
        var Resolve;
        (function (Resolve) {
            function notMounted(threadId, reason) {
                return { threadId, status: "not-mounted", strategy: "none", confidence: 0, lastResolvedAt: Date.now(), failureReason: reason };
            }
            Resolve.notMounted = notMounted;
        })(Resolve = Anchors.Resolve || (Anchors.Resolve = {}));
    })(Anchors = WGU.Anchors || (WGU.Anchors = {}));
})(WGU || (WGU = {}));
var WGU;
(function (WGU) {
    var Overlays;
    (function (Overlays) {
        var TextColorRenderer;
        (function (TextColorRenderer) {
            function canRender(anchor) { return WGU.Anchors.hasLiveDomTarget(anchor); }
            TextColorRenderer.canRender = canRender;
        })(TextColorRenderer = Overlays.TextColorRenderer || (Overlays.TextColorRenderer = {}));
    })(Overlays = WGU.Overlays || (WGU.Overlays = {}));
})(WGU || (WGU = {}));
var WGU;
(function (WGU) {
    var Overlays;
    (function (Overlays) {
        var MarginIconRenderer;
        (function (MarginIconRenderer) {
            function isSafeIconY(rect) { return rect.top > 76 && rect.bottom > 76; }
            MarginIconRenderer.isSafeIconY = isSafeIconY;
        })(MarginIconRenderer = Overlays.MarginIconRenderer || (Overlays.MarginIconRenderer = {}));
    })(Overlays = WGU.Overlays || (WGU.Overlays = {}));
})(WGU || (WGU = {}));
var WGU;
(function (WGU) {
    var Overlays;
    (function (Overlays) {
        var Reflow;
        (function (Reflow) {
            let pending = false;
            function schedule(fn) {
                if (pending)
                    return;
                pending = true;
                requestAnimationFrame(() => { pending = false; fn(); });
            }
            Reflow.schedule = schedule;
        })(Reflow = Overlays.Reflow || (Overlays.Reflow = {}));
    })(Overlays = WGU.Overlays || (WGU.Overlays = {}));
})(WGU || (WGU = {}));
var WGU;
(function (WGU) {
    var Sidebar;
    (function (Sidebar) {
        var CommentCard;
        (function (CommentCard) {
            function threadIdForCard(card) { return card?.dataset?.wguThreadId || card?.dataset?.wguChatRowId || ""; }
            CommentCard.threadIdForCard = threadIdForCard;
        })(CommentCard = Sidebar.CommentCard || (Sidebar.CommentCard = {}));
    })(Sidebar = WGU.Sidebar || (WGU.Sidebar = {}));
})(WGU || (WGU = {}));
var WGU;
(function (WGU) {
    var Sidebar;
    (function (Sidebar) {
        var Registry;
        (function (Registry) {
            const byThreadId = new Map();
            function registerCard(threadId, card) { if (threadId)
                byThreadId.set(threadId, card); }
            Registry.registerCard = registerCard;
            function getCard(threadId) { return byThreadId.get(threadId) || null; }
            Registry.getCard = getCard;
            function clearCards() { byThreadId.clear(); }
            Registry.clearCards = clearCards;
        })(Registry = Sidebar.Registry || (Sidebar.Registry = {}));
    })(Sidebar = WGU.Sidebar || (WGU.Sidebar = {}));
})(WGU || (WGU = {}));
var WGU;
(function (WGU) {
    var Sidebar;
    (function (Sidebar) {
        var Events;
        (function (Events) {
            function scrollCardIntoView(card) { card.scrollIntoView({ behavior: "smooth", block: "center" }); }
            Events.scrollCardIntoView = scrollCardIntoView;
        })(Events = Sidebar.Events || (Sidebar.Events = {}));
    })(Sidebar = WGU.Sidebar || (WGU.Sidebar = {}));
})(WGU || (WGU = {}));
var WGU;
(function (WGU) {
    var Options;
    (function (Options) {
        Options.TWO_KEY_SETTINGS_VERSION = "1.10.0";
    })(Options = WGU.Options || (WGU.Options = {}));
})(WGU || (WGU = {}));
