/* COMPANY-only PDF.js viewer. Product PDF viewer is intentionally untouched. */
(()=>{'use strict';
const entries={sanhua:{title:'SANHUA 회사소개',pdf:'../catalog/sanhua-about.pdf'},highly:{title:'HIGHLY 회사소개 · Sales Network',pdf:'../catalog/highly-about.pdf'}};
const entry=entries[new URLSearchParams(location.search).get('maker')];
const pages=document.getElementById('company-pages'), status=document.getElementById('pdf-status');
if(!entry){status.textContent='제조사를 선택해 주세요.';return;}
document.title=entry.title+' | HR COMP';document.getElementById('maker-title').textContent=entry.title;
const url='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const worker='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
let pdf=null, observer=null;
const jobs=new Map(), completed=new Set();
function load(){return new Promise((resolve,reject)=>{if(window.pdfjsLib){resolve(window.pdfjsLib);return;}const s=document.createElement('script');s.src=url;s.onload=()=>resolve(window.pdfjsLib);s.onerror=()=>reject(new Error('PDF 뷰어 라이브러리를 불러오지 못했습니다.'));document.head.append(s);});}
async function draw(n){if(jobs.has(n)||completed.has(n))return;
const host=document.getElementById('company-page-'+n);if(!host)return;
const job=(async()=>{const p=await pdf.getPage(n);const natural=p.getViewport({scale:1});const width=Math.max(280,Math.min(pages.clientWidth-4,1100));const scale=width/natural.width;
const ratio=Math.min(window.devicePixelRatio||1,2);const vp=p.getViewport({scale:scale*ratio});
const canvas=document.createElement('canvas');canvas.width=Math.round(vp.width);canvas.height=Math.round(vp.height);canvas.style.width=Math.round(width)+'px';canvas.style.height=Math.round(natural.height*scale)+'px';
const ctx=canvas.getContext('2d',{alpha:false});await p.render({canvasContext:ctx,viewport:vp}).promise;
host.replaceChildren(canvas);completed.add(n);status.textContent='회사소개 · '+pdf.numPages+'페이지';})();
jobs.set(n,job);try{await job;}catch(e){host.textContent='페이지를 표시할 수 없습니다.';status.textContent='PDF 표시 오류';console.error(e);}finally{jobs.delete(n);}}
async function start(){try{const lib=await load();lib.GlobalWorkerOptions.workerSrc=worker;pdf=await lib.getDocument({url:entry.pdf,withCredentials:false}).promise;
for(let n=1;n<=pdf.numPages;n++){const h=document.createElement('div');h.className='company-page';h.id='company-page-'+n;h.textContent='페이지 '+n+' 준비 중…';pages.appendChild(h);}
status.textContent='회사소개 · '+pdf.numPages+'페이지';
observer=new IntersectionObserver(es=>{for(const e of es){if(e.isIntersecting)draw(Number(e.target.id.split('-').pop()));}},{rootMargin:'450px 0px'});
for(const h of pages.children)observer.observe(h);await draw(1);
}catch(e){status.textContent='PDF를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';console.error(e);}}
start();
})();