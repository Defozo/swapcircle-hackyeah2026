import { Buffer } from 'buffer';
// SPL Token evaluates Buffer constants while modules load. Install the browser
// polyfill before importing the wallet and application dependency graph.
globalThis.Buffer = Buffer;
void import('./bootstrap');
