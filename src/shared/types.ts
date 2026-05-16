namespace WGU.Shared {
  export type AnchorStatus = "live" | "resolved" | "pending" | "not-mounted" | "ambiguous" | "orphaned";
  export type AnchorStrategy = "exact" | "structural" | "prefixSuffix" | "sentenceContext" | "headingBlock" | "tokenFallback" | "fuzzy" | "none";
  export type UserRole = "Reviewer" | "Editor" | "Admin" | "Viewer";

  export interface ExtensionSettings {
    sourceDocId: string;
    sourceApiToken: string;
    commentEngineDocId: string;
    commentEngineApiToken: string;
    threadsTableId: string;
    messagesTableId: string;
    accessTableId: string;
    panelWidthPx: number;
  }

  export interface CommentThread {
    threadId: string;
    sourceDocId: string;
    sourcePageUrl: string;
    sourcePageName?: string;
    resolved?: boolean;
    anchorExactText?: string;
    anchorPrefix?: string;
    anchorSuffix?: string;
    anchorTextHash?: string;
    currentMatchedText?: string;
    anchorApproxTop?: number;
    anchorApproxPageHeight?: number;
    lastMessagePreview?: string;
    lastMessageAt?: string;
    lastMessageAuthorInitials?: string;
    messageCount?: number;
  }

  export interface CommentMessage {
    messageId: string;
    threadId: string;
    authorName: string;
    authorEmail: string;
    authorInitials: string;
    bodyText: string;
    messageType: "comment" | "reply" | "system" | "resolve" | "reopen" | "edit" | "delete";
    createdAt: string;
  }

  export interface ResolvedAnchor {
    threadId: string;
    hash?: string;
    threadIds?: string[];
    status: AnchorStatus | string;
    strategy: AnchorStrategy | string;
    confidence: number;
    range?: Range | null;
    element?: HTMLElement | null;
    cell?: HTMLElement | null;
    blockElement?: HTMLElement | null;
    iconElement?: HTMLElement | null;
    anchorRect?: DOMRect | null;
    lastResolvedAt: number;
    failureReason?: string;
  }

  export interface UserAccess {
    email: string;
    personName?: string;
    role: UserRole;
    canComment: boolean;
    canEditSource: boolean;
    canResolve: boolean;
    canManageSettings: boolean;
    active: boolean;
  }
}
