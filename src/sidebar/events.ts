namespace WGU.Sidebar.Events {
  export function scrollCardIntoView(card: HTMLElement): void { card.scrollIntoView({ behavior: "smooth", block: "center" }); }
}
