const id = new URLSearchParams(location.search).get('id');
const box = document.querySelector('#detail');
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
function loadPdfJs(){return new Promise((resolve,reject)=>{if(window.pdfjsLib)return resolve(window.pdfjsLib);const s=document.createElement('script');s.src=PDFJS_URL;s.onload=()=>{pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;resolve(pdfjsLib)};s.onerror=()=>reject(Error('PDF viewer library unavailable'));document.head.append(s)})}
function element(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el}
async function renderPages(x, viewer, status, zoomLabel) {
  const lib = await loadPdfJs();
  const task = lib.getDocument({url:'../'+(x.series_pdf || x.catalog), withCredentials:false});
  const doc = await task.promise;
  const start = x.series_pdf ? 1 : Math.max(1, Number(x.start)||1);
  const end = x.series_pdf ? doc.numPages : Math.min(doc.numPages, Number(x.end)||doc.numPages);
  if (end < start) throw Error('Invalid catalogue page range');

  const holders = [];
  for (let n=start; n<=end; n++) {
    const holder=element('div','pdf-page');
    holder.dataset.page=String(n);
    const originalPage=x.series_pdf ? Number(x.start)+n-1 : n;
    holder.append(element('div','pdf-page-label',`원본 카탈로그 ${originalPage}페이지`));
    const placeholder=element('div','pdf-placeholder','페이지를 불러오는 중…');
    holder.append(placeholder);
    viewer.append(holder);
    holders.push(holder);
  }

  const pilot = x.series === "DPF-T/S";
  let zoom=1;
  let generation=0;
  let active=false;
  const rendered=new Map();
  const pending=new Set();
  const visible=new Set();
  const observer=new IntersectionObserver(entries=>{
    for(const entry of entries) {
      if(entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    }
    schedule();
  }, {root:viewer,rootMargin:'350px 0px'});

  // A single rendering queue prevents several high-resolution canvases
  // from exhausting memory on mobile devices.
  async function draw(holder,token) {
    const n=Number(holder.dataset.page);
    const page=await doc.getPage(n);
    if(token!==generation) return;
    const baseWidth=Math.min(Math.max(viewer.clientWidth - (window.matchMedia('(max-width:780px)').matches ? 4 : 34),180),950);
    const viewport0=page.getViewport({scale:1});
    const displayScale=baseWidth/viewport0.width*zoom;
    const cssViewport=page.getViewport({scale:displayScale});
    // Cap backing pixels to avoid browser canvas limits on phones.
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const maxPixels=12000000;
    const pixelFactor=Math.min(dpr,Math.sqrt(maxPixels/(cssViewport.width*cssViewport.height)));
    const viewport=page.getViewport({scale:displayScale*pixelFactor});
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.floor(viewport.width));
    canvas.height=Math.max(1,Math.floor(viewport.height));
    canvas.style.width=Math.round(cssViewport.width)+'px';
    canvas.style.height=Math.round(cssViewport.height)+'px';
    const rendering=page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport});
    try { await rendering.promise; } catch(err) { if(token===generation) throw err; return; }
    if(token!==generation) {canvas.width=0;canvas.height=0;return;}
    const old=holder.querySelector('canvas');
    if(old){old.remove();old.width=0;old.height=0;}
    const placeholder=holder.querySelector('.pdf-placeholder');
    if(placeholder)placeholder.remove();
    holder.append(canvas);
    holder.style.minHeight="";
    holder.style.minWidth="";
    holder.classList.add('rendered');
    rendered.set(holder,token);
  }

  async function schedule() {
    if(active)return;
    active=true;
    try {
      while(true) {
        const token=generation;
        const target=holders.find(h=>visible.has(h)&&rendered.get(h)!==token&&!pending.has(h));
        if(!target)break;
        pending.add(target);
        try { await draw(target,token); }
        catch(err) { console.error('PDF page render error',err); const note=target.querySelector('.pdf-placeholder');if(note)note.textContent='페이지를 표시하지 못했습니다.';rendered.set(target,token); }
        finally {pending.delete(target);}
      }
    } finally {active=false;}
  }

  function updateZoom(next, focus) {
    const oldZoom=zoom;
    const anchor=focus || {x:viewer.clientWidth/2,y:viewer.clientHeight/2};
    const contentX=viewer.scrollLeft+anchor.x;
    const contentY=viewer.scrollTop+anchor.y;
    const value=Math.max(0.8,Math.min(4,next));
    if(value===zoom)return;
    zoom=value;
    // Preserve the reading position across resolution changes.
    const ratio=value/oldZoom;
    for(const holder of holders){
      const canvas=holder.querySelector("canvas");
      if(canvas){
        const w=parseFloat(canvas.style.width)||canvas.clientWidth;
        const h=parseFloat(canvas.style.height)||canvas.clientHeight;
        holder.style.minHeight=Math.round(h*ratio+25)+"px";
        holder.style.minWidth=Math.round(w*ratio)+"px";
      }
    }
    zoomLabel.textContent=Math.round(zoom*100)+'%';
    generation++;
    rendered.clear();
    for(const holder of holders) {
      const old=holder.querySelector('canvas');
      if(old){old.remove();old.width=0;old.height=0;}
      holder.classList.remove('rendered');
      if(!holder.querySelector('.pdf-placeholder'))holder.append(element('div','pdf-placeholder','선명하게 다시 표시하는 중…'));
    }
    // Re-render visible pages at the new resolution.
    if(pilot){
      requestAnimationFrame(()=>{
        viewer.scrollLeft=Math.max(0,contentX*ratio-anchor.x);
        viewer.scrollTop=Math.max(0,contentY*ratio-anchor.y);
        schedule();
      });
    } else {
      visible.add(holders[0]);
      requestAnimationFrame(()=>schedule());
    }
  }

  // Pilot: compositor-only pinch preview, followed by one high-resolution redraw.
  // Native one-finger scrolling is retained for horizontal/vertical panning.
  let pinchStart=null;
  let pinchNext=1;
  const distance=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
  const midpoint=t=>({x:(t[0].clientX+t[1].clientX)/2,y:(t[0].clientY+t[1].clientY)/2});
  function preview(scale,center){
    if(!pilot)return;
    const bounds=viewer.getBoundingClientRect();
    const x=center.x-bounds.left+viewer.scrollLeft;
    const y=center.y-bounds.top+viewer.scrollTop;
    viewer.querySelectorAll('.pdf-page canvas').forEach(c=>{
      c.style.transformOrigin='0 0';
      c.style.transform=`scale(${scale})`;
    });
    viewer.classList.add('is-pinching');
  }
  function clearPreview(){
    viewer.querySelectorAll('.pdf-page canvas').forEach(c=>{c.style.transform='';c.style.transformOrigin='';});
    viewer.classList.remove('is-pinching');
  }
  viewer.addEventListener('touchstart',e=>{
    if(e.touches.length===2){pinchStart={distance:distance(e.touches),zoom,center:midpoint(e.touches)};pinchNext=zoom;}
  },{passive:true});
  viewer.addEventListener('touchmove',e=>{
    if(!pinchStart||e.touches.length!==2)return;
    e.preventDefault();
    pinchNext=Math.max(.8,Math.min(4,pinchStart.zoom*distance(e.touches)/Math.max(1,pinchStart.distance)));
    zoomLabel.textContent=Math.round(pinchNext*100)+'%';
    if(pilot)preview(pinchNext/pinchStart.zoom,midpoint(e.touches));
  },{passive:false});
  const finishPinch=()=>{
    if(!pinchStart)return;
    const center=pinchStart.center;
    const next=pinchNext;
    pinchStart=null;
    clearPreview();
    const bounds=viewer.getBoundingClientRect();
    if(Number.isFinite(next)&&next>0)updateZoom(next,{x:center.x-bounds.left,y:center.y-bounds.top});
  };
  viewer.addEventListener('touchend',e=>{if(e.touches.length<2)finishPinch()},{passive:true});
  viewer.addEventListener('touchcancel',finishPinch,{passive:true});

  // Render the first page before enabling lazy observation.
  await draw(holders[0],generation);
  for(const h of holders)observer.observe(h);
  visible.add(holders[0]);
  status.textContent=`${x.series} · 원본 ${x.start}–${x.end}페이지 (${holders.length}페이지)`;
  schedule();
  return {
    zoomIn(){updateZoom(Math.round((zoom+0.25)*100)/100)},
    zoomOut(){updateZoom(Math.round((zoom-0.25)*100)/100)},
    reset(){updateZoom(1)}
  };
}
fetch('../data/products.json').then(r=>{if(!r.ok)throw Error('product data');return r.json()}).then(async data=>{
  const x=data.find(v=>v.id===id);
  if(!x){box.textContent='해당 제품을 찾을 수 없습니다.';return}
  document.title=x.series+' | HR COMP';
  document.querySelector('#detailtitle').textContent=x.series;
  document.querySelector('#breadcrumb').textContent=x.maker+' / '+x.category+' / '+x.series;
  const section=element('div','detail');
  const visual=element('div','series-visual');
  const img=document.createElement('img');img.src='../'+(x.hero_image||x.image);img.alt=x.series+' 제조사 카탈로그 제품 이미지';
  img.onerror=()=>{if(x.hero_image)img.src='../'+x.image};
  visual.append(img,element('p','series-visual-caption','제조사 카탈로그 원본에서 발췌한 제품 이미지'));
  const info=element('div','series-info');info.append(element('span','tag',x.maker+' / '+x.category),element('h2','',x.series),element('p','lead',x.name),element('p','lead series-pages','원본 카탈로그 '+x.start+'–'+x.end+'페이지'));
  const actions=element('div','actions');const back=element('a','btn light','← 제품 목록으로 돌아가기');back.href='index.html?maker='+encodeURIComponent(x.maker);actions.append(back);info.append(actions);section.append(visual,info);
  const pdf=element('section','pdfbox');pdf.append(element('h3','','제품 기술자료 · '+x.series));
  const tip=element('p','lead pdf-tip',x.series_pdf?'해당 Series의 기술자료를 표시합니다.':'제조사 원본 카탈로그의 해당 페이지를 표시합니다.');pdf.append(tip);
  const controls=element('div','pdf-controls');const status=element('span','pdf-status','기술자료를 불러오는 중…');
  const zoomOut=element('button','pdf-control','−');zoomOut.type='button';zoomOut.setAttribute('aria-label','축소');
  const zoomLabel=element('span','pdf-zoom','100%');const reset=element('button','pdf-control','100%');reset.type='button';reset.setAttribute('aria-label','원래 크기');const zoomIn=element('button','pdf-control','+');zoomIn.type='button';zoomIn.setAttribute('aria-label','확대');
  controls.append(status,zoomOut,zoomLabel,zoomIn,reset);pdf.append(controls);
  const viewer=element('div','pdf-series-viewer');viewer.setAttribute('aria-label','PDF 기술자료. 모바일에서 두 손가락으로 확대 축소할 수 있습니다.');pdf.append(viewer);box.replaceChildren(section,pdf);
  try{const api=await renderPages(x,viewer,status,zoomLabel);zoomIn.onclick=api.zoomIn;zoomOut.onclick=api.zoomOut;reset.onclick=api.reset}
  catch(e){status.textContent='기술자료를 표시하지 못했습니다.';viewer.replaceChildren(element('p','notice','PDF 표시 라이브러리 또는 네트워크 연결을 확인해 주세요.'));console.error(e)}
  if(x.note)box.append(element('p','notice',x.note));
}).catch(()=>box.textContent='제품 정보를 불러오지 못했습니다.');
