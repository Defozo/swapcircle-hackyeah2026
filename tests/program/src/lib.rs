//! Executes the compiled SBF artifact, including real SPL Token CPI, in LiteSVM.
//! Fixtures directly initialize supported SPL accounts, not program state.
#[cfg(test)]
mod tests {
    use litesvm::{types::TransactionMetadata, LiteSVM};
    use sha2::{Digest, Sha256};
    use solana_account::Account;
    use solana_address::Address;
    use solana_clock::Clock;
    use solana_instruction::{AccountMeta, Instruction};
    use solana_keypair::Keypair;
    use solana_message::Message;
    use solana_signer::Signer;
    use solana_transaction::Transaction;
    use std::str::FromStr;

    fn addr(s: &str) -> Address {
        Address::from_str(s).unwrap()
    }
    fn program() -> Address {
        addr(
            &std::env::var("SWAPCIRCLE_TEST_PROGRAM_ID")
                .unwrap_or_else(|_| "HkboPxfwBemtYkwfkHzMknHdiM7YP32KkU6Rgjy4LGun".to_string()),
        )
    }
    fn artifact_path() -> String {
        std::env::var("SWAPCIRCLE_TEST_ARTIFACT")
            .unwrap_or_else(|_| "../../target/deploy/swapcircle.so".to_string())
    }
    fn token() -> Address {
        addr("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
    }
    fn system() -> Address {
        Address::default()
    }
    fn ata(owner: Address, mint: Address) -> Address {
        Address::find_program_address(
            &[owner.as_ref(), token().as_ref(), mint.as_ref()],
            &addr("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
        )
        .0
    }
    fn rw(a: Address) -> AccountMeta {
        AccountMeta::new(a, false)
    }
    fn ro(a: Address) -> AccountMeta {
        AccountMeta::new_readonly(a, false)
    }
    fn data(name: &str) -> Vec<u8> {
        Sha256::digest(format!("global:{name}").as_bytes())[..8].to_vec()
    }
    fn put_token(svm: &mut LiteSVM, address: Address, mint: Address, owner: Address, amount: u64) {
        let mut data = vec![0; 165];
        data[..32].copy_from_slice(mint.as_ref());
        data[32..64].copy_from_slice(owner.as_ref());
        data[64..72].copy_from_slice(&amount.to_le_bytes());
        data[108] = 1;
        svm.set_account(
            address,
            Account {
                lamports: 2_039_280,
                data,
                owner: token(),
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
    }
    struct Fixture {
        svm: LiteSVM,
        payer: Keypair,
        owners: Vec<Keypair>,
        mints: Vec<Address>,
        sources: Vec<Address>,
        destinations: Vec<Address>,
        amounts: Vec<u64>,
        decimals: Vec<u8>,
        cycle: Address,
        vaults: Vec<Address>,
        nonce: u64,
        deadline: i64,
    }
    impl Fixture {
        fn new(n: usize) -> Self {
            Self::with_amounts((0..n).map(|i| 100 + i as u64 * 37).collect())
        }
        fn with_amounts(amounts: Vec<u64>) -> Self {
            let n = amounts.len();
            let mut svm = LiteSVM::new();
            svm.add_program_from_file(program(), artifact_path())
                .expect("Run anchor build first; SBF artifact must be real");
            let payer = Keypair::new();
            svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
            let owners: Vec<_> = (0..n).map(|_| Keypair::new()).collect();
            let mints: Vec<_> = (0..n).map(|_| Address::new_unique()).collect();
            let decimals: Vec<_> = (0..n).map(|i| if i % 2 == 0 { 0 } else { 6 }).collect();
            let sources: Vec<_> = (0..n).map(|i| ata(owners[i].pubkey(), mints[i])).collect();
            let destinations: Vec<_> = (0..n)
                .map(|i| ata(owners[(i + 1) % n].pubkey(), mints[i]))
                .collect();
            for i in 0..n {
                svm.airdrop(&owners[i].pubkey(), 10_000_000).unwrap();
                let mut mint = vec![0; 82];
                mint[36..44].copy_from_slice(&amounts[i].to_le_bytes());
                mint[44] = decimals[i];
                mint[45] = 1;
                svm.set_account(
                    mints[i],
                    Account {
                        lamports: 1_461_600,
                        data: mint,
                        owner: token(),
                        executable: false,
                        rent_epoch: 0,
                    },
                )
                .unwrap();
                put_token(
                    &mut svm,
                    sources[i],
                    mints[i],
                    owners[i].pubkey(),
                    amounts[i],
                );
                put_token(
                    &mut svm,
                    destinations[i],
                    mints[i],
                    owners[(i + 1) % n].pubkey(),
                    0,
                );
            }
            let nonce = 77u64;
            let deadline = 1000;
            let cycle = Address::find_program_address(
                &[b"cycle", payer.pubkey().as_ref(), &nonce.to_le_bytes()],
                &program(),
            )
            .0;
            let vaults = (0..n)
                .map(|i| {
                    Address::find_program_address(
                        &[b"vault", cycle.as_ref(), &[i as u8]],
                        &program(),
                    )
                    .0
                })
                .collect();
            let mut fixture = Self {
                svm,
                payer,
                owners,
                mints,
                sources,
                destinations,
                amounts,
                decimals,
                cycle,
                vaults,
                nonce,
                deadline,
            };
            fixture.time(100);
            fixture
        }
        fn n(&self) -> usize {
            self.owners.len()
        }
        fn time(&mut self, timestamp: i64) {
            let mut c = self.svm.get_sysvar::<Clock>();
            c.unix_timestamp = timestamp;
            self.svm.set_sysvar(&c);
            self.svm.expire_blockhash();
        }
        fn send(
            &mut self,
            ix: Instruction,
            owner: Option<usize>,
        ) -> Result<TransactionMetadata, String> {
            self.svm.expire_blockhash();
            let mut signers: Vec<&Keypair> = vec![&self.payer];
            if let Some(i) = owner {
                signers.push(&self.owners[i]);
            }
            let tx = Transaction::new(
                &signers,
                Message::new(&[ix], Some(&self.payer.pubkey())),
                self.svm.latest_blockhash(),
            );
            let bytes = bincode::serialize(&tx).unwrap().len();
            assert!(bytes <= 1232, "legacy transaction {bytes} exceeds1232");
            self.svm
                .send_transaction(tx)
                .map_err(|e| format!("{:?}\n{}", e.err, e.meta.logs.join("\n")))
        }
        fn create_ix(&self) -> Instruction {
            let mut bytes = data("create_cycle");
            bytes.extend(self.nonce.to_le_bytes());
            bytes.extend(self.deadline.to_le_bytes());
            bytes.extend((self.n() as u32).to_le_bytes());
            let mut accounts = vec![
                AccountMeta::new(self.payer.pubkey(), true),
                rw(self.cycle),
                ro(system()),
                ro(token()),
            ];
            for i in 0..self.n() {
                bytes.extend(self.owners[i].pubkey().as_ref());
                bytes.extend(self.mints[i].as_ref());
                bytes.extend(self.amounts[i].to_le_bytes());
                bytes.push(self.decimals[i]);
                accounts.extend([ro(self.mints[i]), rw(self.vaults[i])]);
            }
            Instruction {
                program_id: program(),
                data: bytes,
                accounts,
            }
        }
        fn create(&mut self) {
            self.send(self.create_ix(), None).unwrap();
        }
        fn hash(&self) -> [u8; 32] {
            let mut bytes = b"SwapCircle:terms:v1".to_vec();
            bytes.extend(program().as_ref());
            bytes.extend(self.cycle.as_ref());
            bytes.extend(self.nonce.to_le_bytes());
            bytes.extend(self.deadline.to_le_bytes());
            bytes.push(self.n() as u8);
            for i in 0..self.n() {
                bytes.extend(self.owners[i].pubkey().as_ref());
                bytes.extend(self.mints[i].as_ref());
                bytes.extend(self.amounts[i].to_le_bytes());
                bytes.push(self.decimals[i]);
            }
            Sha256::digest(&bytes).into()
        }
        fn fund_ix(&self, i: usize) -> Instruction {
            let mut bytes = data("fund_and_maybe_settle");
            bytes.push(i as u8);
            bytes.extend(self.hash());
            let mut accounts = vec![
                rw(self.cycle),
                AccountMeta::new_readonly(self.owners[i].pubkey(), true),
                rw(self.sources[i]),
                ro(token()),
            ];
            for j in 0..self.n() {
                accounts.extend([
                    ro(self.mints[j]),
                    rw(self.vaults[j]),
                    rw(self.destinations[j]),
                ]);
            }
            Instruction {
                program_id: program(),
                data: bytes,
                accounts,
            }
        }
        fn fund(&mut self, i: usize) -> Result<TransactionMetadata, String> {
            self.send(self.fund_ix(i), Some(i))
        }
        fn return_ix(&self, name: &str, i: usize, destination: Address) -> Instruction {
            let mut bytes = data(name);
            bytes.push(i as u8);
            Instruction {
                program_id: program(),
                data: bytes,
                accounts: vec![
                    rw(self.cycle),
                    rw(self.vaults[i]),
                    ro(self.mints[i]),
                    rw(destination),
                    ro(token()),
                ],
            }
        }
        fn refund(&mut self, i: usize) -> Result<TransactionMetadata, String> {
            self.send(self.return_ix("refund", i, self.sources[i]), None)
        }
        fn close_ix(&self, i: usize) -> Instruction {
            let mut bytes = data("close_empty_vault");
            bytes.push(i as u8);
            Instruction {
                program_id: program(),
                data: bytes,
                accounts: vec![
                    rw(self.cycle),
                    rw(self.vaults[i]),
                    rw(self.payer.pubkey()),
                    ro(token()),
                ],
            }
        }
        fn balance(&self, key: Address) -> u64 {
            self.svm
                .get_account(&key)
                .map(|a| {
                    if a.data.len() == 165 {
                        u64::from_le_bytes(a.data[64..72].try_into().unwrap())
                    } else {
                        0
                    }
                })
                .unwrap_or(0)
        }
        fn cycle_data(&self) -> Vec<u8> {
            self.svm.get_account(&self.cycle).unwrap().data
        }
        fn state(&self) -> u8 {
            self.cycle_data()[414]
        }
        fn funded(&self) -> u8 {
            self.cycle_data()[415]
        }
        fn mutate(&mut self, key: Address, f: impl FnOnce(&mut Account)) {
            let mut a = self.svm.get_account(&key).unwrap();
            f(&mut a);
            self.svm.set_account(key, a).unwrap();
        }
    }

    #[test]
    fn real_sbf_settles_2_3_4_in_all_funding_orders_and_cross_language_hash() {
        fn permutations(xs: &mut [usize], start: usize, result: &mut Vec<Vec<usize>>) {
            if start == xs.len() {
                result.push(xs.to_vec());
            } else {
                for i in start..xs.len() {
                    xs.swap(i, start);
                    permutations(xs, start + 1, result);
                    xs.swap(i, start);
                }
            }
        }
        for n in 2..=4 {
            let mut orders = vec![];
            permutations(&mut (0..n).collect::<Vec<_>>(), 0, &mut orders);
            for order in orders {
                let mut f = Fixture::new(n);
                f.create();
                assert_eq!(&f.cycle_data()[81..113], &f.hash());
                assert_eq!(f.cycle_data().len(), 419);
                for (step, i) in order.iter().enumerate() {
                    f.fund(*i).unwrap();
                    if step < n - 1 {
                        assert_eq!(f.state(), 0);
                        for j in 0..n {
                            assert_eq!(f.balance(f.destinations[j]), 0);
                        }
                    }
                }
                assert_eq!(f.state(), 1);
                for i in 0..n {
                    assert_eq!(f.balance(f.destinations[i]), f.amounts[i]);
                    assert_eq!(f.balance(f.sources[i]), 0);
                    assert_eq!(f.balance(f.vaults[i]), 0);
                }
                assert!(f.fund(0).is_err());
                f.time(1000);
                assert!(f.refund(0).is_err());
            }
        }
    }
    #[test]
    fn final_transfer_failure_rolls_back_every_transfer_and_last_deposit() {
        let mut f = Fixture::new(3);
        f.create();
        f.fund(0).unwrap();
        f.fund(1).unwrap();
        f.mutate(f.destinations[2], |a| a.data[108] = 2);
        assert!(f.fund(2).is_err());
        assert_eq!(f.funded(), 3);
        assert_eq!(f.balance(f.sources[2]), f.amounts[2]);
        assert_eq!(f.balance(f.vaults[2]), 0);
        for i in 0..3 {
            assert_eq!(f.balance(f.destinations[i]), 0);
        }
        f.time(1000);
        f.refund(0).unwrap();
        f.refund(1).unwrap();
        assert_eq!(f.state(), 3);
    }
    #[test]
    fn exact_deadline_has_no_overlap_and_refunds_are_independent() {
        let mut f = Fixture::new(3);
        f.create();
        f.time(999);
        f.fund(1).unwrap();
        assert!(f.refund(1).is_err());
        f.time(1000);
        assert!(f.fund(2).is_err());
        f.mutate(f.destinations[0], |a| {
            a.data[32..64].copy_from_slice(Address::new_unique().as_ref())
        });
        f.refund(1).unwrap();
        assert_eq!(f.balance(f.sources[1]), f.amounts[1]);
        assert_eq!(f.state(), 3);
        assert!(f.refund(1).is_err());
        assert!(f.refund(0).is_err());
    }
    #[test]
    fn damaged_ata_recovers_to_safe_non_ata_without_owner_signature() {
        for damage in 0..5 {
            let mut f = Fixture::new(3);
            f.create();
            f.fund(0).unwrap();
            f.time(1000);
            f.mutate(f.sources[0], |a| match damage {
                0 => a.data[32..64].copy_from_slice(Address::new_unique().as_ref()),
                1 => a.data[108] = 2,
                2 => {
                    a.data[72..76].copy_from_slice(&1u32.to_le_bytes());
                    a.data[76..108].copy_from_slice(Address::new_unique().as_ref());
                }
                3 => {
                    a.data[129..133].copy_from_slice(&1u32.to_le_bytes());
                    a.data[133..165].copy_from_slice(Address::new_unique().as_ref());
                }
                _ => {
                    a.owner = system();
                    a.data.clear();
                }
            });
            assert!(f.refund(0).is_err());
            let safe = Address::new_unique();
            put_token(&mut f.svm, safe, f.mints[0], f.owners[0].pubkey(), 0);
            f.send(f.return_ix("refund", 0, safe), None).unwrap();
            assert_eq!(f.balance(safe), f.amounts[0]);
            assert_eq!(f.state(), 3);
        }
    }
    #[test]
    fn invalid_signers_terms_vaults_mints_programs_and_aliases_are_rejected() {
        let mut f = Fixture::new(3);
        f.create();
        for mutation in 0..7 {
            let mut ix = f.fund_ix(0);
            match mutation {
                0 => ix.data[9] ^= 1,
                1 => ix.accounts[1] = AccountMeta::new_readonly(f.owners[1].pubkey(), true),
                2 => ix.accounts[5] = rw(f.vaults[1]),
                3 => ix.accounts[4] = ro(f.mints[1]),
                4 => ix.accounts[3] = ro(system()),
                5 => ix.accounts[2] = rw(f.vaults[0]),
                _ => ix.data[8] = 4,
            };
            let signer = if mutation == 1 { 1 } else { 0 };
            assert!(f.send(ix, Some(signer)).is_err(), "mutation{mutation}");
            assert_eq!(f.funded(), 0);
        }
        f.fund(0).unwrap();
        assert!(f.fund(0).is_err());
    }
    #[test]
    fn unsafe_settlement_destinations_never_receive_and_can_be_refunded() {
        for damage in 0..3 {
            let mut f = Fixture::new(2);
            f.create();
            f.fund(0).unwrap();
            f.mutate(f.destinations[0], |a| match damage {
                0 => a.data[32..64].copy_from_slice(Address::new_unique().as_ref()),
                1 => {
                    a.data[72..76].copy_from_slice(&1u32.to_le_bytes());
                    a.data[76..108].copy_from_slice(Address::new_unique().as_ref());
                }
                _ => {
                    a.data[129..133].copy_from_slice(&1u32.to_le_bytes());
                    a.data[133..165].copy_from_slice(Address::new_unique().as_ref());
                }
            });
            assert!(f.fund(1).is_err());
            assert_eq!(f.funded(), 1);
            f.time(1001);
            f.refund(0).unwrap();
        }
    }
    #[test]
    fn donations_do_not_fund_and_surplus_cannot_take_liability_or_change_beneficiary() {
        let mut f = Fixture::new(3);
        f.create();
        f.mutate(f.vaults[0], |a| {
            a.data[64..72].copy_from_slice(&9u64.to_le_bytes())
        });
        assert_eq!(f.funded(), 0);
        assert!(f
            .send(f.return_ix("return_surplus", 0, f.sources[0]), None)
            .is_err());
        f.fund(0).unwrap();
        assert_eq!(f.balance(f.vaults[0]), f.amounts[0] + 9);
        f.time(1000);
        assert!(f
            .send(f.return_ix("return_surplus", 0, f.sources[0]), None)
            .is_err());
        assert!(f.send(f.close_ix(0), None).is_err());
        f.refund(0).unwrap();
        assert_eq!(f.balance(f.vaults[0]), 9);
        assert!(f
            .send(f.return_ix("return_surplus", 0, f.destinations[0]), None)
            .is_err());
        f.send(f.return_ix("return_surplus", 0, f.sources[0]), None)
            .unwrap();
        assert_eq!(f.balance(f.sources[0]), f.amounts[0] + 9);
        f.send(f.close_ix(0), None).unwrap();
        assert_eq!(f.cycle_data()[417] & 1, 1);
    }
    #[test]
    fn prefunded_pdas_create_safely_receipts_prevent_replay_and_rent_is_fixed() {
        let mut f = Fixture::new(4);
        f.svm.airdrop(&f.cycle, 1234).unwrap();
        f.svm.airdrop(&f.vaults[2], 4321).unwrap();
        f.create();
        assert!(f.send(f.close_ix(0), None).is_err());
        assert!(f.send(f.create_ix(), None).is_err());
        f.time(1000);
        let mut wrong = f.close_ix(0);
        wrong.accounts[2] = rw(f.owners[0].pubkey());
        assert!(f.send(wrong, None).is_err());
        for i in 0..4 {
            f.send(f.close_ix(i), None).unwrap();
        }
        assert_eq!(f.cycle_data()[417], 15);
        assert!(f.send(f.create_ix(), None).is_err());
        assert!(f.send(f.close_ix(0), None).is_err());
        assert!(f.svm.get_account(&f.cycle).is_some());
    }
    #[test]
    fn rejects_duplicate_owner_zero_amount_freezable_mint_token2022_and_bad_decimals() {
        for mutation in 0..5 {
            let mut f = Fixture::new(2);
            match mutation {
                0 => f.owners[1] = Keypair::try_from(f.owners[0].to_bytes().as_slice()).unwrap(),
                1 => f.amounts[0] = 0,
                2 => f.mutate(f.mints[0], |a| {
                    a.data[46..50].copy_from_slice(&1u32.to_le_bytes());
                    a.data[50..82].copy_from_slice(Address::new_unique().as_ref());
                }),
                3 => f.mutate(f.mints[0], |a| {
                    a.owner = addr("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")
                }),
                _ => f.decimals[0] = 9,
            };
            assert!(f.send(f.create_ix(), None).is_err());
            assert!(f.svm.get_account(&f.cycle).is_none());
        }
    }
    #[test]
    fn u64_max_settles_without_float_loss() {
        let mut f = Fixture::with_amounts(vec![u64::MAX, u64::MAX - 1]);
        f.create();
        f.fund(1).unwrap();
        f.fund(0).unwrap();
        assert_eq!(f.balance(f.destinations[0]), u64::MAX);
        assert_eq!(f.balance(f.destinations[1]), u64::MAX - 1);
    }
    #[test]
    fn wrapped_sol_and_conflicting_initialized_vault_are_rejected() {
        let mut native = Fixture::new(2);
        native.mints[0] = addr("So11111111111111111111111111111111111111112");
        let mut mint = native.svm.get_account(&native.mints[1]).unwrap();
        mint.data[44] = 9;
        native.decimals[0] = 9;
        native.svm.set_account(native.mints[0], mint).unwrap();
        assert!(native
            .send(native.create_ix(), None)
            .unwrap_err()
            .contains("UnsupportedToken"));
        assert!(native.svm.get_account(&native.cycle).is_none());

        let mut f = Fixture::new(2);
        put_token(&mut f.svm, f.vaults[0], f.mints[0], f.owners[0].pubkey(), 0);
        assert!(f.send(f.create_ix(), None).is_err());
        assert!(f.svm.get_account(&f.cycle).is_none());
        assert_eq!(f.balance(f.sources[0]), f.amounts[0]);
    }
    #[test]
    fn deposit_overflow_rolls_back_and_direct_donations_never_complete_a_leg() {
        let mut f = Fixture::with_amounts(vec![u64::MAX, 100]);
        f.create();
        f.mutate(f.vaults[0], |a| {
            a.data[64..72].copy_from_slice(&1u64.to_le_bytes())
        });
        assert!(f.fund(0).is_err());
        assert_eq!(f.funded(), 0);
        assert_eq!(f.balance(f.sources[0]), u64::MAX);
        assert_eq!(f.balance(f.vaults[0]), 1);
        f.fund(1).unwrap();
        assert_eq!(f.state(), 0);
        f.time(1000);
        f.refund(1).unwrap();
        // Donations to an unfunded leg carry no deposit claim. They can only be returned.
        assert!(f.refund(0).is_err());
    }
    #[test]
    fn repeated_mint_uses_isolated_vaults_and_valid_source_destination_aliases() {
        let mut f = Fixture::new(4);
        let mint = f.mints[0];
        for i in 0..4 {
            f.mints[i] = mint;
            f.decimals[i] = 0;
            f.sources[i] = ata(f.owners[i].pubkey(), mint);
        }
        for i in 0..4 {
            f.destinations[i] = f.sources[(i + 1) % 4];
            put_token(
                &mut f.svm,
                f.sources[i],
                mint,
                f.owners[i].pubkey(),
                f.amounts[i],
            );
        }
        f.create();
        for i in [2, 0, 3, 1] {
            f.fund(i).unwrap();
        }
        assert_eq!(f.state(), 1);
        for i in 0..4 {
            assert_eq!(f.balance(f.sources[(i + 1) % 4]), f.amounts[i]);
            assert_eq!(f.balance(f.vaults[i]), 0);
        }
    }
    #[test]
    fn seeded_random_sequences_conserve_each_mint_and_never_discharge_twice() {
        let mut seed = 0x5357415043495243u64;
        let mut next = || {
            seed = seed
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            seed
        };
        for _ in 0..24 {
            let n = 2 + (next() % 3) as usize;
            let mut f = Fixture::new(n);
            f.create();
            let mut expired = false;
            let mut paid = vec![false; n];
            let mut refunded = vec![false; n];
            let mut settled = false;
            for _ in 0..24 {
                let i = (next() % n as u64) as usize;
                let operation = next() % 6;
                if operation == 0 {
                    expired = true;
                    f.time(1000);
                } else if operation <= 3 {
                    let should_succeed = !expired && !settled && !paid[i];
                    let result = f.fund(i);
                    assert_eq!(result.is_ok(), should_succeed, "fund result mismatch");
                    if should_succeed {
                        paid[i] = true;
                        settled = paid.iter().all(|x| *x);
                    }
                } else {
                    let should_succeed = expired && !settled && paid[i] && !refunded[i];
                    let result = f.refund(i);
                    assert_eq!(result.is_ok(), should_succeed, "refund result mismatch");
                    if should_succeed {
                        refunded[i] = true;
                    }
                }
                for j in 0..n {
                    let sum = f.balance(f.sources[j]) as u128
                        + f.balance(f.vaults[j]) as u128
                        + f.balance(f.destinations[j]) as u128;
                    assert_eq!(sum, f.amounts[j] as u128, "per-mint conservation");
                    assert_eq!(
                        f.balance(f.destinations[j]),
                        if settled { f.amounts[j] } else { 0 }
                    );
                    assert_eq!(
                        f.balance(f.vaults[j]),
                        if paid[j] && !refunded[j] && !settled {
                            f.amounts[j]
                        } else {
                            0
                        }
                    );
                }
            }
            f.time(1000);
            if !settled {
                for i in 0..n {
                    if paid[i] && !refunded[i] {
                        f.refund(i).unwrap();
                    }
                }
            }
            for i in 0..n {
                assert_eq!(f.balance(f.vaults[i]), 0);
                assert!(f.refund(i).is_err());
                assert!(f.fund(i).is_err());
            }
        }
    }
    #[test]
    fn maximum_cycle_measurement() {
        let mut f = Fixture::new(4);
        let create = f.create_ix();
        let create_bytes = bincode::serialize(&Transaction::new(
            &[&f.payer],
            Message::new(&[create.clone()], Some(&f.payer.pubkey())),
            f.svm.latest_blockhash(),
        ))
        .unwrap()
        .len();
        let create_cu = f.send(create, None).unwrap().compute_units_consumed;
        for i in 0..3 {
            f.fund(i).unwrap();
        }
        let fund = f.fund_ix(3);
        let fund_bytes = bincode::serialize(&Transaction::new(
            &[&f.payer, &f.owners[3]],
            Message::new(&[fund], Some(&f.payer.pubkey())),
            f.svm.latest_blockhash(),
        ))
        .unwrap()
        .len();
        let final_cu = f.fund(3).unwrap().compute_units_consumed;
        let artifact_hash = format!(
            "{:x}",
            Sha256::digest(std::fs::read(artifact_path()).unwrap())
        );
        let measurements = serde_json::json!({"environment":"LiteSVM0.9.1, real compiled SBF, legacy transaction", "programId":program().to_string(),"artifactHash":artifact_hash,"participants":4,"create":{"bytes":create_bytes,"computeUnits":create_cu},"finalFund":{"bytes":fund_bytes,"computeUnits":final_cu},"cycleRentLamports":f.svm.get_account(&f.cycle).unwrap().lamports,"vaultRentLamports":f.svm.get_account(&f.vaults[0]).unwrap().lamports});
        std::fs::write(
            std::env::var("SWAPCIRCLE_TEST_MEASUREMENTS")
                .unwrap_or_else(|_| "measurements.json".to_string()),
            serde_json::to_string_pretty(&measurements).unwrap(),
        )
        .unwrap();
        println!("{measurements}");
    }
}
