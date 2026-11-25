// Development UI; explicit mount only. No flash hooks, no automatic startup.
// Connect only after ecu_commerce_v1 and delivery/issuance are deployed.
export function createCommerceAPI({config,getToken,getDevice,isBusy=()=>false,fetcher=fetch}){
 return async function rpc(op,p={}){
  if(isBusy())throw Error('รอให้ ECU ทำงานเสร็จก่อน');
  const jwt=await getToken();
  if(isBusy())throw Error('รอให้ ECU ทำงานเสร็จก่อน');
  if(!jwt)throw Error('กรุณาเข้าสู่ระบบ');
  const endpoint=op==='release_status'?'ecu_commerce_status_v1':op.startsWith('retail_')?'ecu_retail_license_v1':op.startsWith('coin_')?'ecu_coin_v1':op.startsWith('upgrade_')?'ecu_commerce_upgrade_v1':op.startsWith('fulfill_')?'ecu_seller_fulfill_v1':op.startsWith('delivery_')?'ecu_market_delivery_v1':'ecu_commerce_v1';
  const action=endpoint==='ecu_retail_license_v1'?op.slice(7):endpoint==='ecu_coin_v1'?op.slice(5):endpoint==='ecu_commerce_upgrade_v1'?op.slice(8):endpoint==='ecu_seller_fulfill_v1'?op.slice(8):endpoint==='ecu_market_delivery_v1'?op.slice(9):op;
  const res=await fetcher(config.url+'/rest/v1/rpc/'+endpoint,{
   method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',apikey:config.anonKey,Authorization:'Bearer '+jwt},
   body:JSON.stringify(op==='release_status'?{}:{op:action,[endpoint==='ecu_coin_v1'?'payload':'p']:{...p,device:getDevice()}})
  });
  const value=await res.json().catch(()=>null);
  if(!res.ok)throw Error(value?.message||'ระบบร้านค้ายังไม่พร้อม');
  return value;
 };
}
function installTheme(doc){
 if(doc.getElementById('forge55-commerce-theme'))return;
 const css=doc.createElement('link');css.id='forge55-commerce-theme';css.rel='stylesheet';
 css.href=new URL('./forge55-commerce.css?v=1',import.meta.url).href;doc.head.append(css);
}
export function mountCommerce(root,rpc,{admin=false,isBusy=()=>false,confirmAction=msg=>window.confirm(msg),uploadAsset=null,importAsset=null,enableFulfillment=false}={}){
 const d=root.ownerDocument;installTheme(d);
 const el=(tag,text='',cls='')=>{const n=d.createElement(tag);n.textContent=text;n.className=cls;return n;};
 const section=el('section','','commerce55');const status=el('p');status.setAttribute('role','status');
 const content=el('div');let closed=false,locked=false,tab=admin?'admin':'market';
 const money=n=>Number(n).toLocaleString('th-TH');
 const btn=(name,fn)=>{const b=el('button',name);b.type='button';b.onclick=fn;return b;};
 const nav=el('nav');
 for(const [key,name] of (admin?[['admin','ร้านแอดมิน']]:[['market','FILE MARKET'],['coin','เติม Coin'],['seller','55 SELLER'],['tier','STANDARD / PRO']])){
  const b=btn(name,()=>{if(!locked){tab=key;void refresh();}});b.dataset.tab=key;b.setAttribute('aria-pressed',String(tab===key));nav.append(b);
 }
 const hero=el('header','','commerce55-hero');hero.append(el('small','55 PERFORMANCE / FORGE55'),el('h2',admin?'COMMERCE CONTROL':'55 MARKET & SELLER'),el('p',admin?'จัดการไฟล์ • License • ตัวแทน':'คลังไฟล์พิเศษ • สมาชิก • ตัวแทน'));
 section.append(hero,nav,status,content);root.append(section);
 async function action(fn){
  if(closed||locked||isBusy())return;
  locked=true;status.textContent='';
  try{await fn();await render();}catch(e){if(!closed)status.textContent=e.message;}
  finally{locked=false;}
 }
 function refresh(){return action(async()=>{});}
 const row=(parent,title,desc)=>{const r=el('article');r.append(el('strong',title),el('p',desc));parent.append(r);return r;};
 function field(form,name,type='text'){const label=el('label',name);const input=el('input');input.type=type;input.required=true;label.append(input);form.append(label);return input;}
 async function render(){
  const state=await rpc(admin?'admin_state':'state');const release=await rpc('release_status');if(closed)return;
  content.replaceChildren();for(const b of nav.children)b.setAttribute('aria-pressed',String(b.dataset.tab===tab));
  if(admin){
   content.append(el('p',release.market_checkout?'เปิดซื้อไฟล์แล้ว':'โหมดจัดเตรียมร้าน • ยังไม่หัก Coin'),el('p',release.license_checkout?'เปิดขาย License แล้ว':'ล็อกการออก Key / คำสั่งซื้อ'),el('h3','เพิ่มสินค้าแบบร่าง'));
   const form=el('form');
   const title=field(form,'ชื่อรุ่น'),part=field(form,'Part Code'),year=field(form,'ปี / รุ่นย่อย'),price=field(form,'ราคา Coin','number');
   price.min='1';price.max='1000000';price.step='1';
   const submit=el('button','บันทึกแบบร่าง');submit.type='submit';form.append(submit);
   form.onsubmit=e=>{e.preventDefault();void action(()=>rpc('admin_draft',{title:title.value,part_code:part.value,model_year:year.value,price_coins:Number(price.value)}));};
   content.append(form,el('p','ยังไม่เปิดเผยสินค้าจนกว่าระบบส่งมอบ BIN/XDF จะผ่านการทดสอบ'));
   for(const p of state.products){
    const r=row(content,p.title,p.part_code+' · '+p.model_year+' · '+money(p.price_coins)+' Coin · '+(p.published?'เผยแพร่':'แบบร่าง'));
    const priceForm=el('form'),newPrice=field(priceForm,'แก้ราคา Coin','number'),savePrice=el('button','บันทึกราคา');newPrice.min='1';newPrice.max='1000000';newPrice.step='1';newPrice.value=String(p.price_coins);savePrice.type='submit';priceForm.append(savePrice);
    priceForm.onsubmit=e=>{e.preventDefault();void action(()=>rpc('delivery_admin_price',{id:p.id,price_coins:Number(newPrice.value)}));};r.append(priceForm);
    if(uploadAsset&&!p.published){
     const input=el('input');input.type='file';input.accept='.zip,application/zip';r.append(input,btn('อัปโหลด ZIP แบบร่าง',()=>void action(async()=>{
      if(!input.files?.[0])throw Error('เลือก ZIP ก่อน');
      const staged=await uploadAsset(p.id,input.files[0]);
      status.textContent='อัปโหลดแบบร่างแล้ว · SHA-256 '+staged.sha256+' · ยังไม่เผยแพร่';
     })));
     const bin=el('input'),xdf=el('input');bin.type=xdf.type='file';bin.accept='.bin';xdf.accept='.xdf';
     const bl=el('label','เลือกไฟล์ BIN'),xl=el('label','เลือกไฟล์ XDF');bl.append(bin);xl.append(xdf);
     r.append(bl,xl,btn('ตรวจและอัปโหลด BIN + XDF',()=>void action(async()=>{
      if(!bin.files?.[0]||!xdf.files?.[0])throw Error('กรุณาเลือก BIN และ XDF');
      const {buildMarketPack}=await import('./market-pack-builder.mjs');
      const pack=await buildMarketPack(p,bin.files[0],xdf.files[0]);
      const result=await uploadAsset(p.id,pack);
      status.textContent='Supabase รับไฟล์แบบร่างแล้ว • SHA-256 '+result.sha256+' • ตรวจความถูกต้องก่อนเผยแพร่';
     })));
     r.append(btn('เผยแพร่สินค้าที่ตรวจแล้ว',()=>void action(async()=>{if(confirmAction('ยืนยันว่าได้ตรวจ BIN/XDF และสิทธิ์จำหน่ายแล้ว?'))await rpc('delivery_admin_publish',{id:p.id});})));
    }
   }
   content.append(el('h3','คำขอตัวแทน'));
   for(const s of state.sellers){
    const r=row(content,s.uid,'รออนุมัติ');
    for(const decision of ['approved','rejected'])r.append(btn(decision==='approved'?'อนุมัติ':'ไม่อนุมัติ',()=>void action(async()=>{if(confirmAction('ยืนยัน '+decision))await rpc('admin_seller_decide',{uid:s.uid,decision});})));
   }
   content.append(el('h3','คำสั่งซื้อตัวแทน'));
   for(const o of state.orders){
    const r=row(content,o.id,o.tier+' × '+o.quantity+' · '+money(o.quantity*o.unit_baht)+' บาท · รอตรวจสอบ');
    if(enableFulfillment){
     const f=el('form'),amount=field(f,'ยอดรับเงินจริง (บาท)','number'),ref=field(f,'เลขอ้างอิงธนาคาร'),days=field(f,'อายุ License (วัน)','number');
     amount.min='1';days.min='1';days.max='3650';days.step='1';
     const b=el('button','ยืนยันออก License');b.type='submit';f.append(b);
     f.onsubmit=e=>{e.preventDefault();void action(async()=>{if(confirmAction('ยืนยันว่าตรวจยอดเงินจริงแล้ว?'))await rpc('fulfill_confirm',{id:o.id,received_baht:Number(amount.value),reference:ref.value,days:Number(days.value)});});};
     r.append(f,btn('ปฏิเสธ',()=>void action(async()=>{if(confirmAction('ปฏิเสธคำสั่งซื้อ?'))await rpc('fulfill_reject',{id:o.id});})));
    }
   }
   for(const [prefix,title] of [['coin','คำสั่งเติม Coin'],['upgrade','คำสั่งอัปเกรด PRO'],['retail','คำสั่งซื้อ STANDARD / PRO']]){
    const data=await rpc(prefix+'_admin_queue');if(closed)return;
    content.append(el('h3',title));
    for(const o of data.orders||[]){
     const amountExpected=prefix==='coin'?o.baht:o.price_baht;
     const r=row(content,o.id,money(amountExpected)+' บาท · รอตรวจสอบ');
     const form=el('form'),instr=field(form,'รายละเอียดการโอน'),send=el('button','แจ้งวิธีชำระ');send.type='submit';form.append(send);
     instr.value=o.instructions||'';
     form.onsubmit=e=>{e.preventDefault();void action(()=>rpc(prefix+'_admin_instructions',{id:o.id,instructions:instr.value}));};
     const verify=el('form'),amount=field(verify,'ยอดรับจริง','number'),reference=field(verify,'เลขอ้างอิงธนาคาร'),confirm=el('button','ยืนยันยอด');
     const days=prefix==='retail'?field(verify,'อายุ License (วัน)','number'):null;if(days){days.min='1';days.max='3650';days.value='3650';}
     confirm.type='submit';verify.append(confirm);
     verify.onsubmit=e=>{e.preventDefault();void action(async()=>{if(confirmAction('ยืนยันว่าตรวจเงินเข้าจริงแล้ว?'))await rpc(prefix+(prefix==='coin'?'_admin_decide':'_admin_confirm'),{id:o.id,received_baht:Number(amount.value),reference:reference.value,decision:'confirm',...(prefix==='retail'?{days:Number(days.value)}:{})});});};
     r.append(form,verify,btn('ปฏิเสธ',()=>void action(async()=>{if(confirmAction('ปฏิเสธรายการ?'))await rpc(prefix+(prefix==='coin'?'_admin_decide':'_admin_reject'),{id:o.id,decision:'reject'});})));
    }
   }
   return;
  }
  content.append(el('div',state.tier.toUpperCase()+'  /  ◈ '+money(state.coins)+' COIN','c55-wallet'));
  if(tab==='market'){
   content.append(el('h3','OFFICIAL FILE MARKET'));
   if(!state.products.length)content.append(el('p','ยังไม่มีไฟล์ใหม่เปิดจำหน่าย'));
   for(const p of state.products){
    const owned=state.owned.includes(p.id);
    const r=row(content,p.title,p.part_code+' · '+p.model_year+' · '+money(p.price_coins)+' Coin');
    const b=btn(owned?'ซื้อแล้ว':'ซื้อไฟล์',()=>void action(async()=>{if(confirmAction('ยืนยันใช้ '+p.price_coins+' Coin?'))await rpc('buy_file',{id:p.id});}));
    b.disabled=owned||!release.market_checkout;if(!owned&&!release.market_checkout)b.textContent='ยังไม่เปิดซื้อ';r.append(b);if(owned&&importAsset)r.append(btn('นำเข้าคลัง',()=>void action(()=>importAsset(p.id))));
   }
   content.append(el('p','ไฟล์ตลาดเป็นสิทธิ์ของบัญชีผู้ซื้อ ไม่อนุญาตให้ขายต่อ · นำเข้าคลังอีกครั้งหลังเข้าสู่ระบบใหม่ได้โดยไม่เสีย Coin เพิ่ม'));
  }else if(tab==='coin'){
   const wallet=await rpc('coin_state');if(closed)return;
   content.append(el('h3','เติม Coin'),el('p','ส่งคำสั่งซื้อและโอนตามรายละเอียดจากแอดมิน · ตรวจยอดจริงก่อนเติม'));
   const pending=wallet.orders.some(o=>o.state==='pending');
   for(const p of wallet.packages){
    const r=row(content,money(p.coins)+' Coin',money(p.baht)+' บาท');
    const b=btn('สั่งซื้อ',()=>void action(async()=>{if(confirmAction('ส่งคำสั่งซื้อ '+p.baht+' บาท?'))await rpc('coin_topup_create',{sku:p.sku,nonce:crypto.randomUUID()});}));b.disabled=pending;r.append(b);
   }
   for(const o of wallet.orders){
    const r=row(content,money(o.baht)+' บาท · '+money(o.coins)+' Coin',o.state+' · '+(o.instructions||'รอแอดมินแจ้งรายละเอียด'));
    if(o.state==='pending'&&!o.instructions)r.append(btn('ยกเลิก',()=>void action(()=>rpc('coin_topup_cancel',{id:o.id}))));
   }
  }else if(tab==='seller'){
   content.append(el('h3','55 SELLER'));
   if(!['pro','admin'].includes(state.tier)){content.append(el('p','เฉพาะ PRO'));return;}
   if(!state.seller)content.append(btn('สมัครตัวแทน',()=>void action(()=>rpc('seller_apply'))));
   else content.append(el('p','สถานะ: '+state.seller));
   for(const p of state.prices){
    const r=row(content,p.tier.toUpperCase(),'ทุน '+money(p.cost_baht)+' บาท · ราคาขาย '+money(p.retail_baht)+' บาท');
    const b=btn(p.enabled?'สั่งซื้อ 1 License':'ยังไม่เปิดจำหน่าย',()=>void action(async()=>{if(confirmAction('ยืนยันส่งคำสั่งซื้อ?'))await rpc('seller_order',{tier:p.tier,quantity:1,nonce:crypto.randomUUID()});}));
    b.disabled=!release.license_checkout||!p.enabled||state.seller!=='approved'||state.orders.some(o=>o.state==='pending');r.append(b);
   }
   if(state.seller==='approved'&&enableFulfillment){
    const keys=await rpc('fulfill_my_licenses');if(closed)return;
    content.append(el('h3','License พร้อมขาย'));
    for(const k of keys.licenses){const r=row(content,k.tier.toUpperCase(),k.license_key);r.append(btn('คัดลอก',()=>{void navigator.clipboard.writeText(k.license_key).catch(()=>{status.textContent='คัดลอกไม่สำเร็จ';});}));}
   }
   for(const o of state.orders){
    const r=row(content,o.tier+' × '+o.quantity,money(o.quantity*o.unit_baht)+' บาท · '+o.state);
    if(o.state==='pending')r.append(btn('ยกเลิก',()=>void action(()=>rpc('seller_cancel',{id:o.id}))));
   }
  }else{
   content.append(el('h3','ระดับสมาชิก '+state.tier.toUpperCase()),
   el('p','STANDARD 790 บาท · PRO 1,500 บาท · อัปเกรด 710 บาท'),
   el('p','อัปเกรดโดยยืนยันยอดเงินจริง · รับ Key PRO แล้วกรอกเพื่อเปิดสิทธิ์'));
   if(state.tier==='standard'){
    const f=el('form'),k=field(f,'กรอก Key อัปเกรด PRO');k.autocomplete='off';k.spellcheck=false;
    const submit=el('button','เปิดสิทธิ์ PRO');submit.type='submit';f.append(submit);
    f.onsubmit=e=>{e.preventDefault();void action(async()=>{await rpc('upgrade_redeem',{key:k.value});k.value='';status.textContent='เปิด PRO แล้ว กรุณาเปิดแอปใหม่';});};
    content.append(f);
   }
   const data=await rpc('upgrade_state');if(closed)return;
   if(release.license_checkout&&state.tier==='standard'&&!data.orders.some(o=>o.state==='pending'||(o.state==='confirmed'&&!o.redeemed_at)))content.append(btn('ขออัปเกรด 710 บาท',()=>void action(()=>rpc('upgrade_create'))));
   for(const o of data.orders){
    const r=row(content,'อัปเกรด '+money(o.price_baht)+' บาท',o.state+' · '+(o.instructions||'รอแอดมินแจ้งรายละเอียด'));
    if(o.state==='pending'&&!o.instructions)r.append(btn('ยกเลิก',()=>void action(()=>rpc('upgrade_cancel',{id:o.id}))));
    if(o.upgrade_key){
     const code=el('code',o.upgrade_key);r.append(code,btn('คัดลอก Key PRO',()=>void navigator.clipboard.writeText(o.upgrade_key).catch(()=>{status.textContent='คัดลอกไม่สำเร็จ';})));
    }
   }
  }
 }
 void refresh();
 return ()=>{closed=true;section.remove();};
}

