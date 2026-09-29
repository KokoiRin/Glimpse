import { createCatalog } from './catalog.js';
import { createCloud } from './cloud.js';
import { createRecords } from './records.js';
import { initializeAuth } from './auth.js';
import { createFeed, swipeDirection } from './navigation.js';

// This page owns the finite feed. Seen/open/rating records sync; detailed events stay local.
const main = document.querySelector('#main');
const dialog = document.querySelector('#about');
let KEY = 'rin-glimpse-events-v1';
let cards = [], roundRequest = 0, accountId = null, booted = false;
const dismissedMerges = new Set();
const cloud = createCloud({url:__SUPABASE_URL__,key:__SUPABASE_KEY__,redirectTo:new URL('./',location.href).href});
const menuDialog = document.querySelector('#menu-dialog');
const historyDialog = document.querySelector('#history-dialog');
// Storage can be denied even when the page itself is usable.
const storage = {getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)};
const catalog = createCatalog({storage,fetchCards:()=>cloud ? cloud.fetchCards() : Promise.reject(Error('未配置云端'))});
const feedback = createRecords({storage,remote:cloud?.records,onChange:refreshAccountUI});
let historyFilter = 'seen';
const session = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
let events = [], storageAvailable = true;
try { const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]'); events = Array.isArray(saved) ? saved.filter(e => e && typeof e.action === 'string').slice(-2000) : []; } catch { storageAvailable = false; }
let energy = 'low', feed, current, view = 'feed', activeSince = performance.now(), elapsed = 0;
let pointerStart, pendingImpression;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const byId = id => document.getElementById(id);
const on = (id, fn) => byId(id)?.addEventListener('click', fn);
function pauseClock() { if (activeSince !== null) elapsed += performance.now() - activeSince; activeSince = null; }
function resumeClock() { if (activeSince === null && !document.hidden && !dialog.open && !historyDialog.open && !menuDialog.open) activeSince = performance.now(); }
function record(action, extra = {}) {
  pauseClock();
  events.push({session, cardId:current?.id ?? null, type:current?.type ?? null, action, energy, at:new Date().toISOString(), activeMs:Math.round(elapsed), ...extra});
  events = events.slice(-2000);
  try { localStorage.setItem(KEY, JSON.stringify(events)); storageAvailable = true; } catch { storageAvailable = false; }
  elapsed = 0; resumeClock();
}
function focusHeading() { const heading = main.querySelector('h1,h2'); if (heading) { heading.tabIndex = -1; heading.focus({preventScroll:true}); } window.scrollTo(0,0); }
function art(card) {
 const common = '<svg viewBox="0 0 360 310" preserveAspectRatio="xMidYMid slice" aria-hidden="true">';
 let body;
 if(card.art==='graph')body='<rect width="360" height="310" fill="#dce5d8"/><path d="M75 150L166 95L271 178L166 214L166 95" fill="none" stroke="#72917b" stroke-width="3"/><g fill="#416b54"><circle cx="75" cy="150" r="24"/><circle cx="166" cy="95" r="29"/><circle cx="271" cy="178" r="25"/><circle cx="166" cy="214" r="17"/></g><circle cx="166" cy="95" r="10" fill="#ead9a6"/>';
 else if(card.art==='math')body='<rect width="360" height="310" fill="#e3e2d2"/><circle cx="113" cy="139" r="60" fill="none" stroke="#63846d" stroke-width="2"/><circle cx="217" cy="139" r="60" fill="none" stroke="#63846d" stroke-width="2"/><path d="M78 222H256M238 213L256 222L238 231" fill="none" stroke="#416b54" stroke-width="2"/><text x="165" y="149" font-size="36" text-anchor="middle" fill="#416b54">∘</text>';
 else if(card.art==='rain')body='<rect width="360" height="310" fill="#b9c9c0"/><rect x="98" y="54" width="167" height="240" rx="75" fill="#657e72"/><path d="M181 70V294M109 168H256" stroke="#d6d9bf" stroke-width="6"/><path d="M40 50l-9 34m46 38l-9 34m235-95l-9 34m14 99l-9 34" stroke="#edf0df" stroke-width="2"/>';
 else if(card.energy==='low')body='<rect width="360" height="310" fill="#c9d8cc"/><circle cx="251" cy="84" r="36" fill="#f5dfa3"/><path d="M-50 272Q90 80 230 259L400 310H0" fill="#879f86"/><path d="M88 310Q230 153 399 212V320" fill="#4e7564"/>';
 else body='<rect width="360" height="310" fill="#d9e0d1"/><rect x="103" y="41" width="157" height="230" rx="23" fill="#466754"/><rect x="116" y="59" width="131" height="190" rx="13" fill="#f7f2dc"/><rect x="132" y="93" width="91" height="30" rx="9" fill="#bacbad"/><rect x="132" y="137" width="70" height="30" rx="9" fill="#e0cea1"/><rect x="132" y="181" width="91" height="30" rx="9" fill="#8ba88d"/>';
 return `${common}${body}</svg><span class="art-label">${card.energy==='high'?'一点好奇':'一点留白'}</span>`;
}
async function startRound() {
 const request = ++roundRequest;
 view='loading';
 main.className='end-view'; main.innerHTML='<section class="end"><p role="status">正在准备这一轮内容…</p></section>';
 const [loaded] = await Promise.all([catalog.load({userId:accountId}),feedback.sync()]);
 if(request !== roundRequest)return;
 cards = loaded.cards;
 byId('catalog-status').textContent = loaded.error ? (loaded.stale?'当前展示上次保存的内容。':'')+loaded.error : '';
 byId('catalog-notice').textContent=byId('catalog-status').textContent;
 byId('catalog-notice').hidden=!loaded.error;
 byId('retry-content').hidden = !loaded.error;
 byId('sources').innerHTML=cards.map(c=>`<p><strong>${escape(c.title.replace('\n',''))}</strong><br>${escape(c.source)}</p>`).join('');
 const previousId = current?.id ?? [...events].reverse().find(e => e.action === 'impression')?.cardId;
 // Recover retained legacy impressions under the current guest/account scope only.
 const legacySeen=new Map(events.filter(e=>e.action==='impression').map(e=>[e.cardId,e.at]));
 for(const card of cards)if(legacySeen.has(card.id))feedback.see(card,legacySeen.get(card.id));
 const seenIds=new Set(cards.filter(card=>feedback.hasSeen(card.id)).map(card=>card.id));
 feed = createFeed(cards.filter(card=>feedback.get(card.id)?.reaction!=='dislike'), { energy, previousId, seenIds });
 showCard();
}
function showCard(revisit = false) {
 current = feed.current;
 if (!current) { end(); return; }
 view = 'feed'; pendingImpression={revisit}; renderFeed(); markVisibleCard();
}
function markVisibleCard() {
 if(current && view==='feed' && !document.hidden && !dialog.open && !historyDialog.open && !menuDialog.open){
  if(pendingImpression){record('impression',pendingImpression);pendingImpression=null;}
  feedback.see(current);
 }
}
function nextCard() {
 record('next');
 if (!feed.next()) { end(); return; }
 showCard(); focusHeading();
}
function previousCard() {
 if (!feed?.hasPrevious) return;
 record('previous'); feed.previous(); showCard(true); focusHeading();
}
function renderFeed() {
 main.className='feed-view';
 const c=current;
 const known=feedback.get(c.id);
 pointerStart=null;
 main.innerHTML=`<div class="feed-toolbar"><h1 class="feed-brand">Glimpse</h1><span class="feed-caption">${energy==='low'?'随手放松一下':'一点好奇，一点留白'}</span></div><article class="card" aria-label="${escape(c.title.replace('\n',''))}"><div class="visual">${art(c)}</div><div class="card-content"><div class="meta"><span>${c.type}</span><span>${c.time}</span>${known?.opens?'<span>点开过</span>':feedback.hasSeen(c.id)?'<span>浏览过</span>':''}</div><p class="concept-path">${escape(c.parent)}</p><h2>${escape(c.title)}</h2><p class="teaser">${escape(c.teaser)}</p><button class="primary" id="open">${escape(c.action)} <span aria-hidden="true">↗</span></button></div><div class="card-tools"><button class="quiet arrow" id="previous" aria-label="上一张" ${feed.hasPrevious?'':'disabled'}>←</button>${feedbackControls()}<button class="quiet arrow" id="skip" aria-label="下一张">→</button></div></article>`;
 bindFeedback();
 on('open',()=>{feedback.open(c);record('open');view='trial';history.pushState({trial:true},'','#try');renderTrial();focusHeading();});
 on('skip',nextCard); on('previous',previousCard);
 const surface=main.querySelector('.card');
 let suppressClick=false;
 surface.addEventListener('pointerdown', event => {
  if (event.isPrimary === false || event.button !== 0) return;
  suppressClick=false;
  pointerStart = { x:event.clientX, y:event.clientY, id:event.pointerId, interactive:!!event.target.closest('button,a') };
  if(!pointerStart.interactive)surface.setPointerCapture?.(event.pointerId);
 });
 surface.addEventListener('pointerup', event => {
  if (!pointerStart || event.pointerId !== pointerStart.id) return;
  const direction = swipeDirection(pointerStart, { x:event.clientX, y:event.clientY });
  const interactive=pointerStart.interactive;
  suppressClick=Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>12;
  pointerStart = null;
  if(interactive)return;
  if (view !== 'feed' || dialog.open || historyDialog.open || menuDialog.open) return;
  if (direction === 'next') nextCard();
  if (direction === 'previous') previousCard();
 });
 surface.addEventListener('pointercancel', () => { pointerStart = null; suppressClick=true; });
 surface.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopPropagation();suppressClick=false;}},true);

}
function renderTrial() {
 main.className='trial-view';
 const c=current;
 main.innerHTML=`<article class="trial"><button class="quiet back" id="back">← 回到卡片</button><p class="eyebrow">${c.type} / ${c.time}</p><p class="concept-path">${escape(c.parent)}</p><h2>${escape(c.trialTitle)}</h2><p class="prose">${escape(c.trial)}</p>${c.widget||c.choices?'<div class="widget" id="widget"></div>':''}<div class="trial-actions"><button class="primary" id="continue">${escape(c.moreTitle)} <span aria-hidden="true">↓</span></button></div><div id="more"></div>${feedbackControls()}<p class="source">${escape(c.source)}${c.link?`<br><a href="${c.link}" target="_blank" rel="noopener noreferrer" id="external">${c.linkLabel} ↗</a>`:''}</p></article>`;
 bindFeedback();
 on('back',()=>history.back());
 on('continue',()=>{record('continue');byId('more').innerHTML=`<section class="more"><h3>${escape(c.moreTitle)}</h3><p>${escape(c.more)}</p></section>`;byId('continue').disabled=true;byId('continue').textContent='已经展开在下面';byId('more').scrollIntoView({block:'nearest',behavior:'auto'});});
 on('external',()=>record('external_open'));
 renderWidget(c.widget);
 if(c.choices) renderChoices(c.choices);
}
function renderWidget(kind) {
 const w=byId('widget');if(!w)return;
 if(kind==='reachability'){
  let connected=true;
  w.innerHTML='<div class="graph-demo"><span>根</span><b id="root-edge">→</b><span id="object-a">A</span><b>⇄</b><span id="object-b">B</span></div><button class="secondary" id="cut-reference">移除根到 A 的引用</button><p class="widget-status" id="graph-status" aria-live="polite">从根出发，可以走到 A，再走到 B。</p>';
  on('cut-reference',()=>{connected=!connected;byId('root-edge').textContent=connected?'→':'×';byId('object-a').classList.toggle('unreachable',!connected);byId('object-b').classList.toggle('unreachable',!connected);byId('cut-reference').textContent=connected?'移除根到 A 的引用':'重新连接根与 A';byId('graph-status').textContent=connected?'从根出发，可以走到 A，再走到 B。':'A 与 B 仍互相引用，但从根出发已到不了它们。它们可以成为回收对象。';});
 }else if(kind==='queue'){
  let n=0;
  w.innerHTML='<div class="queue"><span>① 当前的耗时工作</span><span>② 等待处理的点击</span><span>③ 随后的界面更新</span></div><button class="secondary" id="step">处理下一项</button><p class="widget-status" id="queue-status" aria-live="polite">先处理当前工作。</p>';
  on('step',()=>{if(n===3){n=0;w.querySelectorAll('.queue span').forEach(s=>s.classList.remove('done'));byId('step').textContent='处理下一项';byId('queue-status').textContent='先处理当前工作。';return;}w.querySelectorAll('.queue span')[n++].classList.add('done');byId('queue-status').textContent=['当前工作结束，才轮到点击。','点击已处理，接着更新界面。','这三项都处理过了。'][n-1];if(n===3)byId('step').textContent='再看一次';});
 }
}
function renderChoices(choices) {
 const w = byId('widget');
 w.innerHTML = `<div class="choices">${choices.map((choice,index)=>`<button class="secondary" id="choice-${index}" aria-pressed="false">${escape(choice.label)}</button>`).join('')}</div><p class="widget-status" id="choice-result" aria-live="polite">点一下，看看另一层。</p>`;
 choices.forEach((choice,index)=>on(`choice-${index}`,()=>{
  byId('choice-result').textContent = choice.reply;
  choices.forEach((_,other)=>byId(`choice-${other}`).setAttribute('aria-pressed',String(index===other)));
 }));
}

