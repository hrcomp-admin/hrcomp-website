/* COMPANY PDF viewer: product-detail style pinch zoom + re-render at current zoom. */
(()=>{'use strict';
const entries={sanhua:{title:'SANHUA 회사소개',pdf:'../catalog/sanhua-about.pdf'},highly:{title:'HIGHLY 회사소개 · Sales Network',pdf:'../catalog/highly-about.pdf'}};
const entry=entries[new URLSearchParams(location.search).get('maker')];
const pages=document.getElementById('company-pages'),status=document.getElementById('pdf-status');
if(!entry){status.textContent='제조사를 선택해 주세요.';return;}
document.title=entry.title+' | HR COMP';document.getElementById('maker-title').textContent=entry.title;
const pdfUrl='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const workerUrl='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
let doc,zoom=1,generation=0,active=false,pinching=false,pinch=null,timer=null;
const holders=[],rendered=new Map(),visible=new Set(),baseSizes=new WeakMap();
const zoomLabel=document.getElementById('company-zoom-label');
const mobile=matchMedia('(max-width:780px)').matches;
function load(){return new Promise((resolve,reject)=>{if(window.pdfjsLib)return resolve(window.pdfjsLib);const s=document.createElement('script');s.src=pdfUrl;s.onload=()=>resolve(window.pdfjsLib);s.onerror=()=>reject(Error('PDF.js loading failed'));document.head.append(s);});}
async function draw(holder,token){
 const n=Number(holder.dataset.page),page=await doc.getPage(n);if(token!==generation)return;
 const vp0=page.getViewport({scale:1});
 const baseWidth=Math.min(Math.max(pages.clientWidth-4,180),1050);
 const cssScale=baseWidth/vp0.width*zoom;
 const cssVP=page.getViewport({scale:cssScale});
 const dpr=mobile?Math.min(devicePixelRatio||1,1.7):Math.min(devicePixelRatio||1,2);
 const maxPixels=mobile?10500000:12000000;
 const factor=Math.min(dpr,Math.sqrt(maxPixels/(cssVP.width*cssVP.height)));
 const vp=page.getViewport({scale:cssScale*factor});
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.floor(vp.width));canvas.height=Math.max(1,Math.floor(vp.height));
 canvas.style.width=Math.round(cssVP.width)+'px';canvas.style.height=Math.round(cssVP.height)+'px';
 const task=page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport:vp});
 try{await task.promise;}catch(e){canvas.width=0;canvas.height=0;if(token===generation)throw e;return;}
 if(token!==generation){canvas.width=0;canvas.height=0;return;}
 const old=holder.querySelector('canvas');if(old){old.remove();old.width=0;old.height=0;}
 const placeholder=holder.querySelector('.company-placeholder');if(placeholder)placeholder.remove();
 holder.append(canvas);baseSizes.set(holder,{width:cssVP.width/zoom,height:cssVP.height/zoom});rendered.set(holder,token);
 status.textContent='회사소개 · '+doc.numPages+'페이지';
}
async function schedule(){if(active||pinching||!doc)return;active=true;
 try{while(true){const token=generation;const holder=holders.find(h=>visible.has(h)&&rendered.get(h)!==token);if(!holder)break;
 try{await draw(holder,token);}catch(e){console.error(e);rendered.set(holder,token);status.textContent='일부 페이지 표시 오류';}
 }}finally{active=false;if(!pinching&&holders.some(h=>visible.has(h)&&rendered.get(h)!==generation))queueMicrotask(schedule);}}
function refreshVisible(){const r=pages.getBoundingClientRect();holders.forEach(h=>{const b=h.getBoundingClientRect();if(b.bottom>=-350&&b.top<=innerHeight+350)visible.add(h);else visible.delete(h);});}
function sharpen(){clearTimeout(timer);timer=setTimeout(()=>{if(pinching)return;generation++;rendered.clear();refreshVisible();schedule();},180);}
function resize(next){const value=Math.max(1,Math.min(3.5,next));if(Math.abs(value-zoom)<.001)return;
 zoom=value;holders.forEach(h=>{const c=h.querySelector('canvas'),b=baseSizes.get(h);if(c&&b){c.style.width=Math.round(b.width*zoom)+'px';c.style.height=Math.round(b.height*zoom)+'px';}});
 zoomLabel.textContent=Math.round(zoom*100)+'%';}
function setZoom(value){resize(value);sharpen();}
document.getElementById('company-zoom-in').onclick=()=>setZoom(Math.round((zoom+.25)*100)/100);
document.getElementById('company-zoom-out').onclick=()=>setZoom(Math.round((zoom-.25)*100)/100);
document.getElementById('company-zoom-reset').onclick=()=>setZoom(1);
const distance=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
pages.addEventListener('touchstart',e=>{if(e.touches.length!==2)return;clearTimeout(timer);pinching=true;pinch={distance:Math.max(1,distance(e.touches)),zoom};},{passive:true});
pages.addEventListener('touchmove',e=>{if(!pinch||e.touches.length!==2)return;e.preventDefault();resize(pinch.zoom*distance(e.touches)/pinch.distance);},{passive:false});
function finish(){if(!pinch)return;pinch=null;pinching=false;sharpen();}
pages.addEventListener('touchend',e=>{if(e.touches.length<2)finish();},{passive:true});pages.addEventListener('touchcancel',finish,{passive:true});
addEventListener('scroll',()=>{if(!pinching){refreshVisible();schedule();}},{passive:true});
async function start(){try{const lib=await load();lib.GlobalWorkerOptions.workerSrc=workerUrl;doc=await lib.getDocument({url:entry.pdf,withCredentials:false}).promise;
 for(let n=1;n<=doc.numPages;n++){const h=document.createElement('div');h.className='company-page';h.dataset.page=n;h.id='company-page-'+n;const note=document.createElement('div');note.className='company-placeholder';note.textContent='페이지 '+n+' 준비 중…';h.append(note);pages.append(h);holders.push(h);}
 status.textContent='회사소개 · '+doc.numPages+'페이지';
 await draw(holders[0],generation);
 const observer=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting)visible.add(e.target);else visible.delete(e.target);}schedule();},{rootMargin:'350px 0px'});
 holders.forEach(h=>observer.observe(h));refreshVisible();schedule();
 }catch(e){console.error(e);status.textContent='PDF를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';}}
start();
})();
