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
