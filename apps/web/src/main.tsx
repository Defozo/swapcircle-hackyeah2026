import { Buffer } from 'buffer';
// SPL Token evaluates Buffer constants while modules load. Install the browser
// polyfill before importing the wallet and application dependency graph.
globalThis.Buffer = Buffer;
// The public entry opens the self-contained product demo. Existing app links,
// offer imports and cycle deep links still open the wallet-backed client.
const mode = new URLSearchParams(location.search).get('mode');
const appRoute = !!location.hash && !location.hash.startsWith('#/demo');
if (mode === 'app' || (mode !== 'demo' && appRoute)) void import('./bootstrap');
else void import('./demo-bootstrap');
