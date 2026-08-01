const config=window.SAM_CONFIG||{},supabaseUrl=String(config.supabaseUrl||'').replace(/\/$/,''),publishableKey=String(config.supabasePublishableKey||config.supabaseAnonKey||''),sessionKey='sam-admin-session';
const $=selector=>document.querySelector(selector),loginView=$('#login-view'),dashboardView=$('#dashboard-view'),loginForm=$('#login-form'),loginStatus=$('#login-status'),dashboardStatus=$('#dashboard-status'),sessionUser=$('#session-user'),logoutButton=$('#logout-button'),productList=$('#product-list'),loadingState=$('#loading-state'),emptyState=$('#empty-state'),productDialog=$('#product-dialog'),productForm=$('#product-form'),productFormStatus=$('#product-form-status'),searchInput=$('#product-search'),statusFilter=$('#status-filter');
let session=null,project=null,membership=null,categories=[],products=[],currentProduct=null;

function setStatus(element,message='',isError=false){element.textContent=message;element.classList.toggle('is-error',isError)}
function slugify(value){return String(value||'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function moneyToCents(value){return String(value).trim()===''?null:Math.round(Number(value)*100)}
function formatPrice(cents,quote){return Number.isInteger(cents)?new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(cents/100):(quote?'Presupuesto':'Sin precio')}
function storeSession(value){session=value;value?localStorage.setItem(sessionKey,JSON.stringify(value)):localStorage.removeItem(sessionKey)}
function readSession(){try{return JSON.parse(localStorage.getItem(sessionKey)||'null')}catch{return null}}

async function authRequest(path,body){
  const response=await fetch(`${supabaseUrl}/auth/v1/${path}`,{method:'POST',headers:{apikey:publishableKey,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload.error_description||payload.msg||payload.message||'No se pudo iniciar sesión');
  return payload;
}
async function ensureSession(){
  session=readSession();if(!session?.access_token)return null;
  if(session.expires_at>Math.floor(Date.now()/1000)+60)return session;
  if(!session.refresh_token)return null;
  try{const refreshed=await authRequest('token?grant_type=refresh_token',{refresh_token:session.refresh_token});refreshed.expires_at=Math.floor(Date.now()/1000)+refreshed.expires_in;storeSession(refreshed);return refreshed}catch{storeSession(null);return null}
}
async function rest(resource,{method='GET',query={},body,prefer}={}){
  const url=new URL(`${supabaseUrl}/rest/v1/${resource}`);Object.entries(query).forEach(([key,value])=>url.searchParams.set(key,value));
  const headers={apikey:publishableKey,Authorization:`Bearer ${session.access_token}`};if(body!==undefined)headers['Content-Type']='application/json';if(prefer)headers.Prefer=prefer;
  const response=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),payload=response.status===204?null:await response.json().catch(()=>null);
  if(!response.ok)throw new Error(payload?.message||payload?.msg||`Error ${response.status}`);return payload;
}

async function loadAccess(){
  const projectRows=await rest('projects',{query:{select:'id,name,slug',slug:'eq.sam',limit:'1'}});project=projectRows[0];if(!project)throw new Error('No se encuentra el proyecto SAM');
  const rows=await rest('project_members',{query:{select:'role,user_id',project_id:`eq.${project.id}`,user_id:`eq.${session.user.id}`,limit:'1'}});membership=rows[0];
  if(!membership||!['owner','admin','editor'].includes(membership.role))throw new Error('Tu cuenta existe, pero aún no tiene permisos de edición en SAM');
}
async function loadCatalog(){
  loadingState.hidden=false;
  const [categoryRows,productRows]=await Promise.all([
    rest('catalog_categories',{query:{select:'id,slug,name,sort_order,is_active',project_id:`eq.${project.id}`,order:'sort_order.asc'}}),
    rest('catalog_products',{query:{select:'id,category_id,slug,name,short_description,kind,fulfillment,status,featured,requires_quote,metadata,sort_order,published_at,category:catalog_categories(name),variants:product_variants(id,name,sku,price_cents,track_inventory,stock_quantity,low_stock_threshold,is_active,sort_order)',project_id:`eq.${project.id}`,order:'sort_order.asc,name.asc'}})
  ]);categories=categoryRows;products=productRows;loadingState.hidden=true;fillCategoryOptions();renderProducts();updateStats();
}
function productVariant(product){return [...(product.variants||[])].sort((a,b)=>a.sort_order-b.sort_order)[0]||null}
function updateStats(){
  $('#stat-total').textContent=products.length;$('#stat-published').textContent=products.filter(x=>x.status==='published').length;$('#stat-drafts').textContent=products.filter(x=>x.status==='draft').length;
  $('#stat-low-stock').textContent=products.filter(x=>{const v=productVariant(x);return v?.track_inventory&&v.stock_quantity<=v.low_stock_threshold}).length;
}
function statusLabel(status){return({published:'Publicado',draft:'Borrador',hidden:'Oculto',archived:'Archivado'})[status]||status}
function textElement(tag,className,text){const element=document.createElement(tag);if(className)element.className=className;element.textContent=text;return element}
function renderProducts(){
  const query=slugify(searchInput.value),selected=statusFilter.value,filtered=products.filter(product=>{const v=productVariant(product),haystack=slugify(`${product.name} ${product.slug} ${v?.sku||''}`);return(!query||haystack.includes(query))&&(selected==='all'||product.status===selected)});
  productList.replaceChildren();filtered.forEach(product=>{const variant=productVariant(product),row=document.createElement('article');row.className='product-row';
    const name=document.createElement('div');name.className='product-name';name.append(textElement('strong','',product.name),textElement('small','',variant?.sku||product.slug));
    const edit=textElement('button','row-button','Editar');edit.type='button';edit.addEventListener('click',()=>openProduct(product));
    row.append(name,textElement('span','category-pill',product.category?.name||'Sin categoría'),textElement('span','price-copy',formatPrice(variant?.price_cents,product.requires_quote)),textElement('span',`status-pill status-pill--${product.status}`,statusLabel(product.status)),edit);productList.append(row);
  });emptyState.hidden=filtered.length!==0;
}
function fillCategoryOptions(){const select=$('#product-category');select.replaceChildren(...categories.filter(x=>x.is_active).map(category=>{const option=document.createElement('option');option.value=category.id;option.textContent=category.name;return option}))}

function resetProductForm(){productForm.reset();$('#product-id').value='';$('#variant-id').value='';$('#variant-name').value='Estándar';$('#stock-quantity').value='0';$('#product-status').value='published';$('#requires-quote').checked=true;currentProduct=null;$('#delete-product-button').hidden=true;setStatus(productFormStatus)}
function openProduct(product=null){
  resetProductForm();currentProduct=product;$('#dialog-title').textContent=product?'Editar producto':'Nuevo producto';
  if(product){const variant=productVariant(product);$('#product-id').value=product.id;$('#variant-id').value=variant?.id||'';$('#product-name').value=product.name;$('#product-slug').value=product.slug;$('#product-category').value=product.category_id||'';$('#product-description').value=product.short_description||'';$('#product-kind').value=product.kind;$('#product-fulfillment').value=product.fulfillment;$('#product-status').value=product.status;$('#product-featured').checked=product.featured;$('#requires-quote').checked=product.requires_quote;$('#variant-name').value=variant?.name||'Estándar';$('#variant-sku').value=variant?.sku||'';$('#variant-price').value=Number.isInteger(variant?.price_cents)?(variant.price_cents/100).toFixed(2):'';$('#track-inventory').checked=Boolean(variant?.track_inventory);$('#stock-quantity').value=variant?.stock_quantity??0;$('#delete-product-button').hidden=false}
  productDialog.showModal();
}

async function saveProduct(event){
  event.preventDefault();setStatus(productFormStatus,'Guardando…');const productId=$('#product-id').value,variantId=$('#variant-id').value,status=$('#product-status').value;
  const payload={project_id:project.id,category_id:$('#product-category').value,slug:$('#product-slug').value,name:$('#product-name').value.trim(),short_description:$('#product-description').value.trim()||null,kind:$('#product-kind').value,fulfillment:$('#product-fulfillment').value,status,featured:$('#product-featured').checked,requires_quote:$('#requires-quote').checked,currency:'EUR',metadata:currentProduct?.metadata||{},published_at:status==='published'?(currentProduct?.published_at||new Date().toISOString()):null};
  try{
    const saved=productId?await rest('catalog_products',{method:'PATCH',query:{id:`eq.${productId}`},body:payload,prefer:'return=representation'}):await rest('catalog_products',{method:'POST',body:payload,prefer:'return=representation'}),savedProduct=saved[0];
    const variantPayload={project_id:project.id,product_id:savedProduct.id,name:$('#variant-name').value.trim(),sku:$('#variant-sku').value.trim()||null,price_cents:moneyToCents($('#variant-price').value),currency:'EUR',track_inventory:$('#track-inventory').checked,is_active:true};
    if(variantId){await rest('product_variants',{method:'PATCH',query:{id:`eq.${variantId}`},body:variantPayload,prefer:'return=minimal'});const oldStock=productVariant(currentProduct)?.stock_quantity||0,newStock=Number.parseInt($('#stock-quantity').value,10)||0,delta=newStock-oldStock;if(variantPayload.track_inventory&&delta!==0)await rest('rpc/adjust_variant_stock',{method:'POST',body:{target_variant:variantId,amount:delta,reason:'adjustment',movement_note:'Ajuste desde el panel SAM'}})}
    else{variantPayload.stock_quantity=Number.parseInt($('#stock-quantity').value,10)||0;await rest('product_variants',{method:'POST',body:variantPayload,prefer:'return=minimal'})}
    await loadCatalog();productDialog.close();setStatus(dashboardStatus,`“${payload.name}” se ha guardado correctamente.`);
  }catch(error){setStatus(productFormStatus,error.message,true)}
}
async function deleteProduct(){if(!currentProduct||!confirm(`¿Eliminar “${currentProduct.name}”? Esta acción no se puede deshacer.`))return;setStatus(productFormStatus,'Eliminando…');try{await rest('catalog_products',{method:'DELETE',query:{id:`eq.${currentProduct.id}`},prefer:'return=minimal'});await loadCatalog();productDialog.close();setStatus(dashboardStatus,'Producto eliminado correctamente.')}catch(error){setStatus(productFormStatus,error.message,true)}}
async function showDashboard(){await loadAccess();loginView.hidden=true;dashboardView.hidden=false;logoutButton.hidden=false;sessionUser.hidden=false;sessionUser.textContent=session.user.email;$('#role-label').textContent=`Sesión autorizada · Rol ${membership.role}`;await loadCatalog()}

loginForm.addEventListener('submit',async event=>{event.preventDefault();setStatus(loginStatus,'Comprobando acceso…');try{const result=await authRequest('token?grant_type=password',{email:$('#login-email').value.trim(),password:$('#login-password').value});result.expires_at=Math.floor(Date.now()/1000)+result.expires_in;storeSession(result);await showDashboard();loginForm.reset();setStatus(loginStatus)}catch(error){storeSession(null);setStatus(loginStatus,error.message,true)}});
logoutButton.addEventListener('click',async()=>{try{await fetch(`${supabaseUrl}/auth/v1/logout`,{method:'POST',headers:{apikey:publishableKey,Authorization:`Bearer ${session.access_token}`}})}finally{storeSession(null);location.reload()}});
$('#new-product-button').addEventListener('click',()=>openProduct());$('#close-dialog-button').addEventListener('click',()=>productDialog.close());$('#cancel-product-button').addEventListener('click',()=>productDialog.close());$('#delete-product-button').addEventListener('click',deleteProduct);productForm.addEventListener('submit',saveProduct);searchInput.addEventListener('input',renderProducts);statusFilter.addEventListener('change',renderProducts);$('#product-name').addEventListener('input',()=>{if(!$('#product-id').value)$('#product-slug').value=slugify($('#product-name').value)});
(async function init(){if(!supabaseUrl||!publishableKey){setStatus(loginStatus,'Falta configurar la conexión pública de Supabase.',true);return}const active=await ensureSession();if(!active)return;try{await showDashboard()}catch(error){setStatus(loginStatus,error.message,true);storeSession(null)}})();
