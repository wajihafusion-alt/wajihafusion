const SUPABASE_URL = "https://bvijessvvuaeehjqfkce.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_8eOJ4p2Llr1yOtRa5bPrMQ_FVf0drf-";
const DROPBAZAR_BASE = "https://www.dropbazarbd.com/api/v1";
const json = (data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
async function isAdmin(request){
 const auth=request.headers.get("Authorization")||"";if(!auth.startsWith("Bearer "))return false;
 const headers={"apikey":SUPABASE_ANON_KEY,"Authorization":auth,"content-type":"application/json"};
 const user=await fetch(SUPABASE_URL+"/auth/v1/user",{headers});if(!user.ok)return false;
 const rpc=await fetch(SUPABASE_URL+"/rest/v1/rpc/is_admin",{method:"POST",headers,body:"{}"});if(!rpc.ok)return false;
 return (await rpc.json())===true;
}
async function verifyWebhook(request,env,rawBody){
 if(!env.DROPBAZAR_WEBHOOK_SECRET)return false;
 const header=request.headers.get("X-Webhook-Signature")||"";
 const parts=Object.fromEntries(header.split(",").map(part=>{const i=part.indexOf("=");return i<0?["",""]:[part.slice(0,i).trim(),part.slice(i+1).trim()]}));
 const timestamp=parts.t||"",given=(parts.v1||"").toLowerCase();
 if(!/^\d{1,20}$/.test(timestamp)||!/^[a-f0-9]{64}$/.test(given))return false;
 const ts=Number(timestamp);if(!Number.isSafeInteger(ts)||Math.abs(Date.now()/1000-ts)>600)return false;
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.DROPBAZAR_WEBHOOK_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const digest=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(timestamp+"."+rawBody));
 const expected=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
 let mismatch=expected.length^given.length;for(let i=0;i<Math.min(expected.length,given.length);i++)mismatch|=expected.charCodeAt(i)^given.charCodeAt(i);
 return mismatch===0;
}
async function supabase(path,options={},env){
 return fetch(SUPABASE_URL+"/rest/v1/"+path,{...options,headers:{"apikey":env.SUPABASE_SERVICE_ROLE_KEY,"Authorization":"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"content-type":"application/json",...(options.headers||{})}});
}
async function handleDropbazar(request,env,url){
 if(!env.DROPBAZAR_API_TOKEN)return json({error:"DropBazarBD API Token is not configured in Cloudflare Secret DROPBAZAR_API_TOKEN."},503);
 if(request.method!=="GET")return json({error:"Method not allowed."},405);
 let endpoint="",allowedQuery=[];
 const p=url.pathname;
 if(p==="/api/dropbazar/catalog/categories")endpoint="/categories";
 else if(p==="/api/dropbazar/catalog/products"){endpoint="/products";allowedQuery=["category_id","search","updated_since","page","per_page"]}
 else if(p==="/api/dropbazar/catalog/posts"){endpoint="/posts";allowedQuery=["category_id","search","boost","updated_since","page","per_page"]}
 else if(/^\/api\/dropbazar\/catalog\/products\/\d+$/.test(p))endpoint="/products/"+p.split("/").pop();
 else if(/^\/api\/dropbazar\/catalog\/posts\/\d+$/.test(p))endpoint="/posts/"+p.split("/").pop();
 else if(p==="/api/dropbazar/wallet")endpoint="/wallet";
 else if(p==="/api/dropbazar/locations/districts")endpoint="/districts";
 else if(/^\/api\/dropbazar\/locations\/districts\/\d+\/thanas$/.test(p))endpoint="/districts/"+p.split("/")[5]+"/thanas";
 else return json({error:"Unknown DropBazarBD endpoint."},404);
 const qs=new URLSearchParams();for(const key of allowedQuery){const value=url.searchParams.get(key);if(value!==null&&value!=="")qs.set(key,value)}
 try{
  const upstream=await fetch(DROPBAZAR_BASE+endpoint+(qs.size?"?"+qs.toString():""),{headers:{"Authorization":"Bearer "+env.DROPBAZAR_API_TOKEN,"Accept":"application/json"}});
  const body=await upstream.text();let data;try{data=JSON.parse(body)}catch{data={message:"Supplier returned a non-JSON response."}}
  return json(data,upstream.status);
 }catch(e){return json({error:"Could not connect to DropBazarBD. Please try again."},502)}
}

async function verifySupabaseSmsHook(request,env,rawBody){
 if(!env.SEND_SMS_HOOK_SECRET)return false;
 const id=request.headers.get("webhook-id")||"",timestamp=request.headers.get("webhook-timestamp")||"",signature=request.headers.get("webhook-signature")||"";
 if(!id||!/^\d{1,20}$/.test(timestamp)||!signature)return false;
 const ts=Number(timestamp);if(!Number.isSafeInteger(ts)||Math.abs(Date.now()/1000-ts)>300)return false;
 const secrets=String(env.SEND_SMS_HOOK_SECRET).split("|").map(s=>s.trim()).filter(Boolean);
 const signed=id+"."+timestamp+"."+rawBody;
 for(const secret of secrets){
  try{
   const encoded=secret.replace(/^v1,whsec_/,"");
   const raw=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
   const key=await crypto.subtle.importKey("raw",raw,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
   const digest=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(signed));
   const expected=btoa(String.fromCharCode(...new Uint8Array(digest)));
   for(const item of signature.split(" ")){
    const parts=item.split(",");if(parts.length!==2||parts[0]!=="v1")continue;
    const given=parts[1];if(given.length!==expected.length)continue;
    let mismatch=0;for(let i=0;i<given.length;i++)mismatch|=given.charCodeAt(i)^expected.charCodeAt(i);
    if(mismatch===0)return true;
   }
  }catch(e){}
 }
 return false;
}
async function handleSupabaseSendSms(request,env){
 if(request.method!=="POST")return json({error:"Method not allowed."},405);
 const smsConfig = {
  SENDMYSMS_USER: Boolean(env.SENDMYSMS_USER && String(env.SENDMYSMS_USER).trim()),
  SENDMYSMS_API_KEY: Boolean(env.SENDMYSMS_API_KEY && String(env.SENDMYSMS_API_KEY).trim()),
  SEND_SMS_HOOK_SECRET: Boolean(env.SEND_SMS_HOOK_SECRET && String(env.SEND_SMS_HOOK_SECRET).trim())
 };
 console.log("SMS configuration presence:", smsConfig);
 const missingSmsConfig = Object.entries(smsConfig).filter(([, present]) => !present).map(([name]) => name);
 if(missingSmsConfig.length)return json({error:"SMS gateway is not configured.",missing:missingSmsConfig},503);
 const rawBody=await request.text();
 if(!await verifySupabaseSmsHook(request,env,rawBody))return json({error:"Invalid SMS hook signature."},401);
 let payload;try{payload=JSON.parse(rawBody)}catch{return json({error:"Invalid request body."},400)}
 const phoneInput=String(payload.user?.phone||"").trim();
 const otp=String(payload.sms?.otp||"").trim();
 const phoneDigits=phoneInput.replace(/\D/g,"");
 const bdPhone=phoneDigits.startsWith("880")?phoneDigits:(phoneDigits.startsWith("0")?"88"+phoneDigits:"880"+phoneDigits);
 const phoneValid=/^8801[3-9]\d{8}$/.test(bdPhone);
 const otpValid=/^\d{4,10}$/.test(otp);
 console.log("SMS payload validation:",{phonePresent:Boolean(phoneInput),phoneLength:phoneDigits.length,phoneValid,otpPresent:Boolean(otp),otpLength:otp.length,otpValid});
 if(!phoneValid||!otpValid)return json({error:"Invalid phone number or OTP format.",phoneValid,otpValid},400);
 const form=new URLSearchParams({user:env.SENDMYSMS_USER,key:env.SENDMYSMS_API_KEY,to:bdPhone,msg:"Your Wajiha Fusion verification code is "+otp+". Valid for 5 minutes. Do not share this code."});
 try{
  const response=await fetch("https://sendmysms.net/api.php",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:form.toString()});
  const text=await response.text();let result;try{result=JSON.parse(text)}catch{return json({error:"SMS provider returned an invalid response."},502)}
  if(!response.ok||String(result.status||"").toUpperCase()!=="OK")return json({error:"SMS could not be sent."},502);
  return json({},200);
 }catch(e){return json({error:"Could not connect to SMS provider."},502)}
}

export default {async fetch(request,env){
 const url=new URL(request.url);
 if(url.pathname==="/api/auth/send-sms")return handleSupabaseSendSms(request,env);

 if(url.pathname==="/api/webhooks/dropshipping/dropbazar"&&request.method==="POST"){
  try{
   if(!env.DROPBAZAR_WEBHOOK_SECRET||!env.SUPABASE_SERVICE_ROLE_KEY)return json({error:"Webhook is not configured."},503);
   const rawBody=await request.text();
   if(!await verifyWebhook(request,env,rawBody))return json({error:"Invalid webhook signature."},401);
   const payload=JSON.parse(rawBody),event=String(payload.event||""),data=payload.data||{},deliveryId=String(payload.delivery_id||"");
   if(!["order.placed","order.status_changed","order.payment_status_changed"].includes(event))return json({received:true,ignored:true});
   if(!deliveryId)return json({error:"Missing delivery_id."},400);
   const seen=await supabase("dropbazar_webhook_deliveries?delivery_id=eq."+encodeURIComponent(deliveryId)+"&select=delivery_id",{},env);
   if(!seen.ok)throw new Error("Could not check webhook delivery.");
   if((await seen.json()).length)return json({received:true,duplicate:true});
   const orderNumber=String(data.external_order_id||"").trim();
   if(!/^WF-[A-Za-z0-9-]{6,40}$/.test(orderNumber))return json({error:"Missing or invalid external_order_id."},400);
   const process=String(data.order_process||"").toLowerCase(),status=String(data.status||"").toLowerCase();
   const map={accepted:"Processing",collected:"Processing",booked:"Processing",packed:"Processing",courier_pending:"Shipped",delivered:"Delivered",courier_delivered:"Delivered",partial_delivered:"Partially Delivered",courier_returned:"Returned",cancelled:"Cancelled",courier_cancelled:"Cancelled",refunded:"Refunded",pending:"Pending",processing:"Processing",shipped:"Shipped",returned:"Returned"};
   const patch={supplier_order_id:data.id??null,supplier_order_number:data.order_number??null,supplier_status:data.status??null,supplier_order_process:data.order_process??null,supplier_payment_status:data.payment_status??null,supplier_courier:data.courier??null,supplier_last_delivery_id:deliveryId};
   if(event==="order.status_changed"){const next=map[process]||map[status];if(next)patch.status=next}
   const q="customer_orders?order_number=eq."+encodeURIComponent(orderNumber);
   const response=await supabase(q,{method:"PATCH",headers:{"Prefer":"return=representation"},body:JSON.stringify(patch)},env);
   if(!response.ok)throw new Error("Could not update the matching store order. Check the Supplier migration SQL.");
   const updated=await response.json();if(!updated.length)return json({error:"Matching Wajiha Fusion order not found."},404);
   const mark=await supabase("dropbazar_webhook_deliveries",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({delivery_id:deliveryId,event,occurred_at:payload.occurred_at||null})},env);
   if(mark.status===409)return json({received:true,duplicate:true});
   if(!mark.ok)throw new Error("Could not record webhook delivery.");
   return json({received:true,order_number:orderNumber,event});
  }catch(e){return json({error:e.message||"Webhook processing failed."},500)}
 }
 if(url.pathname==="/api/order-status"&&request.method==="POST"){
  try{
   if(!env.SUPABASE_SERVICE_ROLE_KEY)return json({error:"Order lookup is temporarily unavailable."},500);
   const input=await request.json().catch(()=>({})),orderNumber=String(input.order_number||"").trim(),phone=String(input.phone||"").trim(),digits=phone.replace(/[^0-9]/g,"");
   if(!/^WF-[0-9]{10,16}$/.test(orderNumber)||digits.length<10||digits.length>13)return json({error:"সঠিক Order ID ও মোবাইল নম্বর দিন।"},400);
   let local=digits;
   if(local.startsWith("00880"))local=local.slice(2);
   if(local.startsWith("8801")&&local.length===13)local="0"+local.slice(3);
   if(local.startsWith("01")&&local.length===11){
    const variants=[local,"+88"+local,"88"+local];
    let rows=[];
    for(const candidate of variants){
     const q=SUPABASE_URL+"/rest/v1/customer_orders?order_number=eq."+encodeURIComponent(orderNumber)+"&customer_phone=eq."+encodeURIComponent(candidate)+"&select=order_number,status,total,created_at&limit=1";
     const r=await fetch(q,{headers:{"apikey":env.SUPABASE_SERVICE_ROLE_KEY,"Authorization":"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY}});
     if(!r.ok)throw new Error("Order lookup failed.");
     rows=await r.json();
     if(rows.length)break;
    }
    if(!rows.length)return json({error:"এই Order ID ও মোবাইল নম্বর দিয়ে অর্ডার পাওয়া যায়নি।"},404);
    const o=rows[0];return json({order_number:o.order_number,status:o.status||"New",total:o.total,created_at:o.created_at});
   }
   return json({error:"সঠিক বাংলাদেশি মোবাইল নম্বর দিন।"},400);
  }catch(e){return json({error:e.message||"Order lookup failed."},500)}
 }
 if(url.pathname.startsWith("/api/")){
  if(!await isAdmin(request))return json({error:"Admin access required."},401);
  if(url.pathname.startsWith("/api/dropbazar/"))return handleDropbazar(request,env,url);
  return json({error:"Not found."},404);
 }
 return env.ASSETS.fetch(request);
}};