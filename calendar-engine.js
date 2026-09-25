/* iCalendar expansion uses bundled ICAL.js (MPL-2.0). */
(()=>{const date=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
function matchJob(event,projects){
 const hay=' '+normalize([event.title,event.description,event.location].join(' '))+' ';
 for(const values of [p=>[p.jobNo],p=>[p.name,...(p.calendarNames||[])]]){
  const matches=projects.filter(p=>values(p).some(v=>normalize(v)&&hay.includes(' '+normalize(v)+' ')));
  if(matches.length===1)return matches[0];if(matches.length>1)return null;
 }return null;
}
function reconcile(events,projects,previous=[]){
 const valid=id=>projects.find(p=>String(p.id)===String(id));
 const prior=new Map(previous.map(e=>[e.id,e]));
 return events.map(e=>{const old=prior.get(e.id);const job=valid(e.projectId)||valid(old?.projectId)||matchJob(e,projects);return {...e,projectId:job?.id??null};});
}
window.JJCalendar={reconcile,parse(text,projects,now=new Date()){
 const root=new ICAL.Component(ICAL.parse(text));if(root.name!=='vcalendar')throw Error('Choose an iCalendar file.');
 root.getAllSubcomponents('vtimezone').forEach(c=>{const tz=new ICAL.Timezone(c);ICAL.TimezoneService.register(tz.tzid,tz)});
 const min=new Date(now.getFullYear()-1,0,1),max=new Date(now.getFullYear()+3,0,1),out=new Map();
 for(const component of root.getAllSubcomponents('vevent')){
  if(component.hasProperty('recurrence-id'))continue;
  const event=new ICAL.Event(component,{exceptions:root.getAllSubcomponents('vevent').filter(c=>c.hasProperty('recurrence-id')&&c.getFirstPropertyValue('uid')===component.getFirstPropertyValue('uid'))});if(!event.startDate)continue;
  const emit=occ=>{const item=occ.item||event;if(String(item.component.getFirstPropertyValue('status')).toUpperCase()==='CANCELLED')return;
   const start=occ.startDate.toJSDate(),end=occ.endDate?.toJSDate()||start;if(end<min||start>=max)return;
   const description=String(item.component.getFirstPropertyValue('description')||''),location=String(item.component.getFirstPropertyValue('location')||''),attendees=item.component.getAllProperties('attendee').map(p=>p.getParameter('cn')||String(p.getFirstValue()||'').replace(/^mailto:/i,'')).join(', ');
   const title=String(item.summary||'Scheduled work'),job=matchJob({title,description,location},projects);
   const first=occ.startDate.isDate?occ.startDate.toString().slice(0,10):date(start),last=occ.endDate?.isDate?date(new Date(end.getTime()-86400000)):date(new Date(Math.max(start.getTime(),end.getTime()-1)));
   for(let day=new Date(first+'T12:00:00'),count=0;date(day)<=last||count===0;day.setDate(day.getDate()+1),count++){
    if(count>366)throw Error('An event spans more than one year. Review that event before importing.');
    if(day<min||day>=max)continue;const id=String(event.uid||title)+'|'+occ.startDate.toString()+'|'+date(day);out.set(id,{id,title,description,location,attendees,date:date(day),time:occ.startDate.isDate?'All day':start.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}),projectId:job?.id||null});
   }
  };
  if(event.isRecurring()){const iterator=event.iterator();let occurrence,count=0;while((occurrence=iterator.next())){if(++count>20000)throw Error('Calendar recurrence is too large to expand.');if(occurrence.toJSDate()>=max)break;emit(event.getOccurrenceDetails(occurrence))}}
  else emit({item:event,startDate:event.startDate,endDate:event.endDate});
 }
 return {events:[...out.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title)),through:date(new Date(max.getTime()-86400000))};
}};
})();
