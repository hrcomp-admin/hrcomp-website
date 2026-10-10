const id = new URLSearchParams(location.search).get('id');
const box = document.querySelector('#detail');
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
function loadPdfJs(){return new Promise((resolve,reject)=>{if(window.pdfjsLib)return resolve(window.pdfjsLib);const s=document.createElement('script');s.src=PDFJS_URL;s.onload=()=>{pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;resolve(pdfjsLib)};s.onerror=()=>reject(Error('PDF viewer library unavailable'));document.head.append(s)})}
function element(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el}
async function renderPages(x,viewer,status,zoomLabel){
  const lib=await loadPdfJs();
  const task=lib.getDocument({url:'../'+x.catalog,withCredentials:false});
  const doc=await task.promise;
  const start=Math.max(1,Number(x.start)||1),end=Math.min(doc.numPages,Number(x.end)||doc.numPages);
  if(end<start)throw Error('Invalid catalogue page range');
  const holders=[];
  for(let n=start;n<=end;n++){
    const holder=element('div','pdf-page');holder.dataset.page=n;
    holder.append(element('div','pdf-page-label',`원본 카탈로그 ${n}페이지`));
    const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',`카탈로그 ${n}페이지`);holder.append(canvas);viewer.append(holder);holders.push(holder);
  }
  let zoom=1,run=0;
  async function draw(holder,token){
    const n=Number(holder.dataset.page),page=await doc.getPage(n);
    if(token!==run)return;
    const available=Math.min(viewer.clientWidth-32,950);
    const base=available/page.getViewport({scale:1}).width;
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const viewport=page.getViewport({scale:base*zoom*dpr});
    const canvas=holder.querySelector('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    canvas.style.width=Math.round(viewport.width/dpr)+'px';canvas.style.height=Math.round(viewport.height/dpr)+'px';
    const render=page.render({canvasContext:canvas.getContext('2d'),viewport});
    await render.promise;
    if(token===run)holder.classList.add('rendered');
  }
  async function redraw(){
    const token=++run;zoomLabel.textContent=Math.round(zoom*100)+'%';
    for(const h of holders){h.classList.remove('rendered');await draw(h,token);if(token!==run)return;}
    status.textContent=`${x.series} · ${start}–${end}페이지 (${holders.length}페이지)`;
  }
  return {redraw,zoomIn(){zoom=Math.min(zoom+0.2,2);redraw()},zoomOut(){zoom=Math.max(zoom-0.2,0.6);redraw()}};
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
  const info=element('div');info.append(element('span','tag',x.maker+' / '+x.category),element('h2','',x.series),element('p','lead',x.name),element('p','lead','원본 카탈로그 '+x.start+'–'+x.end+'페이지'));
  const actions=element('div','actions');const back=element('a','btn light','← 제품 목록으로 돌아가기');back.href='index.html?maker='+encodeURIComponent(x.maker);actions.append(back);info.append(actions);section.append(visual,info);
  const pdf=element('section','pdfbox');pdf.append(element('h3','','제품 기술자료 · '+x.series));
  const tip=element('p','lead','제조사 원본 PDF에서 이 Series에 해당하는 페이지만 표시합니다. 원본 파일은 변경하지 않습니다.');pdf.append(tip);
  const controls=element('div','pdf-controls');const status=element('span','pdf-status','기술자료를 불러오는 중…');
  const zoomOut=element('button','pdf-control','−');zoomOut.type='button';zoomOut.setAttribute('aria-label','축소');
  const zoomLabel=element('span','pdf-zoom','100%');const zoomIn=element('button','pdf-control','+');zoomIn.type='button';zoomIn.setAttribute('aria-label','확대');
  controls.append(status,zoomOut,zoomLabel,zoomIn);pdf.append(controls);
  const viewer=element('div','pdf-series-viewer');pdf.append(viewer);box.replaceChildren(section,pdf);
  try{const api=await renderPages(x,viewer,status,zoomLabel);zoomIn.onclick=api.zoomIn;zoomOut.onclick=api.zoomOut;await api.redraw()}
  catch(e){status.textContent='기술자료를 표시하지 못했습니다.';viewer.replaceChildren(element('p','notice','PDF 표시 라이브러리 또는 네트워크 연결을 확인해 주세요.'));console.error(e)}
  if(x.note)box.append(element('p','notice',x.note));
}).catch(()=>box.textContent='제품 정보를 불러오지 못했습니다.');
