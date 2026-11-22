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
