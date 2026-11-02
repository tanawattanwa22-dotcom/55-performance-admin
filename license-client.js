const cfg=window.LICENSE_CONFIG;
const $=id=>document.getElementById(id);
const storageKey='55p_admin_session';
function getSession(){try{return JSON.parse(sessionStorage.getItem(storageKey)||'null')}catch{return null}}
async function request(url,body,token){
 let response;
 try{response=await fetch(url,{method:'POST',mode:'cors',cache:'no-store',headers:{'Content-Type':'application/json','apikey':cfg.anonKey,...(token?{'Authorization':'Bearer '+token}:{})},body:JSON.stringify(body)})}
 catch(e){throw Error('เชื่อมต่อ API ไม่ได้: '+e.message+' | '+new URL(url).hostname)}
 const j=await response.json().catch(()=>({}));
 if(!response.ok)throw Error((j.msg||j.error_description||j.error||'HTTP '+response.status)+' (HTTP '+response.status+')');
 return j;
}
async function login(email,password){
 const j=await request(cfg.url+'/auth/v1/token?grant_type=password',{email:email.trim(),password});
 if(!j.access_token)throw Error('ไม่พบ access token');
 sessionStorage.setItem(storageKey,JSON.stringify({access_token:j.access_token,expires_at:Date.now()+(j.expires_in||3600)*1000}));
}
async function api(action,payload={}){
 const s=getSession();if(!s)throw Error('กรุณาเข้าสู่ระบบ');
 if(Date.now()>=s.expires_at){sessionStorage.removeItem(storageKey);throw Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่')}
 return request(cfg.url+'/functions/v1/'+cfg.functionName,{action,...payload},s.access_token);
}
async function logout(){sessionStorage.removeItem(storageKey);location.reload()}
