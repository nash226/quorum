# API Deployment Guide

Quorum's HTTP API is a local verification service, not an internet-facing
authentication gateway. The server does not implement user accounts, API keys,
or bearer-token validation. Treat the network boundary around the process as
part of the deployment: keep the default loopback binding for same-host jobs,
or put a trusted reverse proxy, private network, or service-mesh policy in
front of a deliberately broader bind address.

## Choose the network boundary

The CLI binds to `127.0.0.1` by default:

```bash
quorum serve --host 127.0.0.1 --port 3000
```

For a private service that is reached by another workload, bind to the
interface exposed by that private network and enforce authentication and
authorization at the proxy or platform layer. Do not treat CORS as access
control: `--cors-origin` limits browser origins, but it does not authenticate
non-browser callers. Replace the permissive local-development default with an
explicit origin allowlist when a browser client is deployed:

```bash
quorum serve \
  --host 0.0.0.0 \
  --port 3000 \
  --cors-origin https://console.example.com
```

Only use a public or broadly reachable bind address when an external gateway
provides the required TLS, authentication, authorization, rate limiting, and
request logging. Quorum's request ID can connect gateway logs to service logs;
send `X-Quorum-Request-Id` when the caller already has a trace identifier.

## Set operational limits

The service rejects JSON bodies larger than 1 MiB and aborts requests after 30
seconds by default. Set limits that match the workload, especially when
uploading base64-encoded PDF or DOCX content, and confirm the effective values
through `GET /capabilities`:

```bash
quorum serve \
  --host 127.0.0.1 \
  --port 3000 \
  --max-request-bytes 8388608 \
  --request-timeout-ms 30000
```

Use `/readyz` for readiness checks and `/livez` for process liveness. Probe
responses are uncached; verification, reviewer-import, evaluation, and error
responses are also marked `Cache-Control: no-store` because they can contain
business evidence or reviewer decisions.

The programmatic `startApiServer()` helper returns an idempotent `close()`
function. Call it from both `SIGINT` and `SIGTERM` handlers, or from multiple
cleanup paths, without needing a separate shutdown race guard.

## Preserve durable source identity

Authentication protects who can call the service; source IDs explain what an
approved record was. When a workflow already has a durable identifier from its
policy repository, include it as `sources[].id` on `/verify` and
`/verify-batch` requests. Quorum carries that value into report sources,
claim-level evidence, reviewer CSVs, and evaluation summaries. Do not use a
temporary file path as the long-term identity when a repository ID or version
is available.

Keep the identifier stable across retries and include a version or revision
when the source content changes, for example:

```json
{
  "id": "people-ops/hr-policy@2026-07-14",
  "sourcePath": "sources/hr-policy.md",
  "content": "Employees receive 12 weeks of paid parental leave."
}
```

Clients can discover the complete request and response shape from
`/openapi.json`, and can revalidate that contract with its `ETag`. See the
[HTTP API integration guide](api-integration.md) for request examples and
artifact options.

## Deployment checklist

- Keep the service loopback-only unless a private network or authenticated
  gateway is in place.
- Configure explicit browser origins; remember that CORS is not authentication.
- Set request-size and timeout limits for the expected workload.
- Wire `/readyz` and `/livez` to the platform's probes.
- Forward or generate `X-Quorum-Request-Id` for traceable workflow calls.
- Send stable, versioned `sources[].id` values for audit-ready evidence.
- Keep `/openapi.json` and `/capabilities` available to the integration that
  negotiates the running contract.
