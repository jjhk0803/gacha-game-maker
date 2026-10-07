// 가챠 게임 메이커 — 아이폰·웹 버전용 중계 서버 (Cloudflare Workers)
// 브라우저가 직접 부르지 못하는 AI 서비스만 이 서버를 거쳐요.
// 아래 ALLOW_ORIGIN을 내 GitHub Pages 주소로 바꾸면 다른 사이트는 이 서버를 못 써요.
const ALLOW_ORIGIN = 'https://jjhk0803.github.io';
const ALLOW_HOSTS = [
  'api.anthropic.com', 'generativelanguage.googleapis.com', 'aiplatform.googleapis.com', 'oauth2.googleapis.com',
  'api.openai.com', 'openrouter.ai', 'ollama.com', 'api.deepseek.com', 'image.novelai.net', 'api.fish.audio', 'api.elevenlabs.io',
  'raw.githubusercontent.com', 'api.github.com',
];
function cors(req) {
  return {
    'access-control-allow-origin': ALLOW_ORIGIN,
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': req.headers.get('access-control-request-headers') || '*',
    'access-control-expose-headers': '*',
    'access-control-max-age': '86400',
    'vary': 'origin',
  };
}
export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
    const origin = req.headers.get('origin') || '';
    if (origin && origin !== ALLOW_ORIGIN) return new Response('origin not allowed', { status: 403 });
    let target;
    try { target = new URL(new URL(req.url).searchParams.get('u')); } catch (e) { return new Response('bad url', { status: 400, headers: cors(req) }); }
    const ok = target.protocol === 'https:' && (ALLOW_HOSTS.includes(target.hostname) || target.hostname.endsWith('-aiplatform.googleapis.com'));
    if (!ok) return new Response('host not allowed', { status: 403, headers: cors(req) });
    const h = new Headers(req.headers);
    ['origin', 'referer', 'host', 'cookie', 'cf-connecting-ip', 'x-forwarded-for', 'x-real-ip'].forEach(k => h.delete(k));
    const r = await fetch(target, { method: req.method, headers: h, body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer(), redirect: 'follow' });
    const out = new Response(r.body, r);
    Object.entries(cors(req)).forEach(([k, v]) => out.headers.set(k, v));
    return out;
  },
};
