(function(){const el=document.getElementById('footer-contact');if(!el)return;
const src=new URL(document.currentScript.src);const dataUrl=new URL('../../data/site.json',src);
fetch(dataUrl).then(r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{
 const items=[['TEL',d.phone,'tel:'],['E-mail',d.contact_email,'mailto:']];
 for(const [label,value,scheme] of items){if(!String(value||'').trim())continue;
  const line=document.createElement('p');line.className='footer-contact-line';const a=document.createElement('a');
  a.href=scheme+(scheme==='tel:'?String(value).replace(/[^+0-9]/g,''):String(value).trim());a.textContent=label+' : '+value;
  line.append(a);el.append(line);
 }
});})();