function feedbackControls() {
 const reaction=feedback.get(current.id)?.reaction;
 return `<div class="feedback" aria-label="这张卡的反馈"><button class="quiet" id="like" aria-pressed="${reaction==='like'}">♡ 有意思</button><button class="quiet" id="dislike" aria-pressed="${reaction==='dislike'}">不感兴趣</button><span class="feedback-note" id="feedback-note" role="status">${reaction==='like'?'已标记喜欢':reaction==='dislike'?'下轮不再主动推荐':''}</span></div>`;
}
function bindFeedback() {
 for(const reaction of ['like','dislike'])on(reaction,()=>{
  const next=feedback.get(current.id)?.reaction===reaction?null:reaction;
  feedback.rate(current,next);record(next||'feedback_clear');
  byId('like').setAttribute('aria-pressed',String(next==='like'));byId('dislike').setAttribute('aria-pressed',String(next==='dislike'));
  byId('feedback-note').textContent=feedback.available?(next==='like'?'已标记喜欢':next==='dislike'?'下轮不再主动推荐':'已取消标记'):'本次已标记，但浏览器暂时不能保存';
 });
}
function renderRecords() {
 const labels={seen:'浏览过',opened:'点开过',like:'喜欢',dislike:'不感兴趣'};
 byId('record-tabs').innerHTML=Object.entries(labels).map(([key,label])=>`<button class="quiet" id="filter-${key}" aria-pressed="${key===historyFilter}">${label}</button>`).join('');
 Object.keys(labels).forEach(key=>on(`filter-${key}`,()=>{historyFilter=key;renderRecords();}));
 const rows=feedback.all().filter(row=>historyFilter==='seen'?feedback.hasSeen(row.id):historyFilter==='opened'?row.opens>0:row.reaction===historyFilter).sort((a,b)=>(b.ratedAt||b.lastOpenedAt||b.seenAt||'').localeCompare(a.ratedAt||a.lastOpenedAt||a.seenAt||''));
 byId('record-list').innerHTML=rows.length?rows.map(row=>`<div class="record-row"><button class="record-title" id="record-${escape(row.id)}" ${cards.some(c=>c.id===row.id)?'':'disabled'}>${escape(row.title.replace('\n',''))}</button><p>${escape(row.parent)}${cards.some(c=>c.id===row.id)?'':' · 内容已下架或暂不可用'} · ${row.opens?'点开过':'浏览过，尚未展开'}${row.reaction==='like'?' · 喜欢':row.reaction==='dislike'?' · 不感兴趣':''}</p>${row.reaction?`<button class="quiet" id="unrate-${escape(row.id)}">取消标记</button>`:''}</div>`).join(''):'<p class="empty-records">这里暂时没有记录。遇到感兴趣的内容，再慢慢留下就好。</p>';
 rows.forEach(row=>{
  const card=cards.find(c=>c.id===row.id);
  on(`unrate-${row.id}`,()=>{feedback.rate(card||row,null);renderRecords();});
  on(`record-${row.id}`,()=>{
   if(!card)return;
   energy=accountId?'any':'low';refreshAccountUI();feed=createFeed(cards,{firstId:card.id});current=feed.current;
   historyDialog.close();feedback.open(current);record('open',{from:'records'});
   if(view!=='trial')history.pushState({trial:true},'','#try');view='trial';renderTrial();focusHeading();
  });
 });
}

