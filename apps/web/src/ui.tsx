import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUpRight, Check, Copy as CopyIcon, X, CircleHelp, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { Background, ReactFlow, MarkerType, type Node, type Edge } from '@xyflow/react';
import type { Leg, Manifest } from '@swapcircle/sdk';
import { formatAmount } from '@swapcircle/sdk';
import { useTranslation, type Copy } from './i18n';

export const short = (s: string, n = 5) => s.length > n * 2 + 2 ? `${s.slice(0, n)}…${s.slice(-n)}` : s;
export const time = (s: number) => new Date(s * 1000).toLocaleString(typeof document === 'undefined' ? undefined : document.documentElement.lang === 'en' ? 'en-GB' : 'pl-PL', { dateStyle: 'short', timeStyle: 'short' });
export const symbol = (mint: string, manifest?: Manifest | null) => manifest?.mints.find(m => m.mint === mint)?.symbol || short(mint, 4);
export const ownerName = (owner: string, manifest?: Manifest | null) => manifest?.participants?.find(p => p.owner === owner)?.name || short(owner);
export function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Address({ value, full = false }: { value: string; full?: boolean }) {
  const { f } = useTranslation();
  const [copied, setCopied] = useState(false);
  return <span className="address"><code title={value}>{full ? value : short(value)}</code><button className="icon-button" aria-label={f("Kopiuj {0}", value)} onClick={() => { void navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }}>{copied ? <Check size={13} /> : <CopyIcon size={13} />}</button></span>;
}
export function Modal({ open, setOpen, title, description, children, wide = false, error }: { open: boolean; setOpen: (open: boolean) => void; title: string; description?: string; children: ReactNode; wide?: boolean; error?: string }) {
  const { p } = useTranslation();
  const trigger = useRef<HTMLElement | null>(null);
  return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal><Dialog.Overlay className="modal-overlay" /><Dialog.Content className={`modal ${wide ? 'modal-wide' : ''}`} onOpenAutoFocus={() => { trigger.current = document.activeElement as HTMLElement; }} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}><div className="modal-heading"><div><Dialog.Title>{title}</Dialog.Title>{description ? <Dialog.Description>{description}</Dialog.Description> : <Dialog.Description className="sr-only">{p("Warunki i szczegóły operacji")}</Dialog.Description>}</div><Dialog.Close className="icon-button" aria-label={p("Zamknij")}><X /></Dialog.Close></div>{error ? <div className="toast toast-error" role="alert">{error}</div> : null}{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function Empty({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return <div className="empty"><div className="empty-symbol"><CircleHelp size={28} /></div><h3>{title}</h3><p>{text}</p>{children}</div>;
}
export function Notice({ children, danger = false }: { children: ReactNode; danger?: boolean }) {
  return <div className={`notice ${danger ? 'notice-danger' : ''}`}><ShieldCheck size={18} /><div>{children}</div></div>;
}
export function Explorer({ signature, cluster }: { signature: string; cluster: string }) {
  return <a className="external-link" target="_blank" rel="noreferrer" href={`https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=${cluster === 'localnet' ? 'custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899' : 'devnet'}`}>{short(signature, 8)}<ArrowUpRight size={14} /></a>;
}
export function CycleGraph({ legs, manifest, copy }: { legs: Leg[]; manifest: Manifest | null; copy: Copy }) {
  const { p } = useTranslation();
  const nodes: Node[] = legs.map((leg, i) => {
    const angle = (2 * Math.PI * i / legs.length) - Math.PI / 2;
    return { id: String(i), type: 'default', position: { x: 290 + Math.cos(angle) * 230, y: 160 + Math.sin(angle) * 120 }, data: { label: <div className="graph-person"><span className={`avatar avatar-${i}`}>{ownerName(leg.owner, manifest).slice(0, 1)}</span><div><strong>{ownerName(leg.owner, manifest)}</strong><span>{formatAmount(leg.amount, leg.decimals)} {symbol(leg.mint, manifest)}</span></div></div> }, draggable: false, selectable: false };
  });
  const edges: Edge[] = legs.map((leg, i) => ({ id: `e${i}`, source: String(i), target: String((i + 1) % legs.length), type: 'smoothstep', label: `${formatAmount(leg.amount, leg.decimals)} ${symbol(leg.mint, manifest)}`, markerEnd: { type: MarkerType.ArrowClosed, color: '#b5de79' }, style: { stroke: '#86a85b', strokeWidth: 1.5 }, labelStyle: { fill: '#d4edb2', fontSize: 11 }, labelBgStyle: { fill: '#151c24' }, labelBgPadding: [8, 5], labelBgBorderRadius: 6, animated: false }));
  return <><div className="cycle-graph" role="img" aria-label={p("Kierunek przekazywania aktywów. Równoważna tabela znajduje się poniżej.")}><ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.2 }} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false} preventScrolling={false} proOptions={{ hideAttribution: true }}><Background gap={24} color="#26303b" /></ReactFlow></div><div className="table-wrap"><table><caption className="sr-only">{p("Dokładne przekazania w cyklu")}</caption><thead><tr><th>{copy.owner}</th><th>{copy.give}</th><th>{p("Odbiorca")}</th><th>{copy.want}</th></tr></thead><tbody>{legs.map((leg, i) => { const before = legs[(i + legs.length - 1) % legs.length]!; return <tr key={leg.owner}><td><strong>{ownerName(leg.owner, manifest)}</strong><Address value={leg.owner} /></td><td>{formatAmount(leg.amount, leg.decimals)} {symbol(leg.mint, manifest)}<Address value={leg.mint} /></td><td>{ownerName(legs[(i + 1) % legs.length]!.owner, manifest)}</td><td>{formatAmount(before.amount, before.decimals)} {symbol(before.mint, manifest)}</td></tr>; })}</tbody></table></div></>;
}
