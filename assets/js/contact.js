fetch('../data/site.json').then(r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{
 const el=document.querySelector('#contact-data');el.replaceChildren();
 const entries=[['회사명',d.company],['전화',d.phone],['이메일',d.contact_email],['주소',d.address]];
 for(const [name,value] of entries){if(!String(value||'').trim())continue;
  const item=document.createElement('div');item.className='contact-item';const label=document.createElement('strong');label.textContent=name;
  const text=document.createElement('p');let content=text;
  if(name==='전화'||name==='이메일'){content=document.createElement('a');content.href=name==='전화'?'tel:'+String(value).replace(/[^+0-9]/g,''):'mailto:'+String(value).trim();text.append(content)}
  content.textContent=value;item.append(label,text);el.append(item);
 }
}).catch(()=>document.querySelector('#contact-data').textContent='회사 연락처 정보를 불러오지 못했습니다.');
