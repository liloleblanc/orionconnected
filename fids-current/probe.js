const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-proxy-server']});
  const p = await (await b.newContext({viewport:{width:1920,height:1080}})).newPage();
  await p.goto('http://127.0.0.1:8899/gids.html?ap=YQM&stream=1&gate=3', {waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForTimeout(5000);
  await p.evaluate(() => { try { loadDemo(); } catch(e){} });
  await p.waitForTimeout(9000);
  await p.evaluate(() => document.body.setAttribute('data-gate-airline','DL'));
  await p.waitForTimeout(700);
  const o = await p.evaluate(() => {
    const pick=s=>{const e=document.querySelector(s);return e?getComputedStyle(e).borderBottomColor:'absent';};
    return {
      'LONG left title ': pick('.g8-wrap .gad-aircraft-col .v2-fi-title'),
      'LONG right row  ': pick('.g8-wrap .gad-map-col-v2 .v2-rc-fi-pane .v2-rc-fi-trow:not(.v2-rc-fi-trow-last)'),
      'small word rule ': pick('.g8-wrap .gad-map-col-v2 .v2-rc-fi-tlbl span:first-child'),
      'small map stat  ': pick('.g8-wrap .gad-map-col-v2 .v2-rc-mstat .v2-rc-ms-lbl'),
    };
  });
  console.log(JSON.stringify(o,null,1));
  console.log('tag', await p.evaluate(()=>FIDS_BUILD_TAG));
  await b.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
