// Exercise routing and theme controls with the generated feeds, without a browser dependency.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('assets/templates.js','utf8')+'\n'+fs.readFileSync('assets/app.js','utf8');
const feed=JSON.parse(fs.readFileSync('dist/data/sites/sample.json','utf8'));
const detail=JSON.parse(fs.readFileSync(`dist/data/posts/sample/${feed.entries[0].slug}.json`,'utf8'));
async function run(siteId='sample',saved='natural',settings={}){
  const events={},windowEvents={},storage=new Map([['markdown-cms-sample-theme',saved]]);
  const app={dataset:{mode:'site',siteId,default:siteId,themeSwitcher:'true',template:'natural',...settings},innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(name,fn)=>events[name]=fn};
  const html={style:{setProperty(){}},dataset:{}};
  const document={querySelector:()=>app,documentElement:html,baseURI:'https://example.org/',title:''};
  const location={hash:''};
  vm.runInNewContext(source,{document,location,URL,console,localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},window:{addEventListener:(name,fn)=>windowEvents[name]=fn,scrollTo(){}},fetch:async url=>({ok:true,json:async()=>url.pathname.includes('/posts/')?detail:url.pathname.includes('/sites/')?feed:{entries:[],sites:[]}})});
  const settle=async()=>{for(let i=0;i<15;i++)await Promise.resolve()};
  await settle();
  return {app,html,document,location,events,storage,windowEvents,settle};
}
(async()=>{
  const sample=await run();
  assert.match(sample.app.innerHTML,/data-theme-picker/);
  assert.match(sample.app.innerHTML,/Markdownで書いて/); // Sample home, not portal fallback.
  assert.doesNotMatch(sample.app.innerHTML,/統合ポータル|ONE TOWN, MANY STORIES/);
  assert.equal(sample.document.title,feed.site.name);
  assert.match(sample.app.innerHTML,/brandicon-sample/);
  for(const theme of ['apple','notion','dala','dope','natural']){
    sample.events.change({target:{matches:()=>true,value:theme}});
    assert.equal(sample.html.dataset.sampleTheme,theme);
    assert.equal(sample.storage.get('markdown-cms-sample-theme'),theme);
    await sample.settle();
    if(theme==='natural')assert.doesNotMatch(sample.app.innerHTML,/data-template=/);
    else assert.match(sample.app.innerHTML,new RegExp(`data-template="${theme}" data-page="home"`));
  }
  sample.location.hash=`#/post/sample/${feed.entries[0].slug}`;
  sample.windowEvents.hashchange();await sample.settle();
  assert.match(sample.app.innerHTML,/class="prose"/);
  assert.match(sample.app.innerHTML,/data-theme-picker/);
  for(const theme of ['apple','notion','dala','dope']){
    const demo=await run('sample',theme);
    demo.location.hash=`#/post/sample/${feed.entries[0].slug}`;
    demo.windowEvents.hashchange();await demo.settle();
    assert.match(demo.app.innerHTML,new RegExp(`data-template="${theme}" data-page="detail"`));
    assert.match(demo.app.innerHTML,/class="prose"/);
    demo.events.change({target:{matches:()=>true,value:'natural'}});await demo.settle();
    assert.doesNotMatch(demo.app.innerHTML,/data-template=/);
    assert.match(demo.app.innerHTML,/class="prose"/);
    assert.equal(demo.location.hash,`#/post/sample/${feed.entries[0].slug}`);
    demo.events.change({target:{matches:()=>true,value:theme}});await demo.settle();
    assert.match(demo.app.innerHTML,new RegExp(`data-template="${theme}" data-page="detail"`));
    demo.location.hash='#/about/sample';demo.windowEvents.hashchange();await demo.settle();
    assert.match(demo.app.innerHTML,new RegExp(`data-template="${theme}" data-page="about"`));
  }
  assert.equal((await run('sample','dope')).html.dataset.sampleTheme,'dope');
  assert.equal((await run('sample','invalid')).html.dataset.sampleTheme,'natural');
  const fixed=await run('sample','dope',{themeSwitcher:'false',template:'notion'});
  assert.doesNotMatch(fixed.app.innerHTML,/data-theme-picker|data-theme-source/);
  assert.doesNotMatch(fixed.app.innerHTML,/テーマを切り替えて/);
  assert.equal(fixed.html.dataset.sampleTheme,'notion');
  assert.match(fixed.app.innerHTML,/data-template="notion"/);
  fixed.events.change({target:{matches:()=>true,value:'apple'}});await fixed.settle();
  assert.equal(fixed.html.dataset.sampleTheme,'notion');
  fixed.location.hash=`#/post/sample/${feed.entries[0].slug}`;
  fixed.windowEvents.hashchange();await fixed.settle();
  assert.match(fixed.app.innerHTML,/data-template="notion" data-page="detail"/);
  assert.doesNotMatch(fixed.app.innerHTML,/data-theme-picker/);
  const natural=await run('sample','dope',{themeSwitcher:'false',template:'natural'});
  assert.doesNotMatch(natural.app.innerHTML,/data-theme-picker|data-template=/);
  assert.equal(natural.html.dataset.sampleTheme,'natural');
  const other=await run('bakery');
  assert.doesNotMatch(other.app.innerHTML,/data-theme-picker/);
  assert.equal(other.html.dataset.sampleTheme,undefined);
  console.log('Frontend routing, sample identity, theme switching and persistence: OK');
})().catch(error=>{console.error(error);process.exitCode=1});
