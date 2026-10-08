# Longwater public delivery baseline

At 16:46:15Z on 2026-10-08, both documented HTTP and HTTPS routes returned 200 from the supported native Mac receiver. At 16:56:08–09Z, all 18 runtime inputs and the actual offline download matched the complete Git blobs and lengths of longwater-demo commit `2451ec6fa29d10fa8bac53b59faf95c69fb9951c`, tree `60d5959531bef550d7af5db6ba3c1d2a2857f801`. CSS, JavaScript and WASM responses had their expected MIME types.

The framed runtime-input SHA-256 `ea98bef4ccdb5b770152b023b8adf996da9c6eba602a4a0a8588e3e1645921e8` equals the source-hash meta inside the actual 316,725-byte offline game. This establishes source delivery for the existing historical-comparison release. It does not claim browser execution or delivery of the pending practice feature.

The earlier timeout/unavailable-web observation remains preserved as an unexecuted boundary. No browser, active watch, profile, hosting, DNS or credential setting was changed. Pages metadata endpoints were unsupported by the public GitHub fetch tool; delivery identity was established through supported public source and native response bytes instead.

[receiving.json](receiving.json) retains all per-asset HTTP status, MIME type, byte length, SHA-256 and Git blob comparisons. [receive-public-baseline.cjs](receive-public-baseline.cjs) is the exact bounded read-only native receiver: at most three concurrent requests, 15-second request bounds, 1 MiB response bounds and no browser or filesystem mutation.

The practice candidate must preserve this newer 2451 source and be integrated before the final live-asset-gated, practice-only browser receiving.
