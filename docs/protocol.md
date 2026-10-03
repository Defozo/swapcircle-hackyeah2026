# SwapCircle v1

The on-chain account is the authority for a cycle. The board discovers offers and cannot move funds. Each owner signs their own funding transaction after reviewing immutable terms. Merely appearing in a cycle or signing a published offer is not consent to transfer tokens.

## Amounts and flow

Each cycle has 2 to 4 distinct owners. Leg `i` gives an exact positive u64 amount of a classic SPL mint to owner `(i+1) mod count`. The recipient gives its own leg and receives the previous leg. The demonstration order is Alicja (100 dX), Celina (250 dZ), Bartek (40 dY). Amounts do not imply equal market value.

`Clock < deadline` permits funding. The final authorized deposit and every outgoing transfer execute in one transaction. A failing transfer rolls back that entire transaction, including its funding bit. Earlier transactions remain locked until settlement or the deadline. A non-participating last party can therefore impose an opportunity cost.

`Clock >= deadline` permits independent refunds of funded, unrefunded legs in an unsettled cycle. Refunds have no expiry. A third party may pay the transaction fee, but the token account must belong to the original owner. No other leg's accounts are needed. Missing ATAs may be recreated. A damaged ATA can be bypassed with a freshly initialized classic SPL account having the same token authority, created and refunded atomically.

Token accounts must be initialized and unfrozen, with the expected mint and authority, no delegate and no foreign close authority. Wrapped SOL, Token-2022 and freeze-enabled mints are excluded. Active mint authority is a supply risk even where the program permits it. Demo mints have neither mint nor freeze authority after issuance.

## Liability and cleanup

Vault balance is not a deposit receipt. Only funding instructions set funding bits. Unsolicited transfers neither fulfill an offer nor increase its payout. After the relevant liability is discharged, surplus belongs to the original leg owner, not its accidental sender. Empty vaults can then close and return rent to the original cycle payer. The Cycle record persists and prevents reinitialization. Transaction fees and the retained receipt's rent are not promised as refundable.

There is no administrative withdrawal, recipient edit, deadline extension, early withdrawal or separate settlement operation. Deployed code remains changeable while an upgrade authority exists. The UI reads and discloses that authority. Removing it is a distinct irreversible release step after verifying the compiled binary and test results.

## Public evidence and recovery

A recovery package contains only public terms, the cluster genesis hash, Program ID, cycle address, leg, IDL and SDK versions, and a CLI command. It needs no board database, hosting session or author key. RPC availability and SOL for fees remain necessary. Recovery cannot restore a lost owner key.

All writes are devnet or loopback localnet only. Manifest genesis is checked before writes. The SDK never interprets an RPC send response as proof of settlement. A confirmed receipt plus fresh cycle and balance reads establish the result. Unknown transaction results retain their original signature for reconciliation before another signing attempt.
