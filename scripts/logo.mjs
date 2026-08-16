import puppeteer from "puppeteer-core";
const b=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:true});
const p=await b.newPage();
await p.setViewport({width:1280,height:300,deviceScaleFactor:2});
await p.goto("http://localhost:3000/venues",{waitUntil:"networkidle2"});
await p.screenshot({path:"/tmp/logo-crop.png",clip:{x:70,y:0,width:420,height:150}});
await b.close();
