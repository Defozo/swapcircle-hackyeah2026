use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    program::invoke_signed, program_option::COption, program_pack::Pack, system_instruction,
};
use anchor_spl::{
    associated_token::get_associated_token_address,
    token::{self, spl_token, CloseAccount, InitializeAccount3, Token, TransferChecked},
};
use solana_sha256_hasher::hashv;

declare_id!("HkboPxfwBemtYkwfkHzMknHdiM7YP32KkU6Rgjy4LGun");
pub const TERMS_DOMAIN: &[u8] = b"SwapCircle:terms:v1";
pub const MAX_LEGS: usize = 4;

#[program]
pub mod swapcircle {
    use super::*;

    /// remaining_accounts = [mint, vault] per leg, in immutable flow order.
    pub fn create_cycle<'info>(
        ctx: Context<'info, CreateCycle<'info>>,
        nonce: u64,
        deadline: i64,
        legs: Vec<Leg>,
    ) -> Result<()> {
        require!(
            (2..=MAX_LEGS).contains(&legs.len()),
            SwapError::InvalidLegCount
        );
        require!(
            deadline > Clock::get()?.unix_timestamp,
            SwapError::InvalidDeadline
        );
        require!(
            ctx.remaining_accounts.len() == legs.len() * 2,
            SwapError::InvalidAccounts
        );
        let cycle_key = ctx.accounts.cycle.key();
        for (i, leg) in legs.iter().enumerate() {
            require!(
                leg.amount > 0 && leg.owner != Pubkey::default(),
                SwapError::InvalidAmount
            );
            require!(
                !legs[..i].iter().any(|previous| previous.owner == leg.owner),
                SwapError::DuplicateOwner
            );
            let mint = &ctx.remaining_accounts[i * 2];
            let vault = &ctx.remaining_accounts[i * 2 + 1];
            validate_mint(mint, leg)?;
            let index = [i as u8];
            let (expected, bump) = Pubkey::find_program_address(
                &[b"vault", cycle_key.as_ref(), &index],
                ctx.program_id,
            );
            require_keys_eq!(expected, vault.key(), SwapError::InvalidVault);
            require!(
                vault.is_writable
                    && vault.owner == &anchor_lang::system_program::ID
                    && vault.data_is_empty(),
                SwapError::InvalidVault
            );
            let signer_seeds: &[&[u8]] = &[b"vault", cycle_key.as_ref(), &index, &[bump]];
            initialize_vault(
                &ctx.accounts.creator.to_account_info(),
                vault,
                &ctx.accounts.system_program.to_account_info(),
                signer_seeds,
            )?;
            token::initialize_account3(CpiContext::new(
                ctx.accounts.token_program.key(),
                InitializeAccount3 {
                    account: vault.clone(),
                    mint: mint.clone(),
                    authority: ctx.accounts.cycle.to_account_info(),
                },
            ))?;
        }
        let cycle = &mut ctx.accounts.cycle;
        cycle.version = 1;
        cycle.creator = ctx.accounts.creator.key();
        cycle.rent_payer = ctx.accounts.creator.key();
        cycle.nonce = nonce;
        cycle.deadline = deadline;
        cycle.leg_count = legs.len() as u8;
        cycle.legs = [Leg::default(); MAX_LEGS];
        cycle.legs[..legs.len()].copy_from_slice(&legs);
        cycle.terms_hash = terms_hash(ctx.program_id, &cycle_key, nonce, deadline, &legs);
        cycle.state = CycleState::Funding;
        cycle.funded = 0;
        cycle.refunded = 0;
        cycle.closed = 0;
        cycle.bump = ctx.bumps.cycle;
        emit!(CycleCreated {
            cycle: cycle_key,
            creator: cycle.creator,
            terms_hash: cycle.terms_hash,
            deadline,
            leg_count: cycle.leg_count
        });
        Ok(())
    }

    /// Every fund supplies all [mint, vault, canonical recipient ATA] triples.
    /// Readiness is decided on-chain, never from a stale client observation.
    pub fn fund_and_maybe_settle<'info>(
        ctx: Context<'info, Fund<'info>>,
        index: u8,
        expected_hash: [u8; 32],
    ) -> Result<()> {
        let cycle = &ctx.accounts.cycle;
        cycle.validate_address(ctx.program_id, &cycle.key())?;
        let i = cycle.index(index)?;
        require!(cycle.state == CycleState::Funding, SwapError::InvalidState);
        require!(
            Clock::get()?.unix_timestamp < cycle.deadline,
            SwapError::DeadlinePassed
        );
        require!(cycle.terms_hash == expected_hash, SwapError::TermsMismatch);
        require!(cycle.funded & (1 << i) == 0, SwapError::AlreadyFunded);
        require_keys_eq!(
            ctx.accounts.owner.key(),
            cycle.legs[i].owner,
            SwapError::WrongOwner
        );
        require!(
            ctx.remaining_accounts.len() == cycle.leg_count as usize * 3,
            SwapError::InvalidAccounts
        );
        for (j, leg) in cycle.active_legs().iter().enumerate() {
            validate_mint(&ctx.remaining_accounts[j * 3], leg)?;
            validate_vault(
                &ctx.remaining_accounts[j * 3 + 1],
                &cycle.key(),
                j as u8,
                leg,
                ctx.program_id,
            )?;
        }
        validate_destination(
            &ctx.accounts.source.to_account_info(),
            &cycle.legs[i],
            cycle.legs[i].owner,
        )?;
        let leg = cycle.legs[i];
        let mint = &ctx.remaining_accounts[i * 3];
        let vault = &ctx.remaining_accounts[i * 3 + 1];
        transfer(
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.source.to_account_info(),
            mint,
            vault,
            &ctx.accounts.owner.to_account_info(),
            leg.amount,
            leg.decimals,
            &[],
        )?;
        ctx.accounts.cycle.funded |= 1 << i;
        let cycle = &ctx.accounts.cycle;
        emit!(LegFunded {
            cycle: cycle.key(),
            index,
            owner: leg.owner,
            amount: leg.amount
        });
        if cycle.funded == cycle.full_mask() {
            let nonce_bytes = cycle.nonce.to_le_bytes();
            let bump = [cycle.bump];
            let seeds: &[&[u8]] = &[b"cycle", cycle.creator.as_ref(), &nonce_bytes, &bump];
            for (j, leg) in cycle.active_legs().iter().enumerate() {
                let mint = &ctx.remaining_accounts[j * 3];
                let vault = &ctx.remaining_accounts[j * 3 + 1];
                let destination = &ctx.remaining_accounts[j * 3 + 2];
                let recipient = cycle.legs[(j + 1) % cycle.leg_count as usize].owner;
                require_keys_eq!(
                    destination.key(),
                    get_associated_token_address(&recipient, &leg.mint),
                    SwapError::InvalidDestination
                );
                validate_destination(destination, leg, recipient)?;
                transfer(
                    &ctx.accounts.token_program.to_account_info(),
                    vault,
                    mint,
                    destination,
                    &cycle.to_account_info(),
                    leg.amount,
                    leg.decimals,
                    &[seeds],
                )?;
            }
            ctx.accounts.cycle.state = CycleState::Settled;
            emit!(CycleSettled {
                cycle: ctx.accounts.cycle.key(),
                terms_hash: expected_hash
            });
        }
        Ok(())
    }

    /// Permissionless fee payer, but strictly owner-preserving destination.
    /// No accounts of another leg are required, including for damaged ATAs.
    pub fn refund(ctx: Context<ReturnTokens>, index: u8) -> Result<()> {
        let cycle = &ctx.accounts.cycle;
        cycle.validate_address(ctx.program_id, &cycle.key())?;
        let i = cycle.index(index)?;
        require!(cycle.state != CycleState::Settled, SwapError::InvalidState);
        require!(
            Clock::get()?.unix_timestamp >= cycle.deadline,
            SwapError::TooEarly
        );
        require!(cycle.funded & (1 << i) != 0, SwapError::NotFunded);
        require!(cycle.refunded & (1 << i) == 0, SwapError::AlreadyRefunded);
        validate_return(&ctx, index)?;
        let leg = cycle.legs[i];
        transfer_return(&ctx, leg.amount, leg.decimals)?;
        let cycle = &mut ctx.accounts.cycle;
        cycle.refunded |= 1 << i;
        cycle.state = if cycle.refunded == cycle.funded {
            CycleState::Refunded
        } else {
            CycleState::Refunding
        };
        emit!(LegRefunded {
            cycle: cycle.key(),
            index,
            destination: ctx.accounts.destination.key(),
            amount: leg.amount
        });
        Ok(())
    }

    pub fn return_surplus(ctx: Context<ReturnTokens>, index: u8) -> Result<()> {
        let cycle = &ctx.accounts.cycle;
        cycle.validate_address(ctx.program_id, &cycle.key())?;
        let i = cycle.index(index)?;
        cycle.require_no_liability(i, Clock::get()?.unix_timestamp)?;
        validate_return(&ctx, index)?;
        let vault = read_token(&ctx.accounts.vault)?;
        require!(vault.amount > 0, SwapError::NoSurplus);
        transfer_return(&ctx, vault.amount, cycle.legs[i].decimals)?;
        emit!(SurplusReturned {
            cycle: cycle.key(),
            index,
            destination: ctx.accounts.destination.key(),
            amount: vault.amount
        });
        Ok(())
    }

    pub fn close_empty_vault(ctx: Context<CloseVault>, index: u8) -> Result<()> {
        let cycle = &ctx.accounts.cycle;
        cycle.validate_address(ctx.program_id, &cycle.key())?;
        let i = cycle.index(index)?;
        cycle.require_no_liability(i, Clock::get()?.unix_timestamp)?;
        require!(cycle.closed & (1 << i) == 0, SwapError::AlreadyClosed);
        validate_vault(
            &ctx.accounts.vault,
            &cycle.key(),
            index,
            &cycle.legs[i],
            ctx.program_id,
        )?;
        require!(
            read_token(&ctx.accounts.vault)?.amount == 0,
            SwapError::VaultNotEmpty
        );
        require_keys_eq!(
            ctx.accounts.rent_payer.key(),
            cycle.rent_payer,
            SwapError::WrongRentPayer
        );
        let nonce = cycle.nonce.to_le_bytes();
        let bump = [cycle.bump];
        let seeds: &[&[u8]] = &[b"cycle", cycle.creator.as_ref(), &nonce, &bump];
        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.rent_payer.to_account_info(),
                authority: cycle.to_account_info(),
            },
            &[seeds],
        ))?;
        ctx.accounts.cycle.closed |= 1 << i;
        emit!(VaultClosed {
            cycle: ctx.accounts.cycle.key(),
            index,
            rent_payer: ctx.accounts.rent_payer.key()
        });
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreateCycle<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(init, payer = creator, space = Cycle::SPACE, seeds = [b"cycle", creator.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub cycle: Account<'info, Cycle>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Fund<'info> {
    #[account(mut)]
    pub cycle: Account<'info, Cycle>,
    pub owner: Signer<'info>,
    /// CHECK: SPL program owner, initialized state, mint and authority checked explicitly.
    #[account(mut)]
    pub source: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ReturnTokens<'info> {
    #[account(mut)]
    pub cycle: Account<'info, Cycle>,
    /// CHECK: vault PDA, SPL ownership and authority checked explicitly.
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: exact stored mint and supported SPL properties checked explicitly.
    pub mint: UncheckedAccount<'info>,
    /// CHECK: actual token authority and security fields checked, arbitrary safe owner account allowed.
    #[account(mut)]
    pub destination: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CloseVault<'info> {
    #[account(mut)]
    pub cycle: Account<'info, Cycle>,
    /// CHECK: vault PDA and token fields checked.
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: immutable rent payer checked before closing.
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Cycle {
    pub version: u8,
    pub creator: Pubkey,
    pub rent_payer: Pubkey,
    pub nonce: u64,
    pub terms_hash: [u8; 32],
    pub deadline: i64,
    pub leg_count: u8,
    pub legs: [Leg; MAX_LEGS],
    pub state: CycleState,
    pub funded: u8,
    pub refunded: u8,
    pub closed: u8,
    pub bump: u8,
}

impl Cycle {
    pub const SPACE: usize = 419;
    pub fn active_legs(&self) -> &[Leg] {
        &self.legs[..self.leg_count as usize]
    }
    pub fn full_mask(&self) -> u8 {
        (1 << self.leg_count) - 1
    }
    pub fn index(&self, index: u8) -> Result<usize> {
        require!(index < self.leg_count, SwapError::InvalidIndex);
        Ok(index as usize)
    }
    pub fn validate_address(&self, program: &Pubkey, address: &Pubkey) -> Result<()> {
        let (expected, bump) = Pubkey::find_program_address(
            &[b"cycle", self.creator.as_ref(), &self.nonce.to_le_bytes()],
            program,
        );
        require_keys_eq!(*address, expected, SwapError::InvalidCycle);
        require!(
            self.version == 1 && self.bump == bump && (2..=4).contains(&self.leg_count),
            SwapError::InvalidCycle
        );
        Ok(())
    }
    pub fn require_no_liability(&self, index: usize, now: i64) -> Result<()> {
        require!(
            self.state == CycleState::Settled || now >= self.deadline,
            SwapError::TooEarly
        );
        require!(
            self.state == CycleState::Settled
                || self.funded & (1 << index) == 0
                || self.refunded & (1 << index) != 0,
            SwapError::OutstandingLiability
        );
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq)]
pub struct Leg {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub decimals: u8,
}
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum CycleState {
    Funding,
    Settled,
    Refunding,
    Refunded,
}

pub fn terms_hash(
    program: &Pubkey,
    cycle: &Pubkey,
    nonce: u64,
    deadline: i64,
    legs: &[Leg],
) -> [u8; 32] {
    let mut bytes = Vec::with_capacity(400);
    bytes.extend_from_slice(TERMS_DOMAIN);
    bytes.extend_from_slice(program.as_ref());
    bytes.extend_from_slice(cycle.as_ref());
    bytes.extend_from_slice(&nonce.to_le_bytes());
    bytes.extend_from_slice(&deadline.to_le_bytes());
    bytes.push(legs.len() as u8);
    for leg in legs {
        bytes.extend_from_slice(leg.owner.as_ref());
        bytes.extend_from_slice(leg.mint.as_ref());
        bytes.extend_from_slice(&leg.amount.to_le_bytes());
        bytes.push(leg.decimals);
    }
    hashv(&[&bytes]).to_bytes()
}

fn validate_mint(account: &AccountInfo, leg: &Leg) -> Result<()> {
    require_keys_eq!(account.key(), leg.mint, SwapError::InvalidMint);
    require_keys_eq!(*account.owner, spl_token::ID, SwapError::UnsupportedToken);
    require!(
        account.key() != spl_token::native_mint::ID,
        SwapError::UnsupportedToken
    );
    let mint = spl_token::state::Mint::unpack(&account.try_borrow_data()?)
        .map_err(|_| error!(SwapError::InvalidMint))?;
    require!(
        mint.is_initialized && mint.decimals == leg.decimals && mint.freeze_authority.is_none(),
        SwapError::UnsupportedToken
    );
    Ok(())
}
fn read_token(account: &AccountInfo) -> Result<spl_token::state::Account> {
    require_keys_eq!(*account.owner, spl_token::ID, SwapError::UnsupportedToken);
    let token = spl_token::state::Account::unpack(&account.try_borrow_data()?)
        .map_err(|_| error!(SwapError::InvalidTokenAccount))?;
    require!(
        token.state == spl_token::state::AccountState::Initialized && token.is_native.is_none(),
        SwapError::UnsafeTokenAccount
    );
    Ok(token)
}
fn validate_destination(account: &AccountInfo, leg: &Leg, owner: Pubkey) -> Result<()> {
    require!(account.is_writable, SwapError::InvalidDestination);
    let token = read_token(account)?;
    require_keys_eq!(token.mint, leg.mint, SwapError::InvalidMint);
    require_keys_eq!(token.owner, owner, SwapError::WrongOwner);
    require!(
        token.delegate.is_none()
            && (token.close_authority.is_none() || token.close_authority == COption::Some(owner)),
        SwapError::UnsafeTokenAccount
    );
    Ok(())
}
fn validate_vault(
    account: &AccountInfo,
    cycle: &Pubkey,
    index: u8,
    leg: &Leg,
    program: &Pubkey,
) -> Result<()> {
    let expected = Pubkey::find_program_address(&[b"vault", cycle.as_ref(), &[index]], program).0;
    require_keys_eq!(account.key(), expected, SwapError::InvalidVault);
    validate_destination(account, leg, *cycle)?;
    require!(
        read_token(account)?.close_authority.is_none(),
        SwapError::UnsafeTokenAccount
    );
    Ok(())
}
fn initialize_vault<'info>(
    payer: &AccountInfo<'info>,
    vault: &AccountInfo<'info>,
    system: &AccountInfo<'info>,
    seeds: &[&[u8]],
) -> Result<()> {
    let rent = Rent::get()?.minimum_balance(spl_token::state::Account::LEN);
    let topup = rent.saturating_sub(vault.lamports());
    if topup > 0 {
        invoke_signed(
            &system_instruction::transfer(payer.key, vault.key, topup),
            &[payer.clone(), vault.clone(), system.clone()],
            &[],
        )?;
    }
    invoke_signed(
        &system_instruction::allocate(vault.key, spl_token::state::Account::LEN as u64),
        &[vault.clone(), system.clone()],
        &[seeds],
    )?;
    invoke_signed(
        &system_instruction::assign(vault.key, &spl_token::ID),
        &[vault.clone(), system.clone()],
        &[seeds],
    )?;
    Ok(())
}
#[allow(clippy::too_many_arguments)]
fn transfer<'info>(
    program: &AccountInfo<'info>,
    from: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    amount: u64,
    decimals: u8,
    seeds: &[&[&[u8]]],
) -> Result<()> {
    token::transfer_checked(
        CpiContext::new_with_signer(
            program.key(),
            TransferChecked {
                from: from.clone(),
                mint: mint.clone(),
                to: to.clone(),
                authority: authority.clone(),
            },
            seeds,
        ),
        amount,
        decimals,
    )
}
fn validate_return(ctx: &Context<ReturnTokens>, index: u8) -> Result<()> {
    let cycle = &ctx.accounts.cycle;
    let leg = &cycle.legs[index as usize];
    require!(cycle.closed & (1 << index) == 0, SwapError::AlreadyClosed);
    validate_mint(&ctx.accounts.mint, leg)?;
    validate_vault(
        &ctx.accounts.vault,
        &cycle.key(),
        index,
        leg,
        ctx.program_id,
    )?;
    validate_destination(&ctx.accounts.destination, leg, leg.owner)
}
fn transfer_return(ctx: &Context<ReturnTokens>, amount: u64, decimals: u8) -> Result<()> {
    let cycle = &ctx.accounts.cycle;
    let nonce = cycle.nonce.to_le_bytes();
    let bump = [cycle.bump];
    let seeds: &[&[u8]] = &[b"cycle", cycle.creator.as_ref(), &nonce, &bump];
    transfer(
        &ctx.accounts.token_program.to_account_info(),
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.mint.to_account_info(),
        &ctx.accounts.destination.to_account_info(),
        &cycle.to_account_info(),
        amount,
        decimals,
        &[seeds],
    )
}

#[event]
pub struct CycleCreated {
    pub cycle: Pubkey,
    pub creator: Pubkey,
    pub terms_hash: [u8; 32],
    pub deadline: i64,
    pub leg_count: u8,
}
#[event]
pub struct LegFunded {
    pub cycle: Pubkey,
    pub index: u8,
    pub owner: Pubkey,
    pub amount: u64,
}
#[event]
pub struct CycleSettled {
    pub cycle: Pubkey,
    pub terms_hash: [u8; 32],
}
#[event]
pub struct LegRefunded {
    pub cycle: Pubkey,
    pub index: u8,
    pub destination: Pubkey,
    pub amount: u64,
}
#[event]
pub struct SurplusReturned {
    pub cycle: Pubkey,
    pub index: u8,
    pub destination: Pubkey,
    pub amount: u64,
}
#[event]
pub struct VaultClosed {
    pub cycle: Pubkey,
    pub index: u8,
    pub rent_payer: Pubkey,
}

#[error_code]
pub enum SwapError {
    #[msg("A cycle requires 2 to 4 distinct owners")]
    InvalidLegCount,
    #[msg("Deadline must be in the future")]
    InvalidDeadline,
    #[msg("Wrong number or order of accounts")]
    InvalidAccounts,
    #[msg("Amount must be a positive u64 and owner must be present")]
    InvalidAmount,
    #[msg("An owner may appear only once")]
    DuplicateOwner,
    #[msg("Wrong vault PDA or conflicting initialized account")]
    InvalidVault,
    #[msg("Instruction unavailable in this cycle state")]
    InvalidState,
    #[msg("Funding deadline has passed")]
    DeadlinePassed,
    #[msg("Signed terms do not match the immutable cycle")]
    TermsMismatch,
    #[msg("Leg already funded")]
    AlreadyFunded,
    #[msg("Wrong token authority or funding signer")]
    WrongOwner,
    #[msg("Wrong or unsafe destination")]
    InvalidDestination,
    #[msg("Recovery and cleanup are unavailable before deadline")]
    TooEarly,
    #[msg("Leg was never funded")]
    NotFunded,
    #[msg("Leg already refunded")]
    AlreadyRefunded,
    #[msg("No surplus to return")]
    NoSurplus,
    #[msg("Vault already closed permanently")]
    AlreadyClosed,
    #[msg("Vault contains tokens")]
    VaultNotEmpty,
    #[msg("Rent must return to the recorded payer")]
    WrongRentPayer,
    #[msg("Invalid cycle address or version")]
    InvalidCycle,
    #[msg("Leg index outside cycle")]
    InvalidIndex,
    #[msg("The authorized deposit is still owed")]
    OutstandingLiability,
    #[msg("Wrong mint or decimals")]
    InvalidMint,
    #[msg("Only classic SPL, unfrozen non-native mints are supported")]
    UnsupportedToken,
    #[msg("Invalid token account data")]
    InvalidTokenAccount,
    #[msg("Frozen account, delegate, native token or foreign close authority")]
    UnsafeTokenAccount,
}
