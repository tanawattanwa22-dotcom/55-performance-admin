/* Existing Admin login + server-side RLS. Never render or store secrets from a report. */
(()=>{'use strict';
const get=id=>document.getElementById(id);
const PAGE=25;
const resultNames={final_ack:'ECU ตอบ Final ACK',usb_detached:'USB หลุด',ecu_timeout:'ECU ไม่ตอบ / หมดเวลา',
 stopped:'หยุดการทำงาน',cancelled:'ยกเลิกก่อนลบ',unknown:'ไม่ทราบผล / ขาดบันทึก'};
const stageNames={preflight:'ตรวจความพร้อม',erase:'ลบข้อมูล',write:'เขียนข้อมูล',final_ack:'หลัง Final ACK'};
const errorNames={ECU_RESPONSE_TIMEOUT:'กล่องไม่ตอบทันเวลา',TRANSPORT_IO:'ข้อผิดพลาดการสื่อสาร (ไม่ยืนยันว่าถอดสาย)',
 ECU_REJECTED:'กล่องไม่รับข้อมูล / การตอบกลับไม่ผ่าน',REJECTED_PRECHECK:'หยุดก่อนเขียน',OTHER:'ข้อผิดพลาดอื่น'};
const sourceNames={tuned:'ไฟล์ที่จูน',stock:'มาตรฐานจากคลัง',local:'ไฟล์ในเครื่อง',unknown:'—'};
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const part=/^[A-Z0-9]{2,12}(?:-[A-Z0-9]{1,12}){0,3}$/;
const time=new Intl.DateTimeFormat('th-TH',{dateStyle:'short',timeStyle:'medium'});
const stamp=x=>x?time.format(new Date(x)):'—';
let cursor=null, criteria=null, more=false, loading=false;
const node=(tag,value)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;return n};
function detail(row){
 const article=node('article');article.className='license-card support-card';article.dataset.outcome=row.outcome;
 const title=node('header');title.append(node('strong',resultNames[row.outcome]||'ไม่ทราบผล'),
   node('span',(row.kind==='recovery'?'Recovery':'Flash')+' · '+(row.transport==='usb'?'USB':row.transport==='bluetooth'?'Bluetooth':'ไม่ทราบสาย')));
 const dl=node('dl');
 function field(key,value){dl.append(node('dt',key),node('dd',value??'—'))}
 field('เริ่ม',stamp(row.started_at));field('ขั้นตอนล่าสุด',(stageNames[row.stage]||'—')+
   (Number.isInteger(row.progress)?' '+row.progress+'%':''));
 field('ECU / Part Code',[row.ecu_id,row.part_code].filter(Boolean).join(' / ')||'—');
 field('Build / แหล่ง BIN',(row.app_build??'เว็บ / ไม่ทราบ')+' / '+(sourceNames[row.bin_source]||'—'));
 field('บัญชีลูกค้า',row.user_id);
 if(row.usb_detached_at){
   const timing=row.final_ack_at?(new Date(row.usb_detached_at)>=new Date(row.final_ack_at)?'หลัง Final ACK':'ก่อน Final ACK'):'ไม่พบ Final ACK';
   field('USB หลุด',stamp(row.usb_detached_at)+' · '+(stageNames[row.usb_detached_stage]||'—')+' · '+timing);
 }
 if(row.final_ack_at)field('Final ACK',stamp(row.final_ack_at)+' · ไม่ได้อ่าน BIN กลับหรือยืนยันการสตาร์ต');
 if(row.error_code)field('สรุปข้อผิดพลาด',errorNames[row.error_code]||'อื่น ๆ');
 field('รหัสเคส',row.id);field('รับรายงาน',stamp(row.received_at));
 article.append(title,dl);return article;
}
function query(q){
 const p=new URLSearchParams({select:'id,user_id,received_at,started_at,kind,app_build,transport,ecu_id,part_code,bin_source,stage,progress,final_ack_at,usb_detached_at,usb_detached_stage,error_code,outcome',
  order:'received_at.desc,id.desc',limit:String(PAGE+1)});
 if(q.search){if(uuid.test(q.search))p.set('or','(id.eq.'+q.search+',user_id.eq.'+q.search+')');else p.set('part_code','eq.'+q.search)}
 if(q.outcome==='usb_detached')p.set('usb_detached_at','not.is.null');
 else if(q.outcome)p.set('outcome','eq.'+q.outcome);
 if(cursor){
  const seek='(received_at.lt.'+cursor.received_at+',and(received_at.eq.'+cursor.received_at+',id.lt.'+cursor.id+'))';
  if(p.has('or')){const base=p.get('or');p.delete('or');p.set('and','(or'+base+',or'+seek+')')}
  else p.set('or',seek);
 }
 return p;
}
async function search(append=false){
 if(loading)return;
 const s=getSession(), status=get('reportStatus'), list=get('reportList');
 if(!s?.access_token||Date.now()>=s.expires_at){list.replaceChildren();status.textContent='เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';return}
 if(!append){
   const search=get('reportQuery').value.trim().toUpperCase();
   if(search&&!uuid.test(search)&&(!part.test(search)||search.length>32)){status.textContent='กรอกรหัสเคส UUID, UUID บัญชี หรือ Part Code ให้ครบ';return}
   criteria={search:uuid.test(search)?search.toLowerCase():search,outcome:get('reportOutcome').value};
   cursor=null;more=false;list.replaceChildren();
 }
 loading=true;get('reportFind').disabled=true;get('reportMore').disabled=true;status.textContent='กำลังโหลด…';
 const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch(cfg.url+'/rest/v1/ecu_flash_reports?'+query(criteria),{cache:'no-store',signal:controller.signal,
    headers:{'apikey':cfg.anonKey,'Authorization':'Bearer '+s.access_token}});
  if(!response.ok)throw Error(response.status===401?'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่':'เปิดประวัติไม่สำเร็จ (HTTP '+response.status+')');
  const rows=await response.json();
  if(!Array.isArray(rows))throw Error('ข้อมูลรายงานไม่ถูกต้อง');
  more=rows.length>PAGE;
  const shown=rows.slice(0,PAGE);
  list.append(...shown.map(detail));
  cursor=shown.at(-1)||cursor;
  status.textContent=list.childElementCount?'แสดง '+list.childElementCount+' รายงาน':'ไม่พบรายงานตามเงื่อนไข';
 }catch(e){status.textContent=e.name==='AbortError'?'การเชื่อมต่อหมดเวลา ลองอีกครั้ง':e.message}
 finally{clearTimeout(deadline);loading=false;get('reportFind').disabled=false;get('reportMore').disabled=false;get('reportMore').hidden=!more}
}
get('reportForm').addEventListener('submit',e=>{e.preventDefault();void search()});
get('reportMore').addEventListener('click',()=>void search(true));
get('reportPanel').addEventListener('toggle',()=>{if(get('reportPanel').open&&!criteria)void search()});
})();
