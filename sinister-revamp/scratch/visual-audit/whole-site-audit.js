const { chromium } = require('playwright');
const fs=require('fs'),path=require('path');
const branch='https://sinisterdiesel.com/?BranchKey=b5afdddae9601468481279b3c52b007d';
const localCss=process.env.SD2_AUDIT_CSS||'';
const pages=[
['home','https://sinisterdiesel.com/'],
['powerstroke','https://sinisterdiesel.com/ford-powerstroke-powerstroke-diesel-truck-parts-online.html'],
['duramax','https://sinisterdiesel.com/shop-gm-duramax-diesel-parts-sinister-diesel.html'],
['cummins','https://sinisterdiesel.com/dodge-cummins-diesel-performance-parts-sinister-diesel.html'],
['category-air','https://sinisterdiesel.com/air-intakes-parts-for-powerstroke.html'],
['category-fuel','https://sinisterdiesel.com/fuel-system-for-powerstroke.html'],
['category-merch','https://sinisterdiesel.com/merchandise-apparel-5534.html'],
['new-products','https://sinisterdiesel.com/new-products.html'],
['product-intake','https://sinisterdiesel.com/sinister-diesel-cold-air-intake-for-2001-2004-chevygmc-duramax-66l-lb7.html'],
['product-edge','https://sinisterdiesel.com/edge-insight-cts3.html'],
['product-filter','https://sinisterdiesel.com/sinister-diesel-bypass-oil-filter-system-for-1999-2003-ford-powerstroke-73l.html'],
['search-results','https://sinisterdiesel.com/search.html?Search=air+intake'],
['search-empty','https://sinisterdiesel.com/search.html?Search=zzzz-no-product-zzzz'],
['basket','https://sinisterdiesel.com/basket-contents.html'],
['account-login','https://sinisterdiesel.com/customer-account.html'],
['order-history','https://sinisterdiesel.com/order-history-list.html'],
['wishlist','https://sinisterdiesel.com/wish-list.html'],
['forgot-password','https://sinisterdiesel.com/forgot-password.html'],
['help-center','https://sinisterdiesel.com/help-center.html'],
['help-order','https://sinisterdiesel.com/help-check-order-status.html'],
['help-sales','https://sinisterdiesel.com/help-sales-inquiry.html'],
['help-tech','https://sinisterdiesel.com/help-sinister-diesel-parts-tech-support.html'],
['help-warranty','https://sinisterdiesel.com/help-warranty-inquiry.html'],
['help-account','https://sinisterdiesel.com/help-online-account-issues.html'],
['help-returns','https://sinisterdiesel.com/help-returns-exchanges.html'],
['help-protection','https://sinisterdiesel.com/help-shipping-protection-requests.html'],
['about','https://sinisterdiesel.com/about-us-19356.html'],
['reviews','https://sinisterdiesel.com/customer-reviews.html'],
['blog','https://sinisterdiesel.com/blog.html'],
['careers','https://sinisterdiesel.com/job-application-full.html'],
['install','https://sinisterdiesel.com/install-instructions.html'],
['shipping','https://sinisterdiesel.com/shipping-policies.html'],
['warranty','https://sinisterdiesel.com/warranty-information.html'],
['privacy','https://sinisterdiesel.com/privacy-policy.html'],
['returns-route','https://sinisterdiesel.com/return-and-warranty-policies.html'],
['race-notice','https://sinisterdiesel.com/race-parts-notice.html'],
['sinister-notice','https://sinisterdiesel.com/sinister-notice.html'],
['sponsor','https://sinisterdiesel.com/sponsor-application-19537.html'],
['dealer','https://sinisterdiesel.com/dealer-application.html'],
['authorized','https://sinisterdiesel.com/authorized-resellers.html'],
['genuine','https://sinisterdiesel.com/identifying-genuine-sinister-parts.html'],
['blue','https://sinisterdiesel.com/sinister-diesel-is-not-suing-over-blue.html'],
['terms','https://sinisterdiesel.com/policies-terms-conditions.html'],
['core-returns','https://sinisterdiesel.com/core-returns.html'],
['faq','https://sinisterdiesel.com/frequently-asked-questions.html'],
['sale','https://sinisterdiesel.com/sale-restrictions.html'],
['military','https://sinisterdiesel.com/military-discount.html'],
['rewards','https://sinisterdiesel.com/rewards.html'],
['news','https://sinisterdiesel.com/news-19612.html'],
['merchandise','https://sinisterdiesel.com/sinister-diesel-merchandise.html'],
['site-map','https://sinisterdiesel.com/site-map.html'],
['not-found','https://sinisterdiesel.com/definitely-not-a-real-page-v2-audit.html']
];
function sanitize(s){return s.replace(/[^a-z0-9_-]/gi,'_')}
async function inspect(page){return await page.evaluate(()=>{
 const visible=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&parseFloat(s.opacity)!==0&&r.width>0&&r.height>0};
 const leaves=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,a,button,label,small,li,dt,dd,span,strong')].filter(e=>visible(e)&&(e.innerText||'').trim()&&e.children.length===0);
 const legacyFonts=leaves.filter(e=>/(Play|Poppins|Barlow)/i.test(getComputedStyle(e).fontFamily)).slice(0,20).map(e=>({tag:e.tagName,cls:typeof e.className==='string'?e.className:'',text:e.innerText.trim().slice(0,60),font:getComputedStyle(e).fontFamily,size:getComputedStyle(e).fontSize}));
 const tiny=leaves.filter(e=>{const n=parseFloat(getComputedStyle(e).fontSize);return n>0&&n<9}).slice(0,20).map(e=>({tag:e.tagName,cls:typeof e.className==='string'?e.className:'',text:e.innerText.trim().slice(0,60),size:getComputedStyle(e).fontSize}));
 const brokenImages=[...document.images].filter(i=>visible(i)&&(!i.complete||i.naturalWidth===0)).map(i=>({src:i.currentSrc||i.src,alt:i.alt,cls:i.className})).slice(0,20);
 const controls=[...document.querySelectorAll('button,input[type=submit],a.sd2-btn,a.sd2-v2-button,.c-button')].filter(visible).map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{tag:e.tagName,cls:typeof e.className==='string'?e.className:'',text:(e.innerText||e.value||e.getAttribute('aria-label')||'').trim().slice(0,50),height:Math.round(r.height),cssHeight:s.height,minHeight:s.minHeight,transform:s.transform}});
 const ids=[...document.querySelectorAll('[id]')].map(e=>e.id).filter(Boolean),dups=[...new Set(ids.filter((x,i)=>ids.indexOf(x)!==i))];
 const text=document.body.innerText||'';
 return {title:document.title,finalUrl:location.href,statusBodyId:document.body.id,bodyClass:document.body.className,hasHeader:!!document.querySelector('.sd2-v2-hdr-root'),hasFooter:!!document.querySelector('.sd2-v2-footer'),hasMain:!!document.querySelector('main'),h1:[...document.querySelectorAll('h1')].filter(visible).map(e=>e.innerText.trim().slice(0,100)),overflowX:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth),scrollHeight:document.documentElement.scrollHeight,legacyFonts,tiny,brokenImages,undersizedControls:controls.filter(x=>x.height<40&&x.transform==='none').slice(0,20),duplicateIds:dups.slice(0,20),placeholders:[...new Set((text.match(/placeholder|lorem ipsum|coming soon|sample product|dummy data/gi)||[]))],fontsStatus:document.fonts.status};
 })}
