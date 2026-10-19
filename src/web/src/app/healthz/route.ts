/** For the container platform's health probe. Doesn't call the API, so a slow API doesn't restart the web app. */
export function GET() {
  return new Response("Healthy", { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
}
