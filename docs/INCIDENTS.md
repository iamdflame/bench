# Failure modes, and what happens

D3 in the teardown: *"What happens when an RPC goes down mid-settlement? When
an agent's endpoint dies while holding a mandate? When a session expires with
an open position? None of this is specified."*

It is specified here. Each entry says what the system does on its own, what a
human has to do, and — where the honest answer is "nothing yet" — that.

---

## An RPC fails mid-settlement

**What happens.** Nothing is half-applied. Settlement is a single transaction:
either `proposeEpoch` lands or it does not. A proposal that never lands leaves
the epoch unsettled and `lastSettledAt` unchanged, so the next attempt is
identical to the first.

**What the system does.** Every read path holds a provider list and tries them
in order. A window that every provider refuses is recorded as a **gap**, never
as an empty result — the distinction that stops a rate-limited node from
looking like a missing measurement.

**What a human does.** Re-run `npm run settle -- settle <id>`. It is
idempotent: the contract rejects a second proposal for an epoch that already
has one.

**What is not handled.** If every provider is down for longer than an epoch,
epochs queue up and settle late. The contract does not penalise a late
settlement, and a principal cannot currently force one.

## An agent's endpoint dies while it holds a mandate

**What happens.** The mandate continues. An endpoint is how an agent is
*reached*, not how it is *measured* — settlement reads its wallet, and a wallet
does not need an endpoint to be valued.

**What the system does.** The next assay sweep drops its fineness, so it falls
off rung 2 and, if the gate is on, can no longer bid for new mandates. Standing
is revocable by design.

**What a human does.** Nothing is required. If the agent also stops managing
the position, the mandate settles negative and the ordinary machinery — strikes,
slashing, dismissal, succession — applies without anyone intervening.

## A session expires with an open position

**What happens.** The agent stops being able to act. The position stays where
it is; the session key bounded what the agent could *do*, never what the
principal *owns*.

**What the system does.** `/authority` shows the expiry counting down before it
lapses. The keeper revokes on dismissal, and expiry needs no keeper — it is
enforced by the wallet.

**What a human does.** Re-grant with `npm run grant -- <id> <category>`, which
re-derives the scope from the chain and may return a **narrower** allowlist
than before if the agent's demonstrated capability has aged out of the window.

**What is not handled.** Nothing closes an open position on expiry. An agent
whose session lapses mid-strategy leaves the position for the principal to
handle, and the principal has always been able to: it never surrendered its
keys.

## A fired agent still holds a live key

**Fixed, and it used to be true.** The contract removed an agent from a mandate
and the session key it held went on working. `npm run keeper` watches
`AgentDismissed` and revokes the matching session, recording the dismissal
transaction beside the revocation.

**What is not handled.** The keeper is a process someone has to run. If it is
down, a dismissed agent keeps a working key until it is restarted — bounded by
the session's own expiry, not by us.

## The adjudicator's key is compromised

**What it can do.** Propose a false settlement, and publish or revoke an
assayed fineness.

**What it cannot do.** Move principal capital to itself. Finalise a challenged
settlement. Withdraw a bond. Change the market's owner. Those are the owner's,
and the owner is a different key.

**What the system does.** Since v2 a proposal costs a stake and anyone may
contradict it for the same block, so a false settlement is expensive and
publicly disputable rather than silent.

**What a human does.** `nominateAdjudicator`, then the nominee accepts —
two-step, so a typo cannot orphan the role. `setPaused(true)` halts everything
that moves value while it is sorted out; withdrawals stay open, because a halt
must not trap funds already owed.

## The owner's key is compromised

**The worst case, and it is stated rather than minimised.** The owner resolves
challenges and slashes, sets parameters, and can pause. It cannot mint, cannot
withdraw a principal's capital, and cannot take an agent's bond — value only
ever moves by pull payment to the account it is credited to.

**What is not handled.** There is no multisig and no timelock. That is the
single largest adoption gap in this system and it is listed as one in
`ADOPTION.md` rather than papered over.

## 8004scan is down or rate-limiting

**What happens.** Registry-derived numbers stop refreshing. Chain-derived ones
are unaffected — the ladder's upper rungs, every attestation, the whole
verifier.

**What the system does.** The index merges rather than replaces, so a failed
run leaves coverage where it was instead of shrinking it. Every row carries
`lastSeen`, so a stale row is visibly stale. An agent whose detail cannot be
fetched is marked inconclusive, never "no evidence".

## Greenfield is unreachable

**What happens.** The working behind an attestation cannot be read. Verification
is unaffected: the observation is emitted whole in the settlement log, so the
arithmetic of every settlement is checkable from the chain alone. That is why
the preimage is in the event and not only in Greenfield.

---

## Contact

There is no on-call rotation, because there is no team yet. The runbook in
[`ADOPTION.md`](ADOPTION.md) is written so that someone who is not the author
can operate this, which is the honest version of an incident process for a
project of this size.
