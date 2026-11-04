const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const database=html.slice(html.indexOf('let databaseOpening='),html.indexOf('function transaction('));
const pdf=html.slice(html.indexOf('function pdfBlob('),html.indexOf('function parseCSV('));
test('closed database is reopened once for concurrent callers; other errors are preserved',async()=>{
 let opens=0,closed=false;
 const connection=()=>({transaction(){if(closed)throw Object.assign(Error('closing'),{name:'InvalidStateError'})},close(){closed=true}});
 const old=connection();closed=true;
 const c=vm.createContext({db:old,DB:'test',indexedDB:{open(){opens++;const r={};queueMicrotask(()=>{closed=false;r.result=connection();r.onsuccess()});return r}}});
 vm.runInContext(database,c);
 const result=await Promise.all([vm.runInContext('ensureDatabase()',c),vm.runInContext('ensureDatabase()',c)]);
 assert.equal(opens,1);assert.equal(result[0],result[1]);
 c.db.transaction=()=>{throw Object.assign(Error('quota'),{name:'QuotaExceededError'})};
 await assert.rejects(vm.runInContext('ensureDatabase()',c),/quota/);assert.equal(opens,1);
});
test('PDF preview uses Blob URL synchronously and reports invalid attachments or blocked windows',async()=>{
 let message='',opened='',revoked=[],timer;
 const c=vm.createContext({records:[{id:'a',pdfData:'data:application/pdf;base64,'+Buffer.from('%PDF-1.4\nfixture').toString('base64')}],Blob,Uint8Array,atob,URL:{createObjectURL(blob){assert.equal(blob.type,'application/pdf');return 'blob:test'},revokeObjectURL:url=>revoked.push(url)},window:{open:url=>{opened=url;return {}}},setTimeout:fn=>{timer=fn},msg:t=>message=t});
 vm.runInContext(pdf,c);vm.runInContext("viewPDF('a')",c);assert.equal(opened,'blob:test');assert.deepEqual(revoked,[]);timer();assert.deepEqual(revoked,['blob:test']);
 c.window.open=()=>null;vm.runInContext("viewPDF('a')",c);assert.match(message,/阻擋/);
 c.records[0].pdfData='data:application/pdf;base64,'+Buffer.from('bad').toString('base64');vm.runInContext("viewPDF('a')",c);assert.match(message,/不是 PDF/);
});
