import { createClient } from '@supabase/supabase-js';
export function createCloud({url, key, redirectTo}) {
  if (!url || !key) return null;
  const client = createClient(url, key, {auth:{flowType:'pkce',detectSessionInUrl:false,persistSession:true,autoRefreshToken:true,storageKey:'glimpse-auth-v1'}});
  const result = async promise => { const {data,error} = await promise; if (error) throw error; return data; };
  return {
    auth: client.auth,
    redirectTo,
    async fetchCards() {
      const rows = await result(client.from('cards').select('id,version,payload').eq('published',true).order('id').abortSignal(AbortSignal.timeout(10000)));
      return rows.map(row=>({...row.payload,id:row.id,version:row.version}));
    },
    records: {
      async list(userId) { return result(client.from('personal_records').select('*').eq('user_id',userId).order('card_id').abortSignal(AbortSignal.timeout(10000))); },
      async apply(ops,userId) { return result(client.rpc('apply_record_ops',{p_user_id:userId,p_ops:ops}).abortSignal(AbortSignal.timeout(10000))); },
    },
  };
}
