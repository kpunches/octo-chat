/**
 * Reference skeleton only.
 *
 * This server demonstrates the contract expected by the extension.
 * The actual native Coda comment implementation must run inside a WGU-approved
 * environment that can call Coda MCP comment_add/comment_resolve, or an approved
 * equivalent native Coda comment mechanism.
 */

import express from "express";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.post("/coda/native-comment", async (req, res) => {
  const payload = req.body;

  if (!payload || !payload.docId || !payload.action) {
    return res.status(400).json({ error: "Missing docId/action." });
  }

  // TODO: authenticate the extension/user.
  // TODO: authorize the doc/table/row/page against WGU RBAC.
  // TODO: call Coda MCP:
  //   create_thread -> comment_add add_to_row/add_to_page
  //   add_reply     -> comment_add add_reply
  //   resolve_thread -> comment_resolve resolve
  //
  // TODO: verify whether @mentions generated through native Coda comments
  // trigger Coda notifications/email. If not, invoke WGU fallback notification.

  return res.json({
    nativeSyncStatus: "Disabled",
    mentionNotificationStatus: "Fallback Needed",
    threadUri: payload.threadUri || "",
    threadUrl: "",
    message: "Reference skeleton only. Wire this endpoint to Coda MCP in WGU infrastructure."
  });
});

app.listen(process.env.PORT || 8080, () => {
  console.log("WGU Coda native comment bridge reference listening.");
});
