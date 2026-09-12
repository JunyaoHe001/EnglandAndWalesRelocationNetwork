/* Atlas basemap controls. Research layers are never removed by this module. */
(() => {
  'use strict';
  if (window.AtlasBasemap) return;
  const NS = 'http://www.w3.org/2000/svg';
  const storageKey = 'atlas-basemap-visible:' + window.location.pathname;
  function preference() {
    try { return localStorage.getItem(storageKey) !== 'false'; } catch (_) { return true; }
  }
  function remember(value) {
    try { localStorage.setItem(storageKey, String(value)); } catch (_) { /* Storage is optional. */ }
  }
  function styles() {
    if (document.getElementById('atlas-basemap-style')) return;
    const style = document.createElement('style');
    style.id = 'atlas-basemap-style';
    style.textContent = '.atlas-basemap-control{padding:14px 0;border-bottom:1px solid #d9e0e7}.atlas-basemap-control label{display:flex;align-items:center;gap:9px;margin:0;cursor:pointer;font:600 13px/1.5 inherit;color:inherit}.atlas-basemap-control input{width:17px;height:17px;margin:0;accent-color:#285f86;flex:none}.atlas-basemap-control input:focus-visible{outline:2px solid #285f86;outline-offset:3px}.atlas-basemap-note{margin:5px 0 0;font-size:11px;line-height:1.45;color:#667085}.atlas-basemap-status{font-size:11px;line-height:1.45;color:#8a4b10}.atlas-basemap-tiles{filter:grayscale(.75)}.atlas-basemap-context{pointer-events:none}.atlas-basemap-context text{font-family:Arial,sans-serif;fill:#5f6e78;paint-order:stroke;stroke:#fff;stroke-width:2px;stroke-linejoin:round}.atlas-basemap-credit{font-size:10px;line-height:1.4;margin-top:4px}.atlas-basemap-credit a{color:inherit}';
    document.head.appendChild(style);
  }
  function control(onChange, note) {
    styles();
    const existing = document.getElementById('atlas-basemap-toggle');
    if (existing) return existing;
    const host = document.querySelector('#sidebar .sidebar-inner, .sidebar-inner, #sidebar, .sidebar');
    if (!host) throw new Error('Basemap control: sidebar not found');
    const section = document.createElement('section');
    section.className = 'atlas-basemap-control';
    section.setAttribute('aria-label', 'Basemap display');
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.id = 'atlas-basemap-toggle';
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.checked = preference();
    const text = document.createElement('span');
    text.textContent = 'Show basemap';
    label.append(input, text);
    section.appendChild(label);
    const description = document.createElement('p');
    description.className = 'atlas-basemap-note';
    description.textContent = note || 'Geographic context only; network layers stay visible.';
    section.appendChild(description);
    const header = host.querySelector(':scope > header');
    if (header) header.after(section); else host.prepend(section);
    input.addEventListener('change', () => {
      remember(input.checked);
      onChange(input.checked);
    });
    onChange(input.checked);
    return input;
  }
  function leaflet(map, options = {}) {
    const L = window.L;
    if (!L || !map) throw new Error('Basemap control: Leaflet map not ready');
    const layer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      maxNativeZoom: 19,
      maxZoom: Math.max(19, Number(options.maxZoom) || 19),
      opacity: options.opacity ?? 0.72,
      className: 'atlas-basemap-tiles',
      updateWhenIdle: true,
      keepBuffer: 1
    });
    const input = control(visible => {
      if (visible && !map.hasLayer(layer)) layer.addTo(map);
      if (!visible && map.hasLayer(layer)) map.removeLayer(layer);
    }, 'OpenStreetMap. Hiding the basemap preserves all research layers.');
    let warning;
    layer.on('tileerror', () => {
      if (!input.checked || warning) return;
      warning = document.createElement('p');
      warning.className = 'atlas-basemap-status';
      warning.setAttribute('role', 'status');
      warning.textContent = 'Some basemap tiles could not load. The research layers remain available.';
      input.closest('section').appendChild(warning);
    });
    layer.on('tileload', () => { if (warning) { warning.remove(); warning = null; } });
    window.__ATLAS_BASEMAP__ = { type: 'leaflet', layer, map, input };
    return layer;
  }
  function svg(elements, options = {}) {
    const layers = Array.from(elements).filter(Boolean);
    if (!layers.length) throw new Error('Basemap control: no geographic context layers');
    const displays = layers.map(layer => layer.style.display);
    layers.forEach(layer => layer.classList.add('atlas-basemap-context'));
    const input = control(visible => {
      layers.forEach((layer, index) => { layer.style.display = visible ? displays[index] : 'none'; });
    }, options.note || 'Local vector basemap. No API key or external map service is required.');
    window.__ATLAS_BASEMAP__ = { type: 'svg', layers, input };
    return input;
  }
  function element(tag, attributes = {}) {
    const el = document.createElementNS(NS, tag);
    Object.entries(attributes).forEach(([key, value]) => el.setAttribute(key, String(value)));
    return el;
  }
  window.AtlasBasemap = { leaflet, svg, control, element };
})();
