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

  const pilot = true; // Shared viewer path for every series.
  const shortPdf = (end - start + 1) <= 4;
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

  // Render visible pages first; never block the first screen on offscreen pages.
  // Keep a single render queue to control mobile memory use.
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
    const dpr=mobile ? Math.min(devicePixelRatio||1,1.7) : Math.min(devicePixelRatio||1,2);
    const maxPixels=mobile ? 10500000 : 12000000;
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
    if (zoom <= 1.001) viewer.scrollLeft = 0;
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
        const target=holders.find(h=>visible.has(h)&&rendered.get(h)!==token&&!pending.has(h));
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
      if(!isPinching && holders.some(h=>visible.has(h) && rendered.get(h)!==generation && !pending.has(h))) {
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
      const vr=viewer.getBoundingClientRect();
      holders.forEach(h=>{const r=h.getBoundingClientRect();if(r.bottom>=vr.top-120&&r.top<=vr.bottom+120)visible.add(h);else visible.delete(h);});
      schedule();
    },180);
  }
  function updateZoom(next,focus){resizePages(next,focus);if(zoom<=1.001)viewer.scrollLeft=0;sharpen();}

  // Some Android WebViews retain a low-resolution composited tile after
  // horizontal panning. Refresh the visible page after the gesture settles.
  // Keep the existing bitmap on screen until its replacement is ready.
  if(mobile){
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
    if (zoom <= 1.001) viewer.scrollLeft=0;
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
Promise.resolve().then(async()=>{const r=await fetch('../data/manufacturers.json',{cache:'no-store'});if(!r.ok)throw Error('manufacturer registry');const makers=await r.json();const datasets=await Promise.all(makers.filter(m=>m.active!==false).map(async m=>{const res=await fetch('../data/'+m.data,{cache:'no-store'});if(!res.ok)throw Error(m.id);return res.json()}));return datasets.flat()}).then(async data=>{
  const x=data.find(v=>v.id===id);
  if(!x){box.textContent='해당 제품을 찾을 수 없습니다.';return}
  document.title=x.series+' | HR COMP';
  document.querySelector('#detailtitle').textContent=x.series;
  document.querySelector('#breadcrumb').textContent=x.maker+' / '+x.category+' / '+x.series;
  const section=element('div','detail');
  const visual=element('div','series-visual');
  visual.classList.add('product-photo-visual');
  const photo=element('img','product-detail-image');
  photo.src='../'+(x.hero_image||x.image);
  photo.alt=x.series+' 제품 대표 이미지';
  photo.loading='eager';
  visual.append(photo);
  const info=element('div','series-info');
  info.append(element('span','tag',x.maker+' / '+x.category),element('h2','',x.series),element('p','lead',x.name));
  if(x.function){
    const heading=element('h3','product-function-heading','주요 역할 · 기능');
    info.append(heading,element('p','product-function',x.function));
  }
  info.append(element('p','lead series-pages','원본 카탈로그 '+x.start+'–'+x.end+'페이지'));
  const actions=element('div','actions');const back=element('a','btn light','← 제품 목록으로 돌아가기');back.href='index.html?maker='+encodeURIComponent(x.maker);actions.append(back);info.append(actions);section.append(visual,info);
  // BAILU: six original catalogue pages as static images; other PDF viewers untouched.
  if(x.image_pages && x.image_pages.length){
    const imageBox=element('section','pdfbox bailu-image-catalog');
    imageBox.append(element('h3','','제품 기술자료 · '+x.series));
    imageBox.append(element('p','lead',x.maker==='BAILU'?'한글 안내 시범판 · 제품 사진과 원본 도면·사양을 함께 제공합니다. 상세 수치는 제조사 원본을 기준으로 확인하십시오.':'제조사 원본 카탈로그를 제공합니다.'));
    const controls=element('div','bailu-controls');
    const minus=element('button','pdf-control','−');minus.type='button';minus.setAttribute('aria-label','이미지 축소');
    const label=element('span','pdf-zoom','100%');
    const plus=element('button','pdf-control','+');plus.type='button';plus.setAttribute('aria-label','이미지 확대');
    const reset=element('button','pdf-control','100%');reset.type='button';reset.setAttribute('aria-label','원래 크기');
    controls.append(minus,label,plus,reset);imageBox.append(controls);
    const viewer=element('div','bailu-viewer');let zoom=100;
    const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
    const applyZoom=(next,point)=>{
      const old=zoom;
      zoom=clamp(next,100,300);
      if(Math.abs(zoom-old)<0.01)return;
      const focus=point||{x:viewer.clientWidth/2,y:viewer.clientHeight/2};
      const contentX=viewer.scrollLeft+focus.x;
      const contentY=viewer.scrollTop+focus.y;
      viewer.querySelectorAll('.bailu-page-image').forEach(im=>{im.style.width=zoom+'%';});
      label.textContent=Math.round(zoom)+'%';
      viewer.classList.toggle('is-zoomed',zoom>100);
      // Keep the location under the fingers fixed during pinch/zoom.
      viewer.scrollLeft=Math.max(0,contentX*zoom/old-focus.x);
      viewer.scrollTop=Math.max(0,contentY*zoom/old-focus.y);
      if(zoom===100){viewer.scrollLeft=0;viewer.scrollTop=0;}
    };
    minus.onclick=()=>applyZoom(zoom-25);
    plus.onclick=()=>applyZoom(zoom+25);
    reset.onclick=()=>applyZoom(100);
    const distance=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
    const midpoint=t=>({x:(t[0].clientX+t[1].clientX)/2,y:(t[0].clientY+t[1].clientY)/2});
    let pinch=null, suppressClickUntil=0;
    viewer.addEventListener('touchstart',e=>{
      if(e.touches.length!==2)return;
      pinch={distance:Math.max(1,distance(e.touches)),zoom};
      suppressClickUntil=Date.now()+700;
    },{passive:true});
    viewer.addEventListener('touchmove',e=>{
      if(!pinch||e.touches.length!==2)return;
      e.preventDefault();
      const mid=midpoint(e.touches),rect=viewer.getBoundingClientRect();
      applyZoom(pinch.zoom*distance(e.touches)/pinch.distance,{x:mid.x-rect.left,y:mid.y-rect.top});
      suppressClickUntil=Date.now()+700;
    },{passive:false});
    viewer.addEventListener('touchend',e=>{if(e.touches.length<2)pinch=null},{passive:true});
    viewer.addEventListener('touchcancel',()=>{pinch=null},{passive:true});
    viewer.addEventListener('click',e=>{
      if(Date.now()<suppressClickUntil){e.preventDefault();e.stopPropagation();}
    },true);
    x.image_pages.forEach((src,i)=>{
      const page=element('div','bailu-page');
      page.append(element('div','pdf-page-label',x.maker+' 제조사 원본 카탈로그 '+(x.start+i)+'페이지 / '+x.end+'페이지'));
      const koPanels=[
        ['제조사 소개 | BAILU','회사 소개','BAILU 제조사의 회사 소개 자료입니다.','원본 안내','회사 소개 원문은 아래 제조사 원본 이미지에서 확인하실 수 있습니다.'],
        ['제조사 소개 | BAILU (영문)','회사 소개','BAILU 제조사의 영문 회사 소개 자료입니다.','원본 안내','제조사 정보와 인증 관련 내용은 원본 카탈로그를 기준으로 확인하십시오.'],
        ['자동복귀형 압력스위치 | BLPS-YKHL','용도','냉동·공조 시스템 및 공기압축기 등에서 고압 또는 저압을 감지하고 전기 접점을 개폐하여 장비를 보호·제어합니다.','주요 특징','나사식·동관 용접식 등 연결 방식을 선택할 수 있으며, 단자형·리드선형 접속과 상시 열림/상시 닫힘 접점 구성을 제공합니다. 설정 압력 범위는 모델별로 확인하십시오.'],
        ['수동복귀형 압력스위치 | BLPS-YKM','용도','냉동·공조 장비 등에서 압력 이상 발생 시 회로를 차단하고, 조건을 확인한 뒤 수동으로 복귀시키는 압력 보호 장치입니다.','주요 특징','연결 및 전기 접속 방식이 다양하며, 자동복귀를 방지하는 수동 리셋 구조를 적용합니다. 모델별 압력 범위와 복귀 조건은 원본 기술자료를 확인하십시오.'],
        ['외형도 및 치수 | BLPS-YK 계열','도면 안내','연결부, 리드선, 단자 및 설치 형태에 따른 외형도입니다.','확인 사항','도면의 단위는 mm이며, 실제 선정 시 모델별 연결 방식·치수·장착 방향을 원본 도면과 대조하십시오.'],
        ['기술사양 및 압력 설정값','사양 안내','압력 설정 범위, 압력 허용오차, 접점 형식, 접점 용량, 절연 특성, 사용 온도 및 내구성 등의 기술자료입니다.','주의 사항','표의 수치·단위와 모델별 개폐 압력은 오역을 방지하기 위해 아래 제조사 원본 표를 그대로 제공합니다. 구매 및 설계 적용 전 해당 모델의 사양을 재확인하십시오.']
      ];
      const k=x.maker==='BAILU'?koPanels[i]:null;
      if(k){const panel=element('div','bailu-ko-panel');
      panel.style.cssText='box-sizing:border-box;background:#f0fbff;border:1px solid #b9e7f4;border-radius:12px;padding:22px 24px;margin:12px auto 18px;max-width:1024px;line-height:1.85;color:#15334b;';
      const h=element('h3','',k[0]);h.style.cssText='font-size:clamp(20px,2.4vw,29px);margin:0 0 12px;color:#0075a6';panel.append(h);
      for(let z=1;z<5;z+=2){const label=element('strong','',k[z]);label.style.cssText='display:block;margin-top:9px;color:#086b94';panel.append(label);const desc=element('p','',k[z+1]);desc.style.cssText='margin:3px 0 10px;font-size:clamp(15px,1.5vw,18px)';panel.append(desc);}
      page.append(panel);}
      page.append(element('div','pdf-page-label','제조사 원본 이미지 · '+(x.start+i)+'페이지'));
      const link=element('a','bailu-image-link');link.href='../'+src;link.target='_blank';link.rel='noopener noreferrer';link.title='이미지 원본 크기로 열기';
      const img=element('img','bailu-page-image');img.src='../'+src;img.alt=x.maker+' 원본 카탈로그 '+(x.start+i)+'페이지';img.loading=i===0?'eager':'lazy';img.decoding='async';
      link.append(img);page.append(link);viewer.append(page);
    });
    imageBox.append(viewer);box.replaceChildren(section,imageBox);
    if(x.note)box.append(element('p','notice',x.note));
    return;
  }
  // HIGHLY Compressor Series (h-1): same static-image presentation as COMPANY.
  // Other product series continue using their original PDF.js viewer unchanged.
  if(x.id==='h-1'){
    const imageBox=element('section','pdfbox highly-series-images');
    imageBox.append(element('h3','','제품 기술자료 · '+x.series));
    imageBox.append(element('p','lead','원본 카탈로그 12–15페이지 (4페이지)'));
    const imageRoot=location.pathname.includes('/products/products/')?'../../assets/img/series/':'../assets/img/series/';
    for(let i=1;i<=4;i++){
      const page=element('div','highly-series-image-page');
      page.style.cssText='margin:0 auto 12px;max-width:100%;background:#fff';
      const img=element('img','highly-series-page-image');
      img.src=imageRoot+'h-1-'+String(i).padStart(2,'0')+'.webp';
      img.alt='HIGHLY Compressor Series 원본 카탈로그 '+(i+11)+'페이지';
      img.width=2000;img.height=2845;
      img.loading=i===1?'eager':'lazy';
      img.decoding='async';
      img.style.cssText='display:block;width:100%;height:auto;max-width:100%';
      if(i===1)img.fetchPriority='high';
      page.append(img);imageBox.append(page);
    }
    box.replaceChildren(section,imageBox);
    if(x.note)box.append(element('p','notice',x.note));
    return;
  }
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