function end() {
 if(view!=='end')record('deck_end',{from:view});
 main.className='end-view';
 view='end'; history.replaceState(null,'',location.pathname);
 main.innerHTML=`<section class="end"><div class="symbol" aria-hidden="true">✳</div><p class="eyebrow">留白也是一种选择</p><h2>${cards.length?'这几张，先到这里。':'暂时没有可浏览的内容。'}</h2><p>这轮可看的卡片到这里了。也可以从右上角菜单里的“我的记录”找回之前的内容。<br>现在可以直接关掉这一页。</p>${feed?.current?'<button class="quiet" id="return-last">← 回看最后一张</button><br>':''}<button class="secondary" id="restart">再随便看看 ↗</button></section>`;
 on('restart',()=>{startRound();focusHeading();});on('return-last',()=>{showCard(true);focusHeading();});focusHeading();
}
window.addEventListener('keydown',event=>{
 if(view!=='feed'||dialog.open||historyDialog.open||menuDialog.open||event.altKey||event.metaKey||event.ctrlKey||event.shiftKey||event.target?.closest?.('input,textarea,select,[contenteditable]'))return;
 if(event.key==='ArrowLeft'){event.preventDefault();previousCard();}
 if(event.key==='ArrowRight'){event.preventDefault();nextCard();}
});
window.addEventListener('popstate',()=>{if(view==='trial'){record('back');view='feed';renderFeed();focusHeading();}});
window.addEventListener('pagehide',()=>{if(view!=='end')record('page_leave',{from:view});pauseClock();});
window.addEventListener('pageshow',()=>{resumeClock();void feedback.sync();});
window.addEventListener('online',()=>{void feedback.sync();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(view!=='end')record('background',{from:view});pauseClock();}else {resumeClock();markVisibleCard();void feedback.sync();}});
on('menu-toggle',()=>{pauseClock();menuDialog.showModal();});
menuDialog.addEventListener('close',()=>{resumeClock();markVisibleCard();});
on('records',()=>{menuDialog.close();pauseClock();renderRecords();historyDialog.showModal();});
function refreshFeedbackAfterDialog() {
 if(view==='feed' && current)renderFeed();
 if(view==='trial'){const reaction=feedback.get(current.id)?.reaction;byId('like')?.setAttribute('aria-pressed',String(reaction==='like'));byId('dislike')?.setAttribute('aria-pressed',String(reaction==='dislike'));if(byId('feedback-note'))byId('feedback-note').textContent=reaction==='like'?'已标记喜欢':reaction==='dislike'?'下轮不再主动推荐':'';}
 resumeClock();markVisibleCard();
}
historyDialog.addEventListener('close',refreshFeedbackAfterDialog);
on('data',()=>{menuDialog.close();pauseClock();dialog.showModal();refreshAccountUI();});
dialog.addEventListener('close',refreshFeedbackAfterDialog);
let exportUrl;
on('export',()=>{
 const serialized=JSON.stringify({version:2,exportedAt:new Date().toISOString(),records:feedback.all(),catalog:cards.map(({id,version,title,topic,parent,type})=>({id,version,title,topic,parent,type})),events},null,2);
 if(exportUrl)URL.revokeObjectURL(exportUrl);
 exportUrl=URL.createObjectURL(new Blob([serialized],{type:'application/json'}));
 byId('export-preview').innerHTML='<label for="event-json">试用记录（可全选复制）</label><textarea id="event-json" readonly rows="7"></textarea><a class="secondary" id="download-json" download="Glimpse-试用记录.json">下载 JSON 文件 ↗</a>';
 byId('event-json').value=serialized;byId('download-json').href=exportUrl;
});
on('clear',async()=>{
 const cleared = await feedback.clear();
 if(!cleared){byId('storage-status').textContent='仍有未同步记录或本机存储不可用，缓存没有清除。';return;}
 events=[];byId('export-preview').replaceChildren();
 if(exportUrl){URL.revokeObjectURL(exportUrl);exportUrl=null;}
 try{localStorage.removeItem(KEY);storageAvailable=true;}catch{storageAvailable=false;}
 byId('storage-status').textContent=feedback.user?'本机缓存已清理。云端记录仍保留，同步后会重新显示。':'已清除本机记录。之后的新操作会重新开始记录。';
});

