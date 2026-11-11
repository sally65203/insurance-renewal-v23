const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');

const html=readFileSync(__dirname+'/../index.html','utf8');
const source=html.slice(html.indexOf('function calendarDay('),html.indexOf('\ninit();'));
const nodes={calendarPanel:{addEventListener(){}}};
const calendar=runInNewContext(source+'\n({renewalToday,renewalEvents,renewalCalendarFile})',{
 $:id=>nodes[id],TextEncoder
});
const policy={id:'policy-1',end:'2027-03-31',plate:'ＡＢＣ-1234',type:'強制險',status:'待續保',
 customer:'Private name',number:'PRIVATE-POLICY'};

test('web calendar clamps month ends, keeps distinct coverages and excludes invalid or closed policies',()=>{
 const events=calendar.renewalEvents([
  policy,{...policy,id:'policy-2',type:'任意險'},{...policy,end:'2027-02-29'},
  {...policy,status:'已續保'},{...policy,status:'不續保'},{...policy,end:'2027-04-03',plate:''}
 ]);
 assert.equal(events.length,3);
 assert.equal(events[0].date,'2027-02-28');
 assert.equal(events[1].date,'2027-02-28');
 assert.deepEqual(new Set(Array.from(events.slice(0,2),event=>event.title)),
  new Set(['續保提醒｜ABC-1234｜強制險','續保提醒｜ABC-1234｜任意險']));
 assert.equal(events[2].date,'2027-03-03');
 assert.equal(events[2].title,'續保提醒｜未填車牌｜強制險');
 assert.equal(calendar.renewalToday(new Date('2027-02-28T16:00:00Z')),'2027-03-01');
});

test('Apple calendar export includes a 09:00 Taipei alarm and folds UTF-8 without exporting private fields',()=>{
 const type='其他產險'.repeat(20)+'\r\n險種,備註';
 const events=calendar.renewalEvents([{...policy,type}]);
 const file=calendar.renewalCalendarFile(events,new Date('2027-02-10T09:00:00Z'));
 assert.match(file,/DTSTART:20270228T010000Z\r\nDTEND:20270228T011500Z/);
 assert.match(file,/BEGIN:VALARM\r\nTRIGGER:PT0S\r\nACTION:DISPLAY/);
 assert.ok(file.split('\r\n').every(line=>Buffer.byteLength(line)<=75));
 assert.ok(file.replaceAll('\r\n ','').includes('SUMMARY:續保提醒｜ABC-1234｜'+type.replace('\r\n','\\n').replace(',','\\,')));
 assert.doesNotMatch(file,/Private name|PRIVATE-POLICY/);
});
