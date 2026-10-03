# Actual localnet demonstration

This recording uses the real application and deployed Solana program on the
local validator. The wallet adapter is a Playwright-only test provider. Private
keys remain in the Node process; the browser receives public keys and signatures.
The film is not proof of a devnet deployment or an installed Phantom extension.

Finish `verify:localnet` first because its adverse-account scenario temporarily
changes an ATA owner. Keep the validator running without resetting its genesis
during preparation, capture and verification.

1. Seed signed public fixture offers for the current `deployments/localnet.json`
   with `packages/matching/scripts/seed-offers.ts --cluster localnet`.
2. Start Vite on a free strict port with the localnet manifest and RPC settings.
   The capture defaults to `http://127.0.0.1:5184`; override `SWAPCIRCLE_VIDEO_URL`
   when necessary.
3. Run `node scripts/video/build.mjs` to create the local capture tools. Inject
   `SWAPCIRCLE_DEVNET_ALICE_KEY`, `SWAPCIRCLE_DEVNET_BOB_KEY` and
   `SWAPCIRCLE_DEVNET_CELINE_KEY` through psst and run
   `node submission/_video_work/prepare-refund.mjs`. These named demo actors are
   also used on localnet. This creates a separate timeout scenario and really
   deposits two token legs. It does not transfer ownership of those deposits.
4. Inject the same keys plus `SWAPCIRCLE_DEVNET_RECOVERY_KEY` through psst and run
   `node submission/_video_work/capture.mjs`. It records matching, cycle creation,
   three actual deposits, atomic settlement, and independent refunds into newly
   created owner accounts, paid by a helper. The capture downloads a recovery
   package and verifies cycle states and finalized signatures through RPC.
5. Run `python scripts/video/render.py`. Review the resulting frames and the
   complete silent film before sharing `submission/demo-localnet.mp4`.

Public source recordings, public transaction evidence, before/after token
balances, caption images, a precise montage plan and technical QC are retained in
`submission/_video_work`. The render keeps all recorded operations. If needed to
meet the 180-second limit, it applies uniform acceleration and visibly labels the
playback speed. Captions and title cards are authored explanations, not generated
application states. There is no music, voiceover, external upload, or cloud render.
