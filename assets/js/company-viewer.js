/* COMPANY: static high-resolution images extracted from the manufacturer PDFs.
   No PDF.js, canvas, zoom buttons, or custom pinch handlers. */
(()=>{'use strict';
const makers={
  sanhua:{title:'SANHUA 회사소개',count:2},
  highly:{title:'HIGHLY 회사소개 · Sales Network',count:7}
};
const maker=new URLSearchParams(location.search).get('maker');
const entry=makers[maker];
const title=document.getElementById('maker-title');
const container=document.getElementById('company-pages');
if(!entry){title.textContent='제조사를 선택해 주세요.';return;}
title.textContent=entry.title;
document.title=entry.title+' | HR COMP';
for(let i=1;i<=entry.count;i++){
  const section=document.createElement('section');
  section.className='company-image-page';
  const img=document.createElement('img');
  img.src='../assets/img/company/'+maker+'-'+String(i).padStart(2,'0')+'.webp';
  img.alt=entry.title+' '+i+' / '+entry.count+'페이지';
  img.decoding='async';
  img.loading=i===1?'eager':'lazy';
  if(i===1)img.fetchPriority='high';
  img.width=2000;
  img.height=2830;
  section.appendChild(img);
  container.appendChild(section);
}
})();
