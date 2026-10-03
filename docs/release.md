# Reproducible development and immutable release

The development program is `HkboPxfwBemtYkwfkHzMknHdiM7YP32KkU6Rgjy4LGun`.
The separately prepared final program is
`Eof8Zk6Y6GkaeawM6grb3gQQFcXEikhEHuEnT4nLyzv4`.
Preparation does not deploy a program or remove its upgrade authority.

The pinned Superteam-derived container uses Anchor 1.1.2, Agave 3.1.10, Rust
1.96.0, Node 24.14.1 and pnpm 10.33.0. Its base digest is recorded in
`.devcontainer/Dockerfile`; its course source is pinned to commit
`5c3cfe8ce036cdef9c91298c3935763d2b2412aa`. Both Cargo workspaces and pnpm have
lockfiles. Build commands use `--ignore-keys` so a disposable build keypair cannot
rewrite the declared program ID.

## Local validator

```sh
pnpm install --frozen-lockfile
pnpm setup:localnet
psst --tag swapcircle-devnet -- pnpm seed:localnet
psst SWAPCIRCLE_DEVNET_ALICE_KEY SWAPCIRCLE_DEVNET_BOB_KEY SWAPCIRCLE_DEVNET_CELINE_KEY -- pnpm exec tsx packages/matching/scripts/seed-offers.ts --manifest deployments/localnet.json
pnpm test:program
psst --tag swapcircle-devnet -- pnpm verify:localnet
pnpm run doctor -- --manifest deployments/localnet.json
```

`setup:localnet` builds the program, copies generated IDL/types, checks actual RPC
health and compares deployed ELF bytes with the built artifact. Existing
containers must be mounted to this project. An existing ledger remains intact.
If a rebuilt artifact differs, setup stops and explains the mismatch. Use
`pnpm setup:localnet -- --reset` only when replacing the local ledger is intended;
then repeat seed and signed-offer generation. Old local signatures and addresses
are evidence for the old genesis and cannot prove the new ledger's state.

New validator containers retain up to 1,000,000 ledger shreds so longer acceptance
runs can still read their earlier finalized receipts. This setting applies when
the container is recreated; setup leaves an already running container alone.
An older container may already have pruned historical transactions. Live cycle
state alone does not replace missing receipts in the devnet release gate.

The validator alone uses `seccomp=unconfined` because Agave requires `io_uring`
denied by Docker's default seccomp profile. RPC and WSS bind to loopback on the
host. The validator binds its actual container address, because Agave rejects
`0.0.0.0` as the first gossip bind address. The toolchain container does not need
that exception. No private keys are embedded in either image.

## Prepare the final address

### Własne adresy w świeżym klonie

Klucze projektu pozostają w psst jego właściciela. `init-secrets.mjs` na nowym
komputerze tworzy inne klucze, dlatego nie należy używać podanych wyżej adresów
do własnego wdrożenia. Odczytaj wyłącznie publiczne adresy:

```sh
psst SWAPCIRCLE_DEVNET_DEPLOYER_KEY SWAPCIRCLE_DEVNET_FINAL_PROGRAM_KEY -- node scripts/public-addresses.mjs
node scripts/release.mjs prepare --program-id OWN_FINAL_PROGRAM_ID --out target/releases/my-release
psst SWAPCIRCLE_DEVNET_DEPLOYER_KEY SWAPCIRCLE_DEVNET_FINAL_PROGRAM_KEY -- node scripts/release.mjs deploy --release target/releases/my-release/release.json --execute
```

Zastąp `OWN_FINAL_PROGRAM_ID` odczytanym adresem finalnego klucza. We wszystkich
dalszych poleceniach używaj `--release target/releases/my-release/release.json`,
własnego Program ID przy seedowaniu i finalizacji oraz artefaktu
`target/releases/my-release/swapcircle.so`. Własny płatnik musi mieć testowe SOL.
Nie jest wymagane wdrożenie pod cudzym adresem rozwojowym. Powstaje osobny
program, który nadal przechodzi pełny odbiór przed utratą authority.

Dla wspólnej tablicy utwórz własny projekt Convex, zapisz jego deploy key pod
`SWAPCIRCLE_CONVEX_DEPLOY_KEY` w swoim psst i ustaw publiczny URL w konfiguracji
frontendu oraz `convexUrl` manifestu. Następnie skonfiguruj tę tablicę swoim
Program ID przez `deploy-convex.ps1`. Bez własnej usługi nadal działa import i
eksport podpisanych ofert. Kolejne przykłady opisują istniejące wydanie tego
projektu; nie używaj jego stałych adresów zamiast własnych.

```sh
node scripts/release.mjs prepare --program-id Eof8Zk6Y6GkaeawM6grb3gQQFcXEikhEHuEnT4nLyzv4
pnpm run doctor -- --release target/releases/Eof8Zk6Y6GkaeawM6grb3gQQFcXEikhEHuEnT4nLyzv4/release.json --offline
```

Preparation copies the source into a separate ignored directory, substitutes the
final public address only there, builds its own ELF and IDL, and records file
digests in `release.json`. The development source and currently running validator
are untouched. A completed release directory is never overwritten; pass another
`--out target/releases/<new-name>` to prepare a new review candidate.

