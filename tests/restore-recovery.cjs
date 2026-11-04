// Run with NODE_PATH pointing to a directory containing fake-indexeddb.
const {indexedDB}=require('fake-indexeddb'),vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const elements={backupStatus:{},message:{classList:{add(){},remove(){}}}};
const context=vm.createContext({DB:'insurance_mobile_v23',db:null,indexedDB,records:[],document:{getElementById:id=>elements[id]},$:id=>elements[id],msg:t=>elements.message.textContent=t,confirm:()=>true,GoogleRenewal:{validateMap(){},async pause(){},async exportMap(){context.db.close();return {}},resume(){}},async refresh(){}});
vm.runInContext(html.slice(html.indexOf('let databaseOpening='),html.indexOf('function transaction(')),context);
vm.runInContext(html.slice(html.indexOf('async function restore('),html.indexOf('let pendingPDF=')),context);
const rows=[{id:'fixture',customer:'Test',pdfData:'data:application/pdf;base64,JVBERi0xLjQK'}];
(async()=>{
 await vm.runInContext('ensureDatabase()',context);context.db.close();
 const event={target:{value:'file',files:[{async text(){return JSON.stringify({format:'insurance-mobile-v1',records:rows})}}]}};context.event=event;
 await vm.runInContext('restore(event)',context);
 assert.match(elements.backupStatus.textContent,/已還原 1 筆/);
 const all=await new Promise((resolve,reject)=>{const q=context.db.transaction('policies').objectStore('policies').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
 assert.deepEqual(all,rows);assert.equal(event.target.value,'');
 // A bad value during the batch must roll back clear() and every earlier put().
 context.GoogleRenewal.exportMap=async()=>({});context.bad={target:{value:'file',files:[{text:async()=>JSON.stringify({format:'insurance-mobile-v1',records:[{id:'bad',customer:'Bad'}]})}]}};
 const original=context.db.transaction.bind(context.db);context.db.transaction=(...args)=>{const tx=original(...args);if(Array.isArray(args[0])){const os=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=os(name);if(name==='settings')store.put=()=>{throw Error('simulated write failure')};return store}}return tx};
 await vm.runInContext('restore(bad)',context);
 assert.match(elements.backupStatus.textContent,/還原失敗/);
 const remaining=await new Promise(resolve=>{const q=original('policies').objectStore('policies').getAll();q.onsuccess=()=>resolve(q.result)});
 assert.deepEqual(remaining,rows);context.db.close();console.log('PASS: closed-connection restore preserves PDF; atomic failure preserves original records');
})().catch(e=>{console.error(e);process.exitCode=1});
