# x402 Guardian — Policy Engine & Security Specification

This document provides the formal engineering specification for the Blue Team Guardian security engine, atomic spending reservations, cryptographic execution permits, and policy evaluation rules.

---

## 1. Architectural Role & Boundary

The Blue Team Guardian acts as a deterministic, server-enforced security firewall positioned between the explicit user approval and the simulation signer.

```
+-------------------------------------------------------------------------------+
|                             UNTRUSTED ZONE                                    |
|  - Merchant 402 Requirements  - AI / LLM Output  - Browser Client Fields      |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                             GUARDIAN GATE                                     |
|                                                                               |
|  1. Approval Snapshot Integrity (Immutable Server vN)                         |
|  2. Parameter Exactness (Amount, Recipient, Asset, Network, Scheme)           |
|  3. Spending Policy Check (Per-Payment, Per-Task, Daily UTC Window)           |
|  4. Atomic Budget Reservation (SELECT ... FOR UPDATE)                         |
|  5. Cryptographic Execution Permit Issuance (HMAC-SHA256)                     |
|  6. Decision Persistence (Append-Only Ledger)                                 |
+---------------------------------------+---------------------------------------+
                                        |
                         +--------------+--------------+
                         |                             |
                     ALLOW (Permit)               BLOCK (Zero-Loss)
                         |                             |
                         v                             v
+----------------------------------+        +-----------------------------------+
|    CONSTRAINED SIMULATION SIGNER |        | Execution Terminated:             |
|  - Verify Permit HMAC            |        | - No Signature Emitted            |
|  - Verify Worker Fencing Token   |        | - Zero Settlement Calls           |
|  - Verify Active DB Reservation  |        | - Reservation Safely Released     |
+----------------------------------+        +-----------------------------------+
```

---

## 2. Policy Scopes & Limits

Spending policies are asset- and network-specific. Accounting is performed using base-unit integer strings (e.g. `1000000` = 1.000000 USDC) without floating-point arithmetic.

| Policy Scope | Parameter Name | Default Limit | Description |
| :--- | :--- | :--- | :--- |
| **Per-Payment** | `maxAmountPerPayment` | `100,000,000` (100 USDC) | Maximum amount permissible in a single purchase execution. |
| **Per-Task** | `maxAmountPerTask` | `200,000,000` (200 USDC) | Maximum cumulative spend allowed across all attempts bound to a purchase task. |
| **Daily Window** | `maxAmountPerDailyWindow` | `500,000,000` (500 USDC) | Maximum cumulative spend across all settled + active reservations in the UTC calendar day. |
| **Window Reset** | `dailyWindowSeconds` | `86,400` (24 Hours) | UTC calendar day boundary: window resets daily at `00:00:00 UTC`. |

---

## 3. Stable Reason Codes Reference

The Guardian evaluates 24 deterministic reason codes across 6 categories. Each decision is stored with its reason code, safe explanation, risk score, and structured check telemetry.

| Reason Code | Category | Default Outcome | Risk Score | User-Facing Explanation |
| :--- | :--- | :---: | :---: | :--- |
| `AUTHORIZED` | Authorization | `ALLOW` | 0 | Payment parameters verified against approval snapshot and budget policy. |
| `AMOUNT_MISMATCH` | Integrity | `BLOCK` | 85 | Proposed payment amount does not match the exact approved purchase terms. |
| `RECIPIENT_MISMATCH` | Integrity | `BLOCK` | 90 | Proposed recipient address does not match the approved merchant address. |
| `ASSET_NOT_ALLOWED` | Integrity | `BLOCK` | 75 | Proposed payment asset is not authorized or does not match approved terms. |
| `NETWORK_NOT_ALLOWED` | Integrity | `BLOCK` | 75 | Execution network is not supported or does not match approved terms. |
| `SCHEME_NOT_ALLOWED` | Protocol | `BLOCK` | 70 | Payment scheme is not supported. Pinned execution requires 'exact'. |
| `APPROVAL_EXPIRED` | Validity | `BLOCK` | 50 | The approval snapshot has expired. Fresh explicit approval required. |
| `APPROVAL_SUPERSEDED` | Validity | `BLOCK` | 60 | A newer version of this purchase intent has superseded this approval. |
| `APPROVAL_REJECTED` | Validity | `BLOCK` | 80 | This purchase intent was explicitly rejected by the user. |
| `SNAPSHOT_NOT_FOUND` | State | `BLOCK` | 85 | Immutable approval snapshot not found for this execution attempt. |
| `OWNERSHIP_VIOLATION` | Security | `BLOCK` | 95 | User does not own the referenced purchase intent or approval snapshot. |
| `LIMIT_EXCEEDED_PAYMENT` | Policy | `BLOCK` | 40 | Proposed amount exceeds the maximum configured limit for a single payment. |
| `LIMIT_EXCEEDED_TASK` | Policy | `BLOCK` | 45 | Cumulative spending for this task exceeds the configured task limit. |
| `LIMIT_EXCEEDED_DAILY` | Policy | `BLOCK` | 50 | Total daily spending including active reservations exceeds the daily allowance. |
| `POLICY_NOT_FOUND` | Policy | `BLOCK` | 60 | No active spending policy found for the specified asset and network. |
| `KILL_SWITCH_ACTIVE` | Administrative | `BLOCK` | 90 | Emergency administrative kill switch is active. All payments paused. |
| `PERMIT_INVALID` | Cryptographic | `BLOCK` | 95 | Execution permit HMAC signature verification failed. |
| `PERMIT_EXPIRED` | Cryptographic | `BLOCK` | 60 | Execution permit has expired. Permits are valid for 5 minutes. |
| `RESERVATION_MISSING` | Accounting | `BLOCK` | 80 | No active spending reservation found in database for this execution. |
| `RESERVATION_EXPIRED` | Accounting | `BLOCK` | 65 | Spending reservation window has expired before settlement was reached. |
| `STALE_WORKER_FENCING` | Concurrency | `BLOCK` | 75 | Worker lease was superseded by a newer worker lease generation. |
| `DUPLICATE_SETTLEMENT` | Replay | `BLOCK` | 90 | This purchase has already completed settlement on the ledger. |
| `PROMPT_INJECTION_FLAG` | Security | `BLOCK` | 85 | Adversarial prompt content or instruction tampering detected. |
| `INTERNAL_ERROR` | System | `BLOCK` | 30 | Guardian evaluation encountered an unexpected internal error. |