The prepared final ELF hash is recorded in its release JSON, alongside a source
digest and IDL digest. Before funding or deployment, inspect that record and the
intended Program ID. The final key is `SWAPCIRCLE_DEVNET_FINAL_PROGRAM_KEY`; the
deployer is `SWAPCIRCLE_DEVNET_DEPLOYER_KEY`. The development program has its own
`SWAPCIRCLE_DEVNET_PROGRAM_KEY`. Keys remain in psst.

## Deploy and accept the mutable final program

The default release directory in commands below is the final address above.
For a different directory, add `--release <path>/release.json` consistently.

```sh
# Inspection only: shows public identities, balance and estimated program rent.
psst SWAPCIRCLE_DEVNET_DEPLOYER_KEY SWAPCIRCLE_DEVNET_FINAL_PROGRAM_KEY -- node scripts/release.mjs deploy

# Sends a development-stage deployment, keeping upgrade authority.
psst SWAPCIRCLE_DEVNET_DEPLOYER_KEY SWAPCIRCLE_DEVNET_FINAL_PROGRAM_KEY -- node scripts/release.mjs deploy --execute

psst --tag swapcircle-devnet -- pnpm exec tsx scripts/seed.ts --cluster devnet --program-id Eof8Zk6Y6GkaeawM6grb3gQQFcXEikhEHuEnT4nLyzv4 --artifact-path target/releases/Eof8Zk6Y6GkaeawM6grb3gQQFcXEikhEHuEnT4nLyzv4/swapcircle.so
pnpm run doctor -- --release target/releases/Eof8Zk6Y6GkaeawM6grb3gQQFcXEikhEHuEnT4nLyzv4/release.json --manifest deployments/devnet.json
psst --tag swapcircle-devnet -- pnpm verify:devnet
```

All transaction scripts reject mainnet. Release deployment additionally checks
the devnet genesis, final key identity, source/IDL/artifact hashes, funding and
on-chain executable bytes. Signer JSON travels over stdin into a mode-0700
temporary directory inside the toolchain, is mode-0600 and is removed on exit.
CLI output from deployment is withheld because an interrupted Solana deployment
can print a temporary buffer recovery phrase.

The acceptance run must complete cycles of two, three and four participants plus
independent refunds with an unsafe ATA and a fresh safe recovery account, and
confirm balances and finalized receipts. Also perform the real-wallet checks in
the public frontend. CLI signers do not prove browser wallet compatibility.

Finalization requires all three reports described in
[release-evidence.md](release-evidence.md): program flows, independent CLI recovery,
and observed Phantom/Solflare use in the public application. The gate checks each
receipt against the current deployment slot. Run the independent recovery command
and record the actual wallet observations before proceeding. Repeat all three
after authority removal; old reports cannot be reused for final publication.

## Explicit irreversible finalization

```sh
# Inspection only. Requires complete final-program devnet acceptance evidence.
node scripts/release.mjs finalize --evidence docs/evidence/devnet-flows.json

# Only after review and explicit authorization to make this Program ID immutable:
psst SWAPCIRCLE_DEVNET_DEPLOYER_KEY -- node scripts/release.mjs finalize --evidence docs/evidence/devnet-flows.json --execute --confirm-immutable Eof8Zk6Y6GkaeawM6grb3gQQFcXEikhEHuEnT4nLyzv4
```

This separate step verifies the evidence, artifact, ProgramData and current
authority, then permanently removes upgrade authority. It reads ProgramData again
and runs `solana program show`. It cannot be reversed, and is absent from normal
setup, build, test and development-deploy commands. Existing cycles never migrate
automatically to another program.

## Repeat acceptance and publish the manifest

```sh
psst --tag swapcircle-devnet -- pnpm verify:devnet
node scripts/release.mjs publish --manifest deployments/devnet.json --evidence docs/evidence/devnet-flows.json
node scripts/release.mjs publish --manifest deployments/devnet.json --evidence docs/evidence/devnet-flows.json --execute
pnpm run doctor -- --release target/releases/Eof8Zk6Y6GkaeawM6grb3gQQFcXEikhEHuEnT4nLyzv4/release.json --manifest deployments/devnet.json
psst SWAPCIRCLE_CONVEX_DEPLOY_KEY -- powershell -File packages/matching/scripts/deploy-convex.ps1 -ProgramId Eof8Zk6Y6GkaeawM6grb3gQQFcXEikhEHuEnT4nLyzv4
psst SWAPCIRCLE_DEVNET_ALICE_KEY SWAPCIRCLE_DEVNET_BOB_KEY SWAPCIRCLE_DEVNET_CELINE_KEY -- pnpm exec tsx packages/matching/scripts/seed-offers.ts --manifest deployments/devnet.json --publish
pnpm build
```

Publishing the final manifest requires a new complete acceptance run started after
authority removal, matching artifact/genesis, null authority, successful
finalized transaction receipts, live final cycle states and demonstration mints
without mint/freeze authority. It copies the verified public manifest into the
frontend and archives the public ELF, IDL, release record and acceptance JSON in
`deployments/releases/<Program ID>/`. Publish the resulting static frontend with
the repository's hosting workflow and verify its public links separately.

Neither preparing artifacts nor publishing a local manifest constitutes a
completed devnet deployment, browser-wallet acceptance or competition submission.

