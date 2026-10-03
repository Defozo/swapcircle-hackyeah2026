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

Verified from the logs of [GitHub Actions run 37155888267](https://github.com/Defozo/swapcircle-hackyeah2026/actions/runs/37155888267), completed successfully on 3 October 2026 at 21:47 UTC for commit `d894c1e9a7115bd45649d759cd80db44a8f8c723`. The structured report, source and downloaded-log hash are in [pitch-ci.json](../../docs/evidence/pitch-ci.json).

- Vitest: **75 passed** across 10 files, including the four demo-state tests and all 32 deposit permutations across two, three and four participants.
- Node tests: **10 passed**, zero failures or skips.
- Playwright: **21 passed, 7 configured skips**, zero failures. This includes eight demo tests covering PL/EN, desktop/mobile, missing offers, settlement, independent refunds, reload/reset, keyboard focus, graph bounds and language persistence after reload. The two desktop demo flows observed no external requests or non-GET requests.
- Program: **16 SBF tests passed** in LiteSVM 0.9.1, zero failures or ignored tests. These execute the compiled program, including settlement, rollback, deadline boundaries and independent refunds.
- Root/web TypeScript checks, Vite production build and Anchor SBF build passed.

The seven skipped browser scenarios require additional localnet state: three wallet transaction tests and two transport/deadline tests require `SWAPCIRCLE_CHAIN_E2E=1`, a local validator and participant keys injected through psst; two UI tests require `SWAPCIRCLE_UX_LOCALNET=1` and existing cycle accounts. They are not counted as passing executions.

Screenshot evidence is in `docs/evidence/demo-*.png`; native pitch crops are in `docs/evidence/pitch-*.png`. The Demo remains a simulation, and the SBF tests run in LiteSVM. This CI run is not proof of new Devnet transactions, full accessibility compliance or public deployment availability. Publication and submission verification are recorded separately by the release task.

## CopilotKit decision

Reviewed the current [official CopilotKit documentation](https://docs.copilotkit.ai/) and [product page](https://www.copilotkit.ai/). CopilotKit supports connecting application state and interactive tools to AI agents, with chat and human approvals.

No integration was added. This product flow already has exact offer matching, visible quantities, explicit consent and deterministic settlement/refund actions. A chat intermediary adds no necessary capability to those steps. Keeping the demo deterministic also makes both outcomes repeatable for the jury. No LLM provider or secret is needed for this choice.