export function mountRetailCheckout(root,rpc){
 const d=root.ownerDocument;installTheme(d);
 const el=(tag,t='')=>{const n=d.createElement(tag);n.textContent=t;return n;};
 const panel=el('section'),status=el('p'),body=el('div');panel.className='commerce55-checkout';status.setAttribute('role','status');
 let active=true,busy=false;
 const button=(t,fn)=>{const b=el('button',t);b.type='button';b.onclick=()=>void act(fn);return b;};
 async function act(fn){if(!active||busy)return;busy=true;status.textContent='';try{await fn();await render();}catch(e){status.textContent=e.message;}finally{busy=false;}}
 async function render(){
  const s=await rpc('retail_state'),release=await rpc('release_status');if(!active)return;
  body.replaceChildren();
  const pending=s.orders.some(o=>o.state==='pending');
  const grid=el('div');grid.className='c55-price-grid';
  for(const [tier,price] of [['standard',790],['pro',1500]]){
   const b=button('ซื้อ '+tier.toUpperCase()+' '+price+' บาท',async()=>{if(window.confirm('ส่งคำสั่งซื้อ '+price+' บาท?'))await rpc('retail_create',{tier});});b.disabled=pending||!release.license_checkout;b.className='c55-primary';const card=el('article');card.append(el('strong',tier.toUpperCase()),el('p',price.toLocaleString('th-TH')+' บาท'),b);grid.append(card);
  }body.append(grid);
  body.append(el('p',release.license_checkout?'โอนตามรายละเอียดจากแอดมิน · Key จะแสดงหลังตรวจยอดเงินจริง':'ยังไม่เปิดรับคำสั่งซื้อ License'));
  for(const o of s.orders){
   const r=el('article');r.append(el('strong',o.tier.toUpperCase()+' · '+o.price_baht+' บาท'),el('p',o.state+' · '+(o.instructions||'')));
   if(o.license_key){r.append(el('code',o.license_key),button('คัดลอก Key',()=>navigator.clipboard.writeText(o.license_key)),button('ใส่ Key ในช่องเปิดใช้งาน',async()=>{const input=d.getElementById('licKey');if(input)input.value=o.license_key;}));}
   if(o.state==='pending'&&!o.instructions)r.append(button('ยกเลิก',()=>rpc('retail_cancel',{id:o.id})));
   body.append(r);
  }
 }
 const hero=el('header');hero.className='commerce55-hero';hero.append(el('small','55 PERFORMANCE / FORGE55'),el('h3','LICENSE STORE'));panel.append(hero,button('รีเฟรช',async()=>{}),status,body);root.append(panel);void act(async()=>{});
 return ()=>{active=false;panel.remove();};
}
