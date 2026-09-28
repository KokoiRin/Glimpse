// Consume the PKCE callback before the page controller changes browser history.
export async function initializeAuth({auth, url, replaceUrl, onUser}) {
  let error = null;
  const callback = new URL(url);
  const code = callback.searchParams.get('code');
  const fragment = new URLSearchParams(callback.hash.slice(1));
  const rejected = callback.searchParams.has('error') || fragment.has('error');
  try {
    if (rejected) throw Error('登录未完成，你仍可以继续浏览。');
    if (code) {
      const response = await auth.exchangeCodeForSession(code);
      if (response.error) throw response.error;
    }
  } catch { error = '登录未完成，请重新尝试。你的本机记录仍然保留。'; }
  if (code || rejected) {
    for (const key of ['code','error','error_code','error_description','state']) callback.searchParams.delete(key);
    if (fragment.has('error')) callback.hash = '';
    replaceUrl(callback.pathname + callback.search + callback.hash);
  }
  const session = await auth.getSession();
  if (session.error) error = '暂时无法恢复登录，请重新登录。';
  onUser(session.data?.session?.user ?? null);
  const {data} = auth.onAuthStateChange((_event, current)=>onUser(current?.user ?? null));
  return {error,unsubscribe:()=>data.subscription.unsubscribe()};
}
