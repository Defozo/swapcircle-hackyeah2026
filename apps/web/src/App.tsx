import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronRight, CircleHelp, Clock3, Download, FileJson, GitBranch, Globe2, Layers3, LayoutGrid, Loader2, LockKeyhole, Menu, Plus, RefreshCw, Search, ShieldCheck, Sparkles, Upload, Users, Wallet, X } from 'lucide-react';
import { SwapCircleClient, formatAmount, parseAmount, submitAndConfirm, type BuiltTransaction, type Cycle, type Leg, type Manifest } from '@swapcircle/sdk';
import { createOffer, createOfferLink, exportOffers, findCycles, importOfferLink, importOffers, offerId, signOffer, signRevocation, verifyOffer, validateCycleOffers, type MatchedCycle, type SignedOffer, type SignedRevocation } from '@swapcircle/matching';
import { dictionaries, LanguageContext, createTranslator, useTranslation, localizeText, operationIdentity, type Language } from './i18n';
import { Address, CycleGraph, Empty, Explorer, Modal, Notice, download, ownerName, short, symbol, time } from './ui';
import { loadTransactions, message, reconcileTransaction, STORAGE, type PendingTransaction } from './transactions';
import { persistTransactionUpdates } from './transaction-journal';

type Route = 'board' | 'matches' | 'deposits' | 'recovery' | 'rules' | 'cycle';
type MintAuthoritySnapshot = { mint: string; authority: string | null };
type Confirmation = { label: string; operationKey: string; leg?: number; built: BuiltTransaction; cycle?: string; legs?: Leg[]; mintAuthorities?: MintAuthoritySnapshot[]; deadline?: number; cost: { feeLamports: number; accountRentLamports: number; bytes: number }; after?: () => Promise<void> };
const routes: Route[] = ['board', 'matches', 'deposits', 'recovery', 'rules'];
const localDate = (timestamp: number) => { const d = new Date(timestamp * 1000); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
const fromLocalDate = (value: string) => Math.floor(new Date(value).getTime() / 1000);
const nowSeconds = () => Math.floor(Date.now() / 1000);
const initialRoute = (): Route => location.hash.startsWith('#/cycle/') ? 'cycle' : routes.find(r => location.hash === `#/${r}`) || 'board';

export function App() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const owner = wallet.publicKey?.toBase58();
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem('swapcircle:language') === 'en' ? 'en' : 'pl');
  const t = dictionaries[language];
  const locale = language === 'en' ? 'en-GB' : 'pl-PL';
  const { p, f } = createTranslator(language);
  const l = (value: string) => localizeText(language, value);
  const [route, setRoute] = useState<Route>(initialRoute);
  const [menuOpen, setMenuOpen] = useState(false);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [network, setNetwork] = useState<'checking' | 'ready' | 'error'>('checking');
  const [networkError, setNetworkError] = useState('');
  const [authority, setAuthority] = useState<string | null | undefined>();
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState('');
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [sol, setSol] = useState<number | null>(null);
  const [balances, setBalances] = useState<{ mint: string; account: string; amount: string; decimals: number }[]>([]);
  const [offers, setOffers] = useState<SignedOffer[]>([]);
  const [revocations, setRevocations] = useState<SignedRevocation[]>([]);
  const [boardStatus, setBoardStatus] = useState('local');
  const [search, setSearch] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchedCycle | null>(null);
  const [selectedMatchLegs, setSelectedMatchLegs] = useState<Leg[]>([]);
  const [matchMintAuthorities, setMatchMintAuthorities] = useState<MintAuthoritySnapshot[]>([]);
  const [matchBalances, setMatchBalances] = useState<{ owner: string; sufficient: boolean; checkedAt: number }[]>([]);
  const [balanceSync, setBalanceSync] = useState<number | null>(null);
  const [matchDeadline, setMatchDeadline] = useState('');
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [cycleBalances, setCycleBalances] = useState<{ owner: string; mint: string; amount: string | null; decimals: number; checkedAt: number }[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycleAddress, setCycleAddress] = useState(() => location.hash.startsWith('#/cycle/') ? decodeURIComponent(location.hash.slice(8)) : '');
  const [transactions, setTransactions] = useState<PendingTransaction[]>(loadTransactions);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [consent, setConsent] = useState(false);
  const [freshAccount, setFreshAccount] = useState(false);
  const [destination, setDestination] = useState('');
  const [recoveryLeg, setRecoveryLeg] = useState(0);
  const [tick, setTick] = useState(nowSeconds());
  const importedHash = useRef(false);
  const client = useMemo(() => manifest ? new SwapCircleClient(connection, manifest) : null, [connection, manifest]);
  const context = useMemo(() => manifest ? { genesisHash: manifest.genesisHash, programId: manifest.programId } : null, [manifest]);
  const boardUrl = manifest?.cluster === 'localnet' ? undefined : import.meta.env.VITE_CONVEX_URL || manifest?.convexUrl;
  const storeKey = context ? `swapcircle:offers:v1:${context.genesisHash}:${context.programId}` : null;
  const networkKey = context ? `${context.genesisHash}:${context.programId}` : null;
  const scopedTransactions = transactions.filter(tx => tx.networkKey === networkKey);
  const toast = (text: string, error = false) => setNotice({ text, error });
  const go = (next: Route) => { setRoute(next); setMenuOpen(false); location.hash = `/${next}`; };
  const fail = (e: unknown) => toast(message(e), true);

  useEffect(() => {
    document.documentElement.lang = language; localStorage.setItem('swapcircle:language', language);
  }, [language]);
  useEffect(() => { const id = setInterval(() => setTick(nowSeconds()), 15_000); return () => clearInterval(id); }, []);
  useEffect(() => {
    const onHash = () => { setRoute(initialRoute()); if (location.hash.startsWith('#/cycle/')) setCycleAddress(decodeURIComponent(location.hash.slice(8))); };
    window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(import.meta.env.VITE_DEMO_MANIFEST_URL || './deployments/devnet.json', { signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error(f("Manifest wdrożenia niedostępny (HTTP {0}).", response.status)); return response.json(); })
      .then((data: Manifest) => {
        if (data.version !== 1 || !['devnet', 'localnet'].includes(data.cluster) || !data.genesisHash || !Array.isArray(data.mints)) throw new Error(p("Nieprawidłowy manifest wdrożenia."));
        new PublicKey(data.programId);
        if (import.meta.env.VITE_SWAPCIRCLE_PROGRAM_ID && data.programId !== import.meta.env.VITE_SWAPCIRCLE_PROGRAM_ID) throw new Error(p("Program ID różni się od manifestu."));
        setManifest(data);
      }).catch(e => { if (!controller.signal.aborted) { setNetwork('error'); setNetworkError(message(e)); } });
    return () => controller.abort();
  }, []);

  const refreshNetwork = useCallback(async () => {
    if (!client) return;
    setNetwork('checking');
    try {
      await client.verifyNetwork();
      const program = await client.readProgramAuthority();
      setAuthority(program.upgradeAuthority); setNetwork('ready'); setNetworkError(''); setLastSync(Date.now());
    } catch (e) { setNetwork('error'); setNetworkError(message(e)); setAuthority(undefined); }
  }, [client]);
  useEffect(() => { void refreshNetwork(); }, [refreshNetwork]);

  const refreshWallet = useCallback(async () => {
    if (!client || !owner || network !== 'ready') { setBalances([]); setSol(null); setBalanceSync(null); return false; }
    const [tokenResult, solResult, cycleResult] = await Promise.allSettled([client.readBalances(owner), connection.getBalance(new PublicKey(owner), 'confirmed'), client.listCycles(owner)]);
    if (tokenResult.status === 'fulfilled') { setBalances(tokenResult.value); setBalanceSync(Date.now()); } else { setBalances([]); setBalanceSync(null); }
    if (solResult.status === 'fulfilled') setSol(solResult.value); else setSol(null);
    if (cycleResult.status === 'fulfilled') setCycles(cycleResult.value); else setCycles([]);
    const failure = [tokenResult, solResult, cycleResult].find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') setNotice({ text: f("Odczyt portfela niekompletny: {0}", message(failure.reason)), error: true });
    else setLastSync(Date.now());
    return !failure;
  }, [client, owner, network, connection]);
  useEffect(() => { void refreshWallet(); }, [refreshWallet]);

  const mergeBundle = useCallback((bundle: { offers: SignedOffer[]; revocations: SignedRevocation[] }) => {
    setOffers(prev => [...new Map([...prev, ...bundle.offers].map(o => [offerId(o), o])).values()]);
    setRevocations(prev => [...new Map([...prev, ...bundle.revocations].map(r => [offerId(r), r])).values()]);
  }, []);
  useEffect(() => {
    if (!context || !storeKey) return;
    try { const local = localStorage.getItem(storeKey); if (local) mergeBundle(importOffers(local, context)); }
    catch (e) { setNotice({ text: f("Nie można odtworzyć zapisanych ofert: {0}", message(e)), error: true }); }
    if (location.hash.startsWith('#import=') && !importedHash.current) {
      importedHash.current = true;
      try { mergeBundle(importOfferLink(location.href, context)); setNotice({ text: p("Podpisane oferty z linku zostały zaimportowane.") }); go('board'); } catch (e) { setNotice({ text: message(e), error: true }); }
    }
  }, [context, storeKey, mergeBundle]);
  useEffect(() => { if (storeKey && (offers.length || revocations.length)) localStorage.setItem(storeKey, exportOffers(offers, revocations)); }, [offers, revocations, storeKey]);

  const refreshBoard = useCallback(async () => {
    if (!boardUrl || !context) { setBoardStatus('local'); return; }
    try {
      const { ConvexBoard } = await import('@swapcircle/matching/board');
      const board = new ConvexBoard(boardUrl, context);
      const snapshot = await board.list(); mergeBundle(snapshot); setBoardStatus('connected'); setLastSync(Date.now());
    } catch (e) { setBoardStatus('error'); setNotice({ text: f("Tablica jest niedostępna. Import i cykle działają niezależnie. {0}", message(e)), error: true }); }
  }, [boardUrl, context, mergeBundle]);
  useEffect(() => { void refreshBoard(); const id = setInterval(() => { void refreshBoard(); }, 30_000); return () => clearInterval(id); }, [refreshBoard]);

  const readCycle = useCallback(async (address: string) => {
    if (!client) throw new Error(p("Najpierw potrzebny jest poprawny manifest sieci."));
    new PublicKey(address);
    const next = await client.readCycle(address); setCycle(next); setCycleAddress(address); setLastSync(Date.now());
    const snapshots = await Promise.allSettled(next.legs.map(leg => client.readBalances(leg.owner)));
    setCycleBalances(next.legs.flatMap((leg, index) => {
      const result = snapshots[index]!;
      const incoming = next.legs[(index + next.legs.length - 1) % next.legs.length]!;
      return [leg, incoming].map(asset => ({ owner: leg.owner, mint: asset.mint, decimals: asset.decimals,
        amount: result.status === 'fulfilled' ? result.value.filter(account => account.mint === asset.mint).reduce((total, account) => total + BigInt(account.amount), 0n).toString() : null,
        checkedAt: Date.now() }));
    }));
    return { ...next, balancesVerified: snapshots.every(result => result.status === 'fulfilled') };
  }, [client]);
  useEffect(() => { if (route === 'cycle' && cycleAddress && client) void readCycle(cycleAddress).catch(e => setNotice({ text: message(e), error: true })); }, [route, cycleAddress, client, readCycle]);
  useEffect(() => {
    if (!client || !cycle?.address) return;
    const address = cycle.address;
    const id = setInterval(() => { if (document.visibilityState === 'visible') void readCycle(address).catch(() => {}); }, 15_000);
    const subscription = connection.onAccountChange(new PublicKey(address), () => { void readCycle(address).catch(() => {}); }, 'confirmed');
    return () => { clearInterval(id); void connection.removeAccountChangeListener(subscription).catch(() => {}); };
  }, [client, connection, cycle?.address, readCycle]);

  const checkPending = useCallback(async () => {
    if (!client || !networkKey) return;
    await client.verifyNetwork();
    const pending = loadTransactions().filter(tx => tx.networkKey === networkKey && ['sent', 'unknown', 'confirmed', 'awaiting-signature'].includes(tx.status));
    const checked = await Promise.allSettled(pending.map(async tx => {
      let cycleChecked = false;
      if (tx.cycle) {
        const info = await connection.getAccountInfo(new PublicKey(tx.cycle), 'confirmed');
        // An absent proposed cycle is a valid readback after a failed create.
        if (!info) cycleChecked = true;
        else { await client.readCycle(tx.cycle); cycleChecked = true; }
      }
      return reconcileTransaction(connection, tx, cycleChecked);
    }));
    setTransactions(persistTransactionUpdates(localStorage, STORAGE, checked.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])));
    if (cycleAddress && client) await readCycle(cycleAddress);
    await refreshWallet();
  }, [connection, cycleAddress, client, networkKey, readCycle, refreshWallet]);
  useEffect(() => { if (client && networkKey) void checkPending().catch(() => {}); }, [client, networkKey]);

  const validOffers = useMemo(() => context ? offers.filter(o => verifyOffer(o, { ...context, now: tick }, revocations).valid) : [], [offers, context, revocations, tick]);
  const matchResult = useMemo(() => context ? findCycles(offers, { ...context, now: tick, revocations, maxResults: 100, maxOffers: 1000 }) : null, [offers, context, revocations, tick]);
  const filteredOffers = validOffers.filter(o => (!onlyMine || o.payload.owner === owner) && `${o.payload.owner} ${o.payload.giveMint} ${o.payload.wantMint} ${symbol(o.payload.giveMint, manifest)} ${symbol(o.payload.wantMint, manifest)}`.toLowerCase().includes(search.toLowerCase()));
  const decimals = (mint: string) => manifest?.mints.find(m => m.mint === mint)?.decimals;
  const amount = (value: string, mint: string) => decimals(mint) === undefined ? f("{0} jednostek bazowych", value) : formatAmount(value, decimals(mint)!);
  const matchLegs = async (match: MatchedCycle): Promise<Leg[]> => {
    if (!client) throw new Error(p("Brak połączenia z programem."));
    return Promise.all(match.offers.map(async ({ payload }) => ({ owner: payload.owner, mint: payload.giveMint, amount: payload.giveAmount, decimals: (await client.readMint(payload.giveMint)).decimals })));
  };
  const readMintAuthorities = async (legs: Leg[]): Promise<MintAuthoritySnapshot[]> => {
    if (!client) throw new Error(p("Brak połączenia z programem."));
    return Promise.all([...new Set(legs.map(leg => leg.mint))].map(async mint => ({ mint, authority: (await client.readMint(mint)).mintAuthority?.toBase58() ?? null })));
  };

  async function prepare(label: string, builder: () => Promise<BuiltTransaction>, options: { cycle?: string; leg?: number; legs?: Leg[]; deadline?: number; after?: () => Promise<void> } = {}) {
    if (!client || !owner || !wallet.signTransaction) { toast(p("Połącz portfel obsługujący podpis transakcji."), true); return; }
    if (network !== 'ready') { toast(p("Najpierw zweryfikuj sieć i program."), true); return; }
    const operationKey = operationIdentity(label);
    if (loadTransactions().some(tx => tx.networkKey === networkKey && (!options.cycle || tx.cycle === options.cycle) && (options.leg === undefined || tx.leg === undefined || options.leg === tx.leg) && (tx.operationKey || operationIdentity(tx.label)) === operationKey && ['sent', 'unknown'].includes(tx.status))) { toast(p("Ta operacja ma nieznany wynik. Sprawdź istniejącą sygnaturę i stan cyklu przed kolejnym podpisem."), true); return; }
    setBusy(label);
    try {
      const built = await builder();
      if (!built.transaction.instructions.length) { toast(p("Wszystkie konta są już przygotowane.")); return; }
      const cost = await client.estimateCost(built.transaction, owner);
      const balance = await connection.getBalance(new PublicKey(owner), 'confirmed');
      if (balance < cost.feeLamports + cost.accountRentLamports) throw new Error(p("Brak wystarczającego SOL na opłatę i utworzenie kont."));
      const mintAuthorities = options.legs ? await readMintAuthorities(options.legs) : [];
      setConfirmation({ label, operationKey, built, ...options, mintAuthorities, cycle: options.cycle || built.cycleAddress, cost }); setConsent(false);
    } catch (e) { fail(e); } finally { setBusy(''); }
  }

  async function submit() {
    if (!confirmation || !wallet.publicKey || !wallet.signTransaction || !consent) return;
    const operation = confirmation; setConfirmation(null); setBusy(operation.label);
    const id = crypto.randomUUID();
    const initial: PendingTransaction = { id, label: operation.label, operationKey: operation.operationKey, leg: operation.leg, networkKey: networkKey!, cycle: operation.cycle, status: 'awaiting-signature', createdAt: Date.now() };
    try {
      setTransactions(persistTransactionUpdates(localStorage, STORAGE, [initial]));
      await submitAndConfirm(connection, operation.built, wallet.publicKey, wallet.signTransaction, status => {
        const normalized: PendingTransaction['status'] = status.phase === 'submitted' ? 'sent' : status.phase === 'failed' ? 'error' : status.phase;
        const persisted = loadTransactions();
        const prior = persisted.find(tx => tx.id === id) || initial;
        const updated = { ...prior, status: normalized, signature: status.signature ?? prior.signature, error: status.error, blockhash: status.blockhash ?? prior.blockhash, lastValidBlockHeight: status.lastValidBlockHeight ?? prior.lastValidBlockHeight };
        setTransactions(persistTransactionUpdates(localStorage, STORAGE, [updated]));
      });
      let cycleBalancesVerified = false;
      if (operation.cycle) { const readback = await readCycle(operation.cycle); cycleBalancesVerified = readback.balancesVerified; setRoute('cycle'); location.hash = `/cycle/${operation.cycle}`; }
      const balancesRead = await refreshWallet(); if (operation.after) await operation.after();
      toast(balancesRead && cycleBalancesVerified ? p("Transakcja confirmed. Stan programu i salda wszystkich uczestników zostały ponownie odczytane.") : p("Transakcja confirmed i stan programu odczytany. Nie udało się potwierdzić wszystkich sald; odśwież portfel."));
    } catch (e) {
      fail(e);
      const pending = loadTransactions().find(tx => tx.id === id);
      if (pending?.status === 'awaiting-signature') {
        try { setTransactions(persistTransactionUpdates(localStorage, STORAGE, [{ ...pending, status: 'error', error: message(e) }])); }
        catch (journalError) { fail(journalError); }
      }
    } finally { setBusy(''); }
  }

  async function publishOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet.signMessage || !owner || !client || !context) { toast(p("Połącz portfel obsługujący podpis wiadomości."), true); return; }
    const fields = new FormData(event.currentTarget); setBusy(p("Podpis oferty"));
    try {
      await client.verifyNetwork();
      const giveMint = String(fields.get('giveMint')).trim(), wantMint = String(fields.get('wantMint')).trim();
      if (giveMint === wantMint) throw new Error(p("Wybierz różne minty wymiany."));
      const [give, want] = await Promise.all([client.readMint(giveMint), client.readMint(wantMint)]);
      const expiresAt = fromLocalDate(String(fields.get('expiresAt')));
      if (expiresAt <= nowSeconds() + 30) throw new Error(p("Ważność oferty musi pozostawiać czas na podpisy."));
      const payload = createOffer({ ...context, owner, giveMint, giveAmount: parseAmount(String(fields.get('giveAmount')), give.decimals).toString(), wantMint, wantAmount: parseAmount(String(fields.get('wantAmount')), want.decimals).toString(), expiresAt });
      const signed = await signOffer(payload, wallet.signMessage);
      mergeBundle({ offers: [signed], revocations: [] });
      if (boardUrl) { const { ConvexBoard } = await import('@swapcircle/matching/board'); await new ConvexBoard(boardUrl, context).publish(signed); }
      setOfferOpen(false); toast(boardUrl ? p("Podpisana oferta została opublikowana.") : p("Podpisana oferta zapisana lokalnie. Udostępnij ją przez eksport lub link."));
    } catch (e) { fail(e); } finally { setBusy(''); }
  }
  async function revoke(offer: SignedOffer) {
    if (!wallet.signMessage || owner !== offer.payload.owner || !context) return;
    setBusy(p("Wycofanie oferty"));
    try { const signed = await signRevocation(offer, wallet.signMessage); mergeBundle({ offers: [], revocations: [signed] }); if (boardUrl) { const { ConvexBoard } = await import('@swapcircle/matching/board'); await new ConvexBoard(boardUrl, context).revoke(signed); } toast(p("Publikacja wycofana. Wcześniejsze depozyty zachowują warunki swojego cyklu.")); } catch (e) { fail(e); } finally { setBusy(''); }
  }
  function doImport(text: string) {
    if (!context) { toast(p("Import wymaga manifestu określającego sieć i program."), true); return; }
    try { const bundle = text.trim().startsWith('http') ? importOfferLink(text.trim(), context) : importOffers(text, context); mergeBundle(bundle); setImportOpen(false); setImportText(''); toast(f("Zweryfikowano podpisy. Zaimportowano {0} ofert i {1} wycofań.", bundle.offers.length, bundle.revocations.length)); } catch (e) { fail(e); }
  }
  async function createFromMatch() {
    if (!selectedMatch || !client || !owner || !context) return;
    try {
      const deadline = fromLocalDate(matchDeadline); validateCycleOffers(selectedMatch.offers, context, deadline, revocations);
      const legs = await matchLegs(selectedMatch);
      await prepare(t.create, () => client.buildCreate({ creator: owner, deadline, legs }), { legs, deadline, after: async () => { setSelectedMatch(null); } });
    } catch (e) { fail(e); }
  }
  async function selectMatch(match: MatchedCycle) {
    setBusy(p("Sprawdzanie dokładnej precyzji mintów"));
    try {
      const legs = await matchLegs(match);
      const checks = await Promise.all(legs.map(async leg => {
        const accounts = await client!.readBalances(leg.owner);
        return { owner: leg.owner, sufficient: accounts.some(account => account.mint === leg.mint && BigInt(account.amount) >= BigInt(leg.amount)), checkedAt: Date.now() };
      }));
      setMatchMintAuthorities(await readMintAuthorities(legs));
      setMatchBalances(checks); setSelectedMatchLegs(legs); setSelectedMatch(match); setMatchDeadline(localDate(match.deadline));
    }
    catch (error) { fail(error); }
    finally { setBusy(''); }
  }
  async function importDemo() {
    if (!manifest) { toast(p("Najpierw potrzebny jest manifest wdrożenia."), true); return; }
    try { const response = await fetch(`./fixtures/${manifest.cluster}-offers.json`, { cache: 'no-store' }); if (!response.ok) throw new Error(p("Brak podpisanych ofert demonstracyjnych dla tej sieci.")); doImport(await response.text()); }
    catch (error) { fail(error); }
  }
  const openCycle = async (address: string) => { setBusy(t.read); try { await readCycle(address); setRoute('cycle'); location.hash = `/cycle/${address}`; } catch (e) { fail(e); } finally { setBusy(''); } };
  const stateLabel = (c: Cycle) => c.state === 'Settled' ? t.settled : c.state === 'Refunded' ? t.returned : c.deadline <= tick ? t.expired : t.waiting;
  const headings: Record<Route, string> = { board: t.board, matches: t.matches, deposits: t.deposits, recovery: t.recovery, rules: t.rules, cycle: t.cycle };

  return <LanguageContext.Provider value={language}><div className="app-shell">
    <a className="skip-link" href="#main-content">{p("Przejdź do treści")}</a>
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <a className="brand" href="#/board" onClick={() => go('board')}><span className="brand-icon"><RefreshCw size={23} strokeWidth={2.8} /></span>SwapCircle<span className="brand-dot">.</span></a>
      <div className="workspace"><span className="workspace-icon"><Users size={17} /></span><div>{p("Społeczność Solana")}<small>{p("Wymieniaj na własnych zasadach")}</small></div></div>
      <div className="nav-caption">{p("PRZESTRZEŃ WYMIANY")}</div>
      <nav aria-label={p("Nawigacja główna")}>{([['board', LayoutGrid], ['matches', GitBranch], ['deposits', Wallet], ['recovery', ShieldCheck]] as const).map(([key, Icon]) => <button key={key} className={`nav-item ${route === key ? 'active' : ''}`} onClick={() => go(key)}><Icon size={19} /><span>{headings[key]}</span>{key === 'matches' && (matchResult?.cycles.length || 0) > 0 ? <span className="nav-count">{matchResult!.cycles.length}</span> : null}{route === key ? <span className="nav-indicator" /> : null}</button>)}</nav>
      <div className="sidebar-bottom"><div className="trust-card"><ShieldCheck size={24} /><strong>{p("Warunki zapisane w kodzie.")}</strong><p>{p("Twoje aktywa trafiają do ustalonego odbiorcy albo wracają do Ciebie.")}</p><button onClick={() => go('rules')}>{t.rules}<ArrowUpRight size={15} /></button></div><button className={`nav-item ${route === 'rules' ? 'active' : ''}`} onClick={() => go('rules')}><CircleHelp size={18} />{p("Jak działa SwapCircle")}</button><div className="sidebar-footer"><span className="solana-mark">≋</span> BUILT ON SOLANA <span>v0.1</span></div></div>
    </aside>
    {menuOpen ? <button className="sidebar-shade" aria-label={p("Zamknij menu")} onClick={() => setMenuOpen(false)} /> : null}
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label={p("Otwórz menu")} onClick={() => setMenuOpen(!menuOpen)}><Menu /></button><span>{p("Przestrzeń wymiany")}</span><ChevronRight size={14} /><strong>{headings[route]}</strong></div><div className="topbar-actions"><span className={`network-pill ${network === 'ready' ? 'network-ready' : ''}`}><span />{manifest?.cluster === 'localnet' ? 'Solana Localnet' : t.devnet}</span><button className="language-button" onClick={() => { const next = language === 'pl' ? 'en' : 'pl'; document.documentElement.lang = next; setLanguage(next); }} aria-label={language === 'pl' ? p("Przełącz na angielski") : p("Przełącz na polski")}><Globe2 size={14} />{language.toUpperCase()}</button><WalletMultiButton>{!wallet.connected ? <><Wallet size={16} />{t.connect}</> : undefined}</WalletMultiButton></div></header>
      <main id="main-content">
        {notice ? <div role={notice.error ? 'alert' : 'status'} className={`toast ${notice.error ? 'toast-error' : ''}`}><span>{l(notice.text)}</span><button className="icon-button" aria-label={p("Zamknij powiadomienie")} onClick={() => setNotice(null)}><X size={16} /></button></div> : null}
        {network === 'error' ? <div className="connection-banner"><span><strong>{t.networkUnavailable}.</strong> {l(networkError)} {p("Oferty lokalne i podgląd pozostają dostępne.")}</span><button onClick={() => void refreshNetwork()}><RefreshCw size={14} />{t.refresh}</button></div> : null}

        {route === 'board' ? <>
          <section className="hero"><div className="hero-copy"><div className="eyebrow"><span /> {p("WYMIANA BEZ POŚREDNIKA")}</div><h1>{t.title}</h1><p>{t.subtitle}</p><div className="hero-actions"><button className="button button-primary" onClick={() => setOfferOpen(true)}><Plus size={18} />{t.newOffer}</button><button className="text-button" onClick={() => setPreviewOpen(true)}>{p("Jak działa krąg")}<ArrowUpRight size={16} /></button></div><div className="hero-note"><ShieldCheck size={14} />{p("Dokładne kwoty. Wspólne rozliczenie. Niezależny zwrot.")}</div></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-center"><RefreshCw size={38} /><span>everyone<br />comes full circle.</span></div><div className="orbit-token orbit-x"><span>X</span><div>100 dX<small>Alicja</small></div></div><div className="orbit-token orbit-y"><span>Y</span><div>40 dY<small>Bartek</small></div></div><div className="orbit-token orbit-z"><span>Z</span><div>250 dZ<small>Celina</small></div></div><span className="orbit-caption">{p("PRZYKŁAD · TOKENY TESTOWE")}</span></div></section>
          <section className="stats" aria-label={p("Stan tablicy")}><Stat icon={<Layers3 size={18} />} label={t.active} value={String(validOffers.length)} extra={p("podpisane i niewygasłe")} /><Stat icon={<Users size={18} />} label={t.owners} value={String(new Set(validOffers.map(o => o.payload.owner)).size)} extra={p("różne adresy portfeli")} /><Stat icon={<GitBranch size={18} />} label={t.cycles} value={String(matchResult?.scope.cyclesFound || 0)} extra={p("2–4 uczestników")} /><Stat icon={<ShieldCheck size={18} />} label={t.fee} value="0%" extra={p("opłaty sieci są osobne")} /></section>
          <section className="board-section"><div className="section-heading"><div><h2>{t.boardTitle}</h2><p>{t.boardSubtitle}</p></div><div className="button-row"><button className="button button-secondary" onClick={() => setImportOpen(true)}><Upload size={15} />{t.import}</button><button className="button button-secondary" disabled={!offers.length} onClick={() => download('swapcircle-offers.json', exportOffers(offers, revocations))}><Download size={15} />{t.export}</button></div></div>
            <div className="board-toolbar"><div className="segment"><button className={!onlyMine ? 'selected' : ''} onClick={() => setOnlyMine(false)}>{t.all}<span>{validOffers.length}</span></button><button className={onlyMine ? 'selected' : ''} onClick={() => setOnlyMine(true)}>{t.mine}</button></div><label className="search"><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.search} aria-label={t.search} /></label><button className="icon-button" aria-label={p("Odśwież tablicę")} onClick={() => void refreshBoard()}><RefreshCw size={17} /></button></div>
            {filteredOffers.length ? <div className="offer-grid">{filteredOffers.map((offer, i) => <article className="offer-card" key={offerId(offer)}><div className="offer-top"><div className={`avatar avatar-${i % 4}`}>{ownerName(offer.payload.owner, manifest).slice(0, 1)}</div><div><strong>{ownerName(offer.payload.owner, manifest)}</strong><Address value={offer.payload.owner} /></div><span className="verified" title={t.signed}><ShieldCheck size={16} /></span></div><div className="offer-amount"><small>{t.give}</small><div><strong>{amount(offer.payload.giveAmount, offer.payload.giveMint)}</strong><span className="token-symbol">{symbol(offer.payload.giveMint, manifest)}</span></div><Address value={offer.payload.giveMint} /></div><div className="offer-divider"><ArrowDown size={14} /></div><div className="offer-amount"><small>{t.want}</small><div><strong>{amount(offer.payload.wantAmount, offer.payload.wantMint)}</strong><span className="token-symbol">{symbol(offer.payload.wantMint, manifest)}</span></div><Address value={offer.payload.wantMint} /></div><div className="offer-footer"><span><Clock3 size={13} />{time(offer.payload.expiresAt)}</span><button className="icon-button" aria-label={p("Skopiuj link oferty")} onClick={() => void navigator.clipboard.writeText(createOfferLink(location.href, [offer], revocations)).then(() => toast(p("Link oferty skopiowany.")))}><ArrowUpRight size={17} /></button></div>{owner === offer.payload.owner ? <button className="withdraw-button" disabled={!!busy} onClick={() => void revoke(offer)}>{t.withdraw}</button> : null}</article>)}</div> : <Empty title={t.empty} text={t.emptyBody}><button className="button button-secondary" onClick={() => setPreviewOpen(true)}><GitBranch size={16} />{t.preview}</button></Empty>}
            <div className="board-bottom"><span><span className={`status-dot ${boardStatus === 'connected' ? 'status-green' : ''}`} />{boardStatus === 'connected' ? p("Współdzielona tablica Convex") : boardStatus === 'error' ? p("Tablica offline · kopia lokalna") : t.local} {p("· podpisy sprawdzane w przeglądarce")}</span><button className="text-button accent" onClick={() => go('matches')}>{t.find}<ArrowRight size={16} /></button></div>
          </section>
          <div className="principles"><div><span>01</span><strong>{p("Znajdź zgodny krąg")}</strong><p>{p("Oferty łączą się wtedy, gdy dokładnie spełniają wzajemne potrzeby.")}</p></div><div><span>02</span><strong>{p("Zaakceptuj swoją wpłatą")}</strong><p>{p("Każdy sam podpisuje transakcję. Warunki zapisują się na Solanie.")}</p></div><div><span>03</span><strong>{p("Wymiana albo zwrot")}</strong><p>{p("Komplet wpłat rozlicza krąg. Po terminie odzyskasz swój depozyt.")}</p></div></div>
        </> : null}

        {route === 'matches' ? <><PageHeading eyebrow={p("DOKŁADNE DOPASOWANIE")} title={t.matchesTitle} text={t.matchesSubtitle} action={<button className="button button-secondary" onClick={() => setManualOpen(true)}><Plus size={16} />{t.manual}</button>} /><div className="match-summary"><div><strong>{matchResult?.scope.pairCycles || 0}</strong><span>{p("Pary")}</span></div><div><strong>{matchResult?.scope.multiPartyCycles || 0}</strong><span>{p("Cykle 3–4 osób")}</span></div><div><strong>{matchResult?.scope.uniqueMatchedOffers || 0}</strong><span>{p("Różne dopasowane oferty")}</span></div><div><strong>{matchResult?.scope.searchedOffers || 0}</strong><span>{p("Przeszukane oferty")}</span></div></div><Notice>{p("Oferty nie rezerwują aktywów. Salda nie zostały jeszcze zweryfikowane. Przed wpłatą aplikacja ponownie sprawdzi stan programu, tokeny i konta odbiorców. Wycofania offline są aktualne tylko na moment eksportu.")}</Notice>{matchResult?.cycles.length ? <div className="matches-list">{matchResult.cycles.map((match, i) => <article className="match-card" key={match.id}><div className="match-card-heading"><span className="match-number">{String(i + 1).padStart(2, '0')}</span><div><h3>{p("Krąg")} {match.offers.length} {p("osób")}</h3><p>{match.offers.map(o => ownerName(o.payload.owner, manifest)).join(' → ')} → {ownerName(match.offers[0]!.payload.owner, manifest)}</p></div><span className="badge badge-green">{p("Dokładne dopasowanie")}</span></div><div className="match-tokens">{match.offers.map((offer, j) => <div key={offerId(offer)}><span className={`token-circle token-${j}`}>{symbol(offer.payload.giveMint, manifest).slice(-1)}</span><strong>{amount(offer.payload.giveAmount, offer.payload.giveMint)} {symbol(offer.payload.giveMint, manifest)}</strong><ArrowRight size={16} /></div>)}</div><div className="match-card-footer"><span><Clock3 size={15} />{p("Termin najpóźniej")} {time(match.maxDeadline)}</span><button className="button button-primary" onClick={() => void selectMatch(match)}>{t.details}<ArrowRight size={16} /></button></div></article>)}</div> : <div className="panel"><Empty title={t.noMatches} text={t.noMatchesBody}><button className="button button-primary" onClick={() => setOfferOpen(true)}><Plus size={16} />{t.newOffer}</button><button className="button button-secondary" onClick={() => setPreviewOpen(true)}>{t.preview}</button></Empty></div>}<p className="fine-print">{p("Sprawdzono")} {matchResult?.scope.searchedOffers || 0} {p("z")} {matchResult?.scope.inputOffers || 0} {p("ofert. Limit zbioru: 1000; limit wyników: 100.")} {matchResult?.scope.searchComplete === false ? p("Osiągnięto limit przeszukiwania. Wyniki nie są kompletne.") : p("Przeszukiwanie ukończone w podanym zakresie.")} {p("Brak obietnicy optymalności ceny lub globalnej płynności.")}</p></> : null}

        {route === 'deposits' ? <><PageHeading eyebrow={p("HISTORIA W SIECI")} title={t.depositsTitle} text={t.depositsBody} action={<button className="button button-secondary" onClick={() => void refreshWallet()}><RefreshCw size={16} />{t.refresh}</button>} />{owner ? <div className="wallet-panel panel"><div><Wallet size={22} /><div><strong>{p("Połączony portfel")}</strong><Address value={owner} /></div></div><div><small>{p("SOL na opłaty")}</small><strong>{sol === null ? p("Nie odczytano") : `${formatAmount(BigInt(sol), 9)} SOL`}</strong></div></div> : null}{balanceSync ? <p className="fine-print">{p("Salda odczytano:")} {new Date(balanceSync).toLocaleTimeString(locale)}{p(". Odczyt nie rezerwuje aktywów.")}</p> : null}{balances.length ? <div className="balances-grid">{balances.map(balance => <div className="panel balance-card" key={balance.account}><span>{symbol(balance.mint, manifest)}</span><strong>{formatAmount(balance.amount, balance.decimals)}</strong><Address value={balance.account} /></div>)}</div> : null}<CycleList cycles={cycles} manifest={manifest} stateLabel={stateLabel} open={address => void openCycle(address)} empty={<Empty title={t.noDeposits} text={t.noDepositsBody}><button className="button button-secondary" onClick={() => go('recovery')}>{t.read}<ArrowRight size={16} /></button></Empty>} />{transactionPanel()}</> : null}

        {route === 'recovery' ? <><PageHeading eyebrow={p("NIEZALEŻNOŚĆ OD OPERATORA")} title={t.recoveryTitle} text={t.recoveryBody} /><section className="recovery-layout"><div className="panel recovery-form"><div className="large-icon"><ShieldCheck size={30} /></div><h2>{t.read}</h2><form onSubmit={e => { e.preventDefault(); void openCycle(cycleAddress.trim()); }}><label>{t.cycleAddress}<input required value={cycleAddress} onChange={e => setCycleAddress(e.target.value)} placeholder={p("Publiczny adres PDA cyklu")} /></label><button className="button button-primary" disabled={!!busy || !client}><Search size={16} />{t.read}</button></form><div className="or-divider">{p("lub odczytaj adres z pakietu")}</div><label className="file-drop"><FileJson size={22} /><span>{p("Wybierz publiczny pakiet odzyskiwania")}</span><input type="file" accept="application/json,.json" onChange={async e => { try { const file = e.target.files?.[0]; if (!file) return; if (file.size > 2_000_000) throw new Error(p("Plik jest zbyt duży.")); const pack = JSON.parse(await file.text()); if (pack.protocol !== 'SwapCircle' || !manifest || pack.genesisHash !== manifest.genesisHash || pack.programId !== manifest.programId) throw new Error(p("Pakiet pochodzi z innej sieci lub programu.")); setRecoveryLeg(pack.leg || 0); await openCycle(pack.cycle); } catch (error) { fail(error); } }} /></label></div><div className="recovery-explainer"><h3>{p("Co jest Twoim prawem?")}</h3><ol><li><strong>{p("Dokładna kwota depozytu")}</strong><p>{p("Zwrot obejmuje zdeponowane tokeny. Opłaty sieciowe i utracone korzyści nie są zwracane.")}</p></li><li><strong>{p("Bez zgody pozostałych osób")}</strong><p>{p("Po terminie wystarczy własny skarbiec i bezpieczne konto docelowe. Dowolna osoba może opłacić operację.")}</p></li><li><strong>{p("Konto zastępcze, gdy potrzebne")}</strong><p>{p("Gdy ATA jest uszkodzone, utwórz nowe konto tokenowe. Właściciel i mint pozostają zgodne z cyklem.")}</p></li><li><strong>{p("Dostęp również bez tej strony")}</strong><p>{p("Pakiet zawiera adresy i komendę niezależnego klienta. Nie zawiera żadnych sekretów.")}</p></li></ol></div></section>{transactionPanel()}</> : null}

        {route === 'cycle' ? <><PageHeading eyebrow={p("WARUNKI ZAPISANE W SIECI")} title={t.cycle} text={p("Odczyt programu jest źródłem praw do tokenów. Samo wskazanie adresu w cyklu nie oznacza zgody właściciela.")} action={<button className="button button-secondary" disabled={!cycleAddress || !!busy} onClick={() => void openCycle(cycleAddress)}><RefreshCw size={16} />{t.refresh}</button>} />{cycle ? <><section className="panel cycle-panel"><div className="cycle-heading"><div><span className={`badge ${cycle.state === 'Settled' ? 'badge-green' : 'badge-neutral'}`}>{stateLabel(cycle)}</span><h2>{p("Krąg")} {cycle.legs.length} {p("uczestników")}</h2><Address value={cycle.address} full /></div><div className="deadline-card"><Clock3 size={20} /><div><small>{t.deadline}</small><strong>{time(cycle.deadline)}</strong><span>{cycle.deadline > tick ? f("Pozostało około {0} min", Math.ceil((cycle.deadline - tick) / 60)) : p("Termin minął według zegara przeglądarki")}</span></div></div></div><CycleGraph legs={cycle.legs} manifest={manifest} copy={t} /><div className="cycle-progress">{cycle.legs.map((leg, i) => <div key={leg.owner}><span className={cycle.fundedMask & 1 << i ? 'step-done' : ''}>{cycle.fundedMask & 1 << i ? <Check size={14} /> : i + 1}</span><strong>{ownerName(leg.owner, manifest)}</strong><small>{cycle.refundedMask & 1 << i ? t.returned : cycle.state === 'Settled' ? t.settled : cycle.fundedMask & 1 << i ? t.deposited : t.waiting}</small></div>)}</div></section>
          {cycle.state === 'Settled' ? <Notice>{p("Wszystkie uzgodnione przekazania wykonano w tej samej transakcji co ostatnią wpłatę. Stan Settled został odczytany z programu. Historia poniżej zawiera sygnatury zapisane w tej przeglądarce.")}</Notice> : <Notice>{p("Wpłata blokuje tokeny do sukcesu albo terminu")} {time(cycle.deadline)}{p(". Ostatnia osoba może zrezygnować, gdy zmieni się cena. Zwrot po terminie wymaga transakcji i SOL na opłatę. O czasie decyduje zegar sieci.")}</Notice>}
          <section className="panel actions-panel"><div className="section-heading"><div><h2>{p("Twoje operacje w cyklu")}</h2><p>{p("Zwrot i sprzątanie mogą zostać opłacone przez inny portfel. Tokeny nadal trafiają do zapisanych właścicieli.")}</p></div></div><div className="recovery-options"><label>{p("Tryb konta zwrotu")}<select value={freshAccount ? 'fresh' : destination ? 'custom' : 'ata'} onChange={e => { setFreshAccount(e.target.value === 'fresh'); setDestination(e.target.value === 'custom' ? ' ' : ''); }}><option value="ata">{p("Domyślne konto ATA")}</option><option value="fresh">{p("Nowe bezpieczne konto tego właściciela")}</option><option value="custom">{p("Istniejące konto tego właściciela")}</option></select></label>{!freshAccount && destination ? <label>{p("Adres konta docelowego")}<input value={destination.trimStart()} onChange={e => setDestination(e.target.value || ' ')} placeholder={p("Konto klasycznego SPL")} /></label> : null}</div><div className="leg-actions">{cycle.legs.map((leg, i) => { const funded = !!(cycle.fundedMask & 1 << i), refunded = !!(cycle.refundedMask & 1 << i), closed = !!(cycle.closedMask & 1 << i), terminal = cycle.state === 'Settled' || cycle.deadline <= tick, obligation = cycle.state !== 'Settled' && funded && !refunded; const options = { freshAccount, destination: destination.trim() || undefined }; return <div key={leg.owner}><div><strong>{ownerName(leg.owner, manifest)}</strong><span>{formatAmount(leg.amount, leg.decimals)} {symbol(leg.mint, manifest)}</span><small>{closed ? p("Skarbiec zamknięty") : refunded ? p("Depozyt zwrócony") : funded ? p("Depozyt wpłacony") : p("Bez depozytu")}</small></div><div className="button-row">{leg.owner === owner && !funded && cycle.state === 'Funding' && cycle.deadline > tick ? <button className="button button-primary" disabled={!!busy} onClick={() => void prepare(t.fund, () => client!.buildFund(cycle.address, i, owner!), { cycle: cycle.address, leg: i, legs: cycle.legs, deadline: cycle.deadline })}>{t.fund}</button> : null}{obligation && cycle.deadline <= tick ? <button className="button button-primary" disabled={!owner || !!busy} onClick={() => void prepare(t.refund, () => client!.buildRefund(cycle.address, i, owner!, options), { cycle: cycle.address, leg: i })}>{t.refund}</button> : null}{terminal && !obligation && !closed ? <><button className="button button-secondary" disabled={!owner || !!busy} onClick={() => void prepare(t.surplus, () => client!.buildSurplus(cycle.address, i, owner!, options), { cycle: cycle.address, leg: i })}>{t.surplus}</button><button className="button button-secondary" disabled={!owner || !!busy} onClick={() => void prepare(t.cleanup, () => client!.buildClose(cycle.address, i), { cycle: cycle.address, leg: i })}>{t.cleanup}</button></> : null}</div></div>; })}</div>{cycle.state === 'Funding' && cycle.deadline > tick ? <button className="button button-secondary" disabled={!owner || !!busy} onClick={() => void prepare(p("Przygotuj konta odbiorców"), () => client!.prepareDestinations(cycle.address, owner!), { cycle: cycle.address })}>{p("Przygotuj brakujące konta odbiorców")}</button> : null}<p className="fine-print">{p("Wcześniejsza wpłata jest nieodwołalna do rozliczenia lub deadline. Brak osobnej operacji settle. Nadwyżki trafiają wyłącznie do właściciela danej nogi; zamknięcie pustych skarbców zwraca rent do")} <Address value={cycle.rentPayer} />.</p></section>
          <section className="panel"><div className="section-heading"><div><h2>{p("Salda uczestników po odczycie")}</h2><p>{p("Bieżące salda wszystkich kont tego właściciela, osobno dla oddawanego i otrzymywanego mintu.")}</p></div></div><div className="table-wrap"><table><thead><tr><th>{p("Właściciel")}</th><th>Mint</th><th>{p("Saldo tokenów")}</th><th>{p("Odczyt")}</th></tr></thead><tbody>{cycleBalances.map((entry, index) => <tr key={`${entry.owner}:${entry.mint}:${index}`}><td>{ownerName(entry.owner, manifest)}</td><td>{symbol(entry.mint, manifest)}<Address value={entry.mint} /></td><td>{entry.amount === null ? p("Odczyt nieudany") : formatAmount(entry.amount, entry.decimals)}</td><td>{new Date(entry.checkedAt).toLocaleTimeString(locale)}</td></tr>)}</tbody></table></div></section><section className="panel recovery-export"><div><Download size={24} /><div><h3>{t.recoveryDownload}</h3><p>{p("Zapisz publiczne dane i instrukcję niezależnego klienta.")}</p></div></div><div className="button-row"><label className="sr-only" htmlFor="recovery-leg">{p("Uczestnik pakietu odzyskiwania")}</label><select id="recovery-leg" value={Math.min(recoveryLeg, cycle.legs.length - 1)} onChange={e => setRecoveryLeg(Number(e.target.value))}>{cycle.legs.map((leg, i) => <option key={leg.owner} value={i}>{ownerName(leg.owner, manifest)}</option>)}</select><button className="button button-secondary" onClick={() => download(`swapcircle-recovery-${cycle.address}-${Math.min(recoveryLeg, cycle.legs.length - 1)}.json`, client!.recoveryPackage(cycle, Math.min(recoveryLeg, cycle.legs.length - 1)))}><Download size={16} />{p("Pobierz JSON")}</button><button className="button button-secondary" onClick={() => void navigator.clipboard.writeText(`${location.origin}${location.pathname}#/cycle/${cycle.address}`).then(() => toast(p("Link cyklu skopiowany.")))}>{p("Kopiuj link")}</button></div></section><details className="panel raw-details"><summary>{p("Sprawdź niezmienne warunki")}</summary><dl><dt>Program ID</dt><dd><Address value={manifest!.programId} full /></dd><dt>{p("Hash warunków")}</dt><dd><code>{cycle.termsHash}</code></dd><dt>{p("Twórca")}</dt><dd><Address value={cycle.creator} full /></dd><dt>Nonce</dt><dd>{cycle.nonce}</dd><dt>{p("Czas ostatniego odczytu")}</dt><dd>{lastSync ? new Date(lastSync).toLocaleString(locale) : t.noSync}</dd></dl></details>{transactionPanel()}</> : <div className="panel"><Empty title={p("Odczytaj cykl z sieci")} text={p("Podaj publiczny adres cyklu w sekcji odzyskiwania. Stan finansowy nie jest symulowany.")}><button className="button button-secondary" onClick={() => go('recovery')}>{t.recovery}</button></Empty></div>}</> : null}

        {route === 'rules' ? <><PageHeading eyebrow={p("PRZEJRZYSTE ZASADY")} title={t.rights} text={t.rightsBody} /><div className="rules-grid"><Rule icon={<GitBranch />} title={p("Wspólne rozliczenie")} text={p("Każda osoba oddaje jedną ustaloną ilość aktywa i otrzymuje aktywo poprzednika. Ostatnia poprawna wpłata wykonuje wszystkie przekazania atomowo. Błąd cofa całą ostatnią transakcję, wcześniejsze depozyty pozostają.")} /><Rule icon={<Clock3 />} title={p("Blokada ma termin")} text={p("Nie można wcześniej odwołać depozytu ani przedłużyć terminu. Ostatni uczestnik może czekać na zmianę ceny. Po deadline każdy wniesiony depozyt można zwrócić osobno, bez zgody operatora i kontrahentów.")} /><Rule icon={<ShieldCheck />} title={p("Odbiorca jest ustalony")} text={p("Program sprawdza rzeczywistego właściciela kont tokenowych, mint, delegata i stan zamrożenia. Refund na nowe konto zachowuje właściciela depozytu. Operator tablicy nie posiada kluczy do Twoich tokenów.")} /><Rule icon={<Wallet />} title={p("Koszty są osobne")} text={p("Protokół nie pobiera prowizji. Sieć pobiera opłaty, także za część nieudanych transakcji. Twórca płaci rent kont, rent pustych skarbców można odzyskać. Rekord cyklu pozostaje. Zwrot tokenów nie rekompensuje kosztów i zmiany ceny.")} /></div><section className="panel release-panel"><div className="section-heading"><div><h2>{p("Sprawdź program i środowisko")}</h2><p>{p("Odczyt uprawnienia do aktualizacji pochodzi bezpośrednio z Solany.")}</p></div><button className="button button-secondary" onClick={() => void refreshNetwork()}><RefreshCw size={16} />{t.refresh}</button></div><dl><dt>{t.network}</dt><dd>{manifest?.cluster || p("Nie ustalono")} · {t.test}</dd><dt>Program ID</dt><dd>{manifest ? <Address value={manifest.programId} full /> : p("Brak manifestu")}</dd><dt>Genesis hash</dt><dd><code>{manifest?.genesisHash || p("Nie odczytano")}</code></dd><dt>{t.authority}</dt><dd>{authority === undefined ? 'Niezweryfikowane' : authority === null ? <span className="accent">{p("Brak. Program nie może być aktualizowany.")}</span> : <><span className="warning-text">{p("Program może być aktualizowany przez:")} </span><Address value={authority} full /></>}</dd><dt>{p("Hash artefaktu")}</dt><dd><code>{manifest?.artifactHash || p("Nie podano")}</code></dd><dt>Commit</dt><dd><code>{manifest?.commit || p("Nie podano")}</code></dd><dt>RPC</dt><dd><code>{connection.rpcEndpoint}</code></dd></dl></section><Notice danger>{p("Gwarancje zakładają poprawność programu i dostępność sieci. SwapCircle nie gwarantuje rynkowej opłacalności, płynności, przyszłej wartości tokenów ani bezpieczeństwa portfela. dX, dY i dZ są tokenami demonstracyjnymi bez wartości pieniężnej.")}</Notice><div className="panel supported-assets"><h3>{p("Obsługiwane aktywa")}</h3><p>{p("Klasyczne SPL Token, bez freeze authority i rozszerzeń Token-2022. Wrapped SOL nie jest obsługiwany. Nazwa i logo są tylko pomocą; aktywo identyfikuje mint.")}</p>{manifest?.mints.map(mint => <div key={mint.mint}><strong>{mint.symbol}</strong><Address value={mint.mint} full /><span>{mint.decimals} {p("miejsc dziesiętnych")}</span></div>)}</div></> : null}

        <footer className="page-footer"><span>SwapCircle <span>·</span> {p("Każdy wnosi swoją część.")}</span><span><span className={`status-dot ${network === 'ready' ? 'status-green' : ''}`} />{lastSync ? `${t.synced}: ${new Date(lastSync).toLocaleTimeString(locale)}` : t.noSync}<span>·</span>{manifest?.cluster || 'devnet'} / {t.test}</span></footer>
      </main>
    </div>

    <Modal error={notice?.error ? l(notice.text) : undefined} open={offerOpen} setOpen={setOfferOpen} title={p("Twoja część następnego kręgu")} description={p("Podpis wiadomości publikuje warunki. Nie przenosi i nie rezerwuje tokenów.")}><form className="form" onSubmit={e => void publishOffer(e)}><datalist id="mint-options">{manifest?.mints.map(m => <option key={m.mint} value={m.mint}>{m.symbol}</option>)}</datalist><div className="form-asset"><span className="form-step">01</span><h3>{t.give}</h3><label>{t.mint}<input required name="giveMint" list="mint-options" placeholder={p("Adres mintu SPL")} defaultValue={manifest?.mints[0]?.mint} /></label><label>{t.exact}<input name="giveAmount" required inputMode="decimal" placeholder="0.00" pattern="[0-9]+([.,][0-9]+)?" /></label></div><div className="form-asset"><span className="form-step">02</span><h3>{t.want}</h3><label>{t.mint}<input required name="wantMint" list="mint-options" placeholder={p("Adres mintu SPL")} defaultValue={manifest?.mints[1]?.mint} /></label><label>{t.exact}<input name="wantAmount" required inputMode="decimal" placeholder="0.00" pattern="[0-9]+([.,][0-9]+)?" /></label></div><label>{t.expires}<input type="datetime-local" required name="expiresAt" min={localDate(nowSeconds() + 60)} defaultValue={localDate(nowSeconds() + 3600)} /></label><label className="checkbox-label"><input type="checkbox" required />{p("Zgadzam się na publikację adresu portfela i dokładnych warunków oferty. Oferta nie gwarantuje dopasowania.")}</label><Notice>{p("Przed podpisem odczytamy minty i precyzję z sieci. Wszystkie ilości są przeliczane dokładnie, bez zaokrąglania.")}</Notice><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setOfferOpen(false)}>{t.cancel}</button><button className="button button-primary" disabled={!owner || !wallet.signMessage || network !== 'ready' || !!busy}>{busy ? <Loader2 className="spin" size={16} /> : <LockKeyhole size={16} />}{t.publish}</button></div>{!owner ? <p className="fine-print">{p("Połącz portfel, aby podpisać ofertę.")}</p> : null}</form></Modal>
    <Modal error={notice?.error ? l(notice.text) : undefined} open={importOpen} setOpen={setImportOpen} title={p("Oferty podróżują razem z Tobą")} description={p("Zaimportuj podpisany pakiet JSON lub link. Sprawdzimy każdą sygnaturę, domenę, program i sieć.")}><div className="form"><label className="file-drop"><Upload size={24} /><span>{p("Wybierz plik z ofertami")}</span><small>{p("JSON · maks. 2 MB")}</small><input type="file" accept="application/json,.json" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 2_000_000) { toast(p("Plik przekracza 2 MB."), true); return; } doImport(await file.text()); }} /></label><label>{p("Treść JSON albo pełny link")}<textarea rows={7} value={importText} onChange={e => setImportText(e.target.value)} placeholder='{"format":"swapcircle:offers", ...}' /></label><Notice>{p("Kopia offline może nie zawierać ostatnich wycofań publikacji. Oferta nie uprawnia nikogo do transferu tokenów.")}</Notice><button className="button button-secondary" disabled={!manifest} onClick={() => void importDemo()}><Sparkles size={16} />{p("Importuj oferty demonstracyjne (")}{manifest?.cluster || p("sieć")})</button><div className="modal-actions"><button className="button button-secondary" onClick={() => setImportOpen(false)}>{t.cancel}</button><button className="button button-primary" disabled={!importText.trim() || !context} onClick={() => doImport(importText)}><ShieldCheck size={16} />{p("Zweryfikuj i importuj")}</button></div></div></Modal>
    <Modal error={notice?.error ? l(notice.text) : undefined} open={!!selectedMatch} setOpen={open => { if (!open) setSelectedMatch(null); }} title={p("Warunki wspólnej wymiany")} description={p("Kolejność poniżej określa przepływ aktywów. Cykl zostanie zapisany na Solanie i nie będzie edytowalny.")} wide>{selectedMatch ? <div className="form"><CycleGraph legs={selectedMatchLegs} manifest={manifest} copy={t} /><MintAuthorities items={matchMintAuthorities} manifest={manifest} /><div className="balance-verification">{matchBalances.map(check => <p key={check.owner}>{ownerName(check.owner, manifest)}: {check.sufficient ? p("saldo wystarczające") : p("brak wystarczającego salda na jednym koncie")}{p(", odczyt")} {new Date(check.checkedAt).toLocaleTimeString(locale)}{p(". Aktywa nie są zarezerwowane.")}</p>)}</div><label>{t.deadline}<input type="datetime-local" required value={matchDeadline} max={localDate(selectedMatch.maxDeadline)} min={localDate(nowSeconds() + 60)} onChange={e => setMatchDeadline(e.target.value)} /></label><Notice>{p("Utworzenie cyklu nie pobiera tokenów uczestników. Każdy akceptuje warunki dopiero własną wpłatą. Wcześniejsze wpłaty są zablokowane do rozliczenia albo terminu.")}</Notice><div className="modal-actions"><button className="button button-secondary" onClick={() => setSelectedMatch(null)}>{t.cancel}</button><button className="button button-primary" disabled={!owner || !!busy || network !== 'ready'} onClick={() => void createFromMatch()}>{t.create}<ArrowRight size={16} /></button></div></div> : null}</Modal>
    <Modal error={notice?.error ? l(notice.text) : undefined} open={manualOpen} setOpen={setManualOpen} title={t.manual} description={p("Podaj 2–4 różnych właścicieli w kolejności przepływu. Token każdej osoby otrzyma kolejna, a ostatniej pierwsza.")} wide><ManualForm manifest={manifest} busy={!!busy} enabled={!!owner && network === 'ready'} onCreate={async (legs, deadline) => { await prepare(t.create, () => client!.buildCreate({ creator: owner!, legs, deadline }), { legs, deadline, after: async () => setManualOpen(false) }); }} onError={fail} /></Modal>
    <Modal error={notice?.error ? l(notice.text) : undefined} open={!!confirmation} setOpen={open => { if (!open) setConfirmation(null); }} title={confirmation ? l(confirmation.label) : p("Potwierdź operację")} description={p("Sprawdź odbiorców i koszty. Portfel poprosi o osobny podpis transakcji.")} wide={!!confirmation?.legs}>{confirmation ? <div className="form">{confirmation.legs ? <CycleGraph legs={confirmation.legs} manifest={manifest} copy={t} /> : null}<MintAuthorities items={confirmation.mintAuthorities || []} manifest={manifest} />{confirmation.cycle ? <label>{p("Cykl")}<Address value={confirmation.cycle} full /></label> : null}{confirmation.built.destination ? <label>{p("Konto docelowe zwrotu")}<Address value={confirmation.built.destination} full /></label> : null}{confirmation.deadline ? <Notice>{p("Twoje tokeny mogą pozostać zablokowane do")} {time(confirmation.deadline)}{p(". Brak gwarancji, że pozostali uczestnicy wpłacą.")}</Notice> : null}<div className="cost-breakdown"><div><span>{p("Szacowana opłata sieci")}</span><strong>{formatAmount(BigInt(confirmation.cost.feeLamports), 9)} SOL</strong></div><div><span>{p("Utworzenie kont / rent")}</span><strong>{formatAmount(BigInt(confirmation.cost.accountRentLamports), 9)} SOL</strong></div><div><span>{p("Prowizja protokołu")}</span><strong>0 SOL</strong></div><div><span>{p("Rozmiar transakcji")}</span><strong>{confirmation.cost.bytes} B</strong></div></div><label className="checkbox-label"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />{p("Sprawdziłem minty, właścicieli, dokładne kwoty i termin. Rozumiem, że zwrot tokenów nie zwraca opłat sieciowych.")}</label><div className="modal-actions"><button className="button button-secondary" onClick={() => setConfirmation(null)}>{t.cancel}</button><button className="button button-primary" disabled={!consent || !!busy} onClick={() => void submit()}><LockKeyhole size={16} />{p("Podpisz w portfelu")}</button></div></div> : null}</Modal>
    <Modal error={notice?.error ? l(notice.text) : undefined} open={previewOpen} setOpen={setPreviewOpen} title={p("Trzy osoby. Jeden zgodny krąg.")} description={t.previewLabel} wide><Preview copy={t} /><div className="modal-actions"><button className="button button-primary" onClick={() => { setPreviewOpen(false); setOfferOpen(true); }}>{p("Dodaj własną ofertę")}<Plus size={16} /></button></div></Modal>
    {busy ? <div className="busy-indicator" role="status"><Loader2 className="spin" size={18} />{l(busy)}</div> : null}
  </div></LanguageContext.Provider>;

  function transactionPanel() { return <section className="panel transactions-panel"><div className="section-heading"><div><h2>{t.transactions}</h2><p>{p("Wysłana sygnatura nie oznacza jeszcze wykonania. Nie ponawiaj nieznanej operacji przed sprawdzeniem.")}</p></div><button className="button button-secondary" onClick={() => void checkPending().catch(fail)}><RefreshCw size={16} />{p("Sprawdź potwierdzenia")}</button></div>{scopedTransactions.length ? <div className="transaction-list">{scopedTransactions.filter(tx => route !== 'cycle' || tx.cycle === cycle?.address).map(tx => <div key={tx.id}><span className={`tx-dot tx-${tx.status}`} /><div><strong>{l(tx.label)}</strong><small>{new Date(tx.createdAt).toLocaleString(locale)}</small>{tx.signature ? <Explorer signature={tx.signature} cluster={manifest?.cluster || 'devnet'} /> : null}{tx.error ? <p className="tx-error">{l(message(tx.error))}</p> : null}</div><span className={`badge ${['confirmed', 'finalized'].includes(tx.status) ? 'badge-green' : 'badge-neutral'}`}>{({ 'awaiting-signature': p("Oczekiwanie na podpis"), sent: p("Wysłano"), confirmed: 'Confirmed', finalized: 'Finalized', error: p("Błąd"), unknown: p("Wynik nieznany") })[tx.status]}</span></div>)}</div> : <p className="fine-print">{p("Brak operacji zapisanych w tej przeglądarce. Stan cyklu można odczytać po jego adresie.")}</p>}</section>; }
}

