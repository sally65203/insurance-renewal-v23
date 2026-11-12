const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {runInNewContext} = require('node:vm');

const source = name => readFileSync(__dirname+'/../'+name, 'utf8');

test('push schedule payload omits attachments and private fields, and follows policy edits', () => {
 const client = source('js/renewal-push.js');
 const html = source('index.html');
 const helpers = html.slice(html.indexOf('function calendarDay('), html.indexOf('let renewalSelectedDay='));
 const build = client.slice(client.indexOf('function buildReminders('),client.indexOf(' function sync('));
 const schedule = runInNewContext(helpers + '\n' + build + '\nbuildReminders');
 const policy = {id:'test-id',plate:'TEST-123',type:'強制險',customer:'Private name',
  number:'PRIVATE-NUMBER',pdfData:'PRIVATE-PDF',status:'待續保',end:'2027-03-31'};
 const [reminder] = schedule([policy], '2027-02-28');
 assert.deepEqual(JSON.parse(JSON.stringify(reminder)),{
  id:'test-id',date:'2027-02-28',title:'續保提醒｜TEST-123｜強制險',expiry:'2027-03-31'
 });
 assert.equal(schedule([{...policy,end:'2027-04-30'}], '2027-02-28')[0].date,'2027-03-30');
 for (const status of ['已續保','不續保']) assert.equal(schedule([{...policy,status}], '2027-02-28').length,0);
 assert.equal(schedule([policy], '2027-03-01').length,0);
});

test('service worker shows a push and opens its specific policy inside the app scope', async () => {
 const handlers = {};
 let notification, opened;
 const scope = 'https://test.example/renewal/';
 const self = {
  registration:{scope,showNotification:async (title,options)=>{ notification={title,...options}; }},
  clients:{matchAll:async()=>[],openWindow:async url=>{opened=url;}},
  addEventListener:(event,handler)=>{handlers[event]=handler;}
 };
 runInNewContext(source('sw.js'),{self,URL,encodeURIComponent});
 let pending;
 const waitUntil = promise => { pending=promise; };
 const payload={id:'push-test-123',title:'續保提醒｜TEST-123｜強制險',body:'保單將於 2027/03/31 到期'};
 handlers.push({data:{json:()=>payload},waitUntil});
 await pending;
 assert.equal(notification.title,payload.title);
 assert.equal(notification.data.id,payload.id);
 handlers.notificationclick({notification:{data:notification.data,close(){}},waitUntil});
 await pending;
 assert.equal(opened,scope+'?pushPolicy=push-test-123');
});
