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

  const pilot = x.series === 'DPF-T/S' || x.series === 'DPF(O)';
  const mobile = matchMedia('(max-width:780px)').matches;
  const perfStart=performance.now();
  let firstPaintDone=false;
  let zoom=1;
  const baseCanvasSizes=new WeakMap();
  let generation=0;
  let active=false;
  let isPinching=false;
  let settleTimer=null;
  let panTimer=null;
  const rendered=new Map();
  const pending=new Set();
  const visible=new Set();
  const observer=new IntersectionObserver(entries=>{
    for(const entry of entries) {
      if(entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    }
    schedule();
  }, {root:viewer,rootMargin:'120px 0px'});

  // V11: render every short pilot PDF page at zoom, independent of intersection state.
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
    // Mobile first paint: use a light canvas. Sharpen only after a deliberate zoom.
    const dpr=mobile ? (pilot ? Math.min(devicePixelRatio||1,1.7) : (zoom>1.45 ? Math.min(devicePixelRatio||1,1.65) : 1)) : Math.min(devicePixelRatio||1,2);
    const maxPixels=mobile ? (pilot ? 10500000 : 4200000) : 12000000;
    const pixelFactor=Math.min(dpr,Math.sqrt(maxPixels/(cssViewport.width*cssViewport.height)));
    const viewport=page.getViewport({scale:displayScale*pixelFactor});
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.floor(viewport.width));
    canvas.height=Math.max(1,Math.floor(viewport.height));
    canvas.style.width=Math.round(cssViewport.width)+'px';
    canvas.style.height=Math.round(cssViewport.height)+'px';
    baseCanvasSizes.set(holder,{width:cssViewport.width/zoom,height:cssViewport.height/zoom});
    const rendering=page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport});
    try { await rendering.promise; } catch(err) { if(token===generation) throw err; return; }
    if(token!==generation) {canvas.width=0;canvas.height=0;return;}
    const old=holder.querySelector('canvas');
    if(old){old.remove();old.width=0;old.height=0;}
    const placeholder=holder.querySelector('.pdf-placeholder');
    if(placeholder)placeholder.remove();
    holder.append(canvas);
    if (pilot && zoom <= 1.001) viewer.scrollLeft = 0;
    holder.style.minHeight='';
    holder.style.minWidth='';
    if(!firstPaintDone){firstPaintDone=true;console.info('[HR COMP V6] first PDF page rendered in',Math.round(performance.now()-perfStart),'ms (excluding library/document loading)');}
    holder.classList.add('rendered');
    rendered.set(holder,token);
  }

  async function schedule() {
    if(active||isPinching)return;
    active=true;
    try {
      while(true) {
        const token=generation;
        const target=holders.find(h=>(visible.has(h)||(pilot && mobile && zoom>1.001))&&rendered.get(h)!==token&&!pending.has(h));
        if(!target)break;
        pending.add(target);
        try { await draw(target,token); }
        catch(err) { console.error('PDF page render error',err); const note=target.querySelector('.pdf-placeholder');if(note)note.textContent='페이지를 표시하지 못했습니다.';rendered.set(target,token); }
        finally {pending.delete(target);}
      }
    } finally {
      active=false;
      // A zoom may invalidate an in-flight render. The earlier schedule()
      // returns while active=true, so explicitly restart the queue here.
      if(!isPinching && holders.some(h=>(visible.has(h)||(pilot && mobile && zoom>1.001)) && rendered.get(h)!==generation && !pending.has(h))) {
        queueMicrotask(schedule);
      }
    }
  }

  // Resize the already rendered bitmap immediately. This avoids blanking the
  // viewer on every gesture and makes touch interactions compositor-friendly.
  function resizePages(next, focus){
    // Always calculate from the original fit-width dimensions. Repeated
    // rounding of already-resized canvases causes zoom drift on phones.
    const value=Math.max(1,Math.min(3.5,next));
    if(Math.abs(value-zoom)<.001)return;
    const rect=viewer.getBoundingClientRect();
    const point=focus||{x:rect.width/2,y:rect.height/2};
    const oldZoom=zoom;
    const sx=viewer.scrollLeft+point.x,sy=viewer.scrollTop+point.y;
    zoom=value;
    holders.forEach(h=>{
      const c=h.querySelector('canvas');
      const base=baseCanvasSizes.get(h);
      if(c && base){
        c.style.width=Math.round(base.width*zoom)+'px';
        c.style.height=Math.round(base.height*zoom)+'px';
      }
    });
    zoomLabel.textContent=Math.round(zoom*100)+'%';
    if(zoom<=1.001){
      viewer.scrollLeft=0;
      // Do not move the document scroll position when returning to fit width.
    } else {
      viewer.scrollLeft=Math.max(0,sx*(zoom/oldZoom)-point.x);
    }
    viewer.scrollTop=Math.max(0,sy*(zoom/oldZoom)-point.y);
  }
  // High-resolution replacement is deliberately delayed and restricted to
  // pages near the viewport. Never erase the old bitmap before replacement.
  function sharpen(){
    clearTimeout(settleTimer);
    settleTimer=setTimeout(()=>{
      if(isPinching)return;
      generation++;
      rendered.clear();
      schedule();
    },180);
  }
  function updateZoom(next,focus){resizePages(next,focus);if(pilot && zoom<=1.001)viewer.scrollLeft=0;sharpen();}

  // Some Android WebViews retain a low-resolution composited tile after
  // horizontal panning. Refresh the visible page after the gesture settles.
  // Keep the existing bitmap on screen until its replacement is ready.
  if(pilot && mobile){
    viewer.addEventListener('scroll',()=>{
      if(zoom<=1.001 || isPinching) return;
      clearTimeout(panTimer);
      panTimer=setTimeout(()=>{
        // Moving horizontally must also retry any zoom render that was
        // invalidated while the previous canvas was still drawing.
        if(!isPinching && zoom>1.001) schedule();
      },180);
    },{passive:true});
  }

  let pinch=null;
  const distance=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
  const midpoint=t=>({x:(t[0].clientX+t[1].clientX)/2,y:(t[0].clientY+t[1].clientY)/2});
  viewer.addEventListener('touchstart',e=>{
    if(e.touches.length!==2)return;
    clearTimeout(settleTimer);
    isPinching=true;
    pinch={distance:Math.max(1,distance(e.touches)),zoom,center:midpoint(e.touches)};
  },{passive:true});
  viewer.addEventListener('touchmove',e=>{
    if(!pinch||e.touches.length!==2)return;
    e.preventDefault();
    const mid=midpoint(e.touches);
    const rect=viewer.getBoundingClientRect();
    resizePages(pinch.zoom*distance(e.touches)/pinch.distance,{x:mid.x-rect.left,y:mid.y-rect.top});
  },{passive:false});
  const finishPinch=()=>{
    if(!pinch)return;
    pinch=null;
    isPinching=false;
    if (pilot && zoom <= 1.001) viewer.scrollLeft=0;
    sharpen();
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
