#!/usr/bin/env bash
# The local logs, traces and metrics stack (Elasticsearch, Kibana and Elastic's OpenTelemetry collector, from
# docker-compose.yml) in CI, so a broken compose file, collector config or image tag fails here rather than on a
# developer's machine.
#
#   elastic-check.sh start    starts the three containers and waits until they're ready (before the smoke test)
#   elastic-check.sh verify   after the smoke test, which sends to the collector: checks the API's and the media
#                             worker's traces and logs reached Elasticsearch, and that Kibana is up
#
# Needs BJK_ELASTIC_PASSWORD, BJK_KIBANA_SYSTEM_PASSWORD and BJK_KIBANA_ENCRYPTION_KEY (and BJK_SQL_PASSWORD, which the
# compose file also reads), as in a developer's .env.
set -euo pipefail
cd "$(dirname "$0")/../.."

fail() { echo "::error title=Logs and traces::$*"; exit 1; }
es() { curl -s -u "elastic:$BJK_ELASTIC_PASSWORD" -H "Content-Type: application/json" "http://localhost:9200$1" "${@:2}"; }

case "${1:-}" in
  start)
    if ! docker compose up -d --wait --wait-timeout 300 elasticsearch kibana otel-collector; then
      docker compose ps -a
      for service in elasticsearch kibana-setup kibana otel-collector; do
        echo "::group::$service log"; docker compose logs --tail 80 "$service" || true; echo "::endgroup::"
      done
      fail "The Elastic containers didn't start (logs above)."
    fi
    echo "ok  Elasticsearch, Kibana and the collector are up"
    ;;

  verify)
    # count <index pattern> <service name>: documents from that service, by its OpenTelemetry resource attribute.
    count() {
      es "/$1/_count?ignore_unavailable=true&allow_no_indices=true" -X POST -d "{\"query\":{\"term\":{\"resource.attributes.service.name\":\"$2\"}}}" \
        | python3 -c 'import json,sys; print(json.load(sys.stdin).get("count", 0))'
    }
    for _ in $(seq 1 30); do
      [ "$(count 'traces-*' bjk-core-api)" -gt 0 ] && [ "$(count 'logs-*' bjk-core-api)" -gt 0 ] && break
      sleep 2
    done
    for service in bjk-core-api bjk-media-worker; do
      traces=$(count 'traces-*' "$service"); logs=$(count 'logs-*' "$service"); metrics=$(count 'metrics-*' "$service")
      echo "$service: $traces spans, $logs log records, $metrics metric documents"
    done
    [ "$(count 'traces-*' bjk-core-api)" -gt 0 ] || { es "/_cat/indices?v"; docker compose logs --tail 80 otel-collector; fail "No traces from bjk-core-api reached Elasticsearch."; }
    [ "$(count 'logs-*' bjk-core-api)" -gt 0 ] || fail "No logs from bjk-core-api reached Elasticsearch."
    [ "$(count 'traces-*' bjk-media-worker)" -gt 0 ] || [ "$(count 'logs-*' bjk-media-worker)" -gt 0 ] \
      || fail "Nothing from bjk-media-worker reached Elasticsearch."
    [ "$(count 'metrics-*' bjk-core-api)" -gt 0 ] \
      || echo "::warning title=Logs and traces::No metrics from bjk-core-api yet (they're sent every few seconds; the app may have stopped first)."
    echo "ok  the API's and the worker's traces and logs are in Elasticsearch"

    status=$(curl -s -u "elastic:$BJK_ELASTIC_PASSWORD" http://localhost:5601/api/status \
      | python3 -c 'import json,sys; print(json.load(sys.stdin)["status"]["overall"]["level"])' || true)
    [ "$status" = "available" ] || fail "Kibana's status is '${status:-unreachable}', not available."
    echo "ok  Kibana is available"
    ;;

  *)
    echo "Usage: $0 start|verify" >&2; exit 2 ;;
esac
