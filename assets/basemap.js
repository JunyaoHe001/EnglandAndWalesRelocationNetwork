/* The published SVG uses Web Mercator with 38-unit padding. */
(() => {
  'use strict';
  const svg = document.getElementById('mapSvg');
  const ns = 'http://www.w3.org/2000/svg';
  const layer = document.createElementNS(ns, 'g');
  layer.id = 'atlas-basemap-layer'; layer.setAttribute('pointer-events','none'); layer.setAttribute('opacity','0.7');
  svg.insertBefore(layer, document.getElementById('regionLayer'));
  if (!svg.hasAttribute('viewBox')) svg.setAttribute('viewBox','0 0 1180 1406');
  const scale = 1104 / (1.76869 + 6.41901);
  const mercNorth = Math.log(Math.tan(Math.PI/4 + 55.81166*Math.PI/360)) * 180/Math.PI;
  const world = 360*scale, originX = 38 + (-180+6.41901)*scale, originY = 38+(mercNorth-180)*scale;
  const images = new Map();
  let visible = true, timer;
  const credit = document.createElement('div');
  credit.className = 'atlas-basemap-credit';
  credit.style.cssText = 'position:absolute;right:5px;bottom:3px;z-index:5;background:rgba(255,255,255,.94);padding:2px 4px;font:10px/1.4 Arial,sans-serif';
  const link = document.createElement('a'); link.href='https://www.openstreetmap.org/copyright';
  link.target='_blank'; link.rel='noopener'; link.textContent='OpenStreetMap';
  credit.append('\u00a9 ',link,' contributors'); svg.parentElement.appendChild(credit);
  const input = window.AtlasBasemap.control(value => {
    visible=value; layer.style.display=value?'':'none'; credit.hidden=!value;
    if(value) schedule(); else {clearTimeout(timer);layer.replaceChildren();images.clear();}
  }, 'OpenStreetMap. Hiding the basemap preserves all migration layers.');
  const warning=document.createElement('p'); warning.hidden=true; warning.setAttribute('role','status');
  warning.style.cssText='font-size:11px;color:#8a4b10;line-height:1.5';
  warning.textContent='Some background tiles could not load. Migration layers remain available.';
  input.closest('section').appendChild(warning);
  function schedule(){clearTimeout(timer);if(visible)timer=setTimeout(draw,180);}
  function draw(){
    if(!visible)return;
    const box=svg.getBoundingClientRect(),m=svg.getScreenCTM(); if(!m||!box.width||!box.height)return;
    const inverse=m.inverse();
    const a=new DOMPoint(box.left,box.top).matrixTransform(inverse),b=new DOMPoint(box.right,box.bottom).matrixTransform(inverse);
    let z=Math.max(0,Math.min(19,Math.floor(Math.log2(world*Math.hypot(m.a,m.b)/256))));
    let n,span,x0,x1,y0,y1;
    do {
      n=2**z;span=world/n;
      x0=Math.max(0,Math.floor((a.x-originX)/span));x1=Math.min(n-1,Math.floor((b.x-originX)/span));
      y0=Math.max(0,Math.floor((a.y-originY)/span));y1=Math.min(n-1,Math.floor((b.y-originY)/span));
      if((x1-x0+1)*(y1-y0+1)<=64||z===0)break;
      z--;
    }while(z>=0);
    const wanted=new Set();
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const key=`${z}/${x}/${y}`;wanted.add(key);if(images.has(key))continue;
      const image=document.createElementNS(ns,'image');
      const attributes={x:originX+x*span,y:originY+y*span,width:span,height:span,preserveAspectRatio:'none'};
      for(const [k,v] of Object.entries(attributes))image.setAttribute(k,v);
      image.addEventListener('error',()=>{image.style.display='none';if(visible)warning.hidden=false;});
      image.addEventListener('load',()=>{image.dataset.loaded='true';});
      image.setAttribute('href','https://tile.openstreetmap.org/'+key+'.png');
      layer.appendChild(image);images.set(key,image);
    }
    for(const [key,image] of images)if(!wanted.has(key)){image.remove();images.delete(key);}
  }
  new MutationObserver(schedule).observe(svg,{attributes:true,attributeFilter:['viewBox']});
  if(window.ResizeObserver)new ResizeObserver(schedule).observe(svg);
  window.__ATLAS_BASEMAP__={type:'osm',input,layer,refresh:draw};
  schedule();
})();
