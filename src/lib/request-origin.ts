/** Use the browser-facing Host: Next may normalize request.url to localhost. */
export function isSameOrigin(request: { headers: Headers; url: string }): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  const protocol = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  if (protocol !== "https" && protocol !== "http") return false;
  try {
    return origin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}
