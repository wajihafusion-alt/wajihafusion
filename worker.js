const SUPABASE_URL = "https://bvijessvvuaeehjqfkce.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_8eOJ4p2Llr1yOtRa5bPrMQ_FVf0drf-";
const json = (data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
async function isAdmin(request){
 const auth=request.headers.get("Authorization")||"";if(!auth.startsWith("Bearer "))return false;
 const headers={"apikey":SUPABASE_ANON_KEY,"Authorization":auth,"content-type":"application/json"};
 const user=await fetch(SUPABASE_URL+"/auth/v1/user",{headers});if(!user.ok)return false;
 const rpc=await fetch(SUPABASE_URL+"/rest/v1/rpc/is_admin",{method:"POST",headers,body:"{}"});if(!rpc.ok)return false;
 return (await rpc.json())===true;
}
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(url.pathname==="/api/webhooks/dropshipping/dropbazar"&&request.method==="POST"){
  try{
   if(!env.DROPBAZAR_WEBHOOK_SECRET||!env.SUPABASE_SERVICE_ROLE_KEY)return json({error:"Webhook is not configured."},503);
   const rawBody=await request.text();
   const header=request.headers.get("X-Webhook-Signature")||"";
   const parts=Object.fromEntries(header.split(",").map(part=>{const i=part.indexOf("=");return i<0?["",""]:[part.slice(0,i).trim(),part.slice(i+1).trim()]}));
   const timestamp=parts.t||"",given=parts.v1||"";
   if(!/^\d{1,20}$/.test(timestamp)||! /^[a-f0-9]{64}$/i.test(given))return json({error:"Invalid webhook signature."},401);
   const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.DROPBAZAR_WEBHOOK_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
   const digest=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(timestamp+"."+rawBody));
   const expected=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
   let mismatch=expected.length^given.length;
   for(let i=0;i<Math.min(expected.length,given.length);i++)mismatch|=expected.charCodeAt(i)^given.toLowerCase().charCodeAt(i);
   if(mismatch!==0)return json({error:"Invalid webhook signature."},401);
   const payload=JSON.parse(rawBody),event=String(payload.event||""),data=payload.data||{};
   if(event!=="order.status_changed")return json({received:true,ignored:true});
   const orderNumber=String(data.external_order_id||"").trim();
   if(!/^WF-[0-9]{10,16}$/.test(orderNumber))return json({error:"Missing or invalid external_order_id."},400);
   const process=String(data.order_process||"").toLowerCase(),status=String(data.status||"").toLowerCase();
   const map={
    accepted:"Processing",collected:"Processing",booked:"Processing",packed:"Processing",
    courier_pending:"Shipped",delivered:"Delivered",courier_delivered:"Delivered",
    partial_delivered:"Partially Delivered",courier_returned:"Returned",
    cancelled:"Cancelled",courier_cancelled:"Cancelled",refunded:"Refunded",
    pending:"Pending",processing:"Processing",shipped:"Shipped",returned:"Returned"
   };
   const nextStatus=map[process]||map[status];
   if(!nextStatus)return json({received:true,ignored:true,reason:"Unmapped status"});
   const response=await fetch(SUPABASE_URL+"/rest/v1/customer_orders?order_number=eq."+encodeURIComponent(orderNumber),{
    method:"PATCH",
    headers:{"apikey":env.SUPABASE_SERVICE_ROLE_KEY,"Authorization":"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"content-type":"application/json","Prefer":"return=representation"},
    body:JSON.stringify({status:nextStatus})
   });
   if(!response.ok)throw new Error("Could not update the store order.");
   const updated=await response.json();
   if(!updated.length)return json({error:"Matching Wajiha Fusion order not found."},404);
   return json({received:true,order_number:orderNumber,status:nextStatus});
  }catch(e){return json({error:e.message||"Webhook processing failed."},400)}
 }
 if(url.pathname==="/api/order-status"&&request.method==="POST"){
  try{
   if(!env.SUPABASE_SERVICE_ROLE_KEY)return json({error:"Order lookup is temporarily unavailable."},500);
   const input=await request.json().catch(()=>({})),orderNumber=String(input.order_number||"").trim(),phone=String(input.phone||"").trim(),digits=phone.replace(/[^0-9]/g,"");
   if(!/^WF-[0-9]{10,16}$/.test(orderNumber)||digits.length<8||digits.length>15)return json({error:"সঠিক Order ID ও মোবাইল নম্বর দিন।"},400);
   const q=SUPABASE_URL+"/rest/v1/customer_orders?order_number=eq."+encodeURIComponent(orderNumber)+"&customer_phone=eq."+encodeURIComponent(phone)+"&select=order_number,status,total,created_at&limit=1";
   const r=await fetch(q,{headers:{"apikey":env.SUPABASE_SERVICE_ROLE_KEY,"Authorization":"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY}});
   if(!r.ok)throw new Error("Order lookup failed.");
   const rows=await r.json();if(!rows.length)return json({error:"এই Order ID ও মোবাইল নম্বর দিয়ে অর্ডার পাওয়া যায়নি।"},404);
   const o=rows[0];return json({order_number:o.order_number,status:o.status||"New",total:o.total,created_at:o.created_at});
  }catch(e){return json({error:e.message||"Order lookup failed."},500)}
 }
 if(url.pathname.startsWith("/api/")){
  if(!await isAdmin(request))return json({error:"Admin access required."},401);
  return json({error:"Not found."},404);
 }
 return env.ASSETS.fetch(request);
}};
