const SUPABASE_URL = "https://bvijessvvuaeehjqfkce.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_8eOJ4p2Llr1yOtRa5bPrMQ_FVf0drf-";
const SHADAMON_API = "https://api.shadamonshop.com/functions/v1/partner-api";
const json = (data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
async function isAdmin(request){
 const auth=request.headers.get("Authorization")||"";if(!auth.startsWith("Bearer "))return false;
 const headers={"apikey":SUPABASE_ANON_KEY,"Authorization":auth,"content-type":"application/json"};
 const user=await fetch(SUPABASE_URL+"/auth/v1/user",{headers});if(!user.ok)return false;
 const rpc=await fetch(SUPABASE_URL+"/rest/v1/rpc/is_admin",{method:"POST",headers,body:"{}"});if(!rpc.ok)return false;
 return (await rpc.json())===true;
}
async function supplierFetch(path,env){
 if(!env.SHADAMON_API_KEY)throw new Error("SHADAMON_API_KEY secret is missing in Cloudflare.");
 const r=await fetch(SHADAMON_API+path,{headers:{"X-Api-Key":env.SHADAMON_API_KEY,"Accept":"application/json"}});
 const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.message||body.error||"Shadamon API request failed ("+r.status+").");return body;
}
function listFrom(body){if(Array.isArray(body))return body;for(const x of [body?.products,body?.data?.products,body?.data,body?.results])if(Array.isArray(x))return x;return []}
function images(p){const a=Array.isArray(p.images)?p.images:(p.image_url?[p.image_url]:[]);return a.map(x=>typeof x==="string"?x:(x?.url||x?.src||x?.image_url||"")).filter(Boolean)}
async function upsert(rows,env){
 const r=await fetch(SUPABASE_URL+"/rest/v1/products?on_conflict=shadamon_product_id",{method:"POST",headers:{"apikey":env.SUPABASE_SERVICE_ROLE_KEY,"Authorization":"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(rows)});
 if(!r.ok)throw new Error("Supabase import failed: "+(await r.text()).slice(0,500));
}
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(url.pathname.startsWith("/api/")){
  if(!await isAdmin(request))return json({error:"Admin access required."},401);
  try{
   if(url.pathname==="/api/shadamon/products"&&request.method==="GET"){return json({products:listFrom(await supplierFetch("/products",env))})}
   if(url.pathname==="/api/shadamon/orders"&&request.method==="POST"){
    if(!env.SUPABASE_SERVICE_ROLE_KEY)return json({error:"SUPABASE_SERVICE_ROLE_KEY secret is missing in Cloudflare."},500);
    const input=await request.json().catch(()=>({})),orderId=String(input.order_id||"");if(!orderId)return json({error:"Order ID is required."},400);
    const read=await fetch(SUPABASE_URL+"/rest/v1/customer_orders?id=eq."+encodeURIComponent(orderId)+"&select=*",{headers:{"apikey":env.SUPABASE_SERVICE_ROLE_KEY,"Authorization":"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY}});
    if(!read.ok)throw new Error("Could not load customer order: "+(await read.text()).slice(0,300));
    const rows=await read.json(),order=rows[0];if(!order)return json({error:"Order not found."},404);
    const items=Array.isArray(order.items)?order.items:[],supplierItems=items.filter(x=>x.product_source==="shadamon"&&x.shadamon_product_id);
    if(!supplierItems.length)return json({error:"This order has no Shadamon products."},400);
    if(supplierItems.every(x=>x.supplier_order_ref))return json({success:true,already_sent:true,order_ref:supplierItems[0].supplier_order_ref});
    const delivery=String(order.delivery_area||"").includes("ভিতরে")?"dhaka_inside":String(order.delivery_area||"").includes("উপশহর")?"dhaka_suburb":"dhaka_outside";
    const partnerRef=String(order.order_number||("WF-"+order.id));
    const payload={partner_order_ref:partnerRef,customer_name:order.customer_name,customer_phone:order.customer_phone,customer_address:[order.address,order.thana,order.district].filter(Boolean).join(", "),delivery_area:delivery,notes:"Wajiha Fusion customer order "+partnerRef,items:supplierItems.map(x=>({product_id:String(x.shadamon_product_id),size:x.size||"",color:x.color||"",quantity:Number(x.quantity||1),unit_price:Number(x.price||0)}))};
    const response=await fetch(SHADAMON_API+"/orders",{method:"POST",headers:{"X-Api-Key":env.SHADAMON_API_KEY,"Accept":"application/json","Content-Type":"application/json"},body:JSON.stringify(payload)});
    const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.message||result.error||"Shadamon order request failed ("+response.status+").");
    const ref=String(result.order?.partner_order_ref||result.order?.ref||result.order?.id||result.partner_order_ref||partnerRef);
    const updated=items.map(x=>x.product_source==="shadamon"&&x.shadamon_product_id?{...x,supplier_order_ref:ref,supplier_order_status:"sent"}:x);
    const save=await fetch(SUPABASE_URL+"/rest/v1/customer_orders?id=eq."+encodeURIComponent(orderId),{method:"PATCH",headers:{"apikey":env.SUPABASE_SERVICE_ROLE_KEY,"Authorization":"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({items:updated})});
    if(!save.ok)throw new Error("Shadamon accepted the order, but saving its reference failed. Retry with the same order number. "+(await save.text()).slice(0,250));
    return json({success:true,order_ref:ref,supplier_response:result});
   }
   if(url.pathname==="/api/shadamon/import"&&request.method==="POST"){
    if(!env.SUPABASE_SERVICE_ROLE_KEY)return json({error:"SUPABASE_SERVICE_ROLE_KEY secret is missing in Cloudflare."},500);
    const input=await request.json().catch(()=>({})),ids=new Set((Array.isArray(input.product_ids)?input.product_ids:[]).map(String));if(!ids.size)return json({error:"Select at least one supplier product."},400);
    const all=listFrom(await supplierFetch("/products",env)),selected=all.filter(p=>ids.has(String(p.id??p.product_id??"")));if(!selected.length)return json({error:"Selected products not found. Reload the supplier catalog."},404);
    const rows=selected.map(p=>{const id=String(p.id??p.product_id),price=Number(p.price||0),pics=images(p),cat=p.category?.name_bn||p.category?.name||p.category_name||"";
     const colors=Array.isArray(p.colors)?p.colors.map(x=>typeof x==="string"?x:String(x.name||x.name_bn||"")).filter(Boolean):[];
     const sizes=Array.isArray(p.sizes)?p.sizes.map(x=>typeof x==="string"?x:String(x.name||x.name_bn||"")).filter(Boolean):[];
     return {name:String(p.name_bn||p.name||p.title||"Supplier product"),product_code:"SHD-"+id,category:String(cat),category_id:null,regular_price:price,special_price:null,description:String(p.description_bn||p.description||""),colors,sizes,product_images:pics,image_url:pics[0]||"",is_active:p.available!==false,product_source:"shadamon",shadamon_product_id:id,shadamon_min_price:price,shadamon_available:p.available!==false,updated_at:new Date().toISOString()};
    });
    await upsert(rows,env);return json({imported:rows.length,skipped:Math.max(0,ids.size-rows.length)});
   }
   return json({error:"Not found."},404);
  }catch(e){return json({error:e.message||"Server error."},502)}
 }
 return env.ASSETS.fetch(request);
}};
