// Parses a fetch Response as JSON, throwing a readable error instead of a
// cryptic "Unexpected token '<'" when the server (or an intermediary like
// Cloudflare) returns HTML/plain-text instead of JSON.
export async function parseJsonResponse(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(
      `Server returned an unexpected response (status ${res.status}). ${text.slice(0, 120)}`
    );
  }
}
