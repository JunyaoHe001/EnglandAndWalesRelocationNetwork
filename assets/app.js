(() => {
  'use strict';
  const nativeFetch = window.fetch.bind(window);
  const virtual = new Map();
  let packagePromise = null;

  function normalise(input) {
    let value = typeof input === 'string' ? input : input.url;
    try { value = new URL(value, window.location.href).pathname; } catch {}
    value = value.split('?')[0];
    const marker = '/EnglandAndWalesRelocationNetwork/';
    if (value.includes(marker)) value = value.split(marker, 2)[1];
    return value.replace(/^\/+/, '');
  }
  async function gunzip(bytes) {
    if (!('DecompressionStream' in window)) throw new Error('This browser does not support gzip decompression. Please use a current browser release.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function readAscii(bytes, offset, length) {
    return String.fromCharCode(...bytes.subarray(offset, offset + length));
  }
  async function ensurePackage() {
    if (packagePromise) return packagePromise;
    packagePromise = (async () => {
      const pmResponse = await nativeFetch(`data/package-manifest.json?v=1.0.0`, {cache:'no-store'});
      if (!pmResponse.ok) throw new Error(`data/package-manifest.json: HTTP ${pmResponse.status}`);
      const pm = await pmResponse.json();
      const texts = await Promise.all(pm.parts.map(async path => {
        const r = await nativeFetch(`${path}?v=1.0.0`, {cache:'no-store'});
        if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
        return r.text();
      }));
      const binary = atob(texts.join('').trim());
      const pkg = Uint8Array.from(binary, c => c.charCodeAt(0));
      const view = new DataView(pkg.buffer, pkg.byteOffset, pkg.byteLength);
      let p = 0;
      if (readAscii(pkg,p,4) !== 'EWP1') throw new Error('Invalid compact atlas package');
      p += 4;
      const mapLen=view.getUint32(p,true); p+=4;
      const mapBytes=pkg.slice(p,p+mapLen); p+=mapLen;
      const netLen=view.getUint32(p,true); p+=4;
      const netBytes=pkg.slice(p,p+netLen); p+=netLen;
      if (p !== pkg.length) throw new Error('Compact atlas package length mismatch');
      const mapJson=JSON.parse(new TextDecoder().decode(await gunzip(mapBytes)));
      virtual.set('data/map.json.gz',mapJson);

      const net=await gunzip(netBytes);
      const dv=new DataView(net.buffer,net.byteOffset,net.byteLength); let q=0;
      if(readAscii(net,q,4)!=='EWR2') throw new Error('Invalid network data bundle'); q+=4;
      function readUVarint(){let value=0,shift=0,byte;do{byte=net[q++];value|=(byte&127)<<shift;shift+=7;}while(byte&128);return value>>>0;}
      function readSVarint(){const value=readUVarint();return (value>>>1)^-(value&1);}
      const yearCount=readUVarint(),groupCount=readUVarint(),nodeCount=readUVarint(),edgeCount=readUVarint();
      const years=[];for(let i=0;i<yearCount;i++)years.push(readUVarint());
      const manifestResponse=await nativeFetch(`data/manifest.json?v=1.0.0`,{cache:'no-store'});
      if(!manifestResponse.ok)throw new Error(`data/manifest.json: HTTP ${manifestResponse.status}`);
      const manifest=await manifestResponse.json();
      if(nodeCount!==manifest.geography_count||groupCount!==manifest.age_groups.length||edgeCount!==manifest.front_end_defaults.maximum_exported_edges)throw new Error('Compact data dimensions do not match manifest');
      const groupKeys=manifest.age_groups.map(g=>g.key),groupLabels=Object.fromEntries(manifest.age_groups.map(g=>[g.key,g.label]));
      const yearPacks=new Map();
      for(const year of years){
        const pack={schema_version:manifest.schema_version,year,groups:{}};
        for(const group of groupKeys){
          const total=dv.getFloat64(q,true);q+=8;const share=dv.getFloat32(q,true);q+=4;
          const nodes=new Array(nodeCount);
          for(let i=0;i<nodeCount;i++){
            const inflow=readUVarint()/10,outflow=readUVarint()/10,totalFlow=readUVarint()/10,netFlow=readSVarint()/10,degrees=readUVarint(),balance=readSVarint()/100000;
            nodes[i]=[i,inflow,outflow,totalFlow,netFlow,degrees>>>9,degrees&511,balance,0,0,0];
          }
          const edges=new Array(edgeCount);
          for(let i=0;i<edgeCount;i++){
            const pair=readUVarint(),flow=readUVarint()/10,distance=readUVarint()/10;
            edges[i]=[Math.floor(pair/nodeCount),pair%nodeCount,flow,distance,i+1,0];
          }
          pack.groups[group]={label:groupLabels[group],metadata:{total_directed_moves:total,exported_edge_flow_share:share},nodes,edges};
        }
        yearPacks.set(year,pack);virtual.set(`data/years/${year}.json.gz`,pack);
      }
      if(q!==net.length)throw new Error('Network bundle length mismatch');
      for(const group of groupKeys){
        const metrics=['inflow','outflow','total_flow','net_flow','balance_index','in_degree','out_degree'];
        const nodes={};
        for(let index=0;index<nodeCount;index++){
          const record={};metrics.forEach(m=>record[m]=[]);
          for(const year of years){
            const n=yearPacks.get(year).groups[group].nodes[index];
            record.inflow.push(n[1]);record.outflow.push(n[2]);record.total_flow.push(n[3]);record.net_flow.push(n[4]);record.in_degree.push(n[5]);record.out_degree.push(n[6]);record.balance_index.push(n[7]);
          }
          nodes[String(index)]=record;
        }
        virtual.set(`data/timeseries/${group}.json.gz`,{schema_version:manifest.schema_version,age_group:group,age_group_label:groupLabels[group],years,metrics,nodes});
      }
      window.__ATLAS_PACKAGE_VALIDATION__={status:'pass',regions:mapJson.regions.length,years:yearCount,groups:groupCount,nodes:nodeCount,edgesPerLayer:edgeCount,packageBytes:pkg.length};
    })();
    return packagePromise;
  }
  window.fetch=async function(input,init){
    const path=normalise(input);
    if(path==='data/map.json.gz'||path.startsWith('data/years/')||path.startsWith('data/timeseries/')){
      await ensurePackage();
      if(!virtual.has(path))return new Response(`Not found: ${path}`,{status:404});
      return new Response(JSON.stringify(virtual.get(path)),{status:200,headers:{'Content-Type':'application/json'}});
    }
    return nativeFetch(input,init);
  };
})();

(() => {
  'use strict';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const BUILD = '1.0.0';
  window.__ATLAS_READY__ = false;

  const $ = (id) => document.getElementById(id);
  const fmt0 = new Intl.NumberFormat('en-GB', {maximumFractionDigits: 0});
  const fmt1 = new Intl.NumberFormat('en-GB', {maximumFractionDigits: 1});
  const fmt2 = new Intl.NumberFormat('en-GB', {maximumFractionDigits: 2});
  const pct1 = (v) => `${(Number(v) * 100).toFixed(1)}%`;

  const state = {
    manifest: null, map: null, summary: [], summaryLookup: new Map(),
    year: 2025, ageGroup: 'young_adults_20_40', layer: null,
    yearCache: new Map(), timeseriesCache: new Map(),
    regionByIndex: new Map(), regionEls: new Map(), nodeMap: new Map(),
    selected: null, colourMetric: 'balance_index', nodeSizeMetric: 'total_flow',
    edgeLimit: 500, edgeOpacity: .42, showEdges: true, showNodes: true, showLabels: false,
    view: [0,0,1180,1450], playing: false, playTimer: null,
  };

  const svg = $('mapSvg');
  const regionLayer = $('regionLayer');
  const edgeLayer = $('edgeLayer');
  const nodeLayer = $('nodeLayer');
  const labelLayer = $('labelLayer');
  const tooltip = $('tooltip');

  const nodeField = {index:0,inflow:1,outflow:2,total_flow:3,net_flow:4,in_degree:5,out_degree:6,balance_index:7,mean_in_distance_km:8,mean_out_distance_km:9,activity_share:10};
  const edgeField = {source:0,target:1,flow:2,distance_km:3,rank:4,cumulative_flow_share:5};
  const regionField = {index:0,id:1,name:2,x:3,y:4,path:5,nation:6};

  function svgEl(tag, attrs={}) {
    const e = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k,v]) => e.setAttribute(k, String(v)));
    return e;
  }
  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
  function setLoading(message) { $('loadingMessage').textContent = message; }
  function showError(err) {
    console.error(err); window.__ATLAS_ERROR__ = String(err?.message || err);
    $('loadingOverlay').classList.add('hidden');
    const box = document.createElement('div'); box.className='error-banner'; box.textContent=`Data load failed: ${err?.message || err}`;
    document.querySelector('.map-panel').appendChild(box);
  }

  async function fetchJson(path) {
    const r = await fetch(`${path}${path.includes('?')?'&':'?'}v=${BUILD}`, {cache:'no-store'});
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  }
  async function fetchGzipJson(path) {
    const r = await fetch(`${path}${path.includes('?')?'&':'?'}v=${BUILD}`, {cache:'no-store'});
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    const first = bytes.find(v => v > 32);
    if (first === 123 || first === 91) return JSON.parse(new TextDecoder().decode(bytes));
    if (!('DecompressionStream' in window)) throw new Error('This browser does not support gzip decompression. Please use a current Chrome, Edge, Firefox or Safari release.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).json();
  }

  function metricValue(node, metric) { return metric==='uniform' ? 1 : Number(node?.[nodeField[metric]] ?? 0); }
  function quantile(values, q) {
    const a = values.filter(Number.isFinite).sort((x,y)=>x-y); if (!a.length) return 0;
    const pos=(a.length-1)*q, lo=Math.floor(pos), hi=Math.ceil(pos); return lo===hi?a[lo]:a[lo]+(a[hi]-a[lo])*(pos-lo);
  }
  function interpolate(a,b,t){return a.map((v,i)=>Math.round(v+(b[i]-v)*t));}
  function rgb(c){return `rgb(${c[0]},${c[1]},${c[2]})`;}
  function sequential(v,max){
    if(!Number.isFinite(v)||v<=0||max<=0)return '#edf1f5';
    const t=Math.min(1,Math.log1p(v)/Math.log1p(max));
    const stops=[[225,233,242],[143,174,207],[70,113,160],[26,65,111]];
    const p=t*(stops.length-1),i=Math.min(stops.length-2,Math.floor(p));return rgb(interpolate(stops[i],stops[i+1],p-i));
  }
  function diverging(v,limit){
    if(!Number.isFinite(v))return '#edf1f5';
    const stops=[[0,104,55],[102,189,99],[255,255,191],[244,109,67],[165,0,38]];
    const t=Math.max(0,Math.min(1,(v+limit)/(2*limit||1))); const p=t*(stops.length-1),i=Math.min(stops.length-2,Math.floor(p));return rgb(interpolate(stops[i],stops[i+1],p-i));
  }

  function colourScale() {
    const nodes=state.layer.nodes, metric=state.colourMetric;
    if(metric==='balance_index'){
      const lim=Math.abs(state.manifest.scales.node_colour.recommended_domain[1]);
      return {colour:v=>diverging(v,lim), low:'More outflow', mid:'Balanced', high:'More inflow', title:'Migration balance index', css:'linear-gradient(90deg,#006837,#66bd63,#ffffbf,#f46d43,#a50026)'};
    }
    if(metric==='net_flow'){
      const lim=Math.max(1,quantile(nodes.map(n=>Math.abs(metricValue(n,metric))),.95));
      return {colour:v=>diverging(v,lim), low:`−${fmt0.format(lim)}`, mid:'0', high:`+${fmt0.format(lim)}`, title:'Net migration', css:'linear-gradient(90deg,#006837,#66bd63,#ffffbf,#f46d43,#a50026)'};
    }
    const max=Math.max(1,quantile(nodes.map(n=>metricValue(n,metric)),.98));
    const titles={total_flow:'Total migration activity',inflow:'Inflow',outflow:'Outflow'};
    return {colour:v=>sequential(v,max),low:'0',mid:'',high:fmt0.format(max),title:titles[metric],css:'linear-gradient(90deg,#edf1f5,#8faecf,#4671a0,#1a416f)'};
  }

  function nodeRadius(node) {
    if(state.nodeSizeMetric==='uniform') return 5.2;
    const value=Math.max(0,metricValue(node,state.nodeSizeMetric));
    let max;
    if(state.nodeSizeMetric==='total_flow') max=state.manifest.scales.node_size.domains[state.ageGroup].p98;
    else max=Math.max(1,quantile(state.layer.nodes.map(n=>metricValue(n,state.nodeSizeMetric)),.98));
    return 2.4 + 8.2*Math.sqrt(Math.min(1,value/max));
  }
  function edgeWidth(edge) {
    const p98=state.manifest.scales.edge_width.domains[state.ageGroup].p98;
    const v=edge[edgeField.flow];
    return .55 + 3.4*Math.min(1,Math.log1p(v)/Math.log1p(p98||1));
  }

  function region(index){return state.regionByIndex.get(index);}
  function arcPath(edge){
    const a=region(edge[0]),b=region(edge[1]); const x1=a[3],y1=a[4],x2=b[3],y2=b[4];
    const dx=x2-x1,dy=y2-y1,dist=Math.hypot(dx,dy)||1; const mx=(x1+x2)/2,my=(y1+y2)/2;
    const sign=edge[0]<edge[1]?1:-1; const bend=Math.min(48,Math.max(5,dist*.14))*sign;
    const cx=mx+(-dy/dist)*bend,cy=my+(dx/dist)*bend;
    return `M${x1},${y1}Q${cx},${cy} ${x2},${y2}`;
  }

  async function loadBase(){
    setLoading('Loading compact LAD geography…');
    const [manifest,map,summary]=await Promise.all([fetchJson('data/manifest.json'),fetchGzipJson('data/map.json.gz'),fetchJson('data/network_summary.json')]);
    if(map.regions.length!==manifest.geography_count)throw new Error(`Unexpected LAD count: ${map.regions.length}`);
    state.manifest=manifest; state.map=map; state.summary=summary.records; state.view=map.viewBox.slice();
    state.year=manifest.default_year; state.ageGroup=manifest.default_age_group;
    state.summary.forEach(r=>state.summaryLookup.set(`${r.year}|${r.age_group}`,r));
    map.regions.forEach(r=>state.regionByIndex.set(r[0],r));
    svg.setAttribute('viewBox',map.viewBox.join(' ')); $('mapBackground').setAttribute('width',map.viewBox[2]); $('mapBackground').setAttribute('height',map.viewBox[3]);
    const frag=document.createDocumentFragment();
    map.regions.forEach(r=>{
      const p=svgEl('path',{d:r[5],class:'region-shape','data-index':r[0],'fill-rule':'evenodd'});
      p.addEventListener('mousemove',ev=>showRegionTooltip(ev,r[0])); p.addEventListener('mouseleave',hideTooltip); p.addEventListener('click',ev=>{ev.stopPropagation();selectRegion(r[0]);});
      frag.appendChild(p); state.regionEls.set(r[0],p);
    }); regionLayer.appendChild(frag);
    const options=$('regionOptions'); map.regions.slice().sort((a,b)=>a[2].localeCompare(b[2])).forEach(r=>{const o=document.createElement('option');o.value=`${r[2]} (${r[1]})`;options.appendChild(o);});
    const age=$('ageGroupSelect'); manifest.age_groups.forEach(g=>{const o=document.createElement('option');o.value=g.key;o.textContent=g.label;age.appendChild(o);}); age.value=state.ageGroup;
  }

  async function getYearPack(year){
    if(state.yearCache.has(year))return state.yearCache.get(year);
    setLoading(`Loading year ending June ${year}…`);
    const path=state.manifest.files.year_template.replace('{year}',year);
    const pack=await fetchGzipJson(path); state.yearCache.set(year,pack); return pack;
  }
  async function getTimeseries(group){
    if(state.timeseriesCache.has(group))return state.timeseriesCache.get(group);
    const path=state.manifest.files.timeseries_template.replace('{age_group}',group);
    const pack=await fetchGzipJson(path); state.timeseriesCache.set(group,pack); return pack;
  }
  async function loadLayer(year=state.year,group=state.ageGroup){
    const pack=await getYearPack(year); const layer=pack.groups[group]; if(!layer)throw new Error(`Missing layer ${year}/${group}`);
    state.year=year; state.ageGroup=group; state.layer=layer; state.nodeMap=new Map(layer.nodes.map(n=>[n[0],n]));
    $('yearSlider').value=year; $('yearValue').textContent=year; $('toolbarYear').textContent=year; $('ageGroupSelect').value=group; $('toolbarGroup').textContent=layer.label;
    render(); if(state.selected!==null)await updateSelected();
  }

  function visibleEdges(){return state.layer.edges.slice(0,Math.min(state.edgeLimit,state.layer.edges.length));}
  function render(){
    const scale=colourScale();
    state.regionEls.forEach((p,index)=>{const n=state.nodeMap.get(index);p.style.fill=scale.colour(n?metricValue(n,state.colourMetric):0);p.classList.toggle('focused',state.selected===index);p.style.opacity=state.selected!==null&&state.selected!==index?'.66':'1';});
    renderEdges(); renderNodes(); renderLabels(); updateLegend(scale); updateSummary();
    $('toolbarNote').textContent=`Top ${fmt0.format(Math.min(state.edgeLimit,state.layer.edges.length))} directed flows`;
  }
  function renderEdges(){
    edgeLayer.replaceChildren(); if(!state.showEdges)return;
    const frag=document.createDocumentFragment(), focus=state.selected;
    visibleEdges().forEach(edge=>{
      const p=svgEl('path',{d:arcPath(edge),class:'edge-path'}); const source=edge[0],target=edge[1];
      p.style.strokeWidth=edgeWidth(edge); p.style.opacity=String(state.edgeOpacity);
      if(focus!==null){if(target===focus)p.classList.add('inbound');else if(source===focus)p.classList.add('outbound');else p.classList.add('dimmed');}
      p.addEventListener('mousemove',ev=>showEdgeTooltip(ev,edge,p)); p.addEventListener('mouseleave',()=>{p.removeAttribute('marker-end');hideTooltip();});
      p.addEventListener('click',ev=>{ev.stopPropagation();const idx=edge[1];selectRegion(idx);});
      frag.appendChild(p);
    }); edgeLayer.appendChild(frag); $('directionKey').hidden=focus===null;
  }
  function renderNodes(){
    nodeLayer.replaceChildren(); if(!state.showNodes)return;
    const frag=document.createDocumentFragment(), focus=state.selected, connected=new Set();
    if(focus!==null)state.layer.edges.forEach(e=>{if(e[0]===focus)connected.add(e[1]);if(e[1]===focus)connected.add(e[0]);});
    state.layer.nodes.forEach(n=>{const r=region(n[0]);const baseRadius=nodeRadius(n);const c=svgEl('circle',{cx:r[3],cy:r[4],r:baseRadius,class:'node','data-base-radius':baseRadius});if(focus===n[0])c.classList.add('focused');else if(focus!==null&&!connected.has(n[0]))c.classList.add('dimmed');c.addEventListener('mousemove',ev=>showRegionTooltip(ev,n[0]));c.addEventListener('mouseleave',hideTooltip);c.addEventListener('click',ev=>{ev.stopPropagation();selectRegion(n[0]);});frag.appendChild(c);});
    nodeLayer.appendChild(frag); updateScreenScaledSymbols();
  }
  function renderLabels(){
    labelLayer.replaceChildren(); if(!state.showLabels&&state.selected===null)return;
    const ids=new Set(); if(state.showLabels)state.layer.nodes.slice().sort((a,b)=>metricValue(b,state.nodeSizeMetric)-metricValue(a,state.nodeSizeMetric)).slice(0,14).forEach(n=>ids.add(n[0])); if(state.selected!==null)ids.add(state.selected);
    ids.forEach(index=>{const r=region(index),t=svgEl('text',{x:r[3]+10,y:r[4]-8,class:'node-label','data-index':index});t.textContent=r[2];labelLayer.appendChild(t);}); updateScreenScaledSymbols();
  }
  function updateLegend(scale){$('legendTitle').textContent=scale.title;$('legendScale').style.background=scale.css;$('legendLow').textContent=scale.low;$('legendMid').textContent=scale.mid;$('legendHigh').textContent=scale.high;}
  function updateSummary(){
    const m=state.layer.metadata,s=state.summaryLookup.get(`${state.year}|${state.ageGroup}`);$('statMoves').textContent=fmt0.format(m.total_directed_moves);$('statEdges').textContent=fmt0.format(Math.min(state.edgeLimit,state.layer.edges.length));$('statCoverage').textContent=pct1(m.exported_edge_flow_share);$('statDistance').textContent=s?`${fmt1.format(s.weighted_mean_distance_km)} km`:'—';$('statReciprocity').textContent=s?pct1(s.weighted_reciprocity):'—';$('statGini').textContent=s?fmt2.format(s.destination_inflow_gini):'—';
  }

  function placeTooltip(ev,html){tooltip.innerHTML=html;tooltip.hidden=false;const box=document.querySelector('.map-panel').getBoundingClientRect();tooltip.style.left=`${Math.max(8,Math.min(box.width-260,ev.clientX-box.left+14))}px`;tooltip.style.top=`${Math.max(8,Math.min(box.height-150,ev.clientY-box.top+14))}px`;}
  function showRegionTooltip(ev,index){const r=region(index),n=state.nodeMap.get(index);let html=`<strong>${escapeHtml(r[2])}</strong><br><span class="muted">${r[1]} · ${r[6]}</span>`;if(n)html+=`<br>Inflow: ${fmt0.format(n[1])}<br>Outflow: ${fmt0.format(n[2])}<br>Net flow: ${n[4]>=0?'+':''}${fmt0.format(n[4])}<br>Balance index: ${fmt2.format(n[7])}`;placeTooltip(ev,html);}
  function showEdgeTooltip(ev,edge,path){const a=region(edge[0]),b=region(edge[1]);const marker=state.selected===edge[1]?'arrowIn':state.selected===edge[0]?'arrowOut':'arrowDefault';path.setAttribute('marker-end',`url(#${marker})`);placeTooltip(ev,`<span class="edge-direction">${escapeHtml(a[2])} → ${escapeHtml(b[2])}</span><br>Estimated flow: ${fmt1.format(edge[2])}<br>Distance: ${fmt1.format(edge[3])} km<br><span class="muted">Published rank ${fmt0.format(edge[4])}</span>`);}
  function hideTooltip(){tooltip.hidden=true;}

  async function selectRegion(index){state.selected=index;render();await updateSelected();}
  async function updateSelected(){
    const card=$('selectedCard'); if(state.selected===null){card.hidden=true;return;} card.hidden=false;const r=region(state.selected),n=state.nodeMap.get(state.selected);$('selectedName').textContent=r[2];$('selectedCode').textContent=r[1];
    const v=n||[state.selected,0,0,0,0,0,0,0,0,0,0];$('selInflow').textContent=fmt0.format(v[1]);$('selOutflow').textContent=fmt0.format(v[2]);$('selNet').textContent=`${v[4]>=0?'+':''}${fmt0.format(v[4])}`;$('selBalance').textContent=fmt2.format(v[7]);$('selInDegree').textContent=fmt0.format(v[5]);$('selOutDegree').textContent=fmt0.format(v[6]);
    const inbound=state.layer.edges.filter(e=>e[1]===state.selected).sort((a,b)=>b[2]-a[2]).slice(0,5);const outbound=state.layer.edges.filter(e=>e[0]===state.selected).sort((a,b)=>b[2]-a[2]).slice(0,5);fillPartnerList('inboundList',inbound,true);fillPartnerList('outboundList',outbound,false);
    const ts=await getTimeseries(state.ageGroup);renderTrend(ts,state.selected,$('trendMetric').value);
  }
  function fillPartnerList(id,edges,inbound){const list=$(id);list.replaceChildren();if(!edges.length){const li=document.createElement('li');li.textContent='No connection in the published top 4,000';list.appendChild(li);return;}edges.forEach(e=>{const other=region(inbound?e[0]:e[1]);const li=document.createElement('li');li.textContent=`${other[2]} · ${fmt0.format(e[2])}`;list.appendChild(li);});}

  function renderTrend(ts,index,mode){
    const svg=$('trendChart');svg.replaceChildren();const record=ts.nodes[String(index)];if(!record){const t=svgEl('text',{x:150,y:70,'text-anchor':'middle',class:'chart-label'});t.textContent='No time series available';svg.appendChild(t);return;}
    const years=ts.years,W=300,H=138,p={l:34,r:10,t:18,b:22};const x=i=>p.l+i/(years.length-1)*(W-p.l-p.r);
    let series=[];if(mode==='inflow_outflow')series=[{name:'Inflow',values:record.inflow,cls:''},{name:'Outflow',values:record.outflow,cls:'secondary'}];else series=[{name:mode.replace('_',' '),values:record[mode],cls:''}];
    const values=series.flatMap(s=>s.values.filter(v=>v!==null&&Number.isFinite(v)));let min=Math.min(...values),max=Math.max(...values);if(mode==='net_flow'||mode==='balance_index'){const a=Math.max(Math.abs(min),Math.abs(max),.01);min=-a;max=a;}if(min===max){min-=1;max+=1;}const y=v=>p.t+(max-v)/(max-min)*(H-p.t-p.b);
    svg.appendChild(svgEl('line',{x1:p.l,x2:W-p.r,y1:H-p.b,y2:H-p.b,class:'chart-axis'}));svg.appendChild(svgEl('line',{x1:p.l,x2:p.l,y1:p.t,y2:H-p.b,class:'chart-axis'}));if(min<0&&max>0)svg.appendChild(svgEl('line',{x1:p.l,x2:W-p.r,y1:y(0),y2:y(0),class:'chart-zero'}));
    [0,years.length-1].forEach(i=>{const t=svgEl('text',{x:x(i),y:H-7,'text-anchor':i===0?'start':'end',class:'chart-label'});t.textContent=years[i];svg.appendChild(t);});
    const top=svgEl('text',{x:p.l-5,y:p.t+3,'text-anchor':'end',class:'chart-label'});top.textContent=fmt1.format(max);svg.appendChild(top);const bottom=svgEl('text',{x:p.l-5,y:H-p.b+3,'text-anchor':'end',class:'chart-label'});bottom.textContent=fmt1.format(min);svg.appendChild(bottom);
    series.forEach((s,si)=>{let d='';s.values.forEach((v,i)=>{if(v===null||!Number.isFinite(v))return;d+=`${d?'L':'M'}${x(i)},${y(v)}`;});const path=svgEl('path',{d,class:`chart-line ${s.cls}`});svg.appendChild(path);s.values.forEach((v,i)=>{if(v===null||!Number.isFinite(v))return;const c=svgEl('circle',{cx:x(i),cy:y(v),r:2.2,class:`chart-point ${s.cls}`});const title=svgEl('title');title.textContent=`${years[i]}: ${fmt1.format(v)}`;c.appendChild(title);svg.appendChild(c);});const label=svgEl('text',{x:p.l+si*75,y:10,class:'chart-legend'});label.textContent=s.name;svg.appendChild(label);});
  }

  function searchRegion(){const q=$('searchInput').value.trim().toLowerCase();if(!q)return;const match=state.map.regions.find(r=>`${r[2]} (${r[1]})`.toLowerCase()===q)||state.map.regions.find(r=>r[2].toLowerCase().includes(q)||r[1].toLowerCase()===q);if(!match)return;selectRegion(match[0]);setView([match[3]-135,match[4]-170,270,340]);}
  function updateScreenScaledSymbols(){
    if(!state.map)return;
    const factor=Math.max(.07,state.view[2]/state.map.viewBox[2]);
    nodeLayer.querySelectorAll('.node').forEach(c=>{const base=Number(c.dataset.baseRadius||5);c.setAttribute('r',String(base*factor));});
    labelLayer.querySelectorAll('.node-label').forEach(t=>{const idx=Number(t.dataset.index),r=region(idx);if(!r)return;t.setAttribute('x',String(r[3]+10*factor));t.setAttribute('y',String(r[4]-8*factor));t.style.fontSize=`${12*factor}px`;t.style.strokeWidth=String(3.5*factor);});
  }
  function setView(v){state.view=v;svg.setAttribute('viewBox',v.join(' '));updateScreenScaledSymbols();}
  function fitMap(){setView(state.map.viewBox.slice());}
  function bindPanZoom(){let dragging=false,start=null,startView=null;svg.addEventListener('pointerdown',ev=>{dragging=true;svg.setPointerCapture(ev.pointerId);start=[ev.clientX,ev.clientY];startView=state.view.slice();svg.classList.add('dragging');});svg.addEventListener('pointermove',ev=>{if(!dragging)return;const rect=svg.getBoundingClientRect(),dx=(ev.clientX-start[0])/rect.width*startView[2],dy=(ev.clientY-start[1])/rect.height*startView[3];setView([startView[0]-dx,startView[1]-dy,startView[2],startView[3]]);});const stop=()=>{dragging=false;svg.classList.remove('dragging');};svg.addEventListener('pointerup',stop);svg.addEventListener('pointercancel',stop);svg.addEventListener('wheel',ev=>{ev.preventDefault();const rect=svg.getBoundingClientRect(),[vx,vy,vw,vh]=state.view,px=(ev.clientX-rect.left)/rect.width,py=(ev.clientY-rect.top)/rect.height,f=ev.deltaY>0?1.16:.86;const maxW=state.map.viewBox[2]*1.15,nw=Math.max(105,Math.min(maxW,vw*f)),nh=nw*(rect.height/rect.width),mx=vx+px*vw,my=vy+py*vh;setView([mx-px*nw,my-py*nh,nw,nh]);},{passive:false});}

  function bindControls(){
    $('yearSlider').addEventListener('input',e=>loadLayer(Number(e.target.value),state.ageGroup).catch(showError));$('prevYear').addEventListener('click',()=>loadLayer(Math.max(2012,state.year-1),state.ageGroup).catch(showError));$('nextYear').addEventListener('click',()=>loadLayer(Math.min(2025,state.year+1),state.ageGroup).catch(showError));$('playYear').addEventListener('click',togglePlay);
    $('ageGroupSelect').addEventListener('change',e=>loadLayer(state.year,e.target.value).catch(showError));$('colourMetric').addEventListener('change',e=>{state.colourMetric=e.target.value;render();});$('nodeSizeMetric').addEventListener('change',e=>{state.nodeSizeMetric=e.target.value;render();});$('edgeLimit').addEventListener('change',e=>{state.edgeLimit=Number(e.target.value);render();});$('edgeOpacity').addEventListener('input',e=>{state.edgeOpacity=Number(e.target.value)/100;renderEdges();});$('showEdges').addEventListener('change',e=>{state.showEdges=e.target.checked;renderEdges();});$('showNodes').addEventListener('change',e=>{state.showNodes=e.target.checked;renderNodes();});$('showLabels').addEventListener('change',e=>{state.showLabels=e.target.checked;renderLabels();});
    $('searchButton').addEventListener('click',searchRegion);$('searchInput').addEventListener('keydown',e=>{if(e.key==='Enter')searchRegion();});$('fitButton').addEventListener('click',fitMap);$('clearButton').addEventListener('click',()=>{state.selected=null;render();$('selectedCard').hidden=true;});$('trendMetric').addEventListener('change',()=>{if(state.selected!==null)updateSelected();});svg.addEventListener('click',()=>{state.selected=null;render();$('selectedCard').hidden=true;});bindPanZoom();
  }
  function togglePlay(){state.playing=!state.playing;$('playYear').textContent=state.playing?'❚❚':'▶';if(state.playing)state.playTimer=setInterval(()=>loadLayer(state.year>=2025?2012:state.year+1,state.ageGroup).catch(showError),1400);else{clearInterval(state.playTimer);state.playTimer=null;}}

  async function init(){try{await loadBase();bindControls();await loadLayer(state.year,state.ageGroup);fitMap();$('loadingOverlay').classList.add('hidden');window.__ATLAS_READY__=true;window.__ATLAS_VALIDATION__={status:'pass',regions:state.map.regions.length,year:state.year,ageGroup:state.ageGroup,nodes:state.layer.nodes.length,edges:state.layer.edges.length};}catch(err){showError(err);}}
  init();
})();