(async()=>{
 const browser=await chromium.launch({headless:true});
 const outDir=path.join(process.cwd(),'whole-site');fs.mkdirSync(outDir,{recursive:true});
 let next=0,results=[];
 async function worker(i){
  const desktop=await browser.newContext({viewport:{width:1440,height:1000}}), mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true});
  const dp=await desktop.newPage(),mp=await mobile.newPage(); await dp.goto(branch);await mp.goto(branch);
  while(true){const idx=next++;if(idx>=pages.length)break;const[name,url]=pages[idx];let errors=[],status=null,navError=null;dp.removeAllListeners('console');dp.on('console',m=>{if(m.type()==='error')errors.push(m.text())});try{const resp=await dp.goto(url,{waitUntil:'domcontentloaded',timeout:45000});status=resp&&resp.status();if(localCss)await dp.addStyleTag({path:localCss});await dp.evaluate(()=>document.fonts.ready);await dp.waitForTimeout(localCss?2500:900);await dp.evaluate(()=>scrollTo(0,0));await dp.screenshot({path:path.join(outDir,`${sanitize(name)}-desktop.png`)});const metrics=await inspect(dp);const mresp=await mp.goto(url,{waitUntil:'domcontentloaded',timeout:45000});if(localCss)await mp.addStyleTag({path:localCss});await mp.evaluate(()=>document.fonts.ready);await mp.waitForTimeout(localCss?2500:700);await mp.evaluate(()=>scrollTo(0,0));await mp.screenshot({path:path.join(outDir,`${sanitize(name)}-mobile.png`)});const mobileMetrics=await inspect(mp);results[idx]={name,url,status,mobileStatus:mresp&&mresp.status(),...metrics,mobile:{overflowX:mobileMetrics.overflowX,legacyFonts:mobileMetrics.legacyFonts,tiny:mobileMetrics.tiny,brokenImages:mobileMetrics.brokenImages,undersizedControls:mobileMetrics.undersizedControls,h1:mobileMetrics.h1},consoleErrors:[...new Set(errors)].slice(0,12)};console.log(`${idx+1}/${pages.length}`,name,status,'legacy',metrics.legacyFonts.length,'mobOverflow',mobileMetrics.overflowX);}catch(e){navError=e.message;results[idx]={name,url,status,navError};console.log('ERR',name,e.message)}}
  await desktop.close();await mobile.close();
 }
 await Promise.all([0,1,2,3].map(worker));
 fs.writeFileSync(path.join(outDir,'report.json'),JSON.stringify(results,null,2));
 await browser.close();
})();
