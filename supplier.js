(()=>{
 const $=s=>document.querySelector(s),cfg=window.WAJIHA_CONFIG||{},db=window.supabase?.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
 let page=1,categoryId="",categories=[],lastType="products",lastQuery="";
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const money=n=>"৳"+Number(n||0).toLocaleString("en-BD");
 const msg=s=>{$("#supplierMessage").textContent=s};
 async function api(path){
  const {data:{session}}=await db.auth.getSession();if(!session?.access_token)throw new Error("Admin login প্রয়োজন।");
  const r=await fetch(path,{headers:{Authorization:"Bearer "+session.access_token,Accept:"application/json"}});
  const body=await r.json().catch(()=>({}));
  if(!r.ok||body.success===false)throw new Error(body.message||body.error||("Supplier API error: "+r.status));
  return body.data??body;
 }
 function dataArray(x){if(Array.isArray(x))return x;if(Array.isArray(x?.data))return x.data;if(Array.isArray(x?.items))return x.items;return []}
 async function loadCategories(){
  try{const data=await api("/api/dropbazar/catalog/categories");categories=dataArray(data);const opts=['<option value="">All categories</option>'];const walk=items=>items.forEach(c=>{opts.push('<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>');if(Array.isArray(c.children))walk(c.children)});walk(categories);$("#supplierCategory").innerHTML=opts.join("")}
  catch(e){msg("Category list: "+e.message)}
 }
 function render(items){
  const type=lastType;
  $("#supplierResults").innerHTML=items.map(item=>{
   const title=item.title||"Untitled product",image=item.thumbnail||item.images?.[0]||"",price=item.price??item.products?.[0]?.price??0,suggested=item.suggested_price??item.products?.[0]?.suggested_price??0,stock=item.stock??item.products?.some(p=>p.stock);
   const count=Array.isArray(item.products)?item.products.length:0;
   return '<article class="supplier-item"><img src="'+esc(image||"https://placehold.co/500x400/171717/c8a45d?text=Supplier")+'" alt=""><div class="supplier-item-body"><h3>'+esc(title)+'</h3><p>'+(stock?'স্টক আছে':'স্টক নেই')+(count?' · '+count+'টি পণ্য':'')+'</p><div class="supplier-prices"><span>Cost: '+money(price)+'</span><span>Suggested: '+money(suggested)+'</span></div><button class="gold-btn" type="button" data-supplier-import="'+esc(type==="posts"?(item.group_id??item.id):(item.id))+'" data-kind="'+type+'">IMPORT</button></div></article>';
  }).join("")||'<p class="muted">কোনো Product পাওয়া যায়নি।</p>';
  $("#supplierResults").querySelectorAll("[data-supplier-import]").forEach(b=>b.addEventListener("click",()=>importItem(b.dataset.kind,b.dataset.supplierImport)));
 }
 async function search(){
  lastType=$("#supplierType").value;lastQuery=$("#supplierSearch").value.trim();categoryId=$("#supplierCategory").value;page=Math.max(1,page);msg("Loading supplier products...");
  try{
   const p=new URLSearchParams({page:String(page),per_page:lastType==="posts"?"20":"30"});if(lastQuery)p.set("search",lastQuery);if(categoryId)p.set("category_id",categoryId);
   const result=await api("/api/dropbazar/catalog/"+lastType+"?"+p.toString());const rows=dataArray(result);
   render(rows);$("#supplierPage").textContent="Page "+page;$("#supplierPrev").disabled=page<=1;$("#supplierNext").disabled=rows.length===0;msg(rows.length+"টি ফলাফল পাওয়া গেছে।");
  }catch(e){$("#supplierResults").innerHTML='<p class="order-error">'+esc(e.message)+'</p>';msg("Search failed")}
 }
 async function importItem(kind,id){
  try{
   msg("Product details loading...");
   const detail=await api("/api/dropbazar/catalog/"+(kind==="posts"?"posts/":"products/")+encodeURIComponent(id));
   const group=kind==="posts"?detail:null,items=kind==="posts"?(detail.products||[]):[detail];
   if(!items.length)throw new Error("এই Group-এ কোনো Product নেই।");
   const catsResult=await db.from("categories").select("*").order("sort_order");if(catsResult.error)throw catsResult.error;
   const localCats=catsResult.data||[];if(!localCats.length)throw new Error("আগে Wajiha Fusion-এ অন্তত একটি Category তৈরি করুন।");
   for(const product of items){
    if(!product.stock)continue;
    const already=await db.from("products").select("id").eq("supplier_source","dropbazarbd").eq("supplier_product_id",product.id).maybeSingle();
    if(already.error)throw new Error("Supplier metadata SQL এখনো চালানো হয়নি। Supabase-এ DROPBAZAR_SUPPLIER_SETUP.sql চালান।");
    if(already.data)continue;
    const priceText=prompt("Selling Price দিন (৳) — "+(product.title||detail.title)+" | Supplier Cost: "+product.price+" | Suggested: "+(product.suggested_price||detail.suggested_price||"N/A"),String(product.suggested_price||detail.suggested_price||product.price||0));
    if(priceText===null)return;const selling=Number(priceText);if(!Number.isInteger(selling)||selling<Number(product.price||0))throw new Error("Selling Price অবশ্যই Supplier Cost Price-এর সমান বা বেশি হতে হবে।");
    const categoryText=prompt("Wajiha Fusion Category ID নির্বাচন করুন:\n"+localCats.map(c=>c.name+" = "+c.id).join("\n"),String(localCats[0].id));if(categoryText===null)return;
    const cat=localCats.find(c=>String(c.id)===String(categoryText));if(!cat)throw new Error("সঠিক Category ID দিন।");
    const variants=Array.isArray(product.variants)?product.variants:[];
    const sizes=[...new Set(variants.filter(v=>/size/i.test(v.unit||"")).map(v=>String(v.attribute||"")).filter(Boolean))];
    const colors=[...new Set(variants.filter(v=>/colou?r/i.test(v.unit||"")).map(v=>String(v.attribute||"")).filter(Boolean))];
    const images=[product.thumbnail, ...(product.images||[]), ...(group?.images||[])].filter((u,i,a)=>u&&a.indexOf(u)===i);
    const payload={name:product.title||detail.title,category_id:cat.id,category:cat.name,regular_price:selling,special_price:null,description:[product.description||detail.description||detail.note||"", "Supplier: DropBazarBD","Supplier cost: ৳"+Number(product.price||detail.price||0),group?"Supplier group: "+group.group_id:""].filter(Boolean).join("\n\n"),colors,sizes,product_images:images,image_url:images[0]||"",is_active:true,updated_at:new Date().toISOString(),supplier_source:"dropbazarbd",supplier_product_id:product.id,supplier_group_id:group?.group_id||null,supplier_cost_price:Number(product.price||detail.price||0),supplier_suggested_price:Number(product.suggested_price||detail.suggested_price||0),supplier_variants:variants};
    const inserted=await db.from("products").insert(payload);if(inserted.error)throw inserted.error;
   }
   msg("Import সম্পন্ন হয়েছে। Admin Products তালিকা Refresh করুন।");
  }catch(e){msg(e.message||"Import failed")}
 }
 async function wallet(){
  try{const w=await api("/api/dropbazar/wallet");$("#supplierWallet").classList.remove("hidden");$("#supplierWallet").innerHTML='<div><b>'+money(w.balance)+'</b><small>Total Balance</small></div><div><b>'+money(w.available_balance)+'</b><small>Available Balance</small></div><div><b>'+money(w.pending_balance)+'</b><small>Pending Balance</small></div><div><b>'+esc(w.status||"—")+'</b><small>Wallet Status</small></div>'}
  catch(e){msg("Wallet: "+e.message)}
 }
 $("#supplierSearchBtn").addEventListener("click",()=>{page=1;search()});
 $("#supplierSearch").addEventListener("keydown",e=>{if(e.key==="Enter"){page=1;search()}});
 $("#supplierType").addEventListener("change",()=>{page=1;search()});
 $("#supplierCategory").addEventListener("change",()=>{page=1;search()});
 $("#supplierPrev").addEventListener("click",()=>{if(page>1){page--;search()}});
 $("#supplierNext").addEventListener("click",()=>{page++;search()});
 $("#supplierWalletBtn").addEventListener("click",wallet);
 document.querySelectorAll('[data-tab="supplier"]').forEach(b=>b.addEventListener("click",()=>{if(!categories.length)loadCategories()}));
})();
