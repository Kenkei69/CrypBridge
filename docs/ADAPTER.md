# Guard Adapter v1

POST to a registered HTTPS endpoint:

```json
{"adapter_version":"x402-guard/1","test_id":"uuid","attack_type":"overpayment","envelope":{"mode":"mock","payment":{"x402Version":2,"accepted":{}}},"expected":{"decision":"block"}}
```

The complete envelope includes agentId, trusted service URL, full V2 accepted requirements, EIP-3009-shaped mock authorization, and a mockSignature marker. See `fixture()` for executable examples. This is a testing envelope, not an official x402 protocol message. An external guard must use its own independently configured trust registry; the expected result is test metadata and must never drive its decision.

Strict response (no extra keys):

```json
{"decision":"block","reason":"Payment exceeds configured maximum","risk_score":95}
```

Allowed decisions: approve, block, require_approval. Risk must be 0–100. Timeout, transport error, oversized body, malformed JSON or schema mismatch are failed tests, never approvals. Configure the origin and optional authentication token on the server before registration. Built-in secure and vulnerable fixtures execute in process and are not exceptions to outbound SSRF rules.

## Adapter registration and evidence

Registration accepts `adapterVersion: "x402-guard/1"` and optional `authenticationReference: "GUARD_SECRET_TEAM_NAME"`. References resolve only to server environment variables using that prefix; secret values are never accepted as ordinary guard database fields. `GUARD_API_TOKEN` remains a legacy fallback. Other adapter versions are rejected until implemented; no heuristic response mapping is attempted.

Stored assessment reports include each submitted envelope, parsed response/error, expected and actual decisions, result, and elapsed time. This is execution evidence, not proof that an organizer's unknown guard API is compatible. An organizer integration remains unvalidated until its contract, authorized endpoint and authentication are supplied and exercised.
