namespace WGU.Settings {
  export const DEFAULTS: WGU.Shared.ExtensionSettings = {
    sourceDocId: "zR7eW6CJsf",
    sourceApiToken: "",
    commentEngineDocId: WGU.Config.COMMENT_ENGINE_SCHEMA.docId,
    commentEngineApiToken: "",
    threadsTableId: WGU.Config.COMMENT_ENGINE_SCHEMA.threads.tableId,
    messagesTableId: WGU.Config.COMMENT_ENGINE_SCHEMA.messages.tableId,
    accessTableId: WGU.Config.COMMENT_ENGINE_SCHEMA.access.tableId,
    panelWidthPx: 390
  };

  export function normalizeSettings(raw: Partial<WGU.Shared.ExtensionSettings> = {}): WGU.Shared.ExtensionSettings {
    return { ...DEFAULTS, ...raw };
  }
}
