const { chromium } = require('playwright');
const fs = require('fs');
const pages = [
 ['home','https://sinisterdiesel.com/'],
 ['category','https://sinisterdiesel.com/air-intakes-parts-for-powerstroke.html'],
 ['product','https://sinisterdiesel.com/sinister-diesel-cold-air-intake-for-2001-2004-chevygmc-duramax-66l-lb7.html'],
 ['search','https://sinisterdiesel.com/search.html?Search=air+intake'],
 ['basket','https://sinisterdiesel.com/basket-contents.html'],
 ['account','https://sinisterdiesel.com/customer-account.html'],
 ['help','https://sinisterdiesel.com/help-center.html'],
 ['policy','https://sinisterdiesel.com/shipping-policies.html'],
 ['install','https://sinisterdiesel.com/install-instructions.html']
];
const branch='https://sinisterdiesel.com/?BranchKey=b5afdddae9601468481279b3c52b007d';
(async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 const page=await context.newPage();
 const consoleErrors=[];
 page.on('console',m=>{if(m.type()==='error') consoleErrors.push(m.text())});
 await page.goto(branch,{waitUntil:'domcontentloaded',timeout:60000}); await page.waitForTimeout(1500);
 const report=[];
 for(const [name,url] of pages){
  consoleErrors.length=0;
  let navError=null;
  try{await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForTimeout(2500);}catch(e){navError=e.message}
  const metrics=await page.evaluate(()=>{
   const visible=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.visibility!=='hidden'&&s.display!=='none'&&r.width>0&&r.height>0};
   const leaves=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,a,button,label,small,li,dt,dd,span,strong')].filter(e=>visible(e)&&e.innerText&&e.innerText.trim()&&e.children.length===0);
   const fam={}; for(const e of leaves){const f=getComputedStyle(e).fontFamily;fam[f]=(fam[f]||0)+1}
   const tiny=leaves.filter(e=>parseFloat(getComputedStyle(e).fontSize)<11).slice(0,20).map(e=>({tag:e.tagName,cls:e.className,text:e.innerText.trim().slice(0,60),size:getComputedStyle(e).fontSize,family:getComputedStyle(e).fontFamily}));
   const controls=[...document.querySelectorAll('button,input[type=submit],a.sd2-btn,a.sd2-v2-button,.c-button')].filter(visible).map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {tag:e.tagName,cls:e.className,text:(e.innerText||e.value||e.getAttribute('aria-label')||'').trim().slice(0,60),w:Math.round(r.width),h:Math.round(r.height),size:s.fontSize,family:s.fontFamily}});
   return {title:document.title,url:location.href,bodyClass:document.body.className,scrollHeight:document.documentElement.scrollHeight,overflowX:document.documentElement.scrollWidth-document.documentElement.clientWidth,fontFamilies:Object.entries(fam).sort((a,b)=>b[1]-a[1]).slice(0,12),tiny,undersizedControls:controls.filter(x=>x.h<40),controls:controls.slice(0,40)};
  });
  await page.evaluate(()=>scrollTo(0,0)); await page.waitForTimeout(300); await page.screenshot({path:`${name}-top.png`,fullPage:false});
  const max=await page.evaluate(()=>Math.max(0,document.documentElement.scrollHeight-innerHeight));
  await page.evaluate(y=>scrollTo(0,y),Math.floor(max*.55)); await page.waitForTimeout(600); await page.screenshot({path:`${name}-mid.png`,fullPage:false});
  await page.evaluate(y=>scrollTo(0,y),max); await page.waitForTimeout(600); await page.screenshot({path:`${name}-footer.png`,fullPage:false});
  report.push({name,navError,...metrics,consoleErrors:[...new Set(consoleErrors)].slice(0,15)});
  console.log(name,metrics.title,'tiny',metrics.tiny.length,'small controls',metrics.undersizedControls.length,'overflow',metrics.overflowX);
 }
 fs.writeFileSync('audit-report.json',JSON.stringify(report,null,2));
 await browser.close();
})();
