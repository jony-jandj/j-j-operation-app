/* iCalendar expansion uses bundled ICAL.js (MPL-2.0). */
(()=>{const date=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
window.JJCalendar={parse(text,projects,now=new Date()){
 const root=new ICAL.Component(ICAL.parse(text));if(root.name!=='vcalendar')throw Error('Choose an iCalendar file.');
 root.getAllSubcomponents('vtimezone').forEach(c=>{const tz=new ICAL.Timezone(c);ICAL.TimezoneService.register(tz.tzid,tz)});
 const min=new Date(now.getFullYear()-1,0,1),max=new Date(now.getFullYear()+3,0,1),out=new Map();
 for(const component of root.getAllSubcomponents('vevent')){
  if(component.hasProperty('recurrence-id'))continue;
  const event=new ICAL.Event(component,{exceptions:root.getAllSubcomponents('vevent').filter(c=>c.hasProperty('recurrence-id')&&c.getFirstPropertyValue('uid')===component.getFirstPropertyValue('uid'))});if(!event.startDate)continue;
  const emit=occ=>{const item=occ.item||event;if(String(item.component.getFirstPropertyValue('status')).toUpperCase()==='CANCELLED')return;
   const start=occ.startDate.toJSDate(),end=occ.endDate?.toJSDate()||start;if(end<min||start>=max)return;
   const description=String(item.component.getFirstPropertyValue('description')||''),location=String(item.component.getFirstPropertyValue('location')||''),attendees=item.component.getAllProperties('attendee').map(p=>p.getParameter('cn')||String(p.getFirstValue()||'').replace(/^mailto:/i,'')).join(', ');
   const title=String(item.summary||'Scheduled work'),matchText=[title,description,location].join(' ').toLowerCase(),job=projects.find(p=>(p.jobNo&&matchText.includes(String(p.jobNo).toLowerCase()))||(p.name&&matchText.includes(p.name.toLowerCase())));
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
