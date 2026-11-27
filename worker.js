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
 if(!env.SENDMYSMS_API_KEY||!String(env.SENDMYSMS_API_KEY).trim())return json({error:"SendMySMS API key is not configured in Cloudflare Secret SENDMYSMS_API_KEY."},503);
 if(!env.SENDMYSMS_USERNAME||!String(env.SENDMYSMS_USERNAME).trim())return json({error:"SendMySMS username is not configured in Cloudflare Secret SENDMYSMS_USERNAME."},503);
 if(!env.SEND_SMS_HOOK_SECRET||!String(env.SEND_SMS_HOOK_SECRET).trim())return json({error:"SMS hook secret is not configured."},503);
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
 if(!phoneValid||!otpValid)return json({error:"Invalid phone number or OTP format."},400);
 const message="Your Wajiha Fusion verification code is "+otp+". Valid for 5 minutes. Do not share this code.";
 try{
  const form=new URLSearchParams({user:String(env.SENDMYSMS_USERNAME).trim(),key:String(env.SENDMYSMS_API_KEY).trim(),to:"0"+bdPhone.slice(3),msg:message});
  const response=await fetch("https://sendmysms.net/api.php",{
   method:"POST",
   headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},
   body:form.toString()
  });
  const responseText=await response.text();
  let result;try{result=JSON.parse(responseText)}catch{result=null}
  if(!response.ok||result?.status!=="OK"){
   console.log("SendMySMS request failed:",response.status,String(result?.response||responseText).slice(0,300));
   return json({error:"SendMySMS could not accept the SMS request."},502);
  }
  console.log("SendMySMS API accepted request.");
  return json({},200);
 }catch(e){
  console.log("Could not connect to SendMySMS.");
  return json({error:"Could not connect to SendMySMS provider."},502);
 }
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

 const assetResponse=await env.ASSETS.fetch(request);
 if(request.method!=="GET"||!["/","/index.html"].includes(url.pathname)||!assetResponse.ok)return assetResponse;
 let page=await assetResponse.text();
 if(!page.includes('id="specialOffers"')){
  const offers=`
  <section id="specialOffers" class="special-offers" aria-label="Special offers">
   <div class="special-offers-heading"><p class="eyebrow">EXCLUSIVE REWARDS</p><h2>Special Offers</h2><p>More reasons to enjoy shopping with Wajiha Fusion</p></div>
   <div class="special-offer-grid">
    <a class="special-offer-card referral-offer-card" href="#account" id="homeReferralOffer"><span class="offer-card-kicker">SHARE THE LOVE</span><span class="offer-art referral-art" aria-hidden="true"><i>✦</i><b>🎁</b><em>৳</em></span><span class="offer-card-title">REFER &amp; EARN</span><strong class="offer-card-amount">৳৫০ + ৳৫০</strong><span class="offer-card-copy">বন্ধুর প্রথম অর্ডার Delivered হলে দুজনেই পাবেন ৳৫০ করে বোনাস।</span><span class="offer-card-cta">GET YOUR REFERRAL CODE <b>→</b></span></a>
    <a class="special-offer-card mystery-offer-card" href="#shop" id="homeMysteryOffer"><span class="offer-card-kicker">A LITTLE MAGIC FOR YOU</span><span class="offer-art mystery-art" aria-hidden="true"><i>✦</i><b>🎁</b><em>✧</em></span><span class="offer-card-title">MYSTERY BOX</span><strong class="offer-card-amount">OPEN YOUR SURPRISE</strong><span class="offer-card-copy">লগইন করে checkout-এ ৳৫০ বা তার বেশি পণ্যের অর্ডারে খুলুন Mystery Box। জিততে পারেন ৳০–৳৭০ Discount!</span><span class="offer-card-cta">EXPLORE COLLECTION <b>→</b></span></a>
   </div>
  </section>`;
  const styles=`<style id="wf-special-offers-style">
  .special-offers{padding:76px 6vw 82px;background:var(--black);color:var(--cream)}.special-offers-heading{text-align:center;margin:0 auto 30px;max-width:560px}.special-offers-heading .eyebrow{margin:0 0 10px}.special-offers-heading h2{font:600 clamp(28px,3.5vw,42px)/1.15 'Playfair Display',serif;margin:0 0 9px;color:var(--cream)}.special-offers-heading>p:last-child{margin:0;color:var(--muted);font-size:13px}
  .special-offer-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;max-width:1120px;margin:auto}.special-offer-card{position:relative;isolation:isolate;overflow:hidden;min-height:310px;border-radius:20px;padding:28px 30px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;text-decoration:none;box-shadow:0 16px 38px rgba(0,0,0,.16);transition:transform .25s,box-shadow .25s}.special-offer-card:hover{transform:translateY(-4px);box-shadow:0 22px 44px rgba(0,0,0,.24)}
  .referral-offer-card{background:linear-gradient(120deg,#f2e9fb,#e8d9f7 58%,#d7c0ed);color:#39214e;border:1px solid #e1d0f2}.mystery-offer-card{background:radial-gradient(circle at 78% 18%,rgba(199,158,83,.22),transparent 32%),linear-gradient(125deg,#241532,#3d2454 58%,#21132e);color:#fff;border:1px solid rgba(226,196,135,.48)}
  .offer-card-kicker{font-size:9px;font-weight:800;letter-spacing:.2em;opacity:.78;position:relative;z-index:1}.offer-card-title{font:700 14px 'Manrope',sans-serif;letter-spacing:.16em;margin-top:18px;position:relative;z-index:1}.offer-card-amount{font:700 clamp(22px,2.6vw,31px)/1.2 'Playfair Display',serif;margin:5px 0 9px;position:relative;z-index:1;color:inherit}.mystery-offer-card .offer-card-amount{font-size:clamp(17px,2vw,25px);color:#f3d99f}.offer-card-copy{font-family:'Hind Siliguri','DM Sans',sans-serif;font-size:13px;line-height:1.75;max-width:390px;position:relative;z-index:1;opacity:.88}.offer-card-cta{font-size:9px;font-weight:800;letter-spacing:.13em;margin-top:19px;display:flex;align-items:center;gap:10px;position:relative;z-index:1}.offer-card-cta b{font-size:17px;transition:transform .2s}.special-offer-card:hover .offer-card-cta b{transform:translateX(4px)}
  .offer-art{position:absolute;right:28px;top:50%;transform:translateY(-50%);width:148px;height:148px;border-radius:50%;display:grid;place-items:center;z-index:0}.offer-art b{font-size:76px;filter:drop-shadow(0 12px 12px rgba(0,0,0,.18));transform:rotate(-7deg)}.offer-art i,.offer-art em{position:absolute;font-style:normal;font-size:24px;color:#9b70bd}.offer-art i{top:9px;right:17px}.offer-art em{bottom:14px;left:8px;font-size:30px}.referral-art{background:radial-gradient(circle,#fff9ff,rgba(255,255,255,.22) 68%,transparent 70%)}.mystery-art{background:radial-gradient(circle,rgba(229,193,121,.22),rgba(229,193,121,.04) 66%,transparent 68%)}.mystery-art i,.mystery-art em{color:#e8c77f}
  @media(max-width:700px){.special-offers{padding:48px 16px 54px}.special-offers-heading{margin-bottom:22px}.special-offer-grid{grid-template-columns:1fr;gap:14px}.special-offer-card{min-height:270px;padding:23px 22px;border-radius:16px}.offer-art{right:13px;width:116px;height:116px;opacity:.9}.offer-art b{font-size:62px}.offer-card-copy{max-width:75%;font-size:12px}.offer-card-title{margin-top:14px}.offer-card-cta{margin-top:15px}}@media(max-width:390px){.special-offer-card{min-height:286px}.offer-art{top:24px;right:8px;transform:none;width:94px;height:94px}.offer-art b{font-size:52px}.offer-card-copy{max-width:100%;padding-right:35px}}
  </style>`;
  page=page.replace('<section class="editorial-banners">',offers+'<section class="editorial-banners">').replace('</head>',styles+'</head>');
  page=page.replace('</body>','<script>document.getElementById("homeReferralOffer")?.addEventListener("click",function(e){e.preventDefault();document.getElementById("accountToggle")?.click()});</script></body>');
 }
 return new Response(page,{status:assetResponse.status,statusText:assetResponse.statusText,headers:new Headers(assetResponse.headers)});
}};