function Stat({ icon, label, value, extra }: { icon: React.ReactNode; label: string; value: string; extra: string }) { return <div className="stat"><div><span>{label}</span>{icon}</div><strong>{value}</strong><small>{extra}</small></div>; }
function PageHeading({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: React.ReactNode }) { return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{text}</p></div>{action}</div>; }
function Rule({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <article className="panel rule-card"><span>{icon}</span><h3>{title}</h3><p>{text}</p></article>; }
function CycleList({ cycles, manifest, stateLabel, open, empty }: { cycles: Cycle[]; manifest: Manifest | null; stateLabel: (c: Cycle) => string; open: (a: string) => void; empty: React.ReactNode }) { const { p } = useTranslation(); return <div className="panel cycle-list">{cycles.length ? cycles.map(c => <button key={c.address} onClick={() => open(c.address)}><span className="large-icon"><GitBranch size={22} /></span><div><strong>{p("Krąg")} {c.legs.length} {p("osób")}</strong><small>{c.legs.map(l => `${formatAmount(l.amount, l.decimals)} ${symbol(l.mint, manifest)}`).join(' → ')}</small><code>{short(c.address, 9)}</code></div><span className="badge badge-neutral">{stateLabel(c)}</span><ChevronRight size={18} /></button>) : empty}</div>; }
function ManualForm({ manifest, busy, enabled, onCreate, onError }: { manifest: Manifest | null; busy: boolean; enabled: boolean; onCreate: (legs: Leg[], deadline: number) => Promise<void>; onError: (error: unknown) => void }) {
  const { p } = useTranslation();
  const [rows, setRows] = useState([{ owner: '', mint: '', amount: '', decimals: '0' }, { owner: '', mint: '', amount: '', decimals: '0' }]);
  const update = (index: number, key: string, value: string) => setRows(previous => previous.map((row, i) => i === index ? { ...row, [key]: value } : row));
  return <form className="form" onSubmit={event => { event.preventDefault(); try { const values = new FormData(event.currentTarget); const legs = rows.map(r => ({ owner: new PublicKey(r.owner).toBase58(), mint: new PublicKey(r.mint).toBase58(), decimals: Number(r.decimals), amount: parseAmount(r.amount, Number(r.decimals)).toString() })); if (new Set(legs.map(l => l.owner)).size !== legs.length) throw new Error(p("Właściciele muszą być różni.")); void onCreate(legs, fromLocalDate(String(values.get('deadline')))).catch(onError); } catch (e) { onError(e); } }}><datalist id="manual-mints">{manifest?.mints.map(m => <option key={m.mint} value={m.mint}>{m.symbol}</option>)}</datalist>{rows.map((row, i) => <fieldset className="manual-row" key={i}><legend>{p("Uczestnik")} {i + 1} → {i + 1 === rows.length ? 1 : i + 2}</legend><label>{p("Adres właściciela")}<input required value={row.owner} onChange={e => update(i, 'owner', e.target.value)} /></label><label>{p("Adres mintu")}<input required list="manual-mints" value={row.mint} onChange={e => { update(i, 'mint', e.target.value); const mint = manifest?.mints.find(m => m.mint === e.target.value); if (mint) update(i, 'decimals', String(mint.decimals)); }} /></label><div className="form-columns"><label>{p("Ilość tokenów")}<input required inputMode="decimal" value={row.amount} onChange={e => update(i, 'amount', e.target.value)} /></label><label>{p("Decimals mintu")}<input type="number" min="0" max="255" required value={row.decimals} onChange={e => update(i, 'decimals', e.target.value)} /></label></div></fieldset>)}<div className="button-row"><button type="button" className="button button-secondary" disabled={rows.length >= 4} onClick={() => setRows([...rows, { owner: '', mint: '', amount: '', decimals: '0' }])}><Plus size={16} />{p("Dodaj uczestnika")}</button><button type="button" className="button button-secondary" disabled={rows.length <= 2} onClick={() => setRows(rows.slice(0, -1))}>{p("Usuń ostatniego")}</button></div><label>{p("Termin wpłat")}<input required type="datetime-local" name="deadline" min={localDate(nowSeconds() + 60)} defaultValue={localDate(nowSeconds() + 900)} /></label><Notice>{p("Przed przygotowaniem transakcji odczytamy minty i sprawdzimy decimals. Wpisanie cudzego adresu nie stanowi zgody tej osoby.")}</Notice><button className="button button-primary" disabled={!enabled || busy}>{p("Sprawdź i utwórz cykl")}<ArrowRight size={16} /></button></form>;
}
function Preview({ copy }: { copy: typeof dictionaries.pl | typeof dictionaries.en }) {
  const { p } = useTranslation();
  const legs: Leg[] = [{ owner: 'Alicja', mint: 'dX', amount: '100', decimals: 0 }, { owner: 'Celina', mint: 'dZ', amount: '250', decimals: 0 }, { owner: 'Bartek', mint: 'dY', amount: '40', decimals: 0 }];
  return <><div className="preview-explanation"><span className="badge badge-neutral"><Sparkles size={13} />{p("Przykład syntetyczny")}</span><p>{p("Alicja chce 40 dY, Bartek 250 dZ, a Celina 100 dX. Żadna para nie spełnia obu swoich potrzeb. Wspólny cykl spełnia wszystkie trzy.")}</p></div><CycleGraph legs={legs} manifest={null} copy={copy} /><div className="preview-steps"><div><strong>{p("1. Uzgodnienie")}</strong><p>{p("Każdy widzi dokładne ilości, odbiorców i termin.")}</p></div><div><strong>{p("2. Niezależne wpłaty")}</strong><p>{p("Wcześniejsze depozyty czekają w skarbcach programu.")}</p></div><div><strong>{p("3. Ostatnia wpłata")}</strong><p>{p("Wszystkie tokeny trafiają do ustalonych odbiorców w jednej transakcji.")}</p></div></div><Notice>{p("To ilustracja mechanizmu, nie transakcja ani dowód popytu. Gdy zabraknie wpłaty, po terminie właściciele odzyskują swoje depozyty. Ilości nie oznaczają równej wartości rynkowej.")}</Notice></>;
}








function MintAuthorities({ items, manifest }: { items: MintAuthoritySnapshot[]; manifest: Manifest | null }) {
  const { p } = useTranslation();
  if (!items.length) return null;
  return <Notice><div><strong>{p("Uprawnienia do emisji tokenów")}</strong><p>{p("Odczytano z sieci przed podpisem. Aktywne mintAuthority pozwala jego posiadaczowi zwiększyć podaż tokena.")}</p><ul>{items.map(item => <li key={item.mint}><strong>{symbol(item.mint, manifest)}</strong> <Address value={item.mint} />{item.authority ? <><span>{p("Może wyemitować dodatkowe tokeny:")}</span> <Address value={item.authority} /></> : <span>{p("Brak uprawnienia do dalszej emisji.")}</span>}</li>)}</ul></div></Notice>;
}