---

## 4. Atomic Spending Reservation Lifecycle

Reservations ensure that spending limits cannot be exceeded under concurrent execution.

```
               [Purchase Intent Approved]
                           |
                           v
              +--------------------------+
              |   RESERVED (Held Spend)  | <------+
              +--------------------------+        |
                           |                      |
            +--------------+--------------+       |
            |                             |       |
    Settlement 200 OK             Definitive Rejection
            |                             |       |
            v                             v       |
+------------------------+   +------------------------+
| COMMITTED (Permanent)  |   |   RELEASED (Returned)  |
+------------------------+   +------------------------+
            ^
            | (Settled on Ledger)
     Delivery Failure
```

1. **`RESERVED`**:
   - Created atomically in `reserveSpendingBudget()` using `SELECT ... FOR UPDATE` row-level locks on user policy.
   - Holds the exact approved amount against the daily allowance.
   - Retained during network timeouts, lost responses, and ambiguous states (`RECONCILIATION_REQUIRED`).
2. **`COMMITTED`**:
   - Transitioned upon successful HTTP 200 mock merchant settlement or resource delivery failure where settlement occurred.
   - Recorded as settled spend for the remainder of the UTC window.
   - Once `COMMITTED`, the reservation can never be released or rolled back.
3. **`RELEASED`**:
   - Transitioned only upon definitive settlement rejection (e.g. 402 rejection, policy violation, or explicit user cancellation).
   - Returns the reserved allowance to the user's available daily pool.

---

## 5. Cryptographic Execution Permit Specification

An `ExecutionPermit` is issued exclusively by the Guardian when all policy and integrity checks evaluate to `ALLOW`.

```typescript
export interface ExecutionPermit {
  permitId: string;           // Unique permit identity: perm_<uuid>
  executionId: string;        // Bound payment execution ID
  intentId: string;           // Bound purchase intent ID
  snapshotId: string;         // Bound immutable approval snapshot ID
  approvalVersion: number;    // Bound intent version
  policyId: string;           // Evaluated policy ID
  policyVersion: number;      // Evaluated policy version
  reservationId: string;      // Active spending reservation ID
  fencingToken: number;       // Current worker lease fencing token
  recipientAddress: string;   // Canonical recipient address (0x...)
  amount: string;             // Exact base-unit amount integer string
  assetIdentifier: string;    // Pinned USDC contract address
  networkIdentifier: string;  // Pinned Base Sepolia identifier (eip155:84532)
  issuedAt: string;           // ISO 8601 evaluation timestamp
  expiresAt: string;          // ISO 8601 permit expiry (now + 300s)
  hmacSignature: string;      // Server-side HMAC-SHA256 integrity token
}
```

The HMAC signature covers the canonical string:
```
`${permitId}:${executionId}:${intentId}:${snapshotId}:${approvalVersion}:${policyVersion}:${reservationId}:${fencingToken}:${amount}:${recipientAddress}:${networkIdentifier}:${assetIdentifier}:${issuedAt}:${expiresAt}`
```
The simulation signer independently validates this HMAC before signing. Any alteration of recipient, amount, or fencing token causes permit verification failure.

---

## 6. Worker Lease Fencing Tokens

To protect against stale workers mutating state or submitting settlement challenges after lease expiration:
1. Each execution lease acquisition atomically increments `fencing_token = execution.fencingToken + 1`.
2. All subsequent worker updates include `WHERE id = :id AND fencing_token = :fencingToken`.
3. If a stale worker attempts a mutation after a new worker has taken over the lease, the fencing token mismatch raises HTTP 409 `STALE_WORKER_FENCING_TOKEN`.

---

## 7. Administrative Controls & Role Elevation Boundary

- **Administrative Routes**:
  - `PUT /api/v1/admin/guardian/policy` — Configures spending limits for an asset/network.
  - `POST /api/v1/admin/kill-switch` — Toggles emergency kill switch.
- **Role Isolation**:
  - `PATCH /api/v1/auth/profile` strips and rejects all client-supplied `role` properties.
  - Administrative endpoints require `request.user.role === 'admin'` from verified server session tokens. Unauthenticated users receive 401; ordinary authenticated users receive 403 `FORBIDDEN`.
