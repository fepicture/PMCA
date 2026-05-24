import './popup.css';
import { renderAll } from './view/view.js';
import { hydrateIcons } from './util/icons.js';

console.log("Hello PMCA!");
await renderAll();
hydrateIcons(document);