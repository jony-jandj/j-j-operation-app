// Live release is pinned to the existing production project.
(()=>{const allowed='mrkvspqwqsmlnhrfllpx.supabase.co';
function check(value){const url=new URL(value,location.href);if(url.hostname.endsWith('.supabase.co')&&url.hostname!==allowed)throw Error('App blocked a connection outside its configured live database.');}
const fetchOriginal=window.fetch.bind(window);window.fetch=(input,init)=>{check(input instanceof Request?input.url:input);return fetchOriginal(input,init)};
const open=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url,...args){check(url);return open.call(this,method,url,...args)};
const WS=window.WebSocket;window.WebSocket=new Proxy(WS,{construct(target,args){check(args[0]);return Reflect.construct(target,args)}});
window.JJ_LIVE_RELEASE=true;
})();
