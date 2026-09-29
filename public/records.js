import { createFeedback } from './feedback.js';
const GUEST_KEY = 'glimpse-records-v1';
const TRANSFER_KEY = 'glimpse-guest-transfer-v1';
const accountKey = id => `glimpse-account-v1:${id}`;
const clone = value => structuredClone(value);
const metadata = card => ({id:card.id,title:card.title,topic:card.topic,parent:card.parent,version:card.version});
function empty(card) { return {...metadata(card),opens:0,reaction:null,lastOpenedAt:null,ratedAt:null,seenAt:null}; }
export function projectRecords(base, ops) {
  const rows = clone(base);
  for (const op of ops) {
    const old = rows[op.card.id] || empty(op.card);
    const row = rows[op.card.id] = {...old,...op.card};
    row.seenAt ||= old.lastOpenedAt || old.ratedAt || (op.kind === 'import' ? (op.seenAt || op.lastOpenedAt || op.ratedAt) : op.at) || null;
    if (op.kind === 'open') { row.opens++; row.lastOpenedAt=op.at; }
    if (op.kind === 'rate') { row.reaction=op.reaction; row.ratedAt=op.at; }
    if (op.kind === 'import') {
      row.opens+=op.opens;
      if (op.lastOpenedAt && (!row.lastOpenedAt || op.lastOpenedAt>row.lastOpenedAt)) row.lastOpenedAt=op.lastOpenedAt;
      if (!row.ratedAt && op.ratedAt) { row.reaction=op.reaction; row.ratedAt=op.ratedAt; }
    }
  }
  return rows;
}
function fromCloud(rows) {
  return Object.fromEntries(rows.map(row=>[row.card_id,{...row.metadata,id:row.card_id,opens:Number(row.opens),reaction:row.reaction,lastOpenedAt:row.last_opened_at,ratedAt:row.rated_at,seenAt:row.seen_at || row.last_opened_at || row.rated_at || null}]));
}
export function createRecords({storage, remote, onChange=()=>{}, uuid=()=>crypto.randomUUID(), now=()=>new Date().toISOString()}) {
  let user=null;
  let guest=createFeedback(storage,GUEST_KEY);
  const accounts=new Map(), flights=new Map();
  let transfer;
  try {transfer=JSON.parse(storage.getItem(TRANSFER_KEY)||'null');}catch{}
  function load(id) {
    if (!accounts.has(id)) {
      let saved; try { saved=JSON.parse(storage.getItem(accountKey(id)) || 'null'); } catch { /* Start in memory. */ }
      accounts.set(id,{base:saved?.base && typeof saved.base==='object'?saved.base:{},pending:Array.isArray(saved?.pending)?saved.pending:[],available:true,error:null,loaded:false});
    }
    return accounts.get(id);
  }
  function persist(id) {
    const state=load(id);
    try { storage.setItem(accountKey(id),JSON.stringify({base:state.base,pending:state.pending})); state.available=true; return true; }
    catch { state.available=false; return false; }
  }
  function recoverTransfer() {
    if(!transfer?.accountId || !Array.isArray(transfer.ops))return false;
    const state=load(transfer.accountId),known=new Set(state.pending.map(op=>op.op_id));
    for(const op of transfer.ops)if(!known.has(op.op_id))state.pending.push(op);
    if(!persist(transfer.accountId))return false;
    try {
      if(storage.getItem(GUEST_KEY)===transfer.rawGuest)guest.clear();
      if(storage.getItem(GUEST_KEY)!==transfer.rawGuest) {
        storage.removeItem(TRANSFER_KEY);transfer=null;
      }
    }catch{/* Keep the transfer journal until legacy data can be removed safely. */}
    return true;
  }
  function notify(id=user?.id) { if (id === user?.id) onChange(); }
  function values() { if (!user) return Object.fromEntries(guest.all().map(row=>[row.id,row])); const s=load(user.id); return projectRecords(s.base,s.pending); }
  function append(card,kind,extra={}) {
    if (!user) { if(kind==='seen')guest.see(card,extra.at); else if(kind==='open')guest.open(card); else guest.rate(card,extra.reaction); notify();return; }
    const id=user.id, state=load(id);
    state.pending.push({op_id:uuid(),kind,card:metadata(card),at:now(),...extra});
    persist(id);notify(id);void sync();
  }
  async function sync() {
    if (!user || !remote) return;
    const id=user.id;
    if (flights.has(id)) return flights.get(id);
    const task=(async()=>{
      const state=load(id);
      try {
        // Serialize each user's queue; never send it with a different user's session.
        do {
          if (user?.id!==id) return;
          const batch=state.pending.slice(0,100);
          const rows=batch.length?await remote.apply(batch,id):await remote.list(id);
          if (user?.id!==id) return;
          const completed=new Set(batch.map(op=>op.op_id));
          state.base=fromCloud(rows); state.pending=state.pending.filter(op=>!completed.has(op.op_id));
          state.error=null;state.loaded=true;persist(id);notify(id);
        } while(state.pending.length && user?.id===id);
      } catch { state.error='网络暂不可用，记录等待同步';notify(id); }
    })();
    flights.set(id,task);
    try { await task; } finally { flights.delete(id);notify(id); }
  }
  recoverTransfer();
  return {
    setUser(next) { user=next; if(user)load(user.id); onChange(); },
    get user(){return user;},
    get available(){return user?load(user.id).available:guest.available;},
    get status(){ if(!user)return guest.available?'记录保存在本机，登录可同步':'浏览器无法保存，记录仅在本次页面中'; const s=load(user.id); if(!s.available)return '本机无法保存，请保持页面开启直到同步完成'; if(s.pending.length)return `待同步 ${s.pending.length} 项${s.error?'，请检查网络':''}`;if(s.error)return '暂时无法读取云端记录，可重试';return s.loaded?'已同步':'正在读取云端记录'; },
    get pendingCount(){return user?load(user.id).pending.length:0;},
    get hasGuestRecords(){return !!user && !transfer && guest.all().length>0;},
    get(id){return clone(values()[id]);},
    all(){return Object.values(values()).map(clone);},
    hasSeen(id){const row=values()[id];return !!(row?.seenAt || row?.lastOpenedAt || row?.ratedAt || row?.opens>0);},
    see(card,at=now()){if(!this.hasSeen(card.id))append(card,'seen',{at});},
    open(card){append(card,'open');},
    rate(card,reaction){if(![null,'like','dislike'].includes(reaction))throw Error('Unknown reaction');append(card,'rate',{reaction});},
    sync,
    async mergeGuest() {
      if(!user || !guest.available)return false;
      if(transfer){const ok=recoverTransfer();notify();if(ok)await sync();return ok;}
      const rows=guest.all();if(!rows.length)return true;
      const id=user.id;
      const ops=rows.map(row=>({op_id:uuid(),kind:'import',card:metadata(row),at:now(),opens:row.opens,reaction:row.reaction,lastOpenedAt:row.lastOpenedAt,ratedAt:row.ratedAt,seenAt:row.seenAt}));
      try {
        transfer={accountId:id,rawGuest:storage.getItem(GUEST_KEY),ops};
        storage.setItem(TRANSFER_KEY,JSON.stringify(transfer));
      }catch{transfer=null;return false;}
      const ok=recoverTransfer();notify(id);
      if(ok)await sync();return ok;
    },
    async clear() {
      if(!user){guest.clear();notify();return true;}
      await sync();
      const id=user?.id;if(!id)return false;
      const s=load(id);
      if(s.pending.length){s.error='仍有待同步记录，暂不能清除缓存';notify(id);return false;}
      try { storage.removeItem(accountKey(id));s.available=true;s.base={};s.loaded=false; } catch {s.available=false;notify(id);return false;}
      notify(id);await sync();return true;
    },
  };
}
