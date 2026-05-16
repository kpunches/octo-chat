namespace WGU.Sidebar.CommentCard {
  export function threadIdForCard(card: Element | null): string { return (card as HTMLElement | null)?.dataset?.wguThreadId || (card as HTMLElement | null)?.dataset?.wguChatRowId || ""; }
}
