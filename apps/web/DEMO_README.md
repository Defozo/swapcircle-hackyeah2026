# Interactive SwapCircle demo

The public root URL opens a self-contained, explicitly labelled Demo. The real wallet-backed client remains available at `?mode=app#/board`; existing `#/cycle/...`, `#/board`, other client routes and offer-import links remain client links.

`?mode=demo&lang=pl` and `?mode=demo&lang=en` open the two language variants. Progress is stored only in this browser tab's session storage. Reload resumes the scenario. **Start over** resets it. No wallet, RPC, service account, network funds or secrets are used by this demo.

## Scenarios

1. Select two, three or four participants. The default example is Alicja giving 100 dX for 40 dY, Bartek giving 40 dY for 250 dZ and Celina giving 250 dZ for 100 dX.
2. Click **Find an exchange**. The existing `@swapcircle/matching` implementation verifies the public sample signatures and finds cycles. Removing a required offer produces no match. The default example has zero pairs and one three-person cycle.
3. Review exact quantities and recipients, accept the deposit lock and create the circle.
4. Deposit as participants in any order. Early deposits remain in the vault; recipients still receive zero. The last deposit immediately changes every recipient balance and completes the exchange.
5. For the other outcome, reset, create a new circle and make only some deposits. **Advance to deadline** moves the explicitly labelled demo clock to the agreed deadline. Deposits then close. Recover each actual deposit separately. A participant who never deposited has nothing to recover.

The clock is deterministic and advances through this explicit control, not wall-clock time. Token quantities and settlement/refund states are simulated. The public demo must not be described as a Devnet transaction or real wallet signature.

The signed offer fixtures use isolated public addresses, an isolated network/program context and a fixed matching timestamp. No fixture private key is stored. Their context is not the localnet or Devnet deployment manifest. The existing application, SDK and program remain separate.

## Verification

- `pnpm exec vitest run tests/frontend/demo-state.test.ts`: 4 passing tests, including all 32 deposit permutations across two, three and four participants, replay-safe state restoration, terminal guards and independent refunds.
- `pnpm --filter @swapcircle/web exec playwright test --reporter=list`: 19 passing tests and 7 configured skips on the local Vite preview. This includes six new demo tests and the existing read-only client suite. A further focused test passed for the zero-deposit outcome, current-page navigation semantics and recovery explanations in PL/EN.
- Demo browser checks cover PL/EN, desktop/mobile, missing-offer matching, successful settlement, independent refunds, refresh, reset, keyboard focus and complete graph edge/label bounds at 390 and 1440 px. The two desktop complete flows observed zero requests outside the preview origin and zero non-GET requests.
- Screenshot evidence: `docs/evidence/demo-*.png`. Native product crops for the pitch: `docs/evidence/pitch-*.png`.

These checks validate the simulated product flow and selected UI behavior. They are not new chain transactions, a full accessibility audit or proof of public deployment. Production build and publication evidence are recorded by the release task.

## CopilotKit decision

Reviewed the current [official CopilotKit documentation](https://docs.copilotkit.ai/) and [product page](https://www.copilotkit.ai/). CopilotKit supports connecting application state and interactive tools to AI agents, with chat and human approvals.

No integration was added. This product flow already has exact offer matching, visible quantities, explicit consent and deterministic settlement/refund actions. A chat intermediary adds no necessary capability to those steps. Keeping the demo deterministic also makes both outcomes repeatable for the jury. No LLM provider or secret is needed for this choice.
