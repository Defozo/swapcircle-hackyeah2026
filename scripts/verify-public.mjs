import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const url=process.argv[2] || 'https://defozo.github.io/swapcircle-hackyeah2026/';
if(new URL(url).protocol!=='https:')throw new Error('Public acceptance requires HTTPS');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1050},locale:'pl-PL'});
const page=await context.newPage();
const pageErrors=[], failedAssets=[];
page.on('pageerror',error=>pageErrors.push(error.message));
page.on('response',response=>{if(response.url().startsWith(url)&&response.status()>=400)failedAssets.push({url:response.url(),status:response.status()});});
mkdirSync('docs/evidence',{recursive:true});
try{
 const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
 expect(response.status()).toBe(200);
 await expect(page.getByRole('heading',{name:'Dobre wymiany łączą ludzi.'})).toBeVisible({timeout:60000});
 await page.getByRole('button',{name:'Zobacz przykład',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByRole('table')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Odzyskiwanie',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Twoje środki. Twoje prawo do zwrotu.'})).toBeVisible();
 await page.getByRole('button',{name:'Tablica ofert',exact:true}).click();
 await page.screenshot({path:'docs/evidence/public-desktop.png',fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:390,height:844});
 // Wait for the responsive sidebar transition before judging the mobile layout.
 await page.getByRole('button',{name:'Otwórz menu',exact:true}).click();
 await page.getByRole('button',{name:'Odzyskiwanie',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Twoje środki. Twoje prawo do zwrotu.'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'docs/evidence/public-mobile.png',fullPage:true,animations:'disabled'});
 await page.locator('.language-button').click();
 await expect(page.getByRole('heading',{name:'Your funds. Your right to a refund.'})).toBeVisible();
 await expect(page.getByText('A refund returns the deposited tokens. Network fees and lost opportunities are not reimbursed.',{exact:true})).toBeVisible();
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 await expect(page.getByRole('heading',{name:'Your funds. Your right to a refund.'})).toBeVisible();
 await page.screenshot({path:'docs/evidence/public-mobile-en.png',fullPage:true,animations:'disabled'});
 const manifestResponse=await context.request.get(new URL('deployments/devnet.json',url).href);
 expect(manifestResponse.status()).toBe(200);
 const manifest=await manifestResponse.json();
 expect(pageErrors).toEqual([]);
 expect(failedAssets).toEqual([]);
 const report={verifiedAt:new Date().toISOString(),url,freshBrowserContext:true,authenticationUsed:false,loaded:true,navigationVerified:true,languages:['pl','en'],englishRecoveryTermsVerified:true,languagePersistsAfterReload:true,mobileOverflow:false,pageErrors,failedAssets,manifest:{cluster:manifest.cluster,programId:manifest.programId,deployed:manifest.deployed},financialFlowVerified:false};
 writeFileSync('docs/evidence/public-web.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
