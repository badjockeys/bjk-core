// OpenTelemetry for the web app's server (Next.js calls register() once at startup). Traces of page renders, server
// actions and the calls to the API go over OTLP to OTEL_EXPORTER_OTLP_ENDPOINT: locally the otel-lgtm container
// (http://localhost:4318, set in .env.local), Grafana Cloud when deployed. Without it nothing is exported. The
// browser sends nothing.
import { registerOTel } from "@vercel/otel";

export function register() {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return;
  }
  registerOTel({ serviceName: "bjk-web" });
}