function refreshAccountUI() {
 const user=feedback.user;
 byId('account-name').textContent=user?`当前账号：${user.email || 'Google 用户'}`:'登录后，可在不同设备同步记录';
 byId('account-status').textContent=feedback.status;
 byId('login').hidden=!!user;
 byId('logout').hidden=!user;
 byId('sync').hidden=!user;
 byId('relax').hidden=!user;
 byId('relax').setAttribute('aria-pressed',String(energy==='low'));
 byId('relax').textContent=energy==='low'?'加入知识卡':'只看轻松内容';
 byId('content-scope').textContent=user?'计算机、数学与轻松内容，都在这里。':'无需登录，可以浏览全部轻松内容。';
 byId('guest-merge').hidden=!feedback.hasGuestRecords || dismissedMerges.has(user?.id);
 byId('records-note').textContent=user?'浏览过、点开和评价保存在你的账号中；浏览或点开不等于喜欢。':'记录目前保存在本机，登录后可以选择合并到账号。';
 byId('clear').textContent=user?'清除本机缓存':'清除本机记录';
 byId('storage-status').textContent=feedback.status+(user?'。操作明细仍仅保存在本机；清除缓存不会删除云端记录。':'。操作明细最多保留最近 2,000 条。');
 if(current && byId('like')) {
  const reaction=feedback.get(current.id)?.reaction;
  byId('like').setAttribute('aria-pressed',String(reaction==='like'));
  byId('dislike').setAttribute('aria-pressed',String(reaction==='dislike'));
  byId('feedback-note').textContent=reaction==='like'?'已标记喜欢':reaction==='dislike'?'下轮不再主动推荐':'';
 }
 if(historyDialog.open)renderRecords();
}
function changeUser(user) {
 const next=user?.id ?? null;
 const changed=next!==accountId;
 if(changed) {
  ++roundRequest;view='loading';cards=[];current=null;feed=null;
  main.className='end-view';main.innerHTML='<section class="end"><p role="status">正在准备内容…</p></section>';
  byId('sources').replaceChildren();historyDialog.close();dialog.close();
  history.replaceState(null,'',location.pathname);
  energy=next?'any':'low';
  accountId=next;
  byId('export-preview').replaceChildren();
  if(exportUrl){URL.revokeObjectURL(exportUrl);exportUrl=null;}
  KEY=next?`glimpse-events-v2:${next}`:'rin-glimpse-events-v1';
  try {const saved=JSON.parse(storage.getItem(KEY)||'[]');events=Array.isArray(saved)?saved.slice(-2000):[];}catch{events=[];}
 }
 feedback.setUser(user);
 void feedback.sync();
 if(changed && booted)void startRound();
}
on('login',async()=>{
 if(!cloud){byId('account-status').textContent='登录尚未配置，请稍后重试。';return;}
 byId('login').disabled=true;
 try {
  const {error}=await cloud.auth.signInWithOAuth({provider:'google',options:{redirectTo:cloud.redirectTo,scopes:'openid email profile'}});
  if(error)throw error;
 }catch{byId('account-status').textContent='暂时无法打开 Google 登录，请稍后重试。';byId('login').disabled=false;}
});
on('logout',async()=>{
 changeUser(null);
 const {error}=await cloud.auth.signOut({scope:'local'});
 if(error)byId('account-status').textContent='退出请求失败，请重试或关闭当前页面。';
});
on('sync',()=>{void feedback.sync();});
on('merge',async()=>{
 byId('merge').disabled=true;
 const ok=await feedback.mergeGuest();
 byId('merge').disabled=false;refreshAccountUI();
 if(!ok)byId('account-status').textContent='浏览器无法安全保存合并记录，请先导出本机记录。';
});
on('merge-later',()=>{dismissedMerges.add(feedback.user?.id);refreshAccountUI();});
on('retry-content',()=>{void startRound();});
on('relax',()=>{
 if(!accountId)return;
 energy=energy==='low'?'any':'low';record('context_change',{to:energy});
 menuDialog.close();refreshAccountUI();void startRound();
});

async function boot() {
 refreshAccountUI();
 if(cloud) {
  try {
   const result=await initializeAuth({auth:cloud.auth,url:location.href,replaceUrl:path=>history.replaceState(null,'',path),onUser:changeUser});
   if(result.error)byId('auth-notice').textContent=result.error;
  }catch{byId('auth-notice').textContent='暂时无法恢复登录，你仍可以浏览；请在菜单中重试登录。';}
 }
 // The callback has been handled; a reload starts a new, finite visit.
 history.replaceState(null,'',location.pathname);
 booted=true;
 await startRound();
}
export const ready = boot();
