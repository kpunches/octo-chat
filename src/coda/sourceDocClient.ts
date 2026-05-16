namespace WGU.Coda.SourceDocClient {
  export function docApiBase(docId: string): string { return `https://coda.io/apis/v1/docs/${encodeURIComponent(docId)}`; }
}
