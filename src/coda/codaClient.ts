namespace WGU.Coda {
  export type TokenKind = "source" | "commentEngine";
  export interface CodaRequestOptions { token: string; method?: string; body?: unknown; }

  export async function requestJson(url: string, options: CodaRequestOptions): Promise<unknown> {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        "Authorization": `Bearer ${options.token}`,
        "Content-Type": "application/json"
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    if (!response.ok) throw new Error(`Coda API ${response.status}: ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  }
}
