import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {browserQa} from '../tests/browser-helper.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),output=resolve(root,'output/pdf'),qa=resolve(root,'.qa/presentation');
mkdirSync(output,{recursive:true});mkdirSync(qa,{recursive:true});
const browser=await browserQa(qa);
try{
 const {send,evaluate}=browser;await send('Page.enable');
 const frame=(await send('Page.getFrameTree')).frameTree.frame.id;
 await send('Page.setDocumentContent',{frameId:frame,html:readFileSync(new URL('school-display-presentation.html',import.meta.url),'utf8')});
 await evaluate('document.fonts.ready');
 const geometry=await evaluate(`Array.from(document.querySelectorAll('.page')).map(page=>({language:page.lang,height:page.clientHeight,scrollHeight:page.scrollHeight,footer:page.querySelector('.footer').getBoundingClientRect().top-page.getBoundingClientRect().top,last:page.querySelector('.pilot').getBoundingClientRect().bottom-page.getBoundingClientRect().top}))`);
 if(geometry.some(page=>page.scrollHeight>page.height||page.last>page.footer-12))throw Error('Presentation content exceeds page budget: '+JSON.stringify(geometry));
 const pdf=await send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});
 writeFileSync(resolve(output,'School-Display-Presentation-AR-EN.pdf'),Buffer.from(pdf.data,'base64'));
 console.log(JSON.stringify({pages:geometry,output:resolve(output,'School-Display-Presentation-AR-EN.pdf')}));
}finally{await browser.close();}
