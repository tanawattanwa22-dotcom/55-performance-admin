/* 55 PERFORMANCE - private owner delivery ledger.
   Public browser holds ONLY publishable key; Supabase edge validates user and ecu_admins. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const cfg=window.LICENSE_CONFIG,KEY='55p_admin_session';
const API=cfg?.url+'/functions/v1/ecu-esp32-warranty';
const fmt=new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'});
const date=new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium'});
const when=v=>v?fmt.format(new Date(v)):'—';
const iso=v=>v?date.format(new Date(v+'T12:00:00+07:00')):'—';
const bangkokDate=()=>{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(new Date());
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
};
const state={page:0,search:'',units:new Map(),loading:false};
const el=(t,content,cls)=>{const e=document.createElement(t);if(content!==undefined)e.textContent=String(content);if(cls)e.className=cls;return e};
const tell=(msg,ok=true)=>{$('status').textContent=msg;$('status').style.color=ok?'#9aeee8':'#ffb19b'};
const session=()=>{try{return JSON.parse(sessionStorage.getItem(KEY)||'null')}catch{return null}};
async function post(url,payload,token){
 const result=await fetch(url,{method:'POST',cache:'no-store',signal:AbortSignal.timeout(16000),
  headers:{'Content-Type':'application/json','apikey':cfg.anonKey,...(token?{'Authorization':'Bearer '+token}:{})},
  body:JSON.stringify(payload)});
 const body=await result.json().catch(()=>({}));
 if(!result.ok)throw Error(body.error||body.msg||'HTTP '+result.status);
 return body;
}
async function api(action,details={}){
 const s=session();
 if(!s?.access_token||s.expires_at<Date.now())throw Error('กรุณาเข้าสู่ระบบแอดมินอีกครั้ง');
 return post(API,{action,...details},s.access_token);
}
const show=(ok)=>{
 $('login').hidden=ok;$('workspace').hidden=!ok;$('logout').hidden=!ok;
 if(!ok)$('records').replaceChildren();
};
function statusOf(r){
 if(!r.activated_at)return {value:'ยังไม่เปิดใช้',className:'pending'};
 if(new Date(r.expires_at)<new Date())return {value:'หมดประกัน',className:'expired'};
 return {value:'กำลังรับประกัน',className:''};
}
function lines(r){
 return [
  ['Serial',r.serial_number||'ยังไม่ได้กำหนด'],
  ['Bluetooth MAC', '****:'+r.bluetooth_suffix+' (เก็บเป็น Hash)'],
  ['วันที่ออกจากร้าน',iso(r.delivered_on)],
  ['เริ่มรับประกัน',when(r.activated_at)],
  ['สิ้นสุดรับประกัน',when(r.expires_at)],
  ['ระยะรับประกัน',r.warranty_months+' เดือน'],
  ['ลูกค้า',r.customer_name||'—'],
  ['ติดต่อ',r.customer_contact||'—'],
  ['เชื่อมต่อล่าสุด',when(r.last_connected_at)],
  ['เชื่อมต่อสำเร็จ',r.connection_count+' ครั้ง']
 ];
}
function receipt(r){
 const rows=[
  '55 PERFORMANCE - ใบส่งมอบและรับประกัน',
  'สินค้า: '+r.product_name,
  'Serial: '+(r.serial_number||'—'),
  'วันที่ออกจากร้าน: '+iso(r.delivered_on),
  'ระยะประกัน: '+r.warranty_months+' เดือน',
  'วันเริ่มประกัน: '+(r.activated_at?when(r.activated_at):'รอเชื่อมต่อผ่านแอปครั้งแรก'),
  'วันหมดประกัน: '+when(r.expires_at),
  'สถานะ: '+statusOf(r).value,
  'ลูกค้า: '+(r.customer_name||'—')
 ];
 return rows.join('\n');
}
function rowCard(r){
 const c=el('article',undefined,'unit'),head=el('header'),label=el('h3',r.serial_number||'Bluetooth '+r.bluetooth_suffix);
 const st=statusOf(r),pill=el('span',st.value,'pill '+st.className);
 head.append(label,pill);
 const product=el('p',r.product_name);
 const dl=el('dl');
 for(const [key,value] of lines(r))dl.append(el('dt',key),el('dd',value));
 const buttons=el('div',undefined,'buttons'),edit=el('button','แก้ไขข้อมูล / เดือนประกัน'),copy=el('button','คัดลอกใบส่งมอบ');
 edit.type='button';copy.type='button';
 edit.onclick=()=>editUnit(r);
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(receipt(r));tell('คัดลอกใบส่งมอบแล้ว')}
 catch{tell('คัดลอกไม่ได้ กรุณาใช้ Chrome บน HTTPS',false)}};
 buttons.append(edit,copy);c.append(head,product,dl,buttons);return c;
}
async function load(){
 if(state.loading)return;
 state.loading=true;$('reload').disabled=true;
 try{
  const data=await api('admin-list',{page:state.page,search:state.search});
  state.units=new Map((data.units||[]).map(v=>[v.id,v]));
  const cards=data.units.map(rowCard);
  $('records').replaceChildren(...(cards.length?cards:[el('p','ยังไม่มีรายการที่ตรงกับการค้นหา','hint')]));
  $('pageInfo').textContent='หน้า '+(state.page+1)+' · ทั้งหมด '+data.total+' รายการ';
  $('prev').disabled=state.page===0;
  $('next').disabled=(state.page+1)*25>=data.total;
  $('statTotal').textContent=cards.length;
  $('statPending').textContent=data.units.filter(r=>!r.activated_at).length;
  $('statActive').textContent=data.units.filter(r=>r.activated_at&&new Date(r.expires_at)>=new Date()).length;
  $('statExpired').textContent=data.units.filter(r=>r.activated_at&&new Date(r.expires_at)<new Date()).length;
  show(true);
 }catch(e){if(String(e.message).includes('Sign in')||String(e.message).includes('Admin only')||String(e.message).includes('เข้าสู่ระบบ'))show(false);throw e}
 finally{state.loading=false;$('reload').disabled=false}
}
function fields(edit=false){
 const pre=edit?'edit':'';
 return {
  serial_number:$(edit?'editSerial':'serial').value,
  product_name:$(edit?'editProduct':'product').value,
  customer_name:$(edit?'editBuyer':'buyer').value,
  customer_contact:$(edit?'editContact':'contact').value,
  delivered_on:$(edit?'editDelivered':'delivered').value,
  warranty_months:Number($(edit?'editMonths':'months').value),
  notes:$(edit?'editNotes':'notes').value
 };
}
function editUnit(r){
 $('editId').value=r.id;
 $('editSerial').value=r.serial_number||'';
 $('editProduct').value=r.product_name;
 $('editBuyer').value=r.customer_name||'';
 $('editContact').value=r.customer_contact||'';
 $('editDelivered').value=r.delivered_on;
 $('editMonths').value=r.warranty_months;
 $('editNotes').value=r.notes||'';
 $('editDialog').showModal();
}
$('delivered').value=bangkokDate();
$('delivered').max=bangkokDate();
$('editDelivered').max=bangkokDate();
$('loginForm').onsubmit=async event=>{
 event.preventDefault();
 const button=$('loginForm').querySelector('button');button.disabled=true;
 try{
  const token=await post(cfg.url+'/auth/v1/token?grant_type=password',
    {email:$('email').value.trim(),password:$('password').value});
  if(!token.access_token)throw Error('ไม่พบ access token');
  sessionStorage.setItem(KEY,JSON.stringify({access_token:token.access_token,
   expires_at:Date.now()+(token.expires_in||3600)*1000}));
  $('password').value='';await load();tell('เข้าสู่ระบบแอดมินสำเร็จ');
 }catch(e){sessionStorage.removeItem(KEY);show(false);tell(e.message,false)}
 finally{button.disabled=false}
};
$('logout').onclick=()=>{sessionStorage.removeItem(KEY);state.units.clear();show(false);tell('ออกจากระบบแล้ว')};
$('reload').onclick=()=>load().catch(e=>tell(e.message,false));
$('searchForm').onsubmit=e=>{
 e.preventDefault();state.page=0;state.search=$('search').value.trim().toUpperCase();
 load().catch(err=>tell(err.message,false));
};
$('prev').onclick=()=>{if(state.page){state.page--;load().catch(err=>tell(err.message,false))}};
$('next').onclick=()=>{state.page++;load().catch(err=>tell(err.message,false))};
$('unitForm').onsubmit=async e=>{
 e.preventDefault();const save=$('save');save.disabled=true;
 try{
  const mac=$('mac').value.trim().toUpperCase();
  const result=await api('admin-register',{bluetooth_mac:mac,...fields()});
  tell('ลงทะเบียน '+(result.unit.serial_number||'Bluetooth '+result.unit.bluetooth_suffix)+' สำเร็จ · รอเปิดใช้งานผ่านแอป');
  $('unitForm').reset();$('delivered').value=bangkokDate();
  state.page=0;state.search='';$('search').value='';await load();
 }catch(err){tell(err.message,false)}
 finally{save.disabled=false}
};
$('cancelEdit').onclick=()=>$('editDialog').close();
$('editForm').onsubmit=async e=>{
 e.preventDefault();const button=$('saveEdit');button.disabled=true;
 try{
  const id=$('editId').value;
  const result=await api('admin-edit',{id,...fields(true)});
  $('editDialog').close();await load();
  tell('บันทึกเรียบร้อย · เริ่มประกันเดิม '+when(result.unit.activated_at)+' · สิ้นสุด '+when(result.unit.expires_at));
 }catch(err){tell(err.message,false)}
 finally{button.disabled=false}
};
if(session()?.expires_at>Date.now())load().catch(e=>tell(e.message,false));
else show(false);
})();