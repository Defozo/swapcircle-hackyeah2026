import { writeFile } from 'node:fs/promises';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { ConvexBoard } from '../src/board';
import { createOffer, exportOffers, findCycles, importOffers, offerId, signOffer, signRevocation } from '../src';

const url = process.env.VITE_CONVEX_URL || 'https://academic-mole-172.convex.cloud';
const context = { genesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG', programId: process.env.SWAPCIRCLE_PROGRAM_ID || 'HkboPxfwBemtYkwfkHzMknHdiM7YP32KkU6Rgjy4LGun' };
const board = new ConvexBoard(url, context);
const client = new ConvexHttpClient(url);
const publish = makeFunctionReference<'mutation'>('offers:publish');
const revoke = makeFunctionReference<'mutation'>('offers:revoke');
const checks: Record<string, boolean> = {};
const owners = [nacl.sign.keyPair(), nacl.sign.keyPair()];
const mintA = bs58.encode(nacl.sign.keyPair().publicKey), mintB = bs58.encode(nacl.sign.keyPair().publicKey);
const signers = owners.map(pair => async (bytes: Uint8Array) => nacl.sign.detached(bytes, pair.secretKey));
const now = Math.floor(Date.now() / 1000);
const offers = await Promise.all(owners.map((pair, i) => signOffer(createOffer({ ...context, owner: bs58.encode(pair.publicKey), giveMint: i === 0 ? mintA : mintB, wantMint: i === 0 ? mintB : mintA, giveAmount: i === 0 ? '100' : '40', wantAmount: i === 0 ? '40' : '100', expiresAt: now + 600 }), signers[i]!)));
async function rejected(name: string, action: () => Promise<unknown>) {
  try { await action(); checks[name] = false; } catch { checks[name] = true; }
  if (!checks[name]) throw new Error(`Security check failed: ${name}`);
}
await board.configuration(); checks.configuration = true;
await rejected('tamperedSignatureRejected', () => client.mutation(publish, { offer: { ...offers[0], payload: { ...offers[0]!.payload, giveAmount: '101' } } }));
const otherChain = await signOffer({ ...offers[0]!.payload, genesisHash: bs58.encode(nacl.randomBytes(32)) }, signers[0]!);
await rejected('differentNetworkRejected', () => client.mutation(publish, { offer: otherChain }));
for (const offer of offers) await board.publish(offer);
checks.publication = true;
await rejected('publicationReplayRejected', () => board.publish(offers[0]!));
let snapshot = await board.list();
checks.sharedReadback = offers.every(o => snapshot.offers.some(s => offerId(o) === offerId(s)));
checks.liveSignedPairMatches = findCycles(snapshot.offers, { ...context, revocations: snapshot.revocations }).cycles.some(c => c.offers.every(o => offers.some(s => offerId(s) === offerId(o))));
const revocations = await Promise.all(offers.map((offer, i) => signRevocation(offer, signers[i]!, Math.floor(Date.now() / 1000))));
await rejected('wrongRevocationSignerRejected', () => client.mutation(revoke, { revocation: { ...revocations[0], signature: revocations[1]!.signature } }));
for (const revocation of revocations) await board.revoke(revocation);
await rejected('revocationReplayRejected', () => board.revoke(revocations[0]!));
await rejected('republishRevokedNonceRejected', () => board.publish(offers[0]!));
snapshot = await board.list();
const fetchedRevocations = await board.checkRevocations(offers);
checks.revocationsPersisted = fetchedRevocations.length === 2;
checks.staleCopiesExcluded = findCycles(offers, { ...context, revocations: fetchedRevocations }).cycles.length === 0;
const imported = importOffers(exportOffers(offers, fetchedRevocations), context);
checks.offlineImportWorks = imported.offers.length === 2 && findCycles(imported.offers, { ...context, revocations: imported.revocations }).cycles.length === 0;
const result = { verifiedAt: new Date().toISOString(), url, ...context, syntheticPublications: true, financialTransactionsPerformed: false, checks, passed: Object.values(checks).every(Boolean) };
await writeFile('tests/matching/live-result.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
