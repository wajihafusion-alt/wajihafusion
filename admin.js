(() => {
 const cfg=window.WAJIHA_CONFIG||{},db=window.supabase?.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey),$=s=>document.querySelector(s);let cats=[],products=[],orders=[],bannerImage='',bannerImages=[],currentProductPhotos=[],removedProductPhotos=[];
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const money=n=>'৳'+Number(n||0).toLocaleString('en-BD');
 function notify(m){const t=$('#adminToast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500)}
 function setStatus(id,m){$(id).textContent=m}
 let authBusy=false;
 function showLogin(msg=''){
   $('#dashboard').classList.add('hidden');
   $('#loginPanel').classList.remove('hidden');
   $('#loginError').textContent=msg;
 }
 function showDashboard(){
   $('#loginPanel').classList.add('hidden');
   $('#dashboard').classList.remove('hidden');
 }
 async function checkAdminSession(){
   if(!db){showLogin('Supabase configuration missing. Check config.js');return false;}
   const {data:{session},error:sessionError}=await db.auth.getSession();
   if(sessionError){showLogin('Could not read login session: '+sessionError.message);return false;}
   if(!session){showLogin();return false;}
   const {data:userData,error:userError}=await db.auth.getUser();
   if(userError || !userData?.user){showLogin('Login session could not be verified. Please sign in again. '+(userError?.message||''));return false;}
   const {data,error}=await db.rpc('is_admin');
   if(error){showLogin('Signed in, but admin permission check failed: '+error.message+'. Session kept; no automatic logout.');return false;}
   if(data !== true){showLogin('Signed in as '+(userData.user.email||'your account')+', but this account is not being recognized as an admin. User ID: '+userData.user.id+'. Session kept.');return false;}
   showDashboard();
   await refresh();
   await loadOrders();
   return true;
 }
 async function adminCheck(){
   if(authBusy)return;
   authBusy=true;
   try{await checkAdminSession();}
   catch(err){showLogin('Admin panel error: '+(err?.message||String(err)));}
   finally{authBusy=false;}
 }
 $('#loginForm').addEventListener('submit',async e=>{
   e.preventDefault();
   if(!db){$('#loginError').textContent='Supabase configuration missing. Check config.js';return;}
   const btn=$('#loginForm').querySelector('button[type="submit"],button:not([type])');
   if(btn)btn.disabled=true;
   $('#loginError').textContent='Signing in...';
   try{
     const {data,error}=await db.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});
     if(error){$('#loginError').textContent=error.message;return;}
     if(!data?.session){$('#loginError').textContent='Login returned no active session. Please try again.';return;}
     await adminCheck();
   }catch(err){$('#loginError').textContent='Login error: '+(err?.message||String(err));}
   finally{if(btn)btn.disabled=false;}
 });
 $('#logoutBtn').addEventListener('click',async()=>{
   try{const {error}=await db.auth.signOut();if(error)notify(error.message);}
   finally{showLogin('You have been signed out.');}
 });
 db?.auth.onAuthStateChange((event,session)=>{
   if(event==='SIGNED_OUT')showLogin();
   if(event==='SIGNED_IN' && session)setTimeout(()=>adminCheck(),0);
 });
 document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));['overview','products','categories','banner','studio','orders'].forEach(k=>$('#'+k+'Tab').classList.toggle('hidden',k!==b.dataset.tab));if(b.dataset.tab==='orders')loadOrders()}));
 document.querySelectorAll('[data-goto-orders]').forEach(b=>b.addEventListener('click',()=>document.querySelector('.lux-nav [data-tab=orders]').click()));
 async function refresh(){await Promise.all([loadCats(),loadProducts(),loadBanner(),loadStudio()])}
 async function loadCats(){const {data,error}=await db.from('categories').select('*').order('sort_order');if(error){notify('Category load failed: '+error.message);return}cats=data||[];const opts=cats.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');$('#pCategory').innerHTML=opts;$('#parentCategory').innerHTML='<option value="">Main category</option>'+cats.filter(c=>!c.parent_id).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');$('#categoryList').innerHTML=cats.map(c=>`<div class="category-admin-row"><div>${esc(c.name)}<small>${c.parent_id?'Subcategory':'Main category'} · Sizes: ${(c.sizes||[]).map(esc).join(', ')||'Not set'}</small></div><button data-cat-delete="${c.id}">DELETE</button></div>`).join('');$('#categoryList').querySelectorAll('[data-cat-delete]').forEach(b=>b.addEventListener('click',()=>deleteCategory(b.dataset.catDelete)))}
 async function loadProducts(){const {data,error}=await db.from('products').select('*').order('created_at',{ascending:false});if(error){$('#adminProductList').textContent=error.message;return}products=data||[];renderAdminProducts()}
 function renderAdminProducts(){const q=($('#productSearch')?.value||'').trim().toLowerCase();const shown=products.filter(p=>!q||`${p.name||''} ${p.product_code||''}`.toLowerCase().includes(q));$('#adminProductList').innerHTML=shown.map(p=>{const image=(p.product_images||[])[0]||p.image_url||'https://placehold.co/100x120/171717/c8a45d?text=WF';return `<div class="admin-product-row"><img src="${esc(image)}"><div><strong>${esc(p.name)}</strong><small>Code: ${esc(p.product_code||'No code')} · ${money(p.special_price||p.regular_price)} · ${(p.colors||[]).length} colors · ${(p.sizes||[]).length} sizes · Stock: ${Number(p.stock_quantity??0)}${p.is_featured?' · FEATURED':''}</small></div><span class="price-cell">${p.is_active?'Active':'Hidden'}</span><div class="row-actions"><button data-edit="${p.id}">EDIT</button><button class="delete" data-delete="${p.id}">DELETE</button></div></div>`}).join('')||'<p class="muted">No matching products found.</p>';$('#adminProductList').querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>editProduct(b.dataset.edit)));$('#adminProductList').querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',()=>deleteProduct(b.dataset.delete)))}
 $('#newProductBtn').addEventListener('click',()=>{resetProduct();$('#productForm').classList.remove('hidden')});$('#cancelProductBtn').addEventListener('click',()=>$('#productForm').classList.add('hidden'));

 function renderExistingPhotos(){
   const host=$('#existingPhotos');
   if(!host)return;
   host.innerHTML=currentProductPhotos.map((u,i)=>`
     <div style="display:inline-flex;flex-direction:column;gap:5px;margin:6px;padding:6px;border:1px solid #9b792e;border-radius:8px">
       <img src="${esc(u)}" style="width:85px;height:105px;object-fit:cover;border-radius:5px">
       <small style="color:#d9b64c;text-align:center">${i===0?'★ MAIN PHOTO':'PHOTO '+(i+1)}</small>
       <button type="button" data-main-photo="${i}" ${i===0?'disabled':''}>MAKE MAIN</button>
       <button type="button" data-delete-photo="${i}" style="background:#9b2424;color:white">DELETE</button>
     </div>`).join('')||'<p class="muted">No saved photos.</p>';

   host.querySelectorAll('[data-main-photo]').forEach(b=>b.addEventListener('click',()=>{
     const i=Number(b.dataset.mainPhoto);
     if(i<0||i>=currentProductPhotos.length)return;
     const photo=currentProductPhotos.splice(i,1)[0];
     currentProductPhotos.unshift(photo);
     renderExistingPhotos();
   }));

   host.querySelectorAll('[data-delete-photo]').forEach(b=>b.addEventListener('click',()=>{
     const i=Number(b.dataset.deletePhoto);
     if(i<0||i>=currentProductPhotos.length)return;
     if(!confirm('এই Product Photo মুছে ফেলবেন?'))return;
     const photo=currentProductPhotos.splice(i,1)[0];
     if(photo&&!removedProductPhotos.includes(photo))removedProductPhotos.push(photo);
     renderExistingPhotos();
   }));
 }

 function resetProduct(){
   $('#productForm').reset();
   $('#productId').value='';
   $('#pCode').value='';$('#pStock').value='9999';$('#pFeatured').checked=false;$('#pActive').checked=true;
   currentProductPhotos=[];
   removedProductPhotos=[];
   $('#existingPhotos').innerHTML='';
   setStatus('#productStatus','');
      } function editProduct(id){
   const p=products.find(x=>x.id===id);
   if(!p)return;
   $('#productForm').classList.remove('hidden');
   $('#productId').value=p.id;
   $('#pName').value=p.name;
   $('#pCode').value=p.product_code||'';
   $('#pCategory').value=p.category_id||'';
   $('#pRegular').value=p.regular_price||'';
   $('#pSpecial').value=p.special_price||'';
   $('#pDescription').value=p.description||'';
   $('#pColors').value=(p.colors||[]).join(', ');
   $('#pSizes').value=(p.sizes||[]).join(', ');$('#pStock').value=p.stock_quantity??0;$('#pFeatured').checked=!!p.is_featured;$('#pActive').checked=p.is_active!==false;
   currentProductPhotos=(Array.isArray(p.product_images)&&p.product_images.length)
     ?p.product_images.slice()
     :(p.image_url?[p.image_url]:[]);
   removedProductPhotos=[];
   renderExistingPhotos();
   $('#productForm').scrollIntoView({behavior:'smooth'});
 }

 async function uploadFiles(files,folder){
   let urls=[];
   for(const f of files){
     const safe=f.name.replace(/[^a-zA-Z0-9._-]/g,'_');
     const path=`${folder}/${Date.now()}_${Math.random().toString(36).slice(2,8)}_${safe}`;
     const {error}=await db.storage.from('product-images').upload(path,f,{upsert:false,contentType:f.type});
     if(error)throw error;
     const {data}=db.storage.from('product-images').getPublicUrl(path);
     urls.push(data.publicUrl);
   }
   return urls;
 }

 function getProductStoragePath(url){
   const marker='/storage/v1/object/public/product-images/';
   const at=String(url||'').indexOf(marker);
   if(at<0)return null;
   try{return decodeURIComponent(String(url).slice(at+marker.length).split('?')[0]);}
   catch{return null;}
 }

 $('#productForm').addEventListener('submit',async e=>{
   e.preventDefault();
   const btn=e.submitter||$('#productForm').querySelector('[type="submit"]');
   if(btn)btn.disabled=true;
   setStatus('#productStatus','Saving...');
   try{
     const id=$('#productId').value;
     const newUrls=await uploadFiles([...$('#pPhotos').files],'products');
     const imgs=[...currentProductPhotos,...newUrls];
     const category=cats.find(c=>c.id===$('#pCategory').value);
     const payload={
       name:$('#pName').value.trim(),
       category_id:category?.id||null,
       category:category?.name||'',
       regular_price:Number($('#pRegular').value),
       special_price:$('#pSpecial').value?Number($('#pSpecial').value):null,
       description:$('#pDescription').value.trim(),
       colors:$('#pColors').value.split(',').map(x=>x.trim()).filter(Boolean),
       sizes:$('#pSizes').value.split(',').map(x=>x.trim()).filter(Boolean),
       product_images:imgs,
       image_url:imgs[0]||'',
       is_active:$('#pActive').checked,
       stock_quantity:Math.max(0,Number($('#pStock').value)||0),
       is_featured:$('#pFeatured').checked,
       updated_at:new Date().toISOString()
     };
     const enteredCode=$('#pCode').value.trim();
     if(enteredCode)payload.product_code=enteredCode;

     const res=id
       ?await db.from('products').update(payload).eq('id',id)
       :await db.from('products').insert(payload);
     if(res.error)throw res.error;

     const paths=[...new Set(removedProductPhotos.map(getProductStoragePath).filter(Boolean))];
     if(paths.length){
       const {error:storageError}=await db.storage.from('product-images').remove(paths);
       if(storageError)notify('Product saved, but photo file deletion failed: '+storageError.message);
     }

     if(!paths.length||!removedProductPhotos.length)notify('Product saved successfully');
     $('#productForm').classList.add('hidden');
     resetProduct();
     await loadProducts();
   }catch(err){
     setStatus('#productStatus',err.message||'Could not save product');
   }finally{
     if(btn)btn.disabled=false;
   }
 });

 async function deleteProduct(id){if(!confirm('Delete this product?'))return;const {error}=await db.from('products').delete().eq('id',id);if(error)return notify(error.message);notify('Product deleted');await loadProducts()}
 $('#categoryForm').addEventListener('submit',async e=>{e.preventDefault();const name=$('#categoryName').value.trim(),parent=$('#parentCategory').value||null,sizes=$('#categorySizes').value.split(',').map(x=>x.trim()).filter(Boolean);const {error}=await db.from('categories').insert({name,parent_id:parent,sizes,is_active:true,sort_order:cats.length});if(error)return notify(error.message);$('#categoryForm').reset();notify('Category added');await loadCats()});
 async function deleteCategory(id){if(!confirm('Delete category? Products assigned to it may need reassignment.'))return;const {error}=await db.from('categories').delete().eq('id',id);if(error)return notify(error.message);notify('Category deleted');await loadCats()}
 function renderBannerPreview(){const pending=[...$('#bannerPhoto').files];$('#bannerPreview').innerHTML=bannerImages.map((u,i)=>`<div class="banner-preview-item"><img src="${esc(u)}" alt="Banner ${i+1}"><button type="button" class="banner-delete-btn" data-banner-delete="${i}">🗑 DELETE</button></div>`).join('')+pending.map(f=>`<span class="muted">${esc(f.name)} (not uploaded yet)</span>`).join('');$('#bannerPreview').querySelectorAll('[data-banner-delete]').forEach(b=>b.addEventListener('click',()=>{const i=Number(b.dataset.bannerDelete);if(!Number.isInteger(i)||i<0||i>=bannerImages.length)return;if(!confirm('এই Banner ছবিটি মুছে ফেলবেন?'))return;bannerImages.splice(i,1);bannerImage=bannerImages[0]||'';renderBannerPreview();setStatus('#bannerStatus','ছবিটি সরানো হয়েছে। স্থায়ী করতে SAVE BANNER চাপুন।')}))}
 async function loadBanner(){const {data,error}=await db.from('storefront_settings').select('*').eq('id',1).maybeSingle();if(error){console.warn(error.message);return}if(!data)return;$('#bannerText').value=data.banner_text||'';$('#bannerEnabled').checked=!!data.banner_enabled;bannerImage=data.banner_image_url||'';bannerImages=Array.isArray(data.banner_images)?data.banner_images.slice():[];if(!bannerImages.length&&bannerImage)bannerImages=[bannerImage];renderBannerPreview()}
 $('#bannerPhoto').addEventListener('change',renderBannerPreview);$('#bannerForm').addEventListener('submit',async e=>{e.preventDefault();setStatus('#bannerStatus','Saving...');try{if($('#bannerPhoto').files.length)bannerImages=[...bannerImages,...await uploadFiles([...$('#bannerPhoto').files],'banners')];bannerImage=bannerImages[0]||'';const {error}=await db.from('storefront_settings').upsert({id:1,banner_text:$('#bannerText').value,banner_enabled:$('#bannerEnabled').checked,banner_image_url:bannerImage,banner_images:bannerImages,updated_at:new Date().toISOString()});if(error)throw error;$('#bannerPhoto').value='';setStatus('#bannerStatus','Saved successfully');renderBannerPreview();notify('Banner saved')}catch(err){setStatus('#bannerStatus',err.message)}});


 const themePresets={
   beige:{bg:'#FFF1DC',panel:'#FFFFFF',primary:'#800020',accent:'#D4AF37',text:'#3B241C'},
   pink:{bg:'#FFF0F5',panel:'#FFFFFF',primary:'#B8326A',accent:'#E7A6B8',text:'#482536'},
   purple:{bg:'#F2ECFF',panel:'#FFFFFF',primary:'#54218A',accent:'#B99AE8',text:'#2D1B40'},
   dark:{bg:'#090909',panel:'#171717',primary:'#D4AF37',accent:'#F1D27B',text:'#F6F0E2'}
 };
 const studioTextIds={brandName:'txtBrandName',brandTagline:'txtBrandTagline',footerCopyright:'txtFooterCopyright',heroEyebrow:'txtHeroEyebrow',heroTitle:'txtHeroTitle',heroHighlight:'txtHeroHighlight',heroSubtitle:'txtHeroSubtitle',heroButton:'txtHeroButton',shopEyebrow:'txtShopEyebrow',shopTitle:'txtShopTitle',aboutEyebrow:'txtAboutEyebrow',aboutTitle:'txtAboutTitle',aboutText:'txtAboutText',footerContact:'txtFooterContact'};
 let studioTheme={...themePresets.beige,announcementBg:'#800020',announcementText:'#FFFFFF',announcementAnimation:'none',announcementSpeed:3};
 let studioContent={};
 function studioVal(id){return $('#'+id)?.value||''}
 function paintStudioPreview(){const p=$('#themePreview');if(!p)return;p.style.background=studioTheme.bg;p.style.color=studioTheme.text;p.style.borderColor=studioTheme.accent;p.querySelector('button').style.background=studioTheme.primary;p.querySelector('button').style.color='#fff'}
 function readStudioControls(){studioTheme={...studioTheme,bg:studioVal('themeBg'),panel:studioVal('themePanel'),primary:studioVal('themePrimary'),accent:studioVal('themeAccent'),text:studioVal('themeText'),announcementBg:studioVal('announcementBg'),announcementText:studioVal('announcementText'),announcementAnimation:studioVal('announcementAnimation'),announcementSpeed:Number(studioVal('announcementSpeed'))||3};paintStudioPreview()}
 function fillStudioControls(){const root=document.documentElement.style;root.setProperty('--studio-admin-primary',studioTheme.primary||'#800020');root.setProperty('--studio-admin-accent',studioTheme.accent||'#D4AF37');root.setProperty('--studio-admin-panel',studioTheme.panel||'#171717');root.setProperty('--studio-admin-text',studioTheme.text||'#F6F0E2');for(const [id,key] of [['themeBg','bg'],['themePanel','panel'],['themePrimary','primary'],['themeAccent','accent'],['themeText','text'],['announcementBg','announcementBg'],['announcementText','announcementText']])$('#'+id).value=studioTheme[key]||'#ffffff';$('#announcementAnimation').value=studioTheme.announcementAnimation||'none';$('#announcementSpeed').value=studioTheme.announcementSpeed||3;paintStudioPreview()}
 async function loadStudio(){const {data,error}=await db.from('storefront_settings').select('*').eq('id',1).maybeSingle();if(error){console.warn('Studio settings:',error.message);return}if(!data)return;studioTheme={...themePresets.beige,...(data.theme_config||{})};studioContent=data.site_content||{};for(const [key,id] of Object.entries(studioTextIds))$('#'+id).value=studioContent[key]||'';$('#studioAnnouncement').value=data.banner_text||'';$('#announcementShow').checked=!!data.banner_enabled;fillStudioControls()}
 document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{studioTheme={...studioTheme,...(themePresets[b.dataset.preset]||themePresets.beige)};fillStudioControls();document.querySelectorAll('[data-preset]').forEach(x=>x.classList.toggle('active',x===b))}));
 ['themeBg','themePanel','themePrimary','themeAccent','themeText','announcementBg','announcementText','announcementAnimation','announcementSpeed'].forEach(id=>$('#'+id).addEventListener('input',readStudioControls));
 $('#saveStudioBtn').addEventListener('click',async()=>{setStatus('#studioStatus','Saving...');readStudioControls();const content={};for(const [key,id] of Object.entries(studioTextIds))content[key]=$('#'+id).value.trim();try{const payload={id:1,theme_config:studioTheme,site_content:content,banner_text:$('#studioAnnouncement').value.trim(),banner_enabled:$('#announcementShow').checked,updated_at:new Date().toISOString()};const {error}=await db.from('storefront_settings').upsert(payload);if(error)throw error;setStatus('#studioStatus','Saved successfully');notify('Website design saved');}catch(err){setStatus('#studioStatus','Save failed: '+(err.message||String(err)))}});
 $('#resetStudioBtn').addEventListener('click',()=>{studioTheme={...themePresets.beige,announcementBg:'#800020',announcementText:'#FFFFFF',announcementAnimation:'none',announcementSpeed:3};fillStudioControls();document.querySelectorAll('[data-preset]').forEach(x=>x.classList.remove('active'));setStatus('#studioStatus','Default theme selected. Press SAVE to apply.')});
 const orderEsc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function loadOrders(){
   $('#adminOrdersList').textContent='Loading orders...';
   const {data,error}=await db.from('customer_orders').select('*').order('created_at',{ascending:false}).limit(200);
   if(error){$('#adminOrdersList').innerHTML='<p class="order-error">Orders load failed: '+orderEsc(error.message)+'</p>';return}
   orders=data||[];renderOrders();
 }
 function renderOrders(){
   const q=($('#orderSearch').value||'').trim().toLowerCase();
   const shown=orders.filter(o=>[o.order_number,o.customer_name,o.customer_phone,o.status].join(' ').toLowerCase().includes(q));
   const count=(...names)=>orders.filter(o=>names.includes(String(o.status||'').toLowerCase())).length;
   $('#statTotal').textContent=orders.length;
   $('#statCompleted').textContent=count('completed','delivered');
   $('#statPending').textContent=count('pending','new');
   $('#statProcessing').textContent=count('processing','shipped');
   $('#adminOrdersList').innerHTML=`<div class="lux-table-wrap"><table class="lux-orders-table"><thead><tr><th>#</th><th>Order Number</th><th>Customer</th><th>Phone</th><th>Products</th><th>Total</th><th>Status</th><th>Date</th><th>Action</th></tr></thead><tbody>${shown.map((o,i)=>{
     const items=Array.isArray(o.items)?o.items:[];const first=items[0]||{};const thumb=first.image_url||first.image||first.product_image||first.photo||'';
     const status=String(o.status||'New');const statusClass=status.toLowerCase();
     return `<tr><td>${i+1}</td><td class="lux-order-no">${orderEsc(o.order_number||'—')}</td><td>${orderEsc(o.customer_name||'')}</td><td>${orderEsc(o.customer_phone||'')}</td><td><div class="lux-product-cell">${thumb?`<img src="${orderEsc(thumb)}" alt="">`:''}<span>${items.length} item${items.length===1?'':'s'}</span></div></td><td class="lux-order-total">${money(o.total)}</td><td><select class="lux-status ${orderEsc(statusClass)}" data-order-status="${orderEsc(o.id)}">${['New','Pending','Processing','Shipped','Delivered','Completed','Cancelled'].map(x=>`<option value="${x}" ${status.toLowerCase()===x.toLowerCase()?'selected':''}>${x}</option>`).join('')}</select></td><td>${o.created_at?new Date(o.created_at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):''}</td><td><button class="lux-action" type="button" title="View / Print Invoice" data-order-invoice="${orderEsc(o.id)}">⌕</button></td></tr>`;
   }).join('')}</tbody></table></div><div class="lux-table-footer">Showing ${shown.length} of ${orders.length} orders <span>Wajiha Fusion · Premium Fashion</span></div>`||'<p class="muted">No orders found.</p>';
   $('#adminOrdersList').querySelectorAll('[data-order-status]').forEach(el=>el.addEventListener('change',async()=>{
     const {error}=await db.from('customer_orders').update({status:el.value}).eq('id',el.dataset.orderStatus);
     if(error){notify('Status update failed: '+error.message);return}
     const found=orders.find(o=>o.id===el.dataset.orderStatus);if(found)found.status=el.value;notify('Order status updated');renderOrders();
   }));
   $('#adminOrdersList').querySelectorAll('[data-order-invoice]').forEach(b=>b.addEventListener('click',()=>printOrderInvoice(b.dataset.orderInvoice)));
  } function printOrderInvoice(id){
   const o=orders.find(x=>x.id===id);if(!o)return;
   const items=Array.isArray(o.items)?o.items:[];
   const itemRows=items.map((x,i)=>{const linkedProduct=products.find(p=>(x.product_code&&p.product_code===x.product_code)||(x.name&&p.name===x.name)||(x.product_name&&p.name===x.product_name));const image=x.image_url||x.image||x.product_image||x.photo||linkedProduct?.image_url||(linkedProduct?.product_images||[])[0]||'';const qty=Number(x.quantity||x.qty||1);const price=Number(x.price||x.unit_price||0);const line=Number(x.total||x.line_total||price*qty);return `<tr><td class="num">${i+1}</td><td><div class="inv-product">${image?`<img src="${orderEsc(image)}" alt="">`:''}<div><b>${orderEsc(x.name||x.product_name||'Product')}</b><small>${orderEsc(x.product_code||'')}${x.color?' · '+orderEsc(x.color):''}${x.size?' · '+orderEsc(x.size):''}</small></div></div></td><td>${qty}</td><td>${money(price)}</td><td class="right">${money(line)}</td></tr>`}).join('');
   const address=[o.address,o.thana,o.district,o.delivery_area].filter(Boolean).join(', ');
   const date=o.created_at?new Date(o.created_at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
   const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${orderEsc(o.order_number)} | Wajiha Fusion Invoice</title><style>
   *{box-sizing:border-box}body{margin:0;background:#090909;color:#f7f2e8;font:14px Arial,sans-serif;padding:28px}.invoice{max-width:850px;margin:0 auto;border:1px solid #b99135;background:radial-gradient(ellipse at top right,#29200e 0,#090909 48%);padding:34px;position:relative;overflow:hidden}.invoice:before,.invoice:after{content:"";position:absolute;width:260px;height:2px;background:linear-gradient(90deg,transparent,#f6cf62,transparent);transform:rotate(-24deg);right:-50px;top:35px}.invoice:after{top:auto;right:auto;left:-80px;bottom:50px}.brand{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #8f6b24;padding-bottom:20px}.logo{display:flex;align-items:center;gap:15px}.crown{font-size:48px;color:#f5ca55;line-height:1}.brand h1{margin:0;color:#f6d16a;font:bold 30px Georgia,serif;letter-spacing:1px}.brand p{margin:5px 0 0;color:#c8b783;font-style:italic}.tag{border:1px solid #bd9135;color:#f6d16a;border-radius:30px;padding:9px 14px;font-size:11px;letter-spacing:1px}.hero{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:center;margin:24px 0}.hero h2{font:bold 43px Georgia,serif;color:#f3c85b;margin:0}.hero p{color:#c9b77f;margin:5px 0}.meta{border:1px solid #9d762a;border-radius:12px;padding:15px}.meta b{display:block;color:#f3ce69;margin-bottom:6px}.meta span{font-size:16px;overflow-wrap:anywhere}.info{display:grid;grid-template-columns:1fr 1fr;border:1px solid #80601f;border-radius:12px;padding:17px;margin:20px 0}.info h3{color:#f1c85c;margin:0 0 10px}.info p{margin:6px 0;color:#eee}.info>div+div{border-left:1px solid #80601f;padding-left:22px}.items{width:100%;border-collapse:collapse;margin:20px 0}.items th{background:linear-gradient(90deg,#d8a936,#f8dc83);color:#15110a;text-align:left;padding:13px 10px}.items td{padding:13px 10px;border-bottom:1px solid #59451d}.num{color:#e9c65f}.right{text-align:right}.inv-product{display:flex;align-items:center;gap:10px}.inv-product img{width:48px;height:55px;object-fit:cover;border-radius:6px;background:#222;border:1px solid #80601f}.inv-product small{display:block;color:#b9aa82;margin-top:5px}.bottom{display:grid;grid-template-columns:1fr 300px;gap:25px;align-items:start;margin-top:22px}.thanks{font:italic 36px Georgia,serif;color:#f3c85b;margin:5px 0}.thanks-note{color:#cfc6b0;line-height:1.6}.totals{border:1px solid #b38a32;border-radius:12px;padding:14px}.totals div{display:flex;justify-content:space-between;padding:8px 4px;border-bottom:1px solid #49391b}.totals .grand{background:linear-gradient(90deg,#d5a22e,#f8d979);color:#17120a;font-size:18px;font-weight:bold;margin:8px -14px -14px;padding:14px;border-radius:0 0 12px 12px}.footer{border-top:1px solid #80601f;margin-top:28px;padding-top:18px;display:flex;justify-content:space-between;gap:15px;color:#d9c78f;font-size:12px}.footer strong{color:#f4d06c}.actions{text-align:center;margin:24px}.print{background:linear-gradient(90deg,#c99523,#f8d875);border:0;border-radius:7px;padding:13px 26px;font-weight:bold;color:#17120a;cursor:pointer}@media(max-width:620px){body{padding:8px}.invoice{padding:17px}.brand h1{font-size:22px}.tag{display:none}.hero{grid-template-columns:1fr}.hero h2{font-size:34px}.info{grid-template-columns:1fr;gap:12px}.info>div+div{border-left:0;border-top:1px solid #80601f;padding:12px 0 0}.bottom{grid-template-columns:1fr}.items{font-size:11px}.items th,.items td{padding:8px 5px}.inv-product img{width:35px;height:42px}.footer{flex-direction:column}}@media print{body{padding:0;background:#090909!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.invoice{border:0;max-width:none;min-height:100vh}.actions{display:none}}
   </style></head><body><main class="invoice"><header class="brand"><div class="logo"><div class="crown">♛<br>W</div><div><h1>Wajiha Fusion</h1><p>Wear The Best, Feel The Best</p></div></div><span class="tag">FASHION · STYLE · YOU</span></header><section class="hero"><div><h2>INVOICE</h2><p>Thank you for shopping with us!</p></div><div class="meta"><b>ORDER NUMBER</b><span>${orderEsc(o.order_number||'—')}</span><p><b>ORDER DATE</b><span>${date}</span></p></div></section><section class="info"><div><h3>♟ Customer Information</h3><p><b>Name:</b> ${orderEsc(o.customer_name||'—')}</p><p><b>Phone:</b> ${orderEsc(o.customer_phone||'—')}</p></div><div><h3>⌖ Shipping Address</h3><p>${orderEsc(address||'—')}</p><p><b>Payment:</b> ${orderEsc(o.payment_method||'—')}</p></div></section><table class="items"><thead><tr><th>#</th><th>Product</th><th>Qty</th><th>Unit Price</th><th class="right">Total</th></tr></thead><tbody>${itemRows||'<tr><td colspan="5">No product details provided</td></tr>'}</tbody></table><section class="bottom"><div><div class="thanks">Thank You!</div><p class="thanks-note">For being a part of Wajiha Fusion.<br>Your support inspires us to do better. ♥</p></div><div class="totals"><div><span>Subtotal</span><b>${money(o.subtotal)}</b></div><div><span>Discount</span><b>${money(o.discount)}</b></div><div><span>Delivery</span><b>${money(o.delivery_charge)}</b></div><div class="grand"><span>Total Amount</span><b>${money(o.total)}</b></div></div></section><footer class="footer"><span><strong>WAJIHA FUSION</strong> · Premium Fashion</span><span>Fashion Beyond Boundaries</span></footer></main><div class="actions"><button class="print" onclick="window.print()">PRINT / SAVE AS PDF</button></div></body></html>`;
   const w=window.open('','_blank');if(!w){notify('Allow pop-ups to print invoice');return}w.document.open();w.document.write(html);w.document.close();
 }
 $('#orderSearch').addEventListener('input',renderOrders);
 $('#refreshOrdersBtn').addEventListener('click',loadOrders);
 $('#productSearch').addEventListener('input',renderAdminProducts);adminCheck();
})();
