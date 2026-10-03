import React from 'react';
import ReactDOM from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './styles.css';
import './demo.css';
import { DemoApp } from './DemoApp';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><DemoApp /></React.StrictMode>);
