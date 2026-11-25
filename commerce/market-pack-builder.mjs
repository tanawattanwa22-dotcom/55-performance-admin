// Admin-only UI convenience; the server independently checks every upload.
// Produces a standard uncompressed ZIP containing one BIN/XDF pair and SHA manifest.
const enc=new TextEncoder();
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function zip(entries){
 const chunks=[],central=[];let offset=0,cdSize=0;
 for(const [name,bytes] of entries){
  const n=enc.encode(name),h=new Uint8Array(30),c=new Uint8Array(46),a=new DataView(h.buffer),v=new DataView(c.buffer),crc=crc32(bytes);
  a.setUint32(0,0x04034b50,true);a.setUint16(4,20,true);a.setUint16(6,2048,true);a.setUint32(14,crc,true);a.setUint32(18,bytes.length,true);a.setUint32(22,bytes.length,true);a.setUint16(26,n.length,true);
  v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,2048,true);v.setUint32(16,crc,true);v.setUint32(20,bytes.length,true);v.setUint32(24,bytes.length,true);v.setUint16(28,n.length,true);v.setUint32(42,offset,true);
  chunks.push(h,n,bytes);central.push(c,n);offset+=h.length+n.length+bytes.length;cdSize+=c.length+n.length;
 }
 const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,cdSize,true);v.setUint32(16,offset,true);
 return new Blob([...chunks,...central,end],{type:'application/zip'});
}
export async function buildMarketPack(product,binFile,xdfFile){
 if(!binFile||!xdfFile||!/[.]bin$/i.test(binFile.name)||!/[.]xdf$/i.test(xdfFile.name))throw Error('เลือก BIN และ XDF อย่างละหนึ่งไฟล์');
 const part=String(product.part_code||''),year=String(product.model_year||''),model=String(product.title||'').trim();
 if(!/^[A-Z0-9]{3,4}-[A-Z0-9]{3}$/.test(part)||!/^\d{4}(?:[–-]\d{4})?$/.test(year)||!model||model.length>100)throw Error('Part Code / ปี / ชื่อรุ่นไม่ตรงรูปแบบ');
 if(binFile.size<32768||binFile.size>2097152||xdfFile.size<1||xdfFile.size>4194304)throw Error('ขนาด BIN หรือ XDF ไม่รองรับ');
 const bin=new Uint8Array(await binFile.arrayBuffer()),xdf=new Uint8Array(await xdfFile.arrayBuffer()),xml=new TextDecoder('utf-8',{fatal:true}).decode(xdf);
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('XDF XML ไม่รองรับ');
 const doc=new DOMParser().parseFromString(xml,'application/xml');
 if(doc.querySelector('parsererror')||doc.documentElement?.localName!=='XDFFORMAT')throw Error('XDF ไม่ใช่ XML ที่รองรับ');
 const count=doc.getElementsByTagName('XDFTABLE').length;
 if(count<1||count>2000)throw Error('จำนวนตาราง XDF ไม่รองรับ');
 const id=part+'_'+year.replace('–','-'),bp='PAIRS/'+id+'/firmware.bin',xp='PAIRS/'+id+'/definition.xdf';
 const manifest={schema:1,pairs:[{id,part_code:part,year,model,bin_path:bp,xdf_path:xp,bin_size:bin.length,bin_sha256:await sha(bin),xdf_sha256:await sha(xdf),xdf_tables:count}]};
 return zip([['manifest.json',enc.encode(JSON.stringify(manifest))],[bp,bin],[xp,xdf]]);
}
