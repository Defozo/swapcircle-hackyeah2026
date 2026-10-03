# Program and safety contract

SwapCircle accepts two to four distinct token owners in flow order. Leg `i` gives
its exact amount to owner `(i+1)%N`. Proposing a cycle grants no transfer authority.
Each owner signs `fund_and_maybe_settle` with the immutable terms hash. The last
funding transaction includes every transfer, so an error rolls back its deposit,
the funding bitmap and all payouts. Previously funded legs remain refundable.

`Clock < deadline` permits funding. `Clock >= deadline` permits independent
refunds of funded, unresolved legs. A refund requires no creator signature and no
other participant's vault, mint or token account. Its destination must be a safe
classic SPL account controlled by the recorded depositor. Any fee payer can
create a fresh token account and combine initialization and refund atomically.

There is no operator withdrawal, deadline extension, editable recipient, early
withdrawal, separate settlement instruction or protocol fee. The upgradeable
loader remains a separate trust boundary until the final release removes its
upgrade authority. Development deployments do not claim immutability.

Every vault is an isolated PDA with cycle authority. Direct token transfers to a
vault do not set funding bits. A funded amount can be discharged only once, by a
successful whole-cycle settlement or its own refund. Surplus returns only to the
original leg owner after that leg has no liability. Cleanup returns empty-vault
rent to the recorded creator and never deletes the cycle receipt. Prefunded
system PDA accounts are topped up, allocated and assigned safely; conflicting
initialized accounts are rejected atomically.

Supported assets are classic SPL mints without freeze authority, excluding
wrapped SOL. Token-2022 is rejected. Both source and payout accounts must be
initialized, unfrozen, have the expected mint and actual token owner, no delegate,
and no foreign close authority. Settlement also requires canonical ATA addresses.
Vaults cannot have any close authority. Matching and valuation are outside this
program; consent applies only to the stored amounts and flow order.

The ABI and generated client type are in `packages/sdk/idl/`. Cycle space is 419
bytes including its discriminator. Amounts and nonce use little-endian u64;
deadline is little-endian i64. The terms hash is SHA-256 of the UTF-8 domain
`SwapCircle:terms:v1`, program ID, cycle PDA, nonce, deadline, one-byte leg count,
then each active `{owner32,mint32,amount8,decimals1}` in flow order.

Build with `anchor build --ignore-keys` in the pinned devcontainer. `--ignore-keys`
preserves the declared public program ID when a local build generates a disposable
program keypair. Deployment uses the dedicated psst key, never that disposable
build keypair. `pnpm setup:localnet` provisions the toolchain and verifies actual
RPC health plus program bytes. It preserves an existing ledger. Passing `--reset`
explicitly replaces the local ledger and requires new seeding.

`pnpm test:program` executes the compiled ELF in LiteSVM with the real SPL program,
including controlled deadline boundaries, account attacks, all funding
permutations, single-discharge and conservation properties. Test fixtures are
synthetic. These tests do not replace public devnet and wallet acceptance.
