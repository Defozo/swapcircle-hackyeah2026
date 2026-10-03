import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import nacl from 'tweetnacl';
import { getAssociatedTokenAddressSync, getAccount, getMint } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { flag, has, key, loadManifest, network } from '../../../scripts/common';
import { createOffer, exportOffers, findCycles, signOffer, type SignedOffer } from '../src';
import { ConvexBoard } from '../src/board';

const manifest = loadManifest();
const { connection, genesisHash } = await network(manifest.cluster, flag('rpc', manifest.rpcUrl));
if (genesisHash !== manifest.genesisHash) throw new Error('Manifest no longer identifies this chain');
const expiresAt = Math.floor(Date.now() / 1000) + Number(flag('validity-seconds', '86400'));
const specifications = [
  { secret: 'SWAPCIRCLE_DEVNET_ALICE_KEY', name: 'Alicja', give: 'dX', giveAmount: 100n, want: 'dY', wantAmount: 40n },
  { secret: 'SWAPCIRCLE_DEVNET_BOB_KEY', name: 'Bartek', give: 'dY', giveAmount: 40n, want: 'dZ', wantAmount: 250n },
  { secret: 'SWAPCIRCLE_DEVNET_CELINE_KEY', name: 'Celina', give: 'dZ', giveAmount: 250n, want: 'dX', wantAmount: 100n },
];
const offers: SignedOffer[] = [];
for (const specification of specifications) {
  const signer = key(specification.secret);
  const owner = signer.publicKey.toBase58();
  if (!manifest.participants?.some(p => p.owner === owner && p.name === specification.name)) throw new Error('Signing key does not match the named manifest participant');
  const give = manifest.mints.find(m => m.symbol === specification.give);
  const want = manifest.mints.find(m => m.symbol === specification.want);
  if (!give || !want) throw new Error('Demo manifest lacks required mint');
  const giveAmount = specification.giveAmount * 10n ** BigInt(give.decimals);
  const wantAmount = specification.wantAmount * 10n ** BigInt(want.decimals);
  const source = await getAccount(connection, getAssociatedTokenAddressSync(new PublicKey(give.mint), signer.publicKey));
  if (source.amount < giveAmount || !source.owner.equals(signer.publicKey) || source.isFrozen || source.delegate || source.closeAuthority && !source.closeAuthority.equals(signer.publicKey)) throw new Error('Demo owner does not have the advertised freely available tokens');
  for (const entry of [give, want]) {
    const mint = await getMint(connection, new PublicKey(entry.mint));
    if (mint.decimals !== entry.decimals || mint.freezeAuthority || mint.mintAuthority) throw new Error('Demo mint does not match immutable manifest rules');
  }
  const payload = createOffer({ genesisHash, programId: manifest.programId, owner,
    giveMint: give.mint, giveAmount: giveAmount.toString(), wantMint: want.mint, wantAmount: wantAmount.toString(), expiresAt });
  offers.push(await signOffer(payload, async bytes => nacl.sign.detached(bytes, signer.secretKey)));
}
const context = { genesisHash, programId: manifest.programId };
const matches = findCycles(offers, context);
if (matches.scope.pairCycles !== 0 || matches.cycles.length !== 1 || matches.cycles[0]!.offers.length !== 3) throw new Error('Seeded offers must demonstrate a three-person cycle without direct pairs');
const path = `apps/web/public/fixtures/${manifest.cluster}-offers.json`;
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, exportOffers(offers) + '\n');
if (has('publish')) {
  if (manifest.cluster !== 'devnet') throw new Error('Localnet fixtures may not be published to the shared devnet board');
  const url = flag('board-url', manifest.convexUrl ?? process.env.VITE_CONVEX_URL);
  if (!url) throw new Error('A public board URL is required for publication');
  const board = new ConvexBoard(url, context);
  await board.configuration();
  for (const offer of offers) await board.publish(offer);
}
console.log(JSON.stringify({ file: path, cluster: manifest.cluster, genesisHash, programId: manifest.programId, signedOffers: offers.length, pairs: matches.scope.pairCycles, threePersonCycles: matches.cycles.length, balancesVerifiedAt: new Date().toISOString(), expiresAt, published: has('publish'), syntheticScenario: true }));
