/**
 * functions/[[path]].js — Warung • Cloudflare Pages Functions
 * ═══════════════════════════════════════════════════════════════
 * VERSION: v28.0 — "NO-KV: pure in-memory caching, zero KV dependency"
 * AUTHOR:  dukunseo.com
 * 
 *  - Routing LENGKAP: home, view, album, search, tag, category, static pages, sitemap, RSS
 *  - Ads: HTML slot custom + AdSense, mobile/desktop aware
 *  - SEO: SeoHelper lengkap, JSON-LD, OG, breadcrumb, sitemap moon-phase
 *  - Anti-bot: Digital DNA (bot only), Ghost Body, CSS Stego, Blackhole Trap, Sacrificial Lamb
 *  - Security: nonce CSP, HMAC, rate limiting adaptive
 *  - Performance: LRU cache, QuantumCache dengan TTL, brotli via CF, srcset responsive
 *  - Theme: unique per domain, font & color generator
 */

'use strict';

// ── Module-level constants ───────────────────────────────────────────────────
const _STATIC_EXT_RX  = /\.(?:css|js|mjs|map|ico|png|jpg|jpeg|gif|svg|webp|avif|woff|woff2|ttf|eot|otf|mp4|webm|ogg|mp3|wav|json|txt|xml|pdf|zip|gz|br)$/i;
const _HANDLED_PATHS   = new Set(['sitemap.xml','rss.xml','feed.xml','feed','robots.txt']);
const _SEARCHBOT_RX    = /Googlebot|bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|Sogou|Exabot|facebot|ia_archiver|Google-InspectionTool/i;
const _BOT_UA_RX       = /HeadlessChrome|Headless|PhantomJS|SlimerJS|Scrapy|python-requests|Go-http-client|curl\/|wget\//i;
const _MOBILE_UA_RX    = /Mobile|Android|iPhone|iPad/i;
const _SCRAPER_BOTS    = ['SemrushBot','AhrefsBot','MJ12bot','DotBot','BLEXBot','MegaIndex','SeznamBot'];
// Fix: regex ini tadinya dikompile ulang tiap kali sacrificeRedirect() dipanggil
const _BAD_BOT_RX      = /SemrushBot|AhrefsBot|MJ12bot|DotBot|BLEXBot|MegaIndex|SeznamBot|spambot|scraperbot|ia_archiver/i;
const _REAL_BROWSER_RX = /Chrome\/|Firefox\/|Safari\/|Edg\//i;

// ── Immortal config ──────────────────────────────────────────────────────────
const IMMORTAL = {
  ENABLE_DIGITAL_DNA:       true,
  ENABLE_CSS_STEGO:         true,
  ENABLE_GHOST_BODY:        true,
  ENABLE_BLACKHOLE:         true,
  ENABLE_SACRIFICIAL_LAMB:  true,
  BLACKHOLE_MAX_REQUESTS:   50,
  DNA_POOL: [
  // Kata dasar (aman)
  'hot', 'seksi', 'sensual', 'dewasa',
  'cantik', 'mesra', 'berani', 'eksklusif',
  
  // Kata tren
  'viral', 'trending', 'populer', 'hits', 'mantap',
  'gratis', 'online', 'live', '24jam',
  
  // Kata konten
  'film', 'video', 'streaming', 'nonton',
  'terbaru', 'terlengkap', 'kualitas HD'
],

LSI: {
  'hot': ['panas', 'spicy', 'menggoda', 'sensual'],
  'seksi': ['sexy', 'menggairahkan', 'memikat'],
  'sensual': ['erotis', 'menggoda', 'memesona'],
  'dewasa': ['18+', 'mature', 'adult', 'hanya 18+'],
  'cantik': ['imut', 'mulus', 'bening', 'hiper'],
  'mesra': ['intim', 'romantic', 'berdua', 'hangat'],
  'berani': ['provokatif', 'terbuka', 'eksplisit'],
  'eksklusif': ['private', 'premium', 'khusus member'],
  
  // Kata umum
  'viral': ['ramai', 'trending', 'banyak dicari'],
  'populer': ['favorit', 'top', 'banyak ditonton'],
  'streaming': ['nonton online', 'live', 'tanpa download']
},
  CSS_OPACITY: 0.001,
  CSS_VARS: ['--primary-color','--secondary-color','--font-family','--spacing-unit','--border-radius','--transition-speed','--container-width','--header-height','--footer-padding'],
  SACRIFICE_ENERGY_MAX: 1000,
  RATE_LIMIT_WINDOW: 60,
  RATE_LIMIT_MAX: 120,
  SCRAPER_RATE_MAX: 10,
};

// ── Error Logger ─────────────────────────────────────────────────────────────
const _ERROR_LOG     = new Set();
const _ERROR_LOG_TTL = 60000; // 1 menit
function logError(context, error, request = null, ctx = null) {
  const ip  = request?.headers?.get('CF-Connecting-IP') || 'unknown';
  const ua  = (request?.headers?.get('User-Agent') || 'unknown').substring(0, 100);
  const key = `${context}:${error?.message}:${ip}`;
  if (_ERROR_LOG.has(key)) return;
  _ERROR_LOG.add(key);
  setTimeout(() => _ERROR_LOG.delete(key), _ERROR_LOG_TTL);
  const rid = ctx?.id || '';
  console.error(`[${context}${rid?':'+rid:''}]`, {
    message:   error?.message,
    stack:     error?.stack,
    ip,
    ua,
    duration:  ctx?.startTime ? Date.now() - ctx.startTime : undefined,
    timestamp: new Date().toISOString(),
  });
}

// ── LRU Cache ────────────────────────────────────────────────────────────────
class LRUMap extends Map {
  constructor(maxSize = 100) { super(); this.maxSize = maxSize; }
  set(key, value) {
    // Jika key sudah ada, hapus dulu agar pindah ke posisi akhir (most recent)
    if (this.has(key)) this.delete(key);
    else if (this.size >= this.maxSize) this.delete(this.keys().next().value);
    return super.set(key, value);
  }
}

// ── QuantumCache (LRU + TTL) ─────────────────────────────────────────────────
class QCache {
  constructor(maxSize = 200, ttl = 60000) {
    this.maxSize = maxSize; this.ttl = ttl;
    this.data = new Map(); this.ts = new Map();
  }
  get(key) {
    if (!this.data.has(key)) return null;
    if (Date.now() - this.ts.get(key) > this.ttl) { this._del(key); return null; }
    const v = this.data.get(key);
    this.data.delete(key); this.data.set(key, v);
    return v;
  }
  set(key, value) {
    if (this.data.size >= this.maxSize) this._del(this.data.keys().next().value);
    this.data.set(key, value); this.ts.set(key, Date.now());
    return value;
  }
  has(key) { return this.get(key) !== null; }
  _del(key) { this.data.delete(key); this.ts.delete(key); }
}

// ── Module-level in-memory state (persist selama isolate hidup) ─────────────
// Fix: maybeScheduledPing tidak perlu KV read setiap request
// Cukup pakai memory — KV hanya untuk sinkron lintas isolate (write saja)
let _scheduledPingLastTs = 0;
// Fix: getDapurConfig — cache in-memory per domain agar tidak KV read tiap request
const _dapurConfigMemCache = new LRUMap(10); // domain -> { data, ts }, max 10 domain
// Fix: isBlacklisted — hasil cache in-memory lebih agresif (TTL 5 menit)
const _blCacheTTL = 300000; // 5 menit
const _blCacheTs  = new Map(); // ip -> timestamp

// ── Cache instances ──────────────────────────────────────────────────────────
const _hmacCache    = new LRUMap(20);
const _blCache      = new LRUMap(500);
const _rlMemory     = new LRUMap(1000);
const _morphCache   = new LRUMap(20);
const _themeCache   = new LRUMap(10);
const _adsSlotsCache= new LRUMap(10);
const _headersCache = new LRUMap(50);
const _dnaCache     = new QCache(500, 60000);
const _blackholeMap = new LRUMap(5000);
const _sacrificeMap = new LRUMap(50);

// ═══════════════════════════════════════════════════════════════════════
// SECTION 1 — CONFIG
// ═══════════════════════════════════════════════════════════════════════

function subdomainToName(sub) {
  return sub.replace(/[_-]+/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\b\w/g,c=>c.toUpperCase()).trim();
}

function detectDomainInfo(env, request) {
  if (env.WARUNG_DOMAIN && env.WARUNG_NAME) return { domain: env.WARUNG_DOMAIN, name: env.WARUNG_NAME };
  if (request) {
    try {
      const hostname = new URL(request.url).hostname;
      return { domain: env.WARUNG_DOMAIN || hostname, name: env.WARUNG_NAME || subdomainToName(hostname.split('.')[0]) };
    } catch { if (env.DAPUR_DEBUG==='true') console.error('Domain detection failed'); }
  }
  return { domain: env.WARUNG_DOMAIN||'sikatsaja.com', name: env.WARUNG_NAME||'SikatSaja' };
}

// Per-domain cache — mencegah cross-domain pollution di multi-domain Cloudflare isolate
const _cfgCacheMap = new LRUMap(10); // max 10 domain per isolate
function getConfig(env, request) {
  const { domain, name } = detectDomainInfo(env, request);
  // FIX: Jangan cache jika domain masih pages.dev (WARUNG_DOMAIN belum di-set via env)
  // atau jika env belum punya WARUNG_DOMAIN (multi-site: tiap request bisa beda domain)
  // FIX v27.7: Sertakan nilai env penting dalam cache key — kalau PATH_CONTENT/dll diubah,
  // cache otomatis invalid tanpa perlu restart isolate
  const envSig = (env.PATH_CONTENT||'')+(env.PATH_ALBUM||'')+(env.PATH_SEARCH||'')+(env.PATH_CATEGORY||'')+(env.PATH_TAG||'')+(env.WARUNG_TYPE||'')+(env.WARUNG_NAME||'');
  const cacheKey = domain + ':' + envSig;
  const shouldCache = !!env.WARUNG_DOMAIN && !domain.endsWith('.pages.dev') && !domain.endsWith('.workers.dev');
  if (shouldCache && _cfgCacheMap.has(cacheKey)) return _cfgCacheMap.get(cacheKey);
  const baseUrl  = (env.WARUNG_BASE_URL || ('https://' + domain)).replace(/\/$/, '');
  const basePath = new URL(baseUrl).pathname.replace(/\/$/, '');
  const cfg = {
    DAPUR_BASE_URL:   (env.DAPUR_BASE_URL || 'https://dapur.dukunseo.com').replace(/\/$/, ''),
    DAPUR_API_KEY:     env.DAPUR_API_KEY  || '',
    DAPUR_CACHE_TTL:   300,
    DAPUR_DEBUG:       false,
    WARUNG_NAME:       name,
    WARUNG_DOMAIN:     domain,
    WARUNG_TAGLINE:    env.WARUNG_TAGLINE  || 'Streaming gratis kualitas terbaik',
    WARUNG_BASE_URL:   baseUrl,
    WARUNG_BASE_PATH:  basePath,
    WARUNG_TYPE: (['A','B','C'].includes((env.WARUNG_TYPE||'').toUpperCase())) ? env.WARUNG_TYPE.toUpperCase() : 'A',
    SEO_DEFAULT_DESC:  env.SEO_DEFAULT_DESC || 'Streaming gratis kualitas terbaik. Akses mudah, tanpa registrasi.',
    SEO_KEYWORDS:      env.SEO_KEYWORDS    || 'streaming, video, album, cerita, gratis',
    SEO_LANG:          'id',
    SEO_LOCALE:        'id_ID',
    SEO_OG_IMAGE:      baseUrl + '/assets/og-default.jpg',
    SEO_OG_IMAGE_W:    parseInt(env.SEO_OG_IMAGE_W || '1200'),
    SEO_OG_IMAGE_H:    parseInt(env.SEO_OG_IMAGE_H || '630'),
    SEO_TWITTER_SITE:  env.SEO_TWITTER_SITE || '',
    PATH_CONTENT:  env.PATH_CONTENT  || 'tonton',
    PATH_SEARCH:   env.PATH_SEARCH   || 'cari',
    PATH_CATEGORY: env.PATH_CATEGORY || 'kategori',
    PATH_TAG:      env.PATH_TAG      || 'tag',
    PATH_ALBUM:    env.PATH_ALBUM    || 'album',
    PATH_DMCA:     env.PATH_DMCA     || 'dmca',
    PATH_TERMS:    env.PATH_TERMS    || 'terms',
    PATH_PRIVACY:  env.PATH_PRIVACY  || 'privacy',
    PATH_FAQ:      env.PATH_FAQ      || 'faq',
    PATH_CONTACT:  env.PATH_CONTACT  || 'contact',
    PATH_ABOUT:    env.PATH_ABOUT    || 'about',
    ITEMS_PER_PAGE: parseInt(env.ITEMS_PER_PAGE || '24'),
    RELATED_COUNT:  parseInt(env.RELATED_COUNT  || '8'),
    TRENDING_COUNT: parseInt(env.TRENDING_COUNT || '10'),
    DEFAULT_THUMB:  baseUrl + '/assets/no-thumb.jpg',
    ADS_ENABLED:          (env.ADS_ENABLED || 'true') === 'true',
    ADS_ADSENSE_CLIENT:    env.ADS_ADSENSE_CLIENT || '',
    ADS_LABEL:             env.ADS_LABEL || '',

    // ── Slot Iklan per-posisi (edit via Cloudflare Dashboard → Settings → Variables) ──
    // Desktop code
    ADS_HEADER_TOP_DESKTOP:     env.ADS_HEADER_TOP_DESKTOP     || '',
    ADS_BEFORE_GRID_DESKTOP:    env.ADS_BEFORE_GRID_DESKTOP    || '',
    ADS_MID_GRID_DESKTOP:       env.ADS_MID_GRID_DESKTOP       || '',
    ADS_AFTER_GRID_DESKTOP:     env.ADS_AFTER_GRID_DESKTOP     || '',
    ADS_SIDEBAR_TOP_DESKTOP:    env.ADS_SIDEBAR_TOP_DESKTOP    || '',
    ADS_SIDEBAR_MID_DESKTOP:    env.ADS_SIDEBAR_MID_DESKTOP    || '',
    ADS_SIDEBAR_BOTTOM_DESKTOP: env.ADS_SIDEBAR_BOTTOM_DESKTOP || '',
    ADS_AFTER_CONTENT_DESKTOP:  env.ADS_AFTER_CONTENT_DESKTOP  || '',
    ADS_FOOTER_TOP_DESKTOP:     env.ADS_FOOTER_TOP_DESKTOP     || '',
    // Mobile code
    ADS_HEADER_TOP_MOBILE:      env.ADS_HEADER_TOP_MOBILE      || '',
    ADS_BEFORE_GRID_MOBILE:     env.ADS_BEFORE_GRID_MOBILE     || '',
    ADS_MID_GRID_MOBILE:        env.ADS_MID_GRID_MOBILE        || '',
    ADS_AFTER_GRID_MOBILE:      env.ADS_AFTER_GRID_MOBILE      || '',
    ADS_SIDEBAR_TOP_MOBILE:     env.ADS_SIDEBAR_TOP_MOBILE     || '',
    ADS_SIDEBAR_MID_MOBILE:     env.ADS_SIDEBAR_MID_MOBILE     || '',
    ADS_SIDEBAR_BOTTOM_MOBILE:  env.ADS_SIDEBAR_BOTTOM_MOBILE  || '',
    ADS_AFTER_CONTENT_MOBILE:   env.ADS_AFTER_CONTENT_MOBILE   || '',
    ADS_FOOTER_TOP_MOBILE:      env.ADS_FOOTER_TOP_MOBILE      || '',
    // Enable/disable per slot
    ADS_HEADER_TOP_ENABLED:      (env.ADS_HEADER_TOP_ENABLED      ?? 'true') !== 'false',
    ADS_BEFORE_GRID_ENABLED:     (env.ADS_BEFORE_GRID_ENABLED     ?? 'true') !== 'false',
    ADS_MID_GRID_ENABLED:        (env.ADS_MID_GRID_ENABLED        ?? 'true') !== 'false',
    ADS_AFTER_GRID_ENABLED:      (env.ADS_AFTER_GRID_ENABLED      ?? 'true') !== 'false',
    ADS_SIDEBAR_TOP_ENABLED:     (env.ADS_SIDEBAR_TOP_ENABLED     ?? 'true') !== 'false',
    ADS_SIDEBAR_MID_ENABLED:     (env.ADS_SIDEBAR_MID_ENABLED     ?? 'true') !== 'false',
    ADS_SIDEBAR_BOTTOM_ENABLED:  (env.ADS_SIDEBAR_BOTTOM_ENABLED  ?? 'true') !== 'false',
    ADS_AFTER_CONTENT_ENABLED:   (env.ADS_AFTER_CONTENT_ENABLED   ?? 'true') !== 'false',
    ADS_FOOTER_TOP_ENABLED:      (env.ADS_FOOTER_TOP_ENABLED      ?? 'true') !== 'false',
    // Mid grid: posisi insert (default: setelah item ke-6)
    ADS_MID_GRID_INSERT_AFTER:   parseInt(env.ADS_MID_GRID_INSERT_AFTER || '6'),
    CONTACT_EMAIL:         env.CONTACT_EMAIL      || ('admin@' + domain),
    CONTACT_EMAIL_NAME:    env.CONTACT_EMAIL_NAME || (name + ' Admin'),
    _dapurConfig: null,
    _env: env,
  };
  if (shouldCache) _cfgCacheMap.set(cacheKey, cfg);
  return cfg;
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 2 — CRYPTO / HASH
// ═══════════════════════════════════════════════════════════════════════

function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return Math.abs(h >>> 0);
}

function hexHash(str, len = 32) {
  const parts = []; let total = 0;
  for (let i = 0; total < len; i++) {
    const chunk = hashSeed(str + i).toString(16).padStart(8, '0');
    parts.push(chunk); total += chunk.length;
  }
  return parts.join('').slice(0, len);
}

function generateNonce() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, c => ({'+':'-','/':'_','=':''}[c]));
}

async function hmacSha256(message, secret) {
  const enc = new TextEncoder();
  let key = _hmacCache.get(secret);
  if (!key) {
    key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    _hmacCache.set(secret, key);
  }
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 3 — FORMAT / ESCAPE HELPERS
// ═══════════════════════════════════════════════════════════════════════

const _hMap = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'": '&#039;' };
const _hRx  = /[&<>"']/g;
function h(str) { if (str==null) return ''; return String(str).replace(_hRx, c => _hMap[c]); }

function mbSubstr(str, start, len) { return [...(str||'')].slice(start, start+len).join(''); }
function formatDuration(seconds) {
  if (!seconds||seconds<=0) return '';
  const s=seconds%60, m=Math.floor(seconds/60)%60, hh=Math.floor(seconds/3600);
  if (hh>0) return `${String(hh).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function isoDuration(seconds) {
  if (!seconds||seconds<=0) return '';
  const d=parseInt(seconds), hh=Math.floor(d/3600), mm=Math.floor((d%3600)/60), ss=d%60;
  return 'PT'+(hh>0?hh+'H':'')+(mm>0?mm+'M':'')+ss+'S';
}
function formatViews(views) {
  if (!views) return '0';
  if (views>=1_000_000) return (views/1_000_000).toFixed(1)+'M';
  if (views>=1_000) return (views/1_000).toFixed(1)+'K';
  return String(views);
}
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
}
function isoDate(dateStr) { if (!dateStr) return ''; try { return new Date(dateStr).toISOString(); } catch { return ''; } }
function safeThumb(item, cfg) { return item?.thumbnail || cfg.DEFAULT_THUMB; }
function makeSlug(text) {
  return (text||'').toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/^-+|-+$/g,'');
}
function nl2br(str) { return (str||'').replace(/\n/g,'<br>'); }
function ucfirst(str) { if (!str) return ''; return str.charAt(0).toUpperCase()+str.slice(1); }
function numberFormat(n) { return new Intl.NumberFormat('id-ID').format(n||0); }
function stripTags(str) { return (str||'').replace(/<[^>]+>/g,''); }
function truncate(str, len) {
  const s = stripTags(str||'');
  if (s.length<=len) return s;
  return s.slice(0,len).replace(/\s+\S*$/,'')+'…';
}
function seededShuffle(arr, seed) {
  const a=[...arr]; let s=seed;
  for (let i=a.length-1; i>0; i--) {
    s=(s*1664525+1013904223)>>>0;
    const j=s%(i+1);
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 4 — URL HELPERS
// ═══════════════════════════════════════════════════════════════════════

function urlHelper(path='/', cfg) { return (cfg.WARUNG_BASE_PATH||'')+'/'+path.replace(/^\/+/,''); }
function absUrl(path, cfg) { return 'https://'+cfg.WARUNG_DOMAIN+urlHelper(path, cfg); }
function contentUrl(id, title, cfg) {
  const slug=makeSlug(title||''); let p=cfg.PATH_CONTENT+'/'+id;
  if (slug) p+='/'+slug; return urlHelper(p, cfg);
}
function albumUrl(id, title, cfg) {
  const slug=makeSlug(title||''); let p=cfg.PATH_ALBUM+'/'+id;
  if (slug) p+='/'+slug; return urlHelper(p, cfg);
}
function categoryUrl(type, page=1, cfg) {
  let p=cfg.PATH_CATEGORY+'/'+encodeURIComponent(type);
  if (page>1) p+='/'+page; return urlHelper(p, cfg);
}
function tagUrl(tag, cfg) { return urlHelper(cfg.PATH_TAG+'/'+encodeURIComponent((tag||'').toLowerCase().trim()), cfg); }
function searchUrl(q='', cfg) { return urlHelper(cfg.PATH_SEARCH,cfg)+(q?'?q='+encodeURIComponent(q):''); }
function itemUrl(item, cfg) { return item.type==='album' ? albumUrl(item.id,item.title,cfg) : contentUrl(item.id,item.title,cfg); }
function homeUrl(cfg) { return cfg.WARUNG_BASE_PATH||'/'; }

// ── Warung type helpers ──────────────────────────────────────────────────────
function getNavItems(cfg) {
  if (cfg._dapurConfig?.nav_items?.length) {
    return cfg._dapurConfig.nav_items.map(item => ({ label:item.label, icon:item.icon, url:categoryUrl(item.type,1,cfg) }));
  }
  const all = {
    video: { label:'Video', icon:'fa-video',  url:categoryUrl('video',1,cfg) },
    album: { label:'Album', icon:'fa-images', url:categoryUrl('album',1,cfg) },
  };
  switch (cfg.WARUNG_TYPE) {
    case 'A': return [all.video];
    case 'B': return [all.album];
    default:  return [all.video, all.album];
  }
}
function getContentTypes(cfg) {
  if (cfg._dapurConfig?.content_types?.length) return cfg._dapurConfig.content_types;
  switch (cfg.WARUNG_TYPE) {
    case 'A': return ['video'];
    case 'B': return ['album'];
    default:  return ['video','album'];
  }
}
const TYPE_META  = { video:{label:'Video',icon:'fa-video'}, album:{label:'Album',icon:'fa-images'} };
const TYPE_ICONS = { video:'fa-video', album:'fa-images' };

// ═══════════════════════════════════════════════════════════════════════
// SECTION 5 — RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════

class RateLimitError extends Error {
  constructor(retryAfter) { super('Too Many Requests'); this.retryAfter = retryAfter; }
}

// OPTIMASI: Pure in-memory rate limiting — ZERO KV dependency
// Catatan: count reset saat isolate recycle, tapi cukup untuk proteksi request burst
async function checkRateLimit(request, env) {
  const ip  = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const ua  = request.headers.get('User-Agent') || '';
  const isScraper = _SCRAPER_BOTS.some(b => ua.includes(b));
  const WINDOW  = IMMORTAL.RATE_LIMIT_WINDOW;
  const MAX_REQ = isScraper ? IMMORTAL.SCRAPER_RATE_MAX : IMMORTAL.RATE_LIMIT_MAX;
  const now     = Math.floor(Date.now()/1000);

  const memEntry = _rlMemory.get(ip);
  if (memEntry && now - memEntry.start < WINDOW) {
    const newCount = memEntry.count + 1;
    if (newCount > MAX_REQ) throw new RateLimitError(WINDOW - (now - memEntry.start));
    _rlMemory.set(ip, { count: newCount, start: memEntry.start });
    return;
  }
  // Window baru atau entry tidak ada
  _rlMemory.set(ip, { count: 1, start: now });
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 6 — BOT DETECTION + HONEYPOT
// ═══════════════════════════════════════════════════════════════════════

function classifyVisitor(request) {
  const ua=request.headers.get('User-Agent')||'';
  const platform=request.headers.get('Sec-Ch-Ua-Platform')||'';
  const secUa=request.headers.get('Sec-Ch-Ua')||'';
  const fp=request.headers.get('X-FP')||'';
  if (_BOT_UA_RX.test(ua)||ua.includes('SlimerJS')||fp==='0x0'||fp.includes('swiftshader')) return 'headless';
  if (_SCRAPER_BOTS.some(b=>ua.includes(b))) return 'scraper';
  if ((ua.includes('Chrome')&&!platform&&!secUa)||ua.length<20) return 'suspicious';
  return 'human';
}

function isGoogleBot(ua) { return ua.includes('Googlebot')||ua.includes('Google-InspectionTool'); }
function isBingBot(ua)   { return ua.includes('bingbot')||ua.includes('BingPreview'); }
function isSearchBot(ua) { return isGoogleBot(ua)||isBingBot(ua)||_SEARCHBOT_RX.test(ua); }
function isScraperBot(ua){ return _SCRAPER_BOTS.some(b=>ua.includes(b)); }

// OPTIMASI: Pure in-memory blacklist — ZERO KV dependency
// IP di-block saat isolate ini hidup; reset saat isolate recycle (fine untuk sebagian besar kasus)
async function isBlacklisted(ip, env) {
  const now = Date.now();
  if (_blCache.has(ip) && (now - (_blCacheTs.get(ip)||0)) < _blCacheTTL) {
    return _blCache.get(ip);
  }
  return false;
}

async function handleHoneypot(request, env) {
  const ip = request.headers.get('CF-Connecting-IP')||'0.0.0.0';
  // OPTIMASI: Simpan ke in-memory blacklist saja (tidak perlu KV)
  _blCache.set(ip, true);
  _blCacheTs.set(ip, Date.now());
  return new Response(null, { status: 200 });
}

function generateFakeContent(cfg, honeyPrefix) {
  const prefix = 'trap';
  const traps = ['/'+prefix+'/a1b2c3','/'+prefix+'/x9y8z7','/'+prefix+'/m3n4o5','/'+prefix+'/p7q6r5'];
  const links = traps.map(t=>`<a href="${h(t)}" style="display:none" aria-hidden="true">more</a>`).join('');
  return new Response(
    `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>${h(cfg.WARUNG_NAME)}</title></head><body><h1>Selamat Datang</h1><p>Konten tersedia. Silakan refresh.</p>${links}</body></html>`,
    { status:200, headers:{'Content-Type':'text/html; charset=UTF-8'} }
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 7 — BLACKHOLE TRAP
// ═══════════════════════════════════════════════════════════════════════

function blackholeCapture(ip, isScraper) {
  if (!IMMORTAL.ENABLE_BLACKHOLE || !isScraper) return null;
  const state = _blackholeMap.get(ip) || { count: 0 };
  state.count++;
  _blackholeMap.set(ip, state);
  if (state.count <= IMMORTAL.BLACKHOLE_MAX_REQUESTS) return null;
  const tl = Math.floor(Math.random()*1000);
  return `<!DOCTYPE html><html><head><title>Loading Timeline ${tl}...</title>
<style>body{background:#000;color:#0f0;font-family:monospace;padding:50px}.timeline{font-size:10px;color:#0a0;margin-top:20px}</style>
<meta http-equiv="refresh" content="3"></head><body>
<h1>⚫ QUANTUM SINGULARITY</h1><p>You have entered timeline ${tl}</p>
<div class="timeline"><p>Loading quantum state... ████████░░ 80%</p></div>
<script>let i=0;setInterval(()=>{document.querySelector('.timeline').innerHTML='<p>Syncing... '+'█'.repeat(i%10)+'░'.repeat(10-i%10)+' '+(i%100)+'%</p>';i++;},300);</script>
</body></html>`;
}

// FIX v27.8: Blackhole PURE in-memory — ZERO KV writes/reads
// LRUMap(_blackholeMap, 5000) sudah cukup untuk hold ribuan IP bot
// Tidak perlu persist lintas isolate — bot yang sama akan kena lagi dari count 0
// dan tetap kena blackhole setelah BLACKHOLE_MAX_REQUESTS hit di isolate tsb
async function blackholeCaptureWithKV(ip, isScraper, env) {
  if (!IMMORTAL.ENABLE_BLACKHOLE || !isScraper) return null;
  const memState = _blackholeMap.get(ip) || { count: 0 };
  memState.count++;
  _blackholeMap.set(ip, memState);
  if (memState.count > IMMORTAL.BLACKHOLE_MAX_REQUESTS) {
    const tl = Math.floor(Math.random()*1000);
    return `<!DOCTYPE html><html><head><title>Loading Timeline ${tl}...</title>
<style>body{background:#000;color:#0f0;font-family:monospace;padding:50px}.timeline{font-size:10px;color:#0a0;margin-top:20px}</style>
<meta http-equiv="refresh" content="3"></head><body>
<h1>⚫ QUANTUM SINGULARITY</h1><p>You have entered timeline ${tl}</p>
<div class="timeline"><p>Loading quantum state... ████████░░ 80%</p></div>
<script>let i=0;setInterval(()=>{document.querySelector('.timeline').innerHTML='<p>Syncing... '+'█'.repeat(i%10)+'░'.repeat(10-i%10)+' '+(i%100)+'%</p>';i++;},300);</script>
</body></html>`;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 8 — SACRIFICIAL LAMB
// ═══════════════════════════════════════════════════════════════════════

function sacrificeRedirect(request, domain) {
  if (!IMMORTAL.ENABLE_SACRIFICIAL_LAMB) return null;
  const ua = request.headers.get('User-Agent')||'';
  // Hanya match UA bot yang jelas — TIDAK periksa Referer (bisa false positive user biasa)
  // Tidak menghit browser modern (Chrome/Firefox/Safari/Edge)
  // Fix: pakai konstanta module-level, tidak dikompile ulang tiap request
  if (!_BAD_BOT_RX.test(ua)) return null;
  if (_REAL_BROWSER_RX.test(ua)) return null; // safety: jangan redirect browser real

  let sacrifice = null;
  for (const [k,v] of _sacrificeMap) { if (v.status==='active') { sacrifice=v; break; } }
  if (!sacrifice) {
    const id = hexHash(domain+Date.now(), 8);
    sacrifice = { id, subdomain:`sacrifice-${id}.${domain}`, energy:0, status:'active' };
    _sacrificeMap.set(sacrifice.subdomain, sacrifice);
  }
  const url = new URL(request.url);
  const redirectUrl = `https://${sacrifice.subdomain}${url.pathname}`;
  sacrifice.energy += 10;
  if (sacrifice.energy >= IMMORTAL.SACRIFICE_ENERGY_MAX) {
    sacrifice.status = 'sacrificed';
    const newId = hexHash(domain+Date.now()+'new', 8);
    _sacrificeMap.set(`sacrifice-${newId}.${domain}`, { id:newId, subdomain:`sacrifice-${newId}.${domain}`, energy:0, status:'active' });
  }
  return new Response(null, { status:307, headers:{ 'Location': redirectUrl } });
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 9 — DIGITAL DNA
// ═══════════════════════════════════════════════════════════════════════

function dnaGenerate(domain, path) {
  if (!IMMORTAL.ENABLE_DIGITAL_DNA) return null;
  const cacheKey = `${domain}:${path}:${Math.floor(Date.now()/60000)}`;
  let cached = _dnaCache.get(cacheKey);
  if (cached) return cached;

  const seed = hashSeed(domain+path+Date.now().toString().slice(0,-3));
  const pool = IMMORTAL.DNA_POOL;
  const lsi  = IMMORTAL.LSI;

  const pickWord = (s, i) => {
    let word = pool[(s+i*37) % pool.length];
    if (Math.random()<0.3 && lsi[word]) { const arr=lsi[word]; word=arr[Math.floor(Math.random()*arr.length)]; }
    return word;
  };

  const wc = 3 + (seed%3);
  const titleWords = Array.from({length:wc}, (_,i) => pickWord(seed,i));
  const patterns = [
    w=>w.join(' '), w=>w.join(' - '), w=>w.join(' | '),
    w=>'🔥 '+w.join(' ')+' 🔥', w=>w.join(' ')+' 2025',
    w=>w.map((word,i)=>i===0?ucfirst(word):word).join(' ')
  ];
  let s=seed;
  const shuffled = [...titleWords].map((v,i)=>{s=(s*1664525+1013904223)>>>0;return{v,sort:s}}).sort((a,b)=>a.sort-b.sort).map(x=>x.v);
  const title = patterns[seed%patterns.length](shuffled);
  const descWords = Array.from({length:12}, (_,i) => pickWord(seed,i*7));
  const desc = descWords.join(' ')+'. '+descWords.slice(0,4).join(' ')+' '+descWords.slice(4,8).join(' ');
  const keywords = [...new Set([...titleWords,...descWords,...pool.slice(0,5)])].join(', ');
  const result = { title: title.slice(0,70), description: desc.slice(0,160), keywords: keywords.slice(0,200) };
  _dnaCache.set(cacheKey, result);
  return result;
}

function dnaInjectHtml(html, domain, path) {
  const dna = dnaGenerate(domain, path);
  if (!dna) return html;
  return html
    .replace(/<title>.*?<\/title>/, `<title>${dna.title}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${dna.description}">`)
    .replace(/<meta name="keywords"[^>]*>/, `<meta name="keywords" content="${dna.keywords}">`);
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 10 — CSS STEGANOGRAPHY
// ═══════════════════════════════════════════════════════════════════════

function cssInject(html, cfg) {
  if (!IMMORTAL.ENABLE_CSS_STEGO) return html;
  const keywords = (cfg.SEO_KEYWORDS||'').split(',').map(k=>k.trim()).filter(k=>k.length>1).slice(0,8);
  if (!keywords.length) return html;
  // Fix: seed per-jam (slice -7) bukan per-10-detik (slice -4) agar stabil dan bisa di-cache
  const seed = hashSeed(cfg.WARUNG_DOMAIN+Date.now().toString().slice(0,-7));
  let cssVars = '';
  let cssRules = '';
  IMMORTAL.CSS_VARS.forEach((varName,idx) => {
    const val = idx%2===0 ? `#${Math.floor(seed*idx*7777%16777215).toString(16).padStart(6,'0')}` : `${8+idx%12}px`;
    cssVars += `${varName}: ${val};\n`;
  });
  keywords.forEach((kw,idx) => {
    const chars = kw.split('');
    let varDecl='', contentBuilder='';
    chars.forEach((c,i) => {
      const vn = `--k${seed%1000}${idx}${i}`;
      varDecl += `${vn}: '${c}';\n`;
      contentBuilder += `var(${vn})`;
    });
    cssVars += varDecl;
    const cn = `kw-${seed%1000}-${idx}`;
    cssRules += `.${cn}::after{content:${contentBuilder};display:inline-block;width:0;height:0;opacity:${IMMORTAL.CSS_OPACITY};pointer-events:none;position:absolute;z-index:-9999;font-size:0;line-height:0}\n`;
    html = html.replace('</body>', `<div class="${cn}" aria-hidden="true"></div>\n</body>`);
  });
  const styleTag = `<style id="stego-${seed%10000}">:root{\n${cssVars}--rnd-${seed%1000}:${Math.random()};}\n${cssRules}</style>`;
  return html.replace('</head>', styleTag+'\n</head>');
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 11 — GHOST BODY
// ═══════════════════════════════════════════════════════════════════════

// Fix: cache ghostBody per path+domain agar tidak rebuild tiap request
const _ghostCache = new LRUMap(200);

function ghostBody(cfg, path, contentData) {
  if (!IMMORTAL.ENABLE_GHOST_BODY) return null;
  // Cache key: domain + path + title (konten berbeda = cache berbeda)
  const ck = cfg.WARUNG_DOMAIN+':'+path+':'+(contentData?.title||'');
  if (_ghostCache.has(ck)) return _ghostCache.get(ck);
  const nonce = generateNonce();
  const cid   = 'ghost-'+hexHash(path+Date.now().toString(), 8);
  // Fix: ganti unescape() deprecated dengan TextEncoder-safe approach
  const jsonStr = JSON.stringify(contentData);
  const dataAttr = btoa(new TextEncoder().encode(jsonStr).reduce((acc,b)=>acc+String.fromCharCode(b),''));
  const result = `<!DOCTYPE html><html lang="id"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${h(cfg.WARUNG_NAME)}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;background:#f5f5f7}.ghost-container{max-width:1200px;margin:0 auto;padding:20px}.ghost-loader{text-align:center;padding:50px;opacity:.7}@keyframes pulse{0%{opacity:.3}50%{opacity:1}100%{opacity:.3}}.ghost-loader::after{content:"Loading...";animation:pulse 1.5s infinite;display:block}</style>
</head><body>
<div id="${cid}" class="ghost-container" data-content='${dataAttr}'><div class="ghost-loader"></div></div>
<script nonce="${nonce}">(function(){const c=document.getElementById('${cid}');try{const raw=atob(c.dataset.content);const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);const d=JSON.parse(new TextDecoder().decode(bytes));setTimeout(()=>{let html='<nav><a href="/">${h(cfg.WARUNG_NAME)}</a></nav><main><h1>'+(d.title||'')+'</h1>';if(d.description)html+='<p>'+d.description+'</p>';html+='</main><footer>&copy; ${new Date().getFullYear()} ${h(cfg.WARUNG_NAME)}</footer>';c.innerHTML=html;},Math.random()*50+50);}catch(e){c.innerHTML='<p>Please refresh.</p>';}})();</script>
</body></html>`;
  _ghostCache.set(ck, result);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 12 — MORPHING ENGINE (SITEMAP PHASE)
// ═══════════════════════════════════════════════════════════════════════

function getMorphPhase(domain) {
  const seed = hashSeed(domain);
  const intervals = [3,6,12,24,48];
  const hours = intervals[seed%intervals.length];
  const tick  = Math.floor(Date.now()/(hours*3600000));
  const cacheKey = domain+':'+tick;
  if (_morphCache.has(cacheKey)) return _morphCache.get(cacheKey);
  const phase = Math.abs(hashSeed(domain+':'+tick)%100);
  _morphCache.set(cacheKey, phase);
  return phase;
}

function getMoonPhase() {
  const CYCLE=29.530588853*24*60*60*1000;
  return Math.floor(((Date.now()-947182440000)%CYCLE)/CYCLE*4);
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 13 — DAPUR CLIENT
// ═══════════════════════════════════════════════════════════════════════

class DapurClient {
  constructor(cfg, env, ctx=null) {
    this.baseUrl       = cfg.DAPUR_BASE_URL+'/api/v1';
    this.playerBaseUrl = cfg.DAPUR_BASE_URL;
    this.apiKey        = cfg.DAPUR_API_KEY;
    this.cacheTtl      = cfg.DAPUR_CACHE_TTL;
    this.debug         = cfg.DAPUR_DEBUG;
    // OPTIMASI: kv tidak dipakai (pure in-memory)
    this.env           = env;
    this.ctx           = ctx;
    this.domain        = cfg.WARUNG_DOMAIN;
    this.baseUrlSite   = cfg.WARUNG_BASE_URL;
    this.cachePrefix   = hexHash(this.apiKey, 8);
    this.hmacSecret    = env.HMAC_SECRET || '';
  }

  getMediaList(params={})  { return this._fetch('/media', params); }
  getMediaDetail(id)       { if (!id||id<1) return this._emptyResponse(); return this._fetch('/media/'+id,{}); }
  getTrending(limit=20,type='') { const p={limit}; if(type) p.type=type; return this._fetch('/trending',p); }
  search(query,params={})  { if (!query||query.trim().length<2) return {data:[],meta:{}}; return this._fetch('/search',{q:query,...params}); }
  async getByTag(tag,params={}) {
    tag=(tag||'').trim(); if (!tag) return this._emptyResponse();
    const result = await this._fetch('/tags-media/'+encodeURIComponent(tag), params, false);
    if (result?.status==='error') return this._fetch('/search',{q:tag,search_in:'tags',...params},false);
    return result;
  }
  getTags(limit=100)  { return this._fetch('/tags',{limit}); }
  getCategories()     { return this._fetch('/categories',{}); }
  getAlbum(id)        { if (!id||id<1) return this._emptyResponse(); return this._fetch('/album/'+id,{}); }
  getRelated(id,limit=8) { if (!id||id<1) return this._emptyResponse(); return this._fetch('/related/'+id,{limit}); }

  async getDapurConfig() {
    const TTL = Math.min(this.cacheTtl, 300);

    // OPTIMASI: Level 1 cache — in-memory per domain, ZERO KV
    const memEntry = _dapurConfigMemCache.get(this.domain);
    if (memEntry && Date.now() - memEntry.ts < TTL * 1000) {
      return memEntry.data;
    }

    // SWR: kalau cache expired tapi masih ada, refresh di background
    if (memEntry && this.ctx) {
      this.ctx.waitUntil(
        this._fetchAndStoreConfig(null, TTL)
          .then(fresh => { if (fresh) _dapurConfigMemCache.set(this.domain, { data: fresh, ts: Date.now() }); })
          .catch(()=>{})
      );
      return memEntry.data; // Return stale data, jangan tunggu fetch
    }

    const fresh = await this._fetchAndStoreConfig(null, TTL);
    if (fresh) _dapurConfigMemCache.set(this.domain, { data: fresh, ts: Date.now() });
    return fresh;
  }

  async _fetchAndStoreConfig(cacheKey, ttl) {
    try {
      const fetchUrl = this.baseUrl+'/config';
      const ctrl = new AbortController();
      const timer = setTimeout(()=>ctrl.abort(), 10000);
      let resp;
      try {
        resp = await fetch(fetchUrl, { headers:{'X-API-Key':this.apiKey,'Accept':'application/json','User-Agent':'DapurClient/24.0 ('+this.domain+')'}, signal:ctrl.signal });
      } finally { clearTimeout(timer); }
      if (!resp.ok) return null;
      const json = await resp.json();
      if (json?.status!=='ok'||!json?.data) return null;
      const data = json.data;
      if (!['A','B','C'].includes(data.warung_type)) return null;
      // OPTIMASI: Tidak perlu KV write — in-memory sudah cukup
      return data;
    } catch(err) { logError('DapurClient.config', err); return null; }
  }

  async getPlayerUrl(id) {
    const signingKey = this.hmacSecret||this.apiKey;
    const timestamp  = Math.floor(Date.now()/1000);
    const signature  = await hmacSha256(id+'|'+timestamp+'|'+this.domain, signingKey);
    const warungFp   = hashSeed(this.domain+this.baseUrlSite).toString(16);
    return this.playerBaseUrl+'/player.php?id='+id+'&t='+timestamp+'&s='+signature+'&w='+warungFp;
  }

  async getDownloadUrl(id) {
    const signingKey = this.hmacSecret||this.apiKey;
    const timestamp  = Math.floor(Date.now()/1000);
    const signature  = await hmacSha256('download|'+id+'|'+timestamp+'|'+this.domain, signingKey);
    return this.playerBaseUrl+'/download/'+id+'?t='+timestamp+'&s='+signature;
  }

  async _fetch(path, params={}, useCache=true) {
    const url = this.baseUrl+path;
    const ALLOWED = ['page','limit','type','q','search_in','sort','order','per_page'];
    const safeParams = {};
    for (const k of ALLOWED) { if (k in params) safeParams[k]=String(params[k]).slice(0,200); }
    const qs = Object.keys(safeParams).length ? '?'+new URLSearchParams(safeParams).toString() : '';
    const fetchUrl = url+qs;
    const ck = 'apicache:'+this.cachePrefix+':'+hexHash(fetchUrl,16);

    // OPTIMASI: Pure in-memory cache (QCache TTL 60 detik) — ZERO KV dependency
    if (useCache) {
      const memHit = _dnaCache.get(ck);
      if (memHit) return memHit;
    }
    return this._fetchAndStore(fetchUrl, ck, path, useCache);
  }

  async _fetchAndStore(fetchUrl, ck, path, useCache=true) {
    let data;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(()=>ctrl.abort(), 10000);
      let resp;
      try {
        resp = await fetch(fetchUrl, { headers:{'X-API-Key':this.apiKey,'Accept':'application/json','User-Agent':'DapurClient/24.0 ('+this.domain+')'}, signal:ctrl.signal });
      } finally { clearTimeout(timer); }
      if (!resp.ok) { if (this.debug) console.error('[DapurClient] Backend error', resp.status, 'on', path); return this._errorResponse('Layanan sementara tidak tersedia.', 0); }
      data = await resp.json();
    } catch(err) { logError('DapurClient.fetch', err); return this._errorResponse('Layanan sementara tidak tersedia.'); }
    // OPTIMASI: Simpan ke in-memory cache saja, tidak perlu KV
    if (useCache) _dnaCache.set(ck, data);
    return data;
  }

  _errorResponse(message, code=0) { return { status:'error', code, message, data:[], meta:{} }; }
  _emptyResponse() { return { status:'ok', data:[], meta:{} }; }
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 14 — SEO HELPER
// ═══════════════════════════════════════════════════════════════════════

class SeoHelper {
  constructor(cfg) {
    this.siteName   = cfg.WARUNG_NAME;
    this.domain     = cfg.WARUNG_DOMAIN;
    this.domainSeed = hashSeed(cfg.WARUNG_DOMAIN);
    this.cfg        = cfg;
    this.titleTemplates = [
      '{title} - '+this.siteName, '{title} | '+this.siteName,
      'Nonton {title} di '+this.siteName, '{title} HD | '+this.siteName,
      'Streaming {title} - '+this.siteName, this.siteName+' | {title}',
      '{title} Gratis - '+this.siteName, 'Tonton {title} Online | '+this.siteName,
      '{title} Full - '+this.siteName, this.siteName+': {title}',
    ];
    this.descTemplates = [
      '{title} tersedia gratis di '+this.siteName+'. Streaming langsung tanpa registrasi.',
      'Tonton {title} kualitas HD di '+this.siteName+'. Gratis, cepat, tanpa buffering.',
      this.siteName+' menghadirkan {title}. Akses unlimited, 100% gratis.',
      'Nikmati {title} di '+this.siteName+'. Platform streaming terpercaya.',
      '{title} kini hadir di '+this.siteName+'. Nonton gratis tanpa iklan.',
      'Streaming {title} HD di '+this.siteName+'. Tanpa registrasi, langsung tonton.',
      'Cari {title}? '+this.siteName+' tempatnya. Gratis dan berkualitas.',
    ];
    this.schemaTypeMap = { video:'VideoObject', album:'ImageGallery' };
    this.hiddenTokens = ['premium','exclusive','ultra-hd','no-ads','fast-stream','4k-quality','hd-ready','instant-play','zero-buffer','high-speed'];
  }

  generateUniqueSchema(id, type='video') {
    const seed = hashSeed(this.domain+id+type+this.domainSeed);
    return {
      schema_type:      this.schemaTypeMap[type]||'CreativeWork',
      token:            this.hiddenTokens[seed%this.hiddenTokens.length],
      interaction_type: (type==='video'?'WatchAction':'ViewAction'),
      comment:          `<!-- ${this.domain} -->`,
      seed, hash: hexHash(seed+this.domain, 32),
    };
  }

  title(baseTitle, contentId=0, type='') {
    baseTitle=(baseTitle||'').trim(); if (!baseTitle) return this.siteName;
    const contentSeed = contentId>0 ? (contentId*2654435761) : hashSeed(baseTitle);
    const idx = Math.abs((this.domainSeed^contentSeed)%this.titleTemplates.length);
    const out = this.titleTemplates[idx].replace('{title}',baseTitle).replace('{site}',this.siteName).replace('{type}',type||'konten');
    return mbSubstr(out, 0, [60,62,65,68,70][this.domainSeed%5]);
  }

  description(baseTitle, contentId=0, type='', views=0) {
    baseTitle=(baseTitle||'').trim(); if (!baseTitle) return this.cfg.SEO_DEFAULT_DESC;
    const contentSeed = contentId>0 ? (contentId*1234567891) : hashSeed(baseTitle);
    const idx = Math.abs((this.domainSeed^contentSeed^hashSeed(type))%this.descTemplates.length);
    const viewsStr = views>0 ? formatViews(views)+'x ditonton. ' : '';
    const out = this.descTemplates[idx].replace('{title}',baseTitle).replace('{site}',this.siteName).replace('{type}',type||'konten').replace('{views}',viewsStr);
    return mbSubstr(out, 0, [150,155,160,165,170][this.domainSeed%5]);
  }

  canonical(path='', request=null) {
    if (!path&&request) path=new URL(request.url).pathname;
    path=path.replace(/[^\w\-\/\.?=&#@!,:+~%]/g,'');
    return 'https://'+this.domain+(path||'/');
  }

  renderMeta({ title, desc, canonical, ogImage, ogType='website', keywords, noindex=false,
               contentId=0, contentType='meta', publishedTime='', modifiedTime='',
               twitterCard='', isPagePaginated=false, nonce='' }) {
    const fp = this.generateUniqueSchema(contentId, contentType);
    const robotsBase = noindex ? 'noindex, nofollow'
      : isPagePaginated ? 'index, follow, max-snippet:-1, max-image-preview:large'
      : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';
    const finalImg = ogImage||this.cfg.SEO_OG_IMAGE;
    const card = twitterCard||(finalImg?'summary_large_image':'summary');
    const locale = this.cfg.SEO_LOCALE||'id_ID';
    const twitterSite = this.cfg.SEO_TWITTER_SITE ? `\n<meta name="twitter:site" content="${h(this.cfg.SEO_TWITTER_SITE)}">` : '';
    let articleMeta='', videoMeta='';
    if (ogType==='article'||ogType==='video.movie') {
      if (publishedTime) articleMeta+=`\n<meta property="article:published_time" content="${h(publishedTime)}">`;
      if (modifiedTime)  articleMeta+=`\n<meta property="article:modified_time"  content="${h(modifiedTime)}">`;
      articleMeta+=`\n<meta property="article:author" content="https://${h(this.domain)}">`;
      articleMeta+=`\n<meta property="article:publisher" content="https://${h(this.domain)}">`;
    }
    if (ogType==='video.movie') {
      videoMeta=`\n<meta property="og:video" content="${h(canonical)}">\n<meta property="og:video:secure_url" content="${h(canonical)}">\n<meta property="og:video:type" content="text/html">\n<meta property="og:video:width" content="1280">\n<meta property="og:video:height" content="720">`;
    }
    return `${fp.comment}
<title>${h(title)}</title>
<meta name="description" content="${h(desc)}">
<meta name="keywords" content="${h(keywords||this.cfg.SEO_KEYWORDS)}">
<meta name="robots" content="${robotsBase}">
<meta name="googlebot" content="${robotsBase}">
<meta name="author" content="${h(this.siteName)}">
<meta name="rating" content="general">
<meta name="HandheldFriendly" content="True">
<link rel="canonical" href="${h(canonical)}">
<link rel="alternate" hreflang="id" href="${h(canonical)}">
<link rel="alternate" hreflang="x-default" href="${h(canonical)}">
<meta property="og:title" content="${h(title)}">
<meta property="og:description" content="${h(desc)}">
<meta property="og:url" content="${h(canonical)}">
<meta property="og:image" content="${h(finalImg)}">
<meta property="og:image:secure_url" content="${h(finalImg)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="${this.cfg.SEO_OG_IMAGE_W||1200}">
<meta property="og:image:height" content="${this.cfg.SEO_OG_IMAGE_H||630}">
<meta property="og:image:alt" content="${h(title)}">
<meta property="og:type" content="${h(ogType)}">
<meta property="og:site_name" content="${h(this.siteName)}">
<meta property="og:locale" content="${h(locale)}">
<meta name="twitter:card" content="${card}">
<meta name="twitter:title" content="${h(title)}">
<meta name="twitter:description" content="${h(desc)}">
<meta name="twitter:image" content="${h(finalImg)}">
<meta name="twitter:image:alt" content="${h(title)}">${twitterSite}${articleMeta}${videoMeta}`;
  }

  contentSchema(item, canonical, playerUrl=null) {
    if (!item) return '';
    const fp=this.generateUniqueSchema(item.id||0, item.type);
    const type=item.type||'video';
    const baseId='https://'+this.domain+'/#'+type+'-'+(item.id||0);
    const pub={ '@type':'Organization', '@id':'https://'+this.domain+'/#organization', 'name':this.siteName, 'url':'https://'+this.domain, 'logo':{'@type':'ImageObject','url':'https://'+this.domain+'/assets/og-default.jpg','width':1200,'height':630} };
    const base={
      '@type':fp.schema_type,'@id':baseId,'name':item.title||'',
      'description':truncate(item.description||item.title||'',300),
      'url':canonical,'publisher':pub,'isFamilyFriendly':true,'isAccessibleForFree':true,
      'interactionStatistic':{'@type':'InteractionCounter','interactionType':{'@type':fp.interaction_type},'userInteractionCount':parseInt(item.views||0)},
    };
    if (item.thumbnail) { base['thumbnail']={'@type':'ImageObject','url':item.thumbnail}; base['image']=item.thumbnail; }
    if (type==='video') {
      const thumb=item.thumbnail||('https://'+this.domain+'/assets/og-default.jpg');
      Object.assign(base,{'thumbnailUrl':[thumb],'uploadDate':item.created_at||new Date().toISOString(),'contentUrl':canonical,'embedUrl':playerUrl||canonical,'regionsAllowed':'ID','requiresSubscription':false,'inLanguage':this.cfg.SEO_LANG||'id','potentialAction':{'@type':'WatchAction','target':{'@type':'EntryPoint','urlTemplate':canonical}}});
      if (item.duration) base['duration']=isoDuration(parseInt(item.duration));
      if (item.created_at) base['datePublished']=item.created_at;
      if (item.updated_at) base['dateModified']=item.updated_at;
    } else if (type==='album') {
      Object.assign(base,{'datePublished':item.created_at||new Date().toISOString(),'dateModified':item.updated_at||item.created_at||new Date().toISOString(),'inLanguage':this.cfg.SEO_LANG||'id','numberOfItems':item.photo_count||0,'potentialAction':{'@type':'ViewAction','target':canonical}});
    }
    Object.keys(base).forEach(k=>(base[k]===undefined||base[k]===null)&&delete base[k]);
    return `<script type="application/ld+json" nonce="${generateNonce()}">${JSON.stringify({'@context':'https://schema.org','@graph':[base]},null,0)}</script>`;
  }

  websiteSchema(searchUrlTpl) {
    const orgId='https://'+this.domain+'/#organization';
    const siteId='https://'+this.domain+'/#website';
    const graph=[
      {'@type':'Organization','@id':orgId,'name':this.siteName,'url':'https://'+this.domain,'logo':{'@type':'ImageObject','@id':'https://'+this.domain+'/#logo','url':'https://'+this.domain+'/assets/og-default.jpg','width':1200,'height':630,'caption':this.siteName},'contactPoint':{'@type':'ContactPoint','email':this.cfg.CONTACT_EMAIL,'contactType':'customer support'},'sameAs':['https://'+this.domain]},
      {'@type':'WebSite','@id':siteId,'name':this.siteName,'url':'https://'+this.domain,'description':this.cfg.SEO_DEFAULT_DESC,'inLanguage':this.cfg.SEO_LANG||'id','publisher':{'@id':orgId},'potentialAction':{'@type':'SearchAction','target':{'@type':'EntryPoint','urlTemplate':searchUrlTpl},'query-input':'required name=search_term_string'}},
    ];
    return `<script type="application/ld+json" nonce="${generateNonce()}">${JSON.stringify({'@context':'https://schema.org','@graph':graph},null,0)}</script>`;
  }

  breadcrumbSchema(items, pageId='') {
    const bcrumbId = 'https://'+this.domain+(pageId||'/')+'#breadcrumb';
    const schema = { '@context':'https://schema.org', '@type':'BreadcrumbList', '@id':bcrumbId, 'itemListElement':items.map((item,i)=>{const el={'@type':'ListItem','position':i+1,'name':item.name};if(item.url) el['item']='https://'+this.domain+item.url; return el;}) };
    return `<script type="application/ld+json" nonce="${generateNonce()}">${JSON.stringify(schema,null,0)}</script>`;
  }

  itemListSchema(items, canonical, cfg) {
    if (!items?.length) return '';
    const schema={ '@context':'https://schema.org','@type':'ItemList','@id':canonical+'#itemlist','url':canonical,'name':cfg.WARUNG_NAME,'numberOfItems':items.length,'itemListElement':items.slice(0,10).map((item,i)=>({'@type':'ListItem','position':i+1,'url':'https://'+cfg.WARUNG_DOMAIN+itemUrl(item,cfg),'name':item.title||'','image':item.thumbnail||''})) };
    return `<script type="application/ld+json" nonce="${generateNonce()}">${JSON.stringify(schema,null,0)}</script>`;
  }

  faqSchema(faqs) {
    if (!faqs?.length) return '';
    const schema={ '@context':'https://schema.org','@type':'FAQPage','mainEntity':faqs.map(faq=>({'@type':'Question','name':faq.q,'acceptedAnswer':{'@type':'Answer','text':faq.a}})) };
    return `<script type="application/ld+json" nonce="${generateNonce()}">${JSON.stringify(schema,null,0)}</script>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 15 — ADS / BANNER SYSTEM
// ═══════════════════════════════════════════════════════════════════════

function sanitizeAdCode(code) {
  if (!code) return '';
  // Hanya strip event handler inline dari tag HTML (bukan isi script)
  // Penting: jangan hapus content <script> karena AdProvider.push() butuh itu
  return code
    .replace(/(<(?:ins|iframe|div|a)\b[^>]*)\son\w+="[^"]*"/gi, '$1')
    .replace(/(<(?:ins|iframe|div|a)\b[^>]*)\son\w+='[^']*'/gi, '$1');
}

// ── Default ad codes (fallback jika env var kosong) ──────────────────────────
const _ADS_DEFAULT = {
  header_top:    { d:`<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e2" data-zoneid="5823946"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>`, m:`<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e10" data-zoneid="5824016"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>` },
  before_grid:   { d:`<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e2" data-zoneid="5823946"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>`, m:`<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e10" data-zoneid="5824016"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>` },
  mid_grid:      { d:`<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e2" data-zoneid="5823946"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>`, m:`<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e10" data-zoneid="5824016"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>` },
  after_grid:    { d:`<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e2" data-zoneid="5846572"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>`, m:`<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e10" data-zoneid="5845680"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>` },
  sidebar_top:   { d:`<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e2" data-zoneid="5824012"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>`, m:`<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e10" data-zoneid="5846568"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>` },
  sidebar_mid:   { d:`<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e2" data-zoneid="5824012"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>`, m:`<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e10" data-zoneid="5846568"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>` },
  sidebar_bottom:{ d:`<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e2" data-zoneid="5824012"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>`, m:`<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e10" data-zoneid="5846568"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>` },
  after_content: { d:`<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e2" data-zoneid="5846572"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>`, m:`<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e10" data-zoneid="5845680"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>` },
  footer_top:    { d:`<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e2" data-zoneid="5846572"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>`, m:`<script async type="application/javascript" src="https://a.magsrv.com/ad-provider.js"></script> <ins class="eas6a97888e10" data-zoneid="5845680"></ins> <script>(AdProvider = window.AdProvider || []).push({"serve": {}});</script>` },
};

/**
 * getAdsSlots — Membaca kode iklan dari Cloudflare Environment Variables.
 *
 * Cara edit: Cloudflare Dashboard → Pages/Workers → Settings → Environment Variables
 * Setiap slot punya dua variabel: _DESKTOP dan _MOBILE
 * Jika variabel kosong/tidak di-set, kode default (hardcoded di atas) dipakai sebagai fallback.
 *
 * Daftar variabel yang bisa di-set:
 *   ADS_ENABLED                  true/false — matikan semua iklan
 *   ADS_HEADER_TOP_DESKTOP       kode HTML iklan header (desktop)
 *   ADS_HEADER_TOP_MOBILE        kode HTML iklan header (mobile)
 *   ADS_HEADER_TOP_ENABLED       true/false — aktif/nonaktif slot ini
 *   ADS_BEFORE_GRID_DESKTOP      kode HTML sebelum grid (desktop)
 *   ADS_BEFORE_GRID_MOBILE       kode HTML sebelum grid (mobile)
 *   ADS_BEFORE_GRID_ENABLED      true/false
 *   ADS_MID_GRID_DESKTOP         kode HTML tengah grid (desktop)
 *   ADS_MID_GRID_MOBILE          kode HTML tengah grid (mobile)
 *   ADS_MID_GRID_ENABLED         true/false
 *   ADS_MID_GRID_INSERT_AFTER    angka — sisipkan setelah item ke-N (default: 6)
 *   ADS_AFTER_GRID_DESKTOP       kode HTML setelah grid (desktop)
 *   ADS_AFTER_GRID_MOBILE        kode HTML setelah grid (mobile)
 *   ADS_AFTER_GRID_ENABLED       true/false
 *   ADS_SIDEBAR_TOP_DESKTOP      kode HTML sidebar atas (desktop)
 *   ADS_SIDEBAR_TOP_MOBILE       kode HTML sidebar atas (mobile)
 *   ADS_SIDEBAR_TOP_ENABLED      true/false
 *   ADS_SIDEBAR_MID_DESKTOP      kode HTML sidebar tengah (desktop)
 *   ADS_SIDEBAR_MID_MOBILE       kode HTML sidebar tengah (mobile)
 *   ADS_SIDEBAR_MID_ENABLED      true/false
 *   ADS_SIDEBAR_BOTTOM_DESKTOP   kode HTML sidebar bawah (desktop)
 *   ADS_SIDEBAR_BOTTOM_MOBILE    kode HTML sidebar bawah (mobile)
 *   ADS_SIDEBAR_BOTTOM_ENABLED   true/false
 *   ADS_AFTER_CONTENT_DESKTOP    kode HTML setelah konten (desktop)
 *   ADS_AFTER_CONTENT_MOBILE     kode HTML setelah konten (mobile)
 *   ADS_AFTER_CONTENT_ENABLED    true/false
 *   ADS_FOOTER_TOP_DESKTOP       kode HTML footer atas (desktop)
 *   ADS_FOOTER_TOP_MOBILE        kode HTML footer atas (mobile)
 *   ADS_FOOTER_TOP_ENABLED       true/false
 */
function getAdsSlots(cfg) {
  const ck = cfg.ADS_ADSENSE_CLIENT+':'+cfg.WARUNG_DOMAIN
    // Sertakan hash dari semua env ads agar cache auto-invalid saat ada perubahan
    + ':' + (cfg.ADS_HEADER_TOP_DESKTOP||'') + (cfg.ADS_MID_GRID_INSERT_AFTER||'');
  if (_adsSlotsCache.has(ck)) return _adsSlotsCache.get(ck);

  // Helper: pakai env var jika ada, fallback ke default
  const d = (key, slot) => cfg[key] || _ADS_DEFAULT[slot]?.d || '';
  const m = (key, slot) => cfg[key] || _ADS_DEFAULT[slot]?.m || '';
  const en = (key) => cfg[key] !== false; // default true

  const slots = {
    header_top:    { enabled:en('ADS_HEADER_TOP_ENABLED'),     type:'html', code_desktop:d('ADS_HEADER_TOP_DESKTOP','header_top'),       code_mobile:m('ADS_HEADER_TOP_MOBILE','header_top'),       label:true,        align:'center', margin:'0 0 4px' },
    before_grid:   { enabled:en('ADS_BEFORE_GRID_ENABLED'),    type:'html', code_desktop:d('ADS_BEFORE_GRID_DESKTOP','before_grid'),     code_mobile:m('ADS_BEFORE_GRID_MOBILE','before_grid'),     label:'Sponsored', align:'center', margin:'8px 0 16px' },
    mid_grid:      { enabled:en('ADS_MID_GRID_ENABLED'),       type:'html', code_desktop:d('ADS_MID_GRID_DESKTOP','mid_grid'),           code_mobile:m('ADS_MID_GRID_MOBILE','mid_grid'),           label:'Iklan',     align:'center', margin:'4px 0', insert_after:cfg.ADS_MID_GRID_INSERT_AFTER },
    after_grid:    { enabled:en('ADS_AFTER_GRID_ENABLED'),     type:'html', code_desktop:d('ADS_AFTER_GRID_DESKTOP','after_grid'),       code_mobile:m('ADS_AFTER_GRID_MOBILE','after_grid'),       label:true,        align:'center', margin:'16px 0 8px' },
    sidebar_top:   { enabled:en('ADS_SIDEBAR_TOP_ENABLED'),    type:'html', code_desktop:d('ADS_SIDEBAR_TOP_DESKTOP','sidebar_top'),     code_mobile:m('ADS_SIDEBAR_TOP_MOBILE','sidebar_top'),     label:true,        align:'center', margin:'0 0 16px' },
    sidebar_mid:   { enabled:en('ADS_SIDEBAR_MID_ENABLED'),    type:'html', code_desktop:d('ADS_SIDEBAR_MID_DESKTOP','sidebar_mid'),     code_mobile:m('ADS_SIDEBAR_MID_MOBILE','sidebar_mid'),     label:true,        align:'center', margin:'0 0 16px' },
    sidebar_bottom:{ enabled:en('ADS_SIDEBAR_BOTTOM_ENABLED'), type:'html', code_desktop:d('ADS_SIDEBAR_BOTTOM_DESKTOP','sidebar_bottom'),code_mobile:m('ADS_SIDEBAR_BOTTOM_MOBILE','sidebar_bottom'),label:true,        align:'center', margin:'0' },
    after_content: { enabled:en('ADS_AFTER_CONTENT_ENABLED'),  type:'html', code_desktop:d('ADS_AFTER_CONTENT_DESKTOP','after_content'), code_mobile:m('ADS_AFTER_CONTENT_MOBILE','after_content'), label:true,        align:'center', margin:'24px 0' },
    footer_top:    { enabled:en('ADS_FOOTER_TOP_ENABLED'),     type:'html', code_desktop:d('ADS_FOOTER_TOP_DESKTOP','footer_top'),       code_mobile:m('ADS_FOOTER_TOP_MOBILE','footer_top'),       label:true,        align:'center', margin:'0' },
  };
  _adsSlotsCache.set(ck, slots);
  return slots;
}

function getDeliveryMode(request) {
  const ect=request.headers.get('ECT')||'';
  const downlink=parseFloat(request.headers.get('downlink')||'NaN');
  const saveData=request.headers.get('Save-Data')==='on';
  const ua=request.headers.get('User-Agent')||'';
  const cfDev=request.headers.get('CF-Device-Type')||'';
  const slowNet=(ect==='slow-2g'||ect==='2g')||(!isNaN(downlink)&&downlink<0.5);
  return { lite:slowNet||saveData, saveData, mobile:cfDev==='mobile'||_MOBILE_UA_RX.test(ua), lowEnd:slowNet };
}

function renderBanner(name, cfg, request=null, nonce='') {
  if (!cfg.ADS_ENABLED) return '';
  const slots=getAdsSlots(cfg); const slot=slots[name];
  if (!slot||!slot.enabled) return '';
  const margin=h(slot.margin||'16px 0');
  const align=slot.align==='left'?'left':slot.align==='right'?'right':'center';
  // Inject nonce ke semua <script> tag agar lolos CSP
  const injectNonce = (code) => {
    if (!code||!nonce) return sanitizeAdCode(code);
    return sanitizeAdCode(code).replace(/<script\b([^>]*)>/gi, (m, attrs) => {
      if (attrs.includes('nonce=')) return m;
      return `<script${attrs} nonce="${nonce}">`;
    });
  };
  if (slot.type==='html'&&slot.code_desktop&&slot.code_mobile) {
    if (request) {
      const isMob=getDeliveryMode(request).mobile;
      const code=injectNonce(isMob?slot.code_mobile:slot.code_desktop);
      const cls=isMob?'ads-mobile':'ads-desktop';
      return `<div class="ad-slot ad-slot--${h(name)} ${cls}" style="margin:${margin};text-align:${align}">${code}</div>`;
    }
    return [
      `<div class="ad-slot ad-slot--${h(name)} ads-desktop" style="margin:${margin};text-align:${align}">${injectNonce(slot.code_desktop)}</div>`,
      `<div class="ad-slot ad-slot--${h(name)} ads-mobile"  style="margin:${margin};text-align:${align}">${injectNonce(slot.code_mobile)}</div>`,
    ].join('\n');
  }
  return `<div class="ad-slot ad-slot--${h(name)}" style="margin:${margin};text-align:${align}">${injectNonce(slot.code_desktop||slot.code_mobile||'')}</div>`;
}

function renderBannerMidGrid(index, cfg, request=null, nonce='') {
  if (!cfg.ADS_ENABLED) return '';
  const slot=getAdsSlots(cfg)['mid_grid'];
  if (!slot||!slot.enabled) return '';
  if (index!==parseInt(slot.insert_after||6)) return '';
  return renderBanner('mid_grid', cfg, request, nonce);
}

function bannerStyles() {
  return `<style>
.ad-slot{overflow:hidden;width:100%;max-width:100%;box-sizing:border-box;min-height:1px}
.ad-label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted,#666);margin-bottom:4px;line-height:1}
.ads-desktop{display:block}.ads-mobile{display:none}
@media(max-width:767px){.ads-desktop{display:none}.ads-mobile{display:block}}
.ad-slot ins,.ad-slot iframe,.ad-slot img{max-width:100%!important;width:auto!important}
.content-grid>li>.ad-slot--mid_grid,.content-grid>.ad-slot--mid_grid{grid-column:1/-1;width:100%}
.ad-slot--header_top{min-height:50px}.ad-slot--before_grid,.ad-slot--after_grid{min-height:60px}
.ad-slot--sidebar_top,.ad-slot--sidebar_mid{min-height:100px}
</style>`;
}

function adsenseScript(cfg) {
  if (!cfg.ADS_ENABLED||!cfg.ADS_ADSENSE_CLIENT) return '';
  return `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${h(cfg.ADS_ADSENSE_CLIENT)}" crossorigin="anonymous"></script>\n`;
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 16 — UNIQUE THEME GENERATOR
// ═══════════════════════════════════════════════════════════════════════

function getUniqueTheme(cfg) {
  if (_themeCache.has(cfg.WARUNG_DOMAIN)) return _themeCache.get(cfg.WARUNG_DOMAIN);
  const domain=cfg.WARUNG_DOMAIN, seed=hashSeed(domain);
  const hue=seed%360, hs=seed%100;
  const fonts=["'DM Sans',system-ui,sans-serif","'Plus Jakarta Sans',system-ui,sans-serif","'Outfit',system-ui,sans-serif","'Figtree',system-ui,sans-serif","'Sora',system-ui,sans-serif","'Nunito',system-ui,sans-serif","'Manrope',system-ui,sans-serif"];
  const widths=[1200,1260,1280,1320,1360];
  const accentH=hue, accentS=55+hs%20, accentL=58+hs%12;
  const accent2H=(hue+30)%360;
  const fontName=fonts[seed%fonts.length].split("'")[1].replace(/ /g,'+');
  const result=`<style id="theme-${(seed%10000).toString(16)}">
@import url('https://fonts.googleapis.com/css2?family=${fontName}:wght@400;500;600;700;800;900&display=swap');
:root{
  --accent:hsl(${accentH},${accentS}%,${accentL}%);
  --accent2:hsl(${accent2H},${accentS}%,${accentL+8}%);
  --accent-dim:hsla(${accentH},${accentS}%,${accentL}%,.15);
  --font-primary:${fonts[seed%fonts.length]};
  --w:${widths[seed%widths.length]}px;
  --r:${[8,10,12,14][seed%4]}px;
  --r-sm:${[6,7,8][seed%3]}px;
  --r-xs:${[4,5,6][seed%3]}px;
  --r-pill:99px;
  --t:${[160,180,200,220][seed%4]}ms;
}
</style>`;
  _themeCache.set(domain, result);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 17 — HTML PARTIALS
// ═══════════════════════════════════════════════════════════════════════

function renderHead({ title, desc, canonical, ogImage, ogType, keywords, noindex, contentId=0, contentType='meta', extraHead='', cfg, seo, request, prevUrl=null, nextUrl=null, publishedTime='', modifiedTime='', isPagePaginated=false, deliveryMode=null, extraNonces=[] }) {
  const nonce = generateNonce();
  const meta  = seo.renderMeta({ title, desc, canonical, ogImage, ogType, keywords, noindex, contentId, contentType, publishedTime, modifiedTime, isPagePaginated, nonce });
  const lcpPreload = ogImage ? `<link rel="preload" as="image" href="${h(ogImage)}" fetchpriority="high">` : '';
  const prevLink   = prevUrl ? `<link rel="prev" href="${h(prevUrl)}">` : '';
  const nextLink   = nextUrl ? `<link rel="next" href="${h(nextUrl)}">` : '';
  const themeColor = `hsl(${hashSeed(cfg.WARUNG_DOMAIN)%360},50%,45%)`;

  const webpageSchema = JSON.stringify({
    '@context':'https://schema.org','@type':'WebPage',
    'name':title,'url':canonical,'inLanguage':cfg.SEO_LANG||'id',
    'isPartOf':{'@type':'WebSite','name':cfg.WARUNG_NAME,'url':'https://'+cfg.WARUNG_DOMAIN},
  },null,0);

  const criticalCss = `<style>
/* ==============================================
   THEME VARIABLES (dari getUniqueTheme)
   ============================================== */
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
:root{
  --accent:hsl(220,65%,62%);
  --accent2:hsl(250,65%,70%);
  --accent-dim:hsla(220,65%,62%,.15);
  --font-primary:'DM Sans',system-ui,sans-serif;
  --w:1260px;
  --r:12px;
  --r-sm:8px;
  --r-xs:6px;
  --r-pill:99px;
  --t:180ms;
}

/* ==============================================
   BANNER STYLES (dari bannerStyles)
   ============================================== */
.ad-slot{overflow:hidden;width:100%;max-width:100%;box-sizing:border-box;min-height:1px}
.ad-label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted,#666);margin-bottom:4px;line-height:1}
.ads-desktop{display:block}.ads-mobile{display:none}
@media(max-width:767px){.ads-desktop{display:none}.ads-mobile{display:block}}
.ad-slot ins,.ad-slot iframe,.ad-slot img{max-width:100%!important;width:auto!important}
.content-grid>li>.ad-slot--mid_grid,.content-grid>.ad-slot--mid_grid{grid-column:1/-1;width:100%}
.ad-slot--header_top{min-height:50px}.ad-slot--before_grid,.ad-slot--after_grid{min-height:60px}
.ad-slot--sidebar_top,.ad-slot--sidebar_mid{min-height:100px}

/* ==============================================
   CRITICAL CSS (yang sudah diperbaiki)
   ============================================== */
/* ── Reset ─────────────────────────────────── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;color-scheme:dark;font-size:16px}
body{font-family:var(--font-primary,'DM Sans',system-ui,sans-serif);font-size:15px;background:var(--bg,#0e0f14);color:var(--fg,#dde1ec);line-height:1.6;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit;text-decoration:none}
img{max-width:100%;height:auto;display:block}
button{cursor:pointer;border:none;background:none;font:inherit}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.skip-link{position:absolute;left:-9999px;top:auto;z-index:9999}
.skip-link:focus{left:16px;top:16px;background:var(--accent);color:#fff;padding:8px 18px;border-radius:99px}

/* ── Design Tokens ─────────────────────────── */
:root{
  --bg:#0e0f14;
  --bg2:#14161e;
  --bg3:#1c1f2a;
  --bg4:#242837;
  --bg5:#2d3145;
  --fg:#dde1ec;
  --fg2:#8b90a8;
  --fg3:#4e5368;
  --text-muted:var(--fg3);
  --text-color:var(--fg);
  --bg-card:var(--bg2);
  --border-radius:12px;
  --line:rgba(255,255,255,.06);
  --line2:rgba(255,255,255,.11);
  --r:12px;
  --r-sm:8px;
  --r-xs:6px;
  --r-pill:99px;
  --ease:cubic-bezier(.4,0,.2,1);
  --t:180ms;
  --nav-h:58px;
  --w:1260px;
}

/* ── Layout ────────────────────────────────── */
.container{max-width:var(--w);margin:0 auto;padding:0 20px;width:100%}
.layout-main{display:grid;grid-template-columns:1fr 288px;gap:28px;padding:24px 0 56px}

/* ── Navbar ────────────────────────────────── */
.nav{
  background:rgba(14,15,20,.88);
  backdrop-filter:blur(24px) saturate(160%);
  -webkit-backdrop-filter:blur(24px) saturate(160%);
  border-bottom:1px solid var(--line);
  position:sticky;top:0;z-index:200;
  height:var(--nav-h)
}
.nav-inner{max-width:var(--w);margin:0 auto;padding:0 20px;display:flex;align-items:center;gap:10px;height:100%;overflow:visible}
.nav-logo{
  font-size:1.1rem;font-weight:900;letter-spacing:-.03em;flex-shrink:0;
  background:linear-gradient(135deg,var(--accent,#7c6fef) 0%,#a78bfa 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.nav-logo span{-webkit-text-fill-color:rgba(255,255,255,.28)}
.nav-links{display:flex;gap:2px;list-style:none;margin-left:6px}
.nav-links a{
  padding:5px 13px;border-radius:var(--r-pill);
  font-size:.81rem;font-weight:600;
  color:var(--fg2);
  display:flex;align-items:center;gap:5px;
  transition:background var(--t) var(--ease),color var(--t) var(--ease)
}
.nav-links a:hover{background:var(--bg4);color:var(--fg)}
.nav-links a.active{background:var(--accent,#7c6fef);color:#fff}
.nav-search{flex:1;max-width:256px;margin-left:auto;position:relative;display:flex;align-items:center;z-index:0}
.nav-search-icon{position:absolute;left:11px;color:var(--fg3);font-size:.78rem;pointer-events:none}
.nav-search input{
  width:100%;padding:7px 12px 7px 32px;
  border:1px solid var(--line2);border-radius:var(--r-pill);
  font-size:.82rem;background:var(--bg3);color:var(--fg);
  outline:none;transition:border-color var(--t) var(--ease),box-shadow var(--t) var(--ease)
}
.nav-search input::placeholder{color:var(--fg3)}
.nav-search input:focus{border-color:var(--accent,#7c6fef);box-shadow:0 0 0 3px rgba(124,111,239,.18)}
.nav-menu-btn{
  display:none;width:36px;height:36px;border-radius:var(--r-sm);
  align-items:center;justify-content:center;
  background:var(--bg3);color:var(--fg2);
  transition:background var(--t) var(--ease);
  position:relative;z-index:210;flex-shrink:0;cursor:pointer;
  -webkit-tap-highlight-color:transparent;touch-action:manipulation
}
.nav-menu-btn:hover{background:var(--bg4);color:var(--fg)}

/* ── Bottom Tab Bar ────────────────────────── */
.bottom-nav{
  display:none;position:fixed;bottom:0;left:0;right:0;
  background:rgba(14,15,20,.96);
  backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
  border-top:1px solid var(--line);z-index:200;
  padding-bottom:env(safe-area-inset-bottom,0);
  box-sizing:content-box
}
.bottom-nav-inner{display:flex}
.bottom-nav-item{
  flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:3px;padding:7px 0;min-height:52px;
  font-size:.57rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--fg3);position:relative;
  transition:color var(--t) var(--ease)
}
.bottom-nav-item i{font-size:1.05rem;transition:transform var(--t) var(--ease)}
.bottom-nav-item.active{color:var(--accent,#7c6fef)}
.bottom-nav-item.active i{transform:translateY(-1px)}
.bottom-nav-item.active::after{
  content:'';position:absolute;top:0;left:50%;transform:translateX(-50%);
  width:22px;height:2.5px;border-radius:0 0 3px 3px;background:var(--accent,#7c6fef)
}

/* ── Cards ─────────────────────────────────── */
.content-grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(180px,1fr));
  gap:14px;
  list-style:none;
  padding:0
}
.card{
  background:var(--bg2);border-radius:var(--r);overflow:hidden;
  border:1px solid var(--line);
  transition:transform var(--t) var(--ease),border-color var(--t) var(--ease),box-shadow var(--t) var(--ease);
  height:100%;
  display:flex;
  flex-direction:column
}
.card:hover{transform:translateY(-4px);border-color:var(--line2);box-shadow:0 16px 48px rgba(0,0,0,.45)}
.card-thumb{position:relative;overflow:hidden;background:var(--bg4);aspect-ratio:16/9}
.card-thumb img{width:100%;height:100%;object-fit:cover;transition:transform .38s var(--ease)}
.card:hover .card-thumb img{transform:scale(1.07)}
.badge-duration{
  position:absolute;bottom:7px;right:7px;
  background:rgba(0,0,0,.78);backdrop-filter:blur(4px);
  color:#fff;font-size:.58rem;font-weight:800;padding:2px 7px;border-radius:5px;letter-spacing:.03em
}
.badge-type{
  position:absolute;top:7px;left:7px;
  background:rgba(0,0,0,.6);backdrop-filter:blur(4px);
  color:#fff;font-size:.58rem;padding:3px 7px;border-radius:5px
}
.card-info{padding:10px 12px 13px;flex:1}
.card-title{
  font-size:.82rem;font-weight:700;line-height:1.42;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
  color:var(--fg);margin-bottom:7px;letter-spacing:-.01em
}
.card-meta{display:flex;gap:8px;font-size:.68rem;color:var(--fg3);flex-wrap:wrap;align-items:center}

/* ── Sidebar & Widgets ─────────────────────── */
.sidebar{position:relative}
.sidebar-sticky{position:sticky;top:calc(var(--nav-h) + 14px)}
.widget{background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);padding:16px;margin-bottom:14px}
.widget-title{
  font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.09em;
  color:var(--fg2);margin-bottom:14px;display:flex;align-items:center;gap:7px
}
.widget-title i{color:var(--accent,#7c6fef)}

/* ── Home Filter Bar ───────────────────────── */
.home-filter{display:none}
.category-filter{display:flex;gap:5px;padding:9px 0;flex-wrap:nowrap;white-space:nowrap;align-items:center}
.filter-tab{
  padding:5px 15px;border-radius:var(--r-pill);
  font-size:.78rem;font-weight:700;flex-shrink:0;
  display:inline-flex;align-items:center;gap:5px;
  color:var(--fg2);border:1px solid transparent;
  transition:background var(--t) var(--ease),color var(--t) var(--ease),border-color var(--t) var(--ease)
}
.filter-tab:hover{background:var(--bg4);color:var(--fg);border-color:var(--line2)}
.filter-tab.active{background:var(--accent,#7c6fef);color:#fff}
.filter-tabs{display:flex;gap:5px;flex-wrap:wrap;padding:8px 0}
.section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.section-title{font-size:.9rem;font-weight:800;color:var(--fg);display:flex;align-items:center;gap:7px;letter-spacing:-.01em}
.section-title i{color:var(--accent,#7c6fef);font-size:.8rem}
.section-page{font-size:.78rem;font-weight:400;color:var(--fg3)}

/* ── Page Header ───────────────────────────── */
.page-header,.tag-header{
  background:linear-gradient(180deg,var(--bg3) 0%,var(--bg) 100%);
  border-bottom:1px solid var(--line);padding:22px 0 18px
}
.page-label{font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--accent,#7c6fef);margin-bottom:7px;display:flex;align-items:center;gap:5px}
.page-title{font-size:1.5rem;font-weight:900;color:var(--fg);line-height:1.2;margin-bottom:6px;letter-spacing:-.03em}
.page-desc{font-size:.84rem;color:var(--fg2)}
.tag-hero{font-size:1.8rem;font-weight:900;color:var(--fg);display:flex;align-items:center;gap:8px;margin:6px 0;letter-spacing:-.04em}
.tag-hero i{color:var(--accent,#7c6fef);font-size:1.3rem}

/* ── Breadcrumb ────────────────────────────── */
.breadcrumb{font-size:.73rem;color:var(--fg3);margin-bottom:12px}
.breadcrumb ol{display:flex;flex-wrap:wrap;gap:3px;list-style:none;align-items:center}
.breadcrumb li{display:flex;align-items:center;gap:3px}
.breadcrumb .fa-chevron-right{font-size:.55rem;opacity:.35}
.breadcrumb a:hover{color:var(--fg);text-decoration:underline}

/* ── Trending Widget ───────────────────────── */
.trending-list{list-style:none}
.trending-item a{
  display:flex;gap:9px;padding:9px 0;border-bottom:1px solid var(--line);
  align-items:center;transition:opacity var(--t) var(--ease)
}
.trending-item:last-child a{border-bottom:none}
.trending-item a:hover{opacity:.65}
.trending-item img{border-radius:var(--r-xs);object-fit:cover;flex-shrink:0;width:60px;height:34px}
.trending-info p{font-size:.76rem;font-weight:700;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--fg)}
.trending-info small{font-size:.67rem;color:var(--fg3);display:flex;align-items:center;gap:3px;margin-top:3px}
.trending-num{font-size:.68rem;font-weight:900;color:var(--accent,#7c6fef);min-width:16px;text-align:center;flex-shrink:0}

/* ── Trending Mobile Scroll ────────────────── */
.trending-mobile-section{display:none;padding:12px 0;background:var(--bg2);border-bottom:1px solid var(--line)}
.trending-mobile-header{font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;padding:0 16px 9px;display:flex;align-items:center;gap:6px;color:var(--fg2)}
.trending-mobile-header i{color:#f97316}
.trending-scroll{display:flex;gap:10px;overflow-x:auto;padding:0 16px 4px;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.trending-scroll::-webkit-scrollbar{display:none}
.trending-scroll-item{flex-shrink:0;width:118px;scroll-snap-align:start}
.trending-scroll-item a{display:block}
.trending-scroll-item .t-thumb{position:relative;aspect-ratio:16/9;border-radius:var(--r-sm);overflow:hidden;background:var(--bg4);margin-bottom:6px}
.trending-scroll-item .t-thumb img{width:100%;height:100%;object-fit:cover}
.trending-scroll-item .t-num{position:absolute;top:4px;left:4px;background:rgba(0,0,0,.72);color:#fff;font-size:.56rem;font-weight:900;padding:2px 5px;border-radius:4px}
.trending-scroll-item .t-title{font-size:.69rem;font-weight:700;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--fg)}

/* ── View / Player Page ────────────────────── */
.view-main{padding:0}
.view-layout{display:grid;grid-template-columns:1fr 308px;gap:24px;max-width:var(--w);margin:0 auto;padding:20px 20px 56px}
.view-content,.view-sidebar{min-width:0}
.player-wrapper{position:relative;width:100%;aspect-ratio:16/9;background:#000;border-radius:var(--r);overflow:hidden;margin-bottom:14px;box-shadow:0 10px 40px rgba(0,0,0,.55)}
.player-frame{position:absolute;inset:0;width:100%;height:100%;border:none}
.content-info{margin-bottom:20px}
.content-title{font-size:1.25rem;font-weight:800;line-height:1.3;margin-bottom:10px;color:var(--fg);letter-spacing:-.025em}
.content-meta{display:flex;flex-wrap:wrap;gap:8px;font-size:.76rem;color:var(--fg2);margin-bottom:10px;align-items:center}
.content-meta i{color:var(--fg3);font-size:.7rem}
.content-tags{display:flex;flex-wrap:wrap;gap:5px;margin:10px 0}
.action-buttons{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}

/* ── Buttons ───────────────────────────────── */
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 18px;border-radius:var(--r-pill);font-size:.8rem;font-weight:700;transition:all var(--t) var(--ease);cursor:pointer;min-height:38px}
.btn-primary{background:var(--accent,#7c6fef);color:#fff}
.btn-primary:hover{filter:brightness(1.12);transform:translateY(-1px)}
.btn-outline{border:1.5px solid var(--line2);color:var(--fg2)}
.btn-outline:hover{background:var(--bg4);color:var(--fg);border-color:var(--fg3)}

/* ── Badges ────────────────────────────────── */
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:5px;font-size:.7rem;font-weight:800;background:rgba(124,111,239,.18);color:var(--accent,#7c6fef)}
.badge-small{display:inline-flex;align-items:center;gap:3px;font-size:.64rem;font-weight:700;padding:2px 6px;border-radius:4px;background:var(--bg4);color:var(--fg3)}

/* ── Related List ──────────────────────────── */
.related-list{display:flex;flex-direction:column;gap:6px;list-style:none}
.related-item{display:flex;gap:9px;padding:7px;border-radius:var(--r-sm);transition:background var(--t) var(--ease)}
.related-item:hover{background:var(--bg3)}
.related-item img{border-radius:var(--r-xs);object-fit:cover;flex-shrink:0;width:60px;height:34px}
.related-info{min-width:0;flex:1}
.related-title{font-size:.76rem;font-weight:700;line-height:1.38;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--fg)}
.related-meta{display:flex;gap:6px;font-size:.67rem;color:var(--fg3);margin-top:4px;flex-wrap:wrap}

/* ── Pagination ────────────────────────────── */
.pagination{display:flex;align-items:center;justify-content:center;gap:5px;padding:28px 0 8px;flex-wrap:wrap}
.page-btn{padding:8px 18px;border-radius:var(--r-pill);background:var(--bg3);color:var(--fg2);font-size:.8rem;font-weight:700;display:flex;align-items:center;gap:5px;transition:all var(--t) var(--ease);min-height:40px;border:1px solid var(--line2)}
.page-btn:hover{background:var(--accent,#7c6fef);color:#fff;border-color:var(--accent,#7c6fef)}
.page-numbers{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
.page-number{min-width:38px;height:38px;border-radius:var(--r-sm);display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;color:var(--fg3);border:1px solid var(--line);transition:all var(--t) var(--ease)}
.page-number.active{background:var(--accent,#7c6fef);color:#fff;border-color:var(--accent,#7c6fef)}
.page-number:hover:not(.active){background:var(--bg4);color:var(--fg);border-color:var(--line2)}
.page-ellipsis{color:var(--fg3);padding:0 3px}

/* ── Tags ──────────────────────────────────── */
.tag{display:inline-flex;align-items:center;padding:4px 11px;border-radius:var(--r-pill);background:var(--bg3);color:var(--fg2);font-size:.73rem;font-weight:600;transition:background var(--t) var(--ease),color var(--t) var(--ease);border:1px solid var(--line)}
.tag:hover,.tag:active{background:var(--accent,#7c6fef);color:#fff;border-color:var(--accent,#7c6fef)}
.tag-cloud{display:flex;flex-wrap:wrap;gap:5px}

/* ── Category Sidebar ──────────────────────── */
.category-sidebar{display:flex;flex-direction:column;gap:2px}
.category-sidebar-item{display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:var(--r-sm);font-size:.83rem;font-weight:600;color:var(--fg2);transition:background var(--t) var(--ease),color var(--t) var(--ease)}
.category-sidebar-item i:first-child{color:var(--fg3);width:15px;text-align:center;transition:color var(--t) var(--ease)}
.category-sidebar-item span{flex:1}
.category-sidebar-item:hover{background:var(--bg4);color:var(--fg)}
.category-sidebar-item:hover i:first-child,.category-sidebar-item.active i:first-child{color:var(--accent,#7c6fef)}
.category-sidebar-item.active{background:rgba(124,111,239,.14);color:var(--accent,#7c6fef)}

/* ── Search ────────────────────────────────── */
.search-bar-large{margin-top:12px}
.search-bar{display:flex;border:1px solid var(--line2);border-radius:var(--r-pill);overflow:hidden;background:var(--bg3)}
.search-bar input{flex:1;padding:10px 16px;font-size:.88rem;background:none;outline:none;border:none;min-width:0;color:var(--fg)}
.search-bar input::placeholder{color:var(--fg3)}
.search-bar button{padding:0 16px;color:var(--accent,#7c6fef);font-size:.88rem}
.search-stats{font-size:.8rem;color:var(--fg2);margin-bottom:13px;display:flex;align-items:center;gap:6px}
.search-stats strong{color:var(--fg)}

/* ── Mobile Nav Drawer ─────────────────────── */
.mobile-nav{position:fixed;inset:0;z-index:300;pointer-events:none;visibility:hidden}
.mobile-nav.open{pointer-events:auto;visibility:visible}
.mobile-nav-overlay{position:absolute;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(3px);opacity:0;transition:opacity .28s}
.mobile-nav.open .mobile-nav-overlay{opacity:1}
.mobile-nav-panel{position:absolute;top:0;left:0;bottom:0;width:min(290px,83vw);background:var(--bg2);border-right:1px solid var(--line);transform:translateX(-100%);transition:transform .28s var(--ease);display:flex;flex-direction:column;overflow-y:auto;z-index:1}
.mobile-nav.open .mobile-nav-panel{transform:translateX(0)}
.mobile-nav-header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line);flex-shrink:0}
.mobile-nav-close{width:34px;height:34px;border-radius:var(--r-sm);background:var(--bg4);display:flex;align-items:center;justify-content:center;color:var(--fg2);transition:background var(--t) var(--ease)}
.mobile-nav-close:hover{background:var(--bg5);color:var(--fg)}
.mobile-search-form{padding:12px 14px;border-bottom:1px solid var(--line);flex-shrink:0}
.mobile-nav-links{display:flex;flex-direction:column;padding:8px;flex:1;gap:2px}
.mobile-nav-links a{padding:10px 13px;border-radius:var(--r-sm);font-size:.88rem;font-weight:600;color:var(--fg2);display:flex;align-items:center;gap:9px;transition:background var(--t) var(--ease),color var(--t) var(--ease)}
.mobile-nav-links a:hover{background:var(--bg4);color:var(--fg)}
.mobile-nav-links a.active{background:rgba(124,111,239,.15);color:var(--accent,#7c6fef)}

/* ── Footer ───────────────────────────────── */
.footer{background:var(--bg2);border-top:1px solid var(--line);color:var(--fg2);padding:40px 0 0}
.footer-inner{max-width:var(--w);margin:0 auto;padding:0 20px 32px;display:grid;grid-template-columns:1.6fr repeat(3,1fr);gap:36px}
.footer-brand .nav-logo{font-size:1.05rem;margin-bottom:10px}
.footer-desc{font-size:.79rem;color:var(--fg3);line-height:1.75;max-width:210px}
.footer-heading{font-size:.67rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--fg);margin-bottom:14px}
.footer-col ul{list-style:none}
.footer-col ul li{margin-bottom:9px}
.footer-col ul a{font-size:.8rem;color:var(--fg3);display:flex;align-items:center;gap:7px;transition:color var(--t) var(--ease)}
.footer-col ul a:hover{color:var(--fg)}
.footer-bottom{border-top:1px solid var(--line);padding:13px 20px;max-width:var(--w);margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
.footer-copy{font-size:.73rem;color:var(--fg3)}
.footer-legal{display:flex;gap:16px}
.footer-legal a{font-size:.73rem;color:var(--fg3);transition:color var(--t) var(--ease)}
.footer-legal a:hover{color:var(--fg)}

/* ── Error Page ────────────────────────────── */
.error-page{padding:80px 0}
.error-content{text-align:center;max-width:480px;margin:0 auto}
.error-icon{font-size:3.5rem;color:var(--fg3);margin-bottom:14px;opacity:.25}
.error-title{font-size:5rem;font-weight:900;color:var(--fg);margin-bottom:8px;line-height:1;letter-spacing:-.06em}
.error-subtitle{font-size:1.25rem;font-weight:800;margin-bottom:10px;color:var(--fg)}
.error-desc{color:var(--fg2);margin-bottom:26px;font-size:.9rem}
.error-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}

/* ── Empty States ──────────────────────────── */
.empty-state,.no-results{text-align:center;padding:52px 16px;color:var(--fg2)}
.no-results-icon{font-size:2.8rem;margin-bottom:13px;opacity:.22}
.empty-state i{font-size:2.8rem;margin-bottom:13px;display:block;opacity:.18}
.no-results h2{font-size:1.05rem;font-weight:800;margin-bottom:8px;color:var(--fg)}
.no-results p{font-size:.88rem;margin-bottom:16px}
.no-results-actions{display:flex;gap:7px;justify-content:center;flex-wrap:wrap}

/* ── Album Grid ────────────────────────────── */
.album-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
.album-thumb-btn{width:100%;cursor:pointer;background:none;border:none;padding:0;border-radius:var(--r-sm);overflow:hidden;display:block}
.album-thumb{width:100%;height:auto;border-radius:var(--r-sm);transition:opacity .2s,transform .32s var(--ease);display:block}
.album-thumb-btn:hover .album-thumb{opacity:.82;transform:scale(1.04)}

/* ── Lightbox ──────────────────────────────── */
.lightbox{position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.93);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(12px)}
.lightbox.hidden{display:none}
.lightbox-content{position:relative;max-width:95vw;max-height:95vh;display:flex;flex-direction:column;align-items:center}
.lightbox-image{max-width:100%;max-height:85vh;object-fit:contain;border-radius:var(--r-sm)}
.lightbox-close{position:absolute;top:-46px;right:0;color:#fff;font-size:1.1rem;background:rgba(255,255,255,.1);backdrop-filter:blur(4px);width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:background var(--t)}
.lightbox-close:hover{background:rgba(255,255,255,.2)}
.lightbox-nav{display:flex;justify-content:space-between;width:100%;margin-top:13px}
.lightbox-prev,.lightbox-next{color:#fff;background:rgba(255,255,255,.1);backdrop-filter:blur(4px);width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1rem;transition:background var(--t)}
.lightbox-prev:hover,.lightbox-next:hover{background:rgba(255,255,255,.2)}
.lightbox-caption{color:rgba(255,255,255,.5);font-size:.8rem;text-align:center;margin-top:10px}

/* ── Misc ──────────────────────────────────── */
.toast{position:fixed;bottom:76px;left:50%;transform:translateX(-50%);background:var(--bg5);color:var(--fg);border:1px solid var(--line2);padding:9px 22px;border-radius:var(--r-pill);font-size:.83rem;font-weight:600;z-index:9999;pointer-events:none;animation:fadeUp .22s var(--ease);box-shadow:0 8px 24px rgba(0,0,0,.4)}
@keyframes fadeUp{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
#backToTop{position:fixed;bottom:80px;right:16px;z-index:180;width:40px;height:40px;border-radius:50%;background:var(--accent,#7c6fef);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 18px rgba(124,111,239,.45);transition:opacity .3s,visibility .3s,transform var(--t) var(--ease);font-size:.82rem;opacity:0;visibility:hidden}
#backToTop:hover{transform:scale(1.1) translateY(-2px)}
.connection-status{position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:#ef4444;color:#fff;padding:8px 20px;border-radius:var(--r-pill);font-size:.79rem;display:flex;align-items:center;gap:7px;z-index:400;box-shadow:0 4px 16px rgba(239,68,68,.4)}
.content-desc{margin:12px 0}
.full-desc.hidden{display:none}
.read-more{font-size:.79rem;color:var(--accent,#7c6fef);margin-top:4px;text-decoration:underline;cursor:pointer;font-weight:700}
.static-content h2{font-size:1.15rem;font-weight:800;margin:22px 0 11px;color:var(--fg)}
.static-content p,.static-content li{margin-bottom:10px;line-height:1.8;color:var(--fg2)}
.static-content ul,.static-content ol{padding-left:20px;margin-bottom:12px}
.static-content address{font-style:normal}
.static-content a{color:var(--accent,#7c6fef);text-decoration:underline}

/* ── Responsive ────────────────────────────── */
@media(min-width:768px) and (max-width:1024px){
  .layout-main{grid-template-columns:1fr 248px;gap:20px}
  .content-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}
  .view-layout{grid-template-columns:1fr 268px}
  .footer-inner{grid-template-columns:1fr 1fr;gap:24px}
  .footer-brand{grid-column:1/-1}
}
@media(max-width:767px){
  /* Navbar mobile */
  :root{--nav-h:52px}
  .nav-links{display:none}
  .nav-menu-btn{display:flex;flex-shrink:0;z-index:999999!important;position:relative!important;pointer-events:auto!important;opacity:1!important;visibility:visible!important;cursor:pointer!important}
  .mobile-nav:not(.open) .mobile-nav-overlay{display:none!important;pointer-events:none!important}
  .nav-inner{gap:8px;padding:0 12px 0 12px;overflow:visible!important}
  .nav-logo{font-size:1rem}
  .nav-search{
    flex:1;
    max-width:none;
    min-width:0;
    margin-left:0;
    z-index:0
  }
  .nav-search input{
    font-size:.8rem;
    padding:6px 10px 6px 28px
  }
  .nav-search-icon{left:9px;font-size:.72rem}

  /* Bottom nav mobile */
  .bottom-nav{display:flex}
  .bottom-nav-inner{display:flex;width:100%}
  .bottom-nav-item{
    flex:1;
    min-width:0;
    padding:6px 2px;
    min-height:50px;
    font-size:.52rem;
    gap:2px
  }
  .bottom-nav-item i{font-size:.95rem}
  .bottom-nav-item span{
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
    max-width:100%;
    display:block;
    text-align:center
  }

  /* Layout */
  body{padding-bottom:calc(52px + env(safe-area-inset-bottom,0))}
  .layout-main{grid-template-columns:1fr;gap:0;padding:0 0 80px}
  .content-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
  .sidebar{display:none}
  .trending-mobile-section{display:block}
  .page-title{font-size:1.25rem}
  .page-header,.tag-header{padding:16px 0 14px}
  .view-layout{grid-template-columns:1fr;padding:0 0 80px;gap:0}
  .view-content{padding:10px 14px 0}
  .view-sidebar{padding:0 14px 16px}
  .content-title{font-size:1.1rem}
  .player-wrapper{border-radius:0;margin-bottom:10px}
  .footer-inner{grid-template-columns:1fr 1fr;gap:20px}
  .footer-brand{grid-column:1/-1}
  .footer-bottom{flex-direction:column;text-align:center;gap:5px}
  .footer-legal{justify-content:center}
  .footer{padding-bottom:calc(70px + env(safe-area-inset-bottom,0))}
  #backToTop{bottom:80px;right:12px;width:36px;height:36px;font-size:.75rem}
  .album-grid{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}
  .toast{bottom:68px}
  .card-title{font-size:.79rem}
}
@media(min-width:480px) and (max-width:767px){
  .content-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}
}
@media(max-width:380px){
  .container{padding:0 12px}
  .content-grid{grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}
  .footer-inner{grid-template-columns:1fr}
}
</style>`;

  const dapurDomain = (cfg._env?.DAPUR_BASE_URL||'https://dapur.dukunseo.com').replace(/https?:\/\//,'').split('/')[0];
  const csp = [
    `default-src 'self' https://${cfg.WARUNG_DOMAIN}`,
    `script-src 'self' 'nonce-${nonce}'${extraNonces.map(n=>` 'nonce-${n}'`).join('')} https://*.magsrv.com https://a.magsrv.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://cdnjs.cloudflare.com https://fonts.googleapis.com`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com`,
    `font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com`,
    `img-src 'self' data: blob: https:`,
    `media-src 'self' blob: https:`,
    `frame-src 'self' https://*.magsrv.com https://${dapurDomain} https://${cfg.WARUNG_DOMAIN} https://googleads.g.doubleclick.net`,
    `connect-src 'self' https://${cfg.WARUNG_DOMAIN} https://${dapurDomain} https://*.magsrv.com https://pagead2.googlesyndication.com`,
    `object-src 'none'`,`base-uri 'self'`,`form-action 'self'`,`upgrade-insecure-requests`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="${h(cfg.SEO_LANG)}" dir="ltr">
<head>
<meta charset="UTF-8">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5">
<meta name="theme-color" content="${h(themeColor)}">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
${meta}
${lcpPreload}${prevLink}${nextLink}
<link rel="dns-prefetch" href="https://fonts.googleapis.com">
<link rel="dns-prefetch" href="https://cdnjs.cloudflare.com">
<link rel="dns-prefetch" href="https://a.magsrv.com">
<link rel="dns-prefetch" href="${h(cfg.DAPUR_BASE_URL||'https://dapur.dukunseo.com')}">
<link rel="preconnect" href="https://a.magsrv.com" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${criticalCss}
<link rel="preload" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"></noscript>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<link rel="icon" href="${urlHelper('assets/favicon.ico',cfg)}" type="image/x-icon">
<link rel="apple-touch-icon" sizes="180x180" href="${urlHelper('assets/apple-touch-icon.png',cfg)}">
<link rel="manifest" href="${urlHelper('assets/site.webmanifest',cfg)}">
<meta http-equiv="Content-Security-Policy" content="${h(csp)}">
${adsenseScript(cfg)}${bannerStyles()}
<script type="application/ld+json" nonce="${nonce}">${webpageSchema}</script>
${extraHead}
</head>`;
}

function renderNavHeader({ cfg, currentPage='', q='', isHome=false }) {
  const nameParts = cfg.WARUNG_NAME.split(' ');
  const logo = h(nameParts[0])+(nameParts[1]?`<span>${h(nameParts.slice(1).join(' '))}</span>`:'');
  const navItems = getNavItems(cfg);
  const navLinksHtml = navItems.map(item=>`<li><a href="${item.url}"><i class="fas ${item.icon}" aria-hidden="true"></i> ${item.label}</a></li>`).join('\n');
  const mobileNavLinksHtml = navItems.map(item=>`<a href="${item.url}"><i class="fas ${item.icon}" aria-hidden="true"></i> ${item.label}</a>`).join('\n');
  const bottomNavItems = [
    { url:homeUrl(cfg), icon:'fa-home', label:'Beranda', key:'home' },
    ...navItems.map(item=>({ url:item.url, icon:item.icon, label:item.label, key:item.label.toLowerCase() })),
    { url:searchUrl('',cfg), icon:'fa-search', label:'Cari', key:'search' },
  ];
  const bottomNavHtml = bottomNavItems.map(item=>`<a href="${item.url}" class="bottom-nav-item${currentPage===item.key||(isHome&&item.key==='home')?' active':''}" aria-label="${item.label}"><i class="fas ${item.icon}" aria-hidden="true"></i><span>${item.label}</span></a>`).join('');
  return `<body>
<a href="#main-content" class="skip-link">Langsung ke konten utama</a>
<header>
<nav class="nav" aria-label="Menu utama">
  <div class="nav-inner">
    <a href="${homeUrl(cfg)}" class="nav-logo" aria-label="${h(cfg.WARUNG_NAME)} — Beranda">${logo}</a>
    <ul class="nav-links" role="list" aria-label="Navigasi utama">
      <li><a href="${homeUrl(cfg)}" class="${isHome?'active':''}" ${isHome?'aria-current="page"':''}><i class="fas fa-home" aria-hidden="true"></i> Beranda</a></li>
      ${navLinksHtml}
    </ul>
    <form class="nav-search" role="search" action="${searchUrl('',cfg)}" method="get" aria-label="Cari konten">
      <label for="nav-search-input" class="sr-only">Cari konten</label>
      <i class="fas fa-search nav-search-icon" aria-hidden="true"></i>
      <input id="nav-search-input" type="search" name="q" placeholder="Cari..." value="${h(q)}" autocomplete="off" aria-label="Kata kunci pencarian" maxlength="100">
      <button type="submit" class="sr-only">Cari</button>
    </form>
    <button class="nav-menu-btn" aria-label="Buka menu navigasi" aria-expanded="false" aria-controls="mobileNav" id="menuBtn"><i class="fas fa-bars" aria-hidden="true"></i></button>
  </div>
</nav>
</header>
<nav class="bottom-nav" aria-label="Navigasi bawah"><div class="bottom-nav-inner">${bottomNavHtml}</div></nav>
<div class="mobile-nav" id="mobileNav" role="dialog" aria-modal="true" aria-label="Menu navigasi mobile">
  <div class="mobile-nav-overlay" id="mobileNavOverlay" aria-hidden="true"></div>
  <div class="mobile-nav-panel">
    <div class="mobile-nav-header">
      <span class="nav-logo">${h(cfg.WARUNG_NAME)}</span>
      <button id="mobileNavClose" class="mobile-nav-close" aria-label="Tutup menu"><i class="fas fa-times" aria-hidden="true"></i></button>
    </div>
    <form role="search" action="${searchUrl('',cfg)}" method="get" class="mobile-search-form">
      <div class="search-bar">
        <label for="mobile-search-input" class="sr-only">Cari konten</label>
        <input id="mobile-search-input" type="search" name="q" placeholder="Cari konten..." value="${h(q)}">
        <button type="submit" aria-label="Cari"><i class="fas fa-search" aria-hidden="true"></i></button>
      </div>
    </form>
    <nav class="mobile-nav-links" aria-label="Navigasi mobile">
      <a href="${homeUrl(cfg)}" class="${isHome?'active':''}">${isHome?'aria-current="page"':''}<i class="fas fa-home" aria-hidden="true"></i> Beranda</a>
      ${mobileNavLinksHtml}
    </nav>
  </div>
</div>`;
}

function renderFooter(cfg, request=null, nonce='') {
  const year      = new Date().getFullYear();
  const nameParts = cfg.WARUNG_NAME.split(' ');
  const footerLogo= h(nameParts[0])+(nameParts[1]?`<span>${h(nameParts.slice(1).join(' '))}</span>`:'');
  return `${renderBanner('footer_top', cfg, request, nonce)}
<footer class="footer" role="contentinfo">
  <div class="footer-inner">
    <div class="footer-brand">
      <div class="nav-logo footer-logo">${footerLogo}</div>
      <p class="footer-desc">${h(cfg.WARUNG_TAGLINE)}</p>
    </div>
    <div class="footer-col">
      <h3 class="footer-heading">Kategori</h3>
      <ul role="list">${getNavItems(cfg).map(item=>`<li><a href="${item.url}"><i class="fas ${item.icon}" aria-hidden="true"></i> ${item.label}</a></li>`).join('')}</ul>
    </div>
    <div class="footer-col">
      <h3 class="footer-heading">Informasi</h3>
      <ul role="list">
        <li><a href="/${cfg.PATH_ABOUT}"><i class="fas fa-info-circle" aria-hidden="true"></i> Tentang Kami</a></li>
        <li><a href="/${cfg.PATH_CONTACT}"><i class="fas fa-envelope" aria-hidden="true"></i> Hubungi Kami</a></li>
        <li><a href="/${cfg.PATH_FAQ}"><i class="fas fa-question-circle" aria-hidden="true"></i> FAQ</a></li>
        <li><a href="/sitemap.xml" rel="nofollow"><i class="fas fa-sitemap" aria-hidden="true"></i> Sitemap</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h3 class="footer-heading">Legal</h3>
      <ul role="list">
        <li><a href="/${cfg.PATH_TERMS}"><i class="fas fa-file-contract" aria-hidden="true"></i> Syarat &amp; Ketentuan</a></li>
        <li><a href="/${cfg.PATH_PRIVACY}"><i class="fas fa-lock" aria-hidden="true"></i> Kebijakan Privasi</a></li>
        <li><a href="/${cfg.PATH_DMCA}"><i class="fas fa-copyright" aria-hidden="true"></i> DMCA</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <p class="footer-copy"><small>&copy; ${year} ${h(cfg.WARUNG_NAME)}. Hak cipta dilindungi.</small></p>
    <nav class="footer-legal" aria-label="Tautan legal">
      <a href="/${cfg.PATH_PRIVACY}">Privasi</a>
      <a href="/${cfg.PATH_DMCA}">DMCA</a>
      <a href="/${cfg.PATH_CONTACT}">Kontak</a>
    </nav>
  </div>
</footer>
<script nonce="${generateNonce()}">
(function(){'use strict';
function getEl(id,sel){return document.getElementById(id)||document.querySelector(sel);}
window.toggleMobileNav=function(){const nav=getEl('mobileNav','.mobile-nav'),btn=getEl('menuBtn','.nav-menu-btn');if(!nav)return;const open=nav.classList.contains('open');nav.classList.toggle('open',!open);if(btn)btn.setAttribute('aria-expanded',String(!open));document.body.style.overflow=!open?'hidden':'';if(!open){const f=nav.querySelector('input[type=search]');if(f)setTimeout(()=>f.focus(),150);}};
window.closeMobileNav=function(){const nav=getEl('mobileNav','.mobile-nav'),btn=getEl('menuBtn','.nav-menu-btn');if(!nav||!nav.classList.contains('open'))return;nav.classList.remove('open');if(btn)btn.setAttribute('aria-expanded','false');document.body.style.overflow='';};
function bindEvents(){
  const btn=getEl('menuBtn','.nav-menu-btn'),overlay=getEl('mobileNavOverlay','.mobile-nav-overlay'),closeBtn=getEl('mobileNavClose','.mobile-nav-close'),btt=getEl('backToTop','#backToTop');
  if(btn){btn.removeEventListener('click',window.toggleMobileNav);btn.addEventListener('click',window.toggleMobileNav);}
  else{document.querySelectorAll('.nav-menu-btn').forEach(b=>b.addEventListener('click',window.toggleMobileNav));}
  if(overlay)overlay.addEventListener('click',window.closeMobileNav);
  if(closeBtn)closeBtn.addEventListener('click',window.closeMobileNav);
  if(btt)btt.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'});});
}
document.addEventListener('keydown',function(e){if(e.key==='Escape')window.closeMobileNav();});
try{const path=location.pathname,base='${cfg.WARUNG_BASE_PATH}',clean=path.startsWith(base)?path.slice(base.length):path;document.querySelectorAll('.nav-links a,.mobile-nav-links a').forEach(a=>{const href=a.getAttribute('href')||'';if(href==='/'||href===base+'/'){if(clean==='/'||clean===''||clean===base)a.classList.add('active');}else if(href!=='#'&&clean.startsWith(href)&&href.length>1)a.classList.add('active');});}catch(e){console.warn('[Nav] active highlight failed:',e);}
window.addEventListener('scroll',function(){const btn=getEl('backToTop','#backToTop');if(btn){const s=window.scrollY>400;btn.style.opacity=s?'1':'0';btn.style.visibility=s?'visible':'hidden';}},{passive:true});
document.addEventListener('DOMContentLoaded',function(){const btt=getEl('backToTop','#backToTop');if(btt){btt.style.opacity='0';btt.style.visibility='hidden';}bindEvents();});
window.addEventListener('load',function(){setTimeout(bindEvents,100);});
window.debugNav=function(){console.log({menuBtn:getEl('menuBtn','.nav-menu-btn'),mobileNav:getEl('mobileNav','.mobile-nav'),toggleFn:typeof window.toggleMobileNav});};
if(document.readyState!=='loading')bindEvents();
})();
<\/script>
<div id="connectionStatus" class="connection-status" role="status" aria-live="polite" style="display:none"><i class="fas fa-wifi" aria-hidden="true"></i><span>Koneksi terputus...</span></div>
<button id="backToTop" aria-label="Kembali ke atas"><i class="fas fa-chevron-up" aria-hidden="true"></i></button>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 18 — CARD, GRID, PAGINATION, WIDGETS
// ═══════════════════════════════════════════════════════════════════════

function renderCard(item, cfg, index=99) {
  const icon=TYPE_ICONS[item.type]||'fa-file';
  const typeLabel=TYPE_META[item.type]?.label||ucfirst(item.type||'');
  const durationBadge=item.type==='video'&&item.duration>0?`<span class="badge-duration">${formatDuration(item.duration)}</span>`:'';
  const isAboveFold=index<4;
  const thumbUrl=safeThumb(item,cfg);
  const srcset=`${h(thumbUrl)}?w=320 320w, ${h(thumbUrl)}?w=640 640w`;
  const imgAttrs=isAboveFold?`loading="eager" fetchpriority="high" decoding="async"`:`loading="lazy" decoding="async"`;
  const iUrl=item.type==='album'?albumUrl(item.id,item.title,cfg):contentUrl(item.id,item.title,cfg);
  const shortTitle=mbSubstr(item.title,0,60);
  const schemaType={'video':'https://schema.org/VideoObject','album':'https://schema.org/ImageGallery'}[item.type]||'https://schema.org/CreativeWork';
  return `<article class="card" itemscope itemtype="${schemaType}">
  <a href="${h(iUrl)}" aria-label="${h(shortTitle)} — ${typeLabel}" itemprop="url">
    <div class="card-thumb" style="aspect-ratio:16/9">
      <img src="${h(thumbUrl)}" srcset="${srcset}" sizes="(max-width:480px) 320px, 640px" alt="${h(shortTitle)}" ${imgAttrs} width="320" height="180" onerror="this.src='${h(cfg.DEFAULT_THUMB)}'" itemprop="image">
      ${durationBadge}
      <span class="badge-type" aria-label="${typeLabel}"><i class="fas ${icon}" aria-hidden="true"></i></span>
    </div>
    <div class="card-info">
      <h3 class="card-title" itemprop="name">${h(shortTitle)}</h3>
      <div class="card-meta">
        <span><i class="fas fa-eye" aria-hidden="true"></i> ${formatViews(item.views)}</span>
        <span><time datetime="${isoDate(item.created_at)}" itemprop="datePublished"><i class="fas fa-calendar-alt" aria-hidden="true"></i> ${formatDate(item.created_at)}</time></span>
      </div>
    </div>
  </a>
</article>`;
}

function renderGrid(items, cfg, midBannerEnabled=true, request=null, nonce='') {
  let html='<ul class="content-grid" aria-label="Daftar konten">';
  items.forEach((item,i) => { html+=`<li>${renderCard(item,cfg,i)}</li>`; if (midBannerEnabled) html+=renderBannerMidGrid(i,cfg,request,nonce); });
  html+='</ul>';
  return html;
}

function renderPagination(pagination, buildUrl) {
  if (!pagination) return '';
  // FIX: Hitung total_pages dari total+per_page jika API tidak mengembalikannya
  const perPage = pagination.per_page || pagination.limit || 24;
  const totalItems = pagination.total || 0;
  const totalPages = pagination.total_pages
    || (totalItems && perPage ? Math.ceil(totalItems / perPage) : 1);
  if (totalPages <= 1) return '';
  const page = pagination.current_page || 1;
  // FIX: Hitung has_prev/has_next jika tidak ada dari API
  const hasPrev = (pagination.has_prev !== undefined) ? pagination.has_prev : (page > 1);
  const hasNext = (pagination.has_next !== undefined) ? pagination.has_next : (page < totalPages);
  let html=`<nav class="pagination" aria-label="Navigasi halaman">`;
  if (hasPrev) html+=`<a href="${buildUrl(page-1)}" class="page-btn" rel="prev"><i class="fas fa-chevron-left" aria-hidden="true"></i> Sebelumnya</a>`;
  html+='<div class="page-numbers">';
  const showPages=[];
  if (totalPages<=7) { for (let p=1;p<=totalPages;p++) showPages.push(p); }
  else {
    showPages.push(1); if (page>3) showPages.push('…');
    for (let p=Math.max(2,page-1);p<=Math.min(totalPages-1,page+1);p++) showPages.push(p);
    if (page<totalPages-2) showPages.push('…'); showPages.push(totalPages);
  }
  showPages.forEach(p=>{
    if (p==='…') html+=`<span class="page-ellipsis">…</span>`;
    else html+=`<a href="${buildUrl(p)}" class="page-number${p===page?' active':''}" ${p===page?'aria-current="page"':`aria-label="Halaman ${p}"`}>${p}</a>`;
  });
  html+='</div>';
  if (hasNext) html+=`<a href="${buildUrl(page+1)}" class="page-btn" rel="next">Berikutnya <i class="fas fa-chevron-right" aria-hidden="true"></i></a>`;
  html+='</nav>';
  return html;
}

function renderTrendingWidget(trending, cfg) {
  if (!trending?.length) return '';
  return `<aside class="widget widget--trending" aria-label="Konten trending">
<h2 class="widget-title"><i class="fas fa-fire" aria-hidden="true"></i> Trending</h2>
<ol class="trending-list">
${trending.map((item,i)=>`<li class="trending-item">
  <a href="${h(itemUrl(item,cfg))}" aria-label="${h(mbSubstr(item.title,0,45))}">
    <span class="trending-num">${i+1}</span>
    <img src="${h(safeThumb(item,cfg))}" alt="" loading="lazy" width="80" height="45">
    <div class="trending-info"><p>${h(mbSubstr(item.title,0,45))}</p><small><i class="fas fa-eye"></i> ${formatViews(item.views)}</small></div>
  </a>
</li>`).join('')}
</ol></aside>`;
}

function renderTrendingMobile(trending, cfg) {
  if (!trending?.length) return '';
  return `<section class="trending-mobile-section" aria-label="Trending">
<div class="trending-mobile-header"><i class="fas fa-fire" aria-hidden="true"></i> Trending</div>
<div class="trending-scroll">
${trending.slice(0,10).map((item,i)=>`<div class="trending-scroll-item">
  <a href="${h(itemUrl(item,cfg))}">
    <div class="t-thumb"><img src="${h(safeThumb(item,cfg))}" alt="" loading="lazy" width="130" height="73"><span class="t-num">${i+1}</span></div>
    <p class="t-title">${h(mbSubstr(item.title,0,40))}</p>
  </a>
</div>`).join('')}
</div></section>`;
}

function renderBreadcrumb(items, cfg) {
  return `<nav class="breadcrumb" aria-label="Breadcrumb">
<ol itemscope itemtype="https://schema.org/BreadcrumbList">
${items.map((item,i)=>`<li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
${item.url?`<a href="${h(item.url)}" itemprop="item"><span itemprop="name">${h(item.name)}</span></a>`:`<span itemprop="name" aria-current="page">${h(item.name)}</span>`}
<meta itemprop="position" content="${i+1}">
${i<items.length-1?`</li><li aria-hidden="true"><i class="fas fa-chevron-right"></i>`:''}</li>`).join('\n')}
</ol></nav>`;
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 19 — PAGE HANDLERS
// ═══════════════════════════════════════════════════════════════════════

async function handle404(cfg, seo, request) {
  const canonical=seo.canonical('/404');
  const head=renderHead({ title:'404 - Halaman Tidak Ditemukan | '+cfg.WARUNG_NAME, desc:'Halaman yang kamu cari tidak ditemukan di '+cfg.WARUNG_NAME+'.', canonical, ogImage:cfg.SEO_OG_IMAGE, ogType:'website', noindex:true, cfg, seo, request, extraHead:getUniqueTheme(cfg) });
  const nav=renderNavHeader({cfg});
  const body=`<main id="main-content"><section class="error-page"><div class="container"><div class="error-content">
  <div class="error-icon"><i class="fas fa-exclamation-triangle"></i></div>
  <h1 class="error-title">404</h1>
  <p class="error-subtitle">Halaman Tidak Ditemukan</p>
  <p class="error-desc">URL yang Anda kunjungi tidak ada atau sudah dihapus.</p>
  <div class="error-actions"><a href="${homeUrl(cfg)}" class="btn btn-primary"><i class="fas fa-home"></i> Beranda</a><a href="${searchUrl('',cfg)}" class="btn btn-outline"><i class="fas fa-search"></i> Cari</a></div>
</div></div></section></main>`;
  return new Response(head+nav+body+renderFooter(cfg,request,''), { status:404, headers:htmlHeaders(cfg,'page') });
}

async function handleHome(request, cfg, client, seo) {
  const url=new URL(request.url);
  const page=Math.max(1, parseInt(url.searchParams.get('page')||'1'));
  const type=getContentTypes(cfg).includes(url.searchParams.get('type')||'') ? url.searchParams.get('type') : '';
  const deliveryMode=getDeliveryMode(request);
  const [mediaResult, trendingResult] = await Promise.all([
    client.getMediaList({ page, per_page:cfg.ITEMS_PER_PAGE, type:type||undefined, sort:'newest' }),
    client.getTrending(cfg.TRENDING_COUNT, getContentTypes(cfg).length===1?getContentTypes(cfg)[0]:''),
  ]);
  const items=mediaResult?.data||[], pagination=mediaResult?.meta?.pagination||{}, trending=trendingResult?.data||[];
  const pageTitle=page>1?`${cfg.WARUNG_NAME} - Halaman ${page}`:`${cfg.WARUNG_NAME} — ${cfg.WARUNG_TAGLINE}`;
  const pageDesc=page>1?`Halaman ${page} — ${cfg.SEO_DEFAULT_DESC}`:cfg.SEO_DEFAULT_DESC;
  let canonical;
  if (type&&page===1) canonical=seo.canonical(`/?type=${encodeURIComponent(type)}`,request);
  else canonical=seo.canonical(page>1?`/?page=${page}`:'/',request);
  const homeExtraHead=(!type&&page===1)
    ? seo.websiteSchema('https://'+cfg.WARUNG_DOMAIN+'/'+cfg.PATH_SEARCH+'?q={search_term_string}')+seo.itemListSchema(items,canonical,cfg)
    : seo.itemListSchema(items,canonical,cfg);
  const prevUrl=page>1?seo.canonical(`/?page=${page-1}`):null;
  const _homeTotalPages=pagination.total_pages||(pagination.total&&cfg.ITEMS_PER_PAGE?Math.ceil(pagination.total/cfg.ITEMS_PER_PAGE):1);
  const _homeHasNext=(pagination.has_next!==undefined)?pagination.has_next:(page<_homeTotalPages);
  const nextUrl=_homeHasNext?seo.canonical(`/?page=${page+1}`):null;
  const adNonce=generateNonce();
  const head=renderHead({ title:pageTitle, desc:pageDesc, canonical, ogImage:cfg.SEO_OG_IMAGE, ogType:'website', noindex:false, cfg, seo, request, deliveryMode, extraHead:homeExtraHead+getUniqueTheme(cfg), prevUrl, nextUrl, extraNonces:[adNonce] });
  const nav=renderNavHeader({ cfg, isHome:true });
  const filterTabsItems=getContentTypes(cfg).map(t=>{
    const meta=TYPE_META[t]||{label:ucfirst(t),icon:'fa-file'};
    return `<a href="/?type=${t}" class="filter-tab ${type===t?'active':''}" role="tab"><i class="fas ${meta.icon}" aria-hidden="true"></i> ${meta.label}</a>`;
  }).join('');
  const filterTabs=`<div class="home-filter" role="tablist"><div class="container"><div class="category-filter">
<a href="/" class="filter-tab ${!type?'active':''}" role="tab">Semua</a>${filterTabsItems}
</div></div></div>`;
  let contentSection='';
  if (!items.length) {
    contentSection=`<div class="empty-state"><i class="fas fa-folder-open"></i><p>Tidak ada konten tersedia saat ini.</p></div>`;
  } else {
    contentSection=renderBanner('before_grid',cfg,request,adNonce)+renderGrid(items,cfg,true,request,adNonce)+renderBanner('after_grid',cfg,request,adNonce)+renderPagination(pagination, p=>`?page=${p}${type?'&type='+type:''}`);
  }
  const sidebarCatsHtml=getContentTypes(cfg).map(t=>{
    const meta=TYPE_META[t]||{label:ucfirst(t),icon:'fa-file'};
    return `<a href="/?type=${t}" class="category-sidebar-item ${type===t?'active':''}" aria-current="${type===t?'page':'false'}"><i class="fas ${meta.icon}" aria-hidden="true"></i><span>${meta.label}</span><i class="fas fa-chevron-right" aria-hidden="true"></i></a>`;
  }).join('');
  const sidebarCats=`<aside class="widget"><h2 class="widget-title"><i class="fas fa-tags" aria-hidden="true"></i> Kategori</h2><nav class="category-sidebar">${sidebarCatsHtml}</nav></aside>`;
  const sectionTitle=type?ucfirst(h(type)):'Konten Terbaru';
  const main=`<main id="main-content">${renderBanner('header_top',cfg,null,adNonce)}${filterTabs}${deliveryMode?.lite?'':renderTrendingMobile(trending,cfg)}<div class="container"><div class="layout-main">
<section class="content-grid-section">
  <div class="section-header"><h2 class="section-title">${sectionTitle}${page>1?` <span class="section-page">— Hal. ${page}</span>`:''}</h2></div>
  ${contentSection}
</section>
<aside class="sidebar">
  <div class="sidebar-sticky">
  ${renderBanner('sidebar_top',cfg,request,adNonce)}
  ${deliveryMode?.lite?'':renderTrendingWidget(trending,cfg)}
  ${renderBanner('sidebar_mid',cfg,request,adNonce)}
  ${sidebarCats}
  ${renderBanner('sidebar_bottom',cfg,request,adNonce)}
  </div>
</aside>
</div></div></main>`;
  return new Response(head+nav+main+renderFooter(cfg,request,adNonce), { status:200, headers:htmlHeaders(cfg,'home') });
}

async function handleView(request, cfg, client, seo, segments) {
  const id=parseInt(segments[1]||'0');
  if (!id||id<1) return handle404(cfg,seo,request);
  // FIX: segments[0] sudah di-lowercase oleh router (via `first`), tapi cfg.PATH_* bisa mixed case
  // Pakai .toLowerCase() di kedua sisi agar tidak mismatch saat PATH_CONTENT diubah
  const reqPath=(segments[0]||'').toLowerCase();
  if (cfg.WARUNG_TYPE==='A'&&reqPath===cfg.PATH_ALBUM.toLowerCase()) return handle404(cfg,seo,request);
  if (cfg.WARUNG_TYPE==='B'&&reqPath===cfg.PATH_CONTENT.toLowerCase()) return handle404(cfg,seo,request);
  const [itemResult, relatedResult]=await Promise.all([client.getMediaDetail(id), client.getRelated(id,cfg.RELATED_COUNT)]);
  if (!itemResult?.data||itemResult?.status==='error') return handle404(cfg,seo,request);
  const media=itemResult.data;
  if (!getContentTypes(cfg).includes(media.type)) return handle404(cfg,seo,request);
  const type=media.type||'video', related=relatedResult?.data||[];
  let albumPhotos=[];
  if (type==='album') { const ar=await client.getAlbum(id); albumPhotos=ar?.data?.photos||[]; }
  const fp=seo.generateUniqueSchema(id,type);
  const pageUrl=type==='album'?albumUrl(id,media.title,cfg):contentUrl(id,media.title,cfg);
  const canonical=seo.canonical(pageUrl);
  const pageTitle=seo.title(media.title,id,type);
  const pageDesc=seo.description(media.title,id,type,media.views||0);
  const ogImage=media.thumbnail||cfg.SEO_OG_IMAGE;
  const ogType=type==='video'?'video.movie':'article';
  const keywords=media.tags?.length?media.tags.slice(0,10).join(', '):cfg.SEO_KEYWORDS;
  const playerUrl=await client.getPlayerUrl(id);
  const publishedTime=isoDate(media.created_at);
  const modifiedTime=isoDate(media.updated_at||media.created_at);
  const extraHead=seo.contentSchema(media,canonical,playerUrl)+seo.breadcrumbSchema([{name:'Beranda',url:'/'},{name:ucfirst(type),url:'/'+cfg.PATH_CATEGORY+'/'+type},{name:media.title,url:null}],pageUrl)+getUniqueTheme(cfg);
  const adNonce=generateNonce();
  const head=renderHead({ title:pageTitle, desc:pageDesc, canonical, ogImage, ogType, keywords, cfg, seo, request, extraHead, contentId:id, contentType:type, publishedTime, modifiedTime, extraNonces:[adNonce] });
  const nav=renderNavHeader({cfg});
  let playerHtml='';
  if (type==='video') {
    playerHtml=`<div class="player-wrapper"><iframe src="${h(playerUrl)}" allowfullscreen loading="eager" class="player-frame" title="${h(media.title)}" data-id="${id}" width="1280" height="720" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-pointer-lock allow-downloads" referrerpolicy="strict-origin-when-cross-origin" aria-label="Pemutar video: ${h(media.title)}"></iframe></div>`;
  } else if (type==='album') {
    playerHtml=`<div class="album-grid" role="list">${albumPhotos.map((photo,i)=>`<div class="album-item" role="listitem"><button type="button" class="album-thumb-btn js-lightbox-open" data-src="${h(photo.url)}" data-idx="${i}" data-title="${h(media.title)}" aria-label="Buka foto ${i+1}"><img src="${h(photo.url)}" srcset="${h(photo.url)}?w=320 320w, ${h(photo.url)}?w=640 640w" sizes="(max-width:480px) 320px, 640px" alt="${h(media.title)} - Foto ${i+1}" loading="${i<4?'eager':'lazy'}" class="album-thumb" width="320" height="240"></button></div>`).join('')}${!albumPhotos.length?`<p class="empty-state">Foto tidak tersedia.</p>`:''}</div>`;
  }
  const tagsHtml=media.tags?.length?`<div class="content-tags" role="list">${media.tags.map(t=>`<a href="${h(tagUrl(t,cfg))}" class="tag" role="listitem">#${h(t)}</a>`).join('')}</div>`:'';
  let descHtml='';
  if (media.description&&type!=='story') {
    const short=mbSubstr(stripTags(media.description),0,300);
    descHtml=`<div class="content-desc"><p>${h(short)}</p>${media.description.length>300?`<button type="button" class="read-more js-toggle-desc" aria-expanded="false" aria-controls="full-desc-${id}">Baca selengkapnya</button><div id="full-desc-${id}" class="full-desc hidden">${nl2br(h(media.description))}</div>`:''}</div>`;
  }
  const contentInfo=`<div class="content-info"><h1 class="content-title">${h(media.title)}</h1>
<div class="content-meta">
  <span class="badge"><i class="fas ${TYPE_ICONS[type]||'fa-file'}" aria-hidden="true"></i> ${h(ucfirst(type))}</span>
  <span><i class="fas fa-eye"></i> ${formatViews(media.views||0)} penonton</span>
  ${media.duration>0?`<span><i class="fas fa-clock"></i> ${formatDuration(media.duration)}</span>`:''}
  <span><time datetime="${publishedTime}"><i class="fas fa-calendar-alt"></i> ${formatDate(media.created_at||'')}</time></span>
</div>
${tagsHtml}${descHtml}
<div class="action-buttons">
  <button type="button" id="btnCopyLink" class="btn btn-outline" data-url="${h(canonical)}"><i class="fas fa-link"></i> Salin Link</button>
  <button type="button" id="btnShare" class="btn btn-outline"><i class="fas fa-share-alt"></i> Share</button>
</div></div>`;
  const relatedHtml=related.length?`<ol class="related-list">${related.map(rel=>`<li><a href="${h(itemUrl(rel,cfg))}" class="related-item"><img src="${h(safeThumb(rel,cfg))}" alt="" loading="lazy" width="80" height="45" onerror="this.src='${h(cfg.DEFAULT_THUMB)}'"><div class="related-info"><p class="related-title">${h(mbSubstr(rel.title,0,50))}</p><small class="related-meta"><span class="badge-small"><i class="fas ${TYPE_ICONS[rel.type]||'fa-file'}"></i> ${h(rel.type||'video')}</span><span><i class="fas fa-eye"></i> ${formatViews(rel.views||0)}</span></small></div></a></li>`).join('')}</ol>`:`<p class="empty-state">Tidak ada konten terkait.</p>`;
  const popularTags=media.tags?.slice(0,5).map(t=>`<a href="${h(tagUrl(t,cfg))}" class="tag">#${h(t)}</a>`).join('')||'';
  const lightboxHtml=type==='album'?`<div id="lightbox" class="lightbox hidden" role="dialog" aria-modal="true"><div class="lightbox-content"><img id="lightbox-img" src="" alt="" class="lightbox-image"><button type="button" id="lightboxClose" class="lightbox-close" aria-label="Tutup"><i class="fas fa-times"></i></button><div class="lightbox-nav"><button type="button" id="lightboxPrev" class="lightbox-prev" aria-label="Sebelumnya"><i class="fas fa-chevron-left"></i></button><button type="button" id="lightboxNext" class="lightbox-next" aria-label="Berikutnya"><i class="fas fa-chevron-right"></i></button></div><div class="lightbox-caption" id="lightbox-caption"></div></div></div>
<script nonce="${generateNonce()}">var _lb={idx:0,photos:${JSON.stringify(albumPhotos.map(p=>p.url))},titles:${JSON.stringify(albumPhotos.map(()=>media.title))}};function openLightbox(src,i,t){_lb.idx=i;var img=document.getElementById('lightbox-img'),cap=document.getElementById('lightbox-caption'),lb=document.getElementById('lightbox');img.src=src;img.alt=t+' - Foto '+(i+1);cap.textContent=t+' ('+(i+1)+' / '+_lb.photos.length+')';lb.classList.remove('hidden');document.body.style.overflow='hidden';lb.querySelector('.lightbox-close').focus();}function closeLightbox(e){if(!e||e.target===e.currentTarget||e.target.closest('.lightbox-close')){var lb=document.getElementById('lightbox');lb.classList.add('hidden');document.body.style.overflow='';}}function navigateLightbox(d){var n=(_lb.idx+d+_lb.photos.length)%_lb.photos.length;_lb.idx=n;var img=document.getElementById('lightbox-img'),cap=document.getElementById('lightbox-caption');img.src=_lb.photos[n];cap.textContent=_lb.titles[n]+' ('+(n+1)+' / '+_lb.photos.length+')';}(function(){var lb=document.getElementById('lightbox'),lc=document.getElementById('lightboxClose'),lp=document.getElementById('lightboxPrev'),ln=document.getElementById('lightboxNext');if(lb)lb.addEventListener('click',function(e){if(e.target===lb)closeLightbox(e);});if(lc)lc.addEventListener('click',closeLightbox);if(lp)lp.addEventListener('click',function(){navigateLightbox(-1);});if(ln)ln.addEventListener('click',function(){navigateLightbox(1);});document.querySelectorAll('.js-lightbox-open').forEach(function(btn){btn.addEventListener('click',function(){openLightbox(btn.dataset.src,parseInt(btn.dataset.idx),btn.dataset.title);});});})();document.addEventListener('keydown',function(e){var lb=document.getElementById('lightbox');if(lb&&!lb.classList.contains('hidden')){if(e.key==='Escape')closeLightbox();if(e.key==='ArrowLeft')navigateLightbox(-1);if(e.key==='ArrowRight')navigateLightbox(1);}});<\/script>`:'';;
  const pageScript=`<script nonce="${generateNonce()}">function copyLink(btn){var url=btn.dataset.url||location.href;if(navigator.clipboard){navigator.clipboard.writeText(url).then(()=>showToast('Link disalin!')).catch(()=>fallbackCopy(url));}else fallbackCopy(url);}function fallbackCopy(text){var ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;opacity:0;top:-999px';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');showToast('Link disalin!');}catch{prompt('Salin link:',text);}document.body.removeChild(ta);}function showToast(msg){var ex=document.querySelector('.toast');ex&&ex.remove();var t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.parentNode&&t.remove(),2200);}function shareContent(){if(navigator.share){navigator.share({title:${JSON.stringify(media.title)},url:location.href}).catch(()=>{});}else copyLink({dataset:{url:location.href}});}function toggleDesc(btn){var id=btn.getAttribute('aria-controls'),fd=document.getElementById(id);if(!fd)return;var open=btn.getAttribute('aria-expanded')==='true';fd.classList.toggle('hidden',open);fd.setAttribute('aria-hidden',String(open));btn.setAttribute('aria-expanded',String(!open));btn.textContent=open?'Baca selengkapnya':'Tutup';}
// FIX CSP: bind copy/share/toggleDesc via addEventListener
(function(){var cp=document.getElementById('btnCopyLink'),sh=document.getElementById('btnShare');if(cp)cp.addEventListener('click',function(){copyLink(this);});if(sh)sh.addEventListener('click',shareContent);document.querySelectorAll('.js-toggle-desc').forEach(function(b){b.addEventListener('click',function(){toggleDesc(this);});});})();<\/script>`;
  const breadcrumbHtml=renderBreadcrumb([{name:'Beranda',url:homeUrl(cfg)},{name:ucfirst(type),url:categoryUrl(type,1,cfg)},{name:mbSubstr(media.title,0,40),url:null}],cfg);
  const main=`<main id="main-content" class="view-main"><div class="view-layout">
<article class="view-content">
  ${breadcrumbHtml}${playerHtml}${contentInfo}${renderBanner('after_content',cfg,request,adNonce)}
</article>
<aside class="view-sidebar">
  <h2 class="widget-title"><i class="fas fa-layer-group"></i> Konten Terkait</h2>
  ${relatedHtml}
  ${popularTags?`<section><h3 class="widget-title" style="margin-top:16px"><i class="fas fa-tags"></i> Tag</h3><div class="tag-cloud">${popularTags}</div></section>`:''}
</aside>
</div></main>${lightboxHtml}${pageScript}`;
  return new Response(head+nav+main+renderFooter(cfg,request,adNonce), { status:200, headers:htmlHeaders(cfg,'article') });
}

async function handleSearch(request, cfg, client, seo) {
  const url=new URL(request.url);
  const q=(url.searchParams.get('q')||'').trim().slice(0,100);
  const type=getContentTypes(cfg).includes(url.searchParams.get('type')||'')?url.searchParams.get('type'):'';
  const page=Math.max(1, parseInt(url.searchParams.get('page')||'1'));
  let items=[], pagination={}, total=0, errorMsg='';
  if (q.length>=2) {
    try {
      const params={page,per_page:cfg.ITEMS_PER_PAGE};
      if (type) params.type=type;
      const result=await client.search(q,params);
      if (result?.status==='error') errorMsg=result.message||'Pencarian gagal.';
      else { items=result?.data||[]; pagination=result?.meta?.pagination||{}; total=pagination.total||0; }
    } catch(err) { if (cfg.DAPUR_DEBUG) console.error('Search error:',err.message); errorMsg='Terjadi kesalahan saat mencari.'; }
  }
  const trending=(await client.getTrending(8).catch(()=>({data:[]})))?.data||[];
  const pageTitle=q?`Cari "${mbSubstr(q,0,50)}"${page>1?' - Hal. '+page:''}  | ${cfg.WARUNG_NAME}`:`Pencarian | ${cfg.WARUNG_NAME}`;
  const pageDesc=q?`Hasil pencarian untuk "${q}" — ${numberFormat(total)} konten di ${cfg.WARUNG_NAME}.`:'Cari video dan album di sini.';
  const canonical=seo.canonical('/'+cfg.PATH_SEARCH+(q?'?q='+encodeURIComponent(q):''),request);
  const adNonce=generateNonce();
  const head=renderHead({ title:pageTitle, desc:pageDesc, canonical, ogImage:cfg.SEO_OG_IMAGE, ogType:'website', noindex:!q, cfg, seo, request, extraHead:getUniqueTheme(cfg), extraNonces:[adNonce] });
  const nav=renderNavHeader({ cfg, currentPage:'search', q });
  const filterUrl=(t,pg=1)=>{const p={};if(q)p.q=q;if(t)p.type=t;if(pg>1)p.page=pg;return '/'+cfg.PATH_SEARCH+'?'+new URLSearchParams(p).toString();};
  const filterTabs=q?`<div class="filter-tabs"><a href="${filterUrl('')}" class="filter-tab ${!type?'active':''}">Semua</a>${getContentTypes(cfg).map(t=>{const meta=TYPE_META[t]||{icon:'fa-file'};return `<a href="${filterUrl(t)}" class="filter-tab ${type===t?'active':''}"><i class="fas ${meta.icon}"></i> ${ucfirst(t)}</a>`;}).join('')}</div>`:'';
  const pageHeader=`<div class="page-header"><div class="container">
<div class="page-label"><i class="fas fa-search"></i> Pencarian</div>
<h1 class="page-title">${q?`Hasil untuk <em>"${h(mbSubstr(q,0,50))}"</em>`:'Cari Konten'}</h1>
<form class="search-bar-large" role="search" action="/${cfg.PATH_SEARCH}" method="get">
  <div class="search-bar">
    <label for="search-main-input" class="sr-only">Kata kunci pencarian</label>
    <input id="search-main-input" type="search" name="q" value="${h(q)}" placeholder="Ketik kata kunci..." autocomplete="off" autofocus maxlength="100">
    ${type?`<input type="hidden" name="type" value="${h(type)}">`:''}
    <button type="submit" aria-label="Cari"><i class="fas fa-search"></i></button>
  </div>
</form>
${filterTabs}
</div></div>`;
  let contentSection='';
  if (!q) contentSection=`<div class="no-results"><div class="no-results-icon"><i class="fas fa-search"></i></div><h2>Mau cari apa?</h2><p>Ketik kata kunci di kolom pencarian.</p></div>`;
  else if (errorMsg) contentSection=`<div class="no-results"><div class="no-results-icon"><i class="fas fa-exclamation-triangle"></i></div><h2>Pencarian gagal</h2><p>${h(errorMsg)}</p></div>`;
  else if (!items.length) contentSection=`<div class="no-results"><div class="no-results-icon"><i class="fas fa-folder-open"></i></div><h2>Tidak ada hasil untuk "${h(q)}"</h2><p>Coba kata kunci lain.</p>${type?`<div class="no-results-actions"><a href="${filterUrl('')}" class="btn btn-outline">Hapus filter</a></div>`:''}</div>`;
  else {
    const from=(page-1)*cfg.ITEMS_PER_PAGE+1, to=Math.min(page*cfg.ITEMS_PER_PAGE,total);
    contentSection=`<div class="search-stats"><i class="fas fa-layer-group"></i> Menampilkan <strong>${from}–${to}</strong> dari <strong>${numberFormat(total)}</strong> hasil</div>`
      +renderBanner('before_grid',cfg,request,adNonce)+renderGrid(items,cfg,true,request,adNonce)+renderBanner('after_grid',cfg,request,adNonce)+renderPagination(pagination, p=>filterUrl(type,p));
  }
  const allTags={};
  items.forEach(item=>(item.tags||[]).forEach(t=>{allTags[t]=(allTags[t]||0)+1;}));
  const topTags=Object.entries(allTags).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([t])=>t);
  const tagsWidget=topTags.length?`<aside class="widget"><h2 class="widget-title"><i class="fas fa-tags"></i> Tag Terkait</h2><div class="tag-cloud">${topTags.map(t=>`<a href="${h(tagUrl(t,cfg))}" class="tag">#${h(t)}</a>`).join('')}</div></aside>`:'';
  const main=`${pageHeader}<main id="main-content" class="container"><div class="layout-main">
<section>${contentSection}</section>
<aside class="sidebar">${renderBanner('sidebar_top',cfg,request,adNonce)}${renderTrendingWidget(trending,cfg)}${renderBanner('sidebar_mid',cfg,request,adNonce)}${tagsWidget}${renderBanner('sidebar_bottom',cfg,request,adNonce)}</aside>
</div></main>`;
  return new Response(head+nav+main+renderFooter(cfg,request,adNonce), { status:200, headers:htmlHeaders(cfg,'search') });
}

async function handleTag(request, cfg, client, seo, segments) {
  const tagRaw=decodeURIComponent(segments[1]||'');
  const tag=mbSubstr((tagRaw).trim().replace(/<[^>]+>/g,''),0,80);
  if (!tag) return handle404(cfg,seo,request);
  const url=new URL(request.url);
  const page=Math.max(1, parseInt(url.searchParams.get('page')||'1'));
  const type=getContentTypes(cfg).includes(url.searchParams.get('type')||'')?url.searchParams.get('type'):'';
  const params={page,per_page:cfg.ITEMS_PER_PAGE};
  if (type) params.type=type;
  const [result, trendingResult]=await Promise.all([client.getByTag(tag,params), client.getTrending(6).catch(()=>({data:[]}))]);
  const items=result?.data||[], pagination=result?.meta?.pagination||{}, total=pagination.total||0, trending=trendingResult?.data||[];
  const errorMsg=result?.status==='error'?(result.message||'Gagal mengambil data tag.'):'';
  const typeCounts={};
  items.forEach(item=>{typeCounts[item.type]=(typeCounts[item.type]||0)+1;});
  const relatedTagsMap={};
  items.forEach(item=>(item.tags||[]).forEach(t=>{if(t.toLowerCase()!==tag.toLowerCase())relatedTagsMap[t]=(relatedTagsMap[t]||0)+1;}));
  const relatedTags=Object.entries(relatedTagsMap).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([t])=>t);
  const pageTitle=`#${tag}${page>1?' - Hal. '+page:''} | ${cfg.WARUNG_NAME}`;
  const pageDesc=`Konten bertag "${tag}" di ${cfg.WARUNG_NAME}. ${numberFormat(total)} konten tersedia.`;
  const canonical=seo.canonical('/'+cfg.PATH_TAG+'/'+encodeURIComponent(tag.toLowerCase()));
  const extraHead=seo.breadcrumbSchema([{name:'Beranda',url:'/'},{name:'Tag',url:'/'+cfg.PATH_TAG},{name:'#'+tag,url:null}],'/'+cfg.PATH_TAG+'/'+encodeURIComponent(tag.toLowerCase()))+getUniqueTheme(cfg);
  const adNonce=generateNonce();
  const head=renderHead({ title:pageTitle, desc:pageDesc, canonical, ogImage:cfg.SEO_OG_IMAGE, ogType:'website', noindex:false, cfg, seo, request, extraHead, extraNonces:[adNonce] });
  const nav=renderNavHeader({cfg});
  const tagFilterUrl=(t,p=1)=>{const base='/'+cfg.PATH_TAG+'/'+encodeURIComponent(tag);const ps={};if(t)ps.type=t;if(p>1)ps.page=p;return base+(Object.keys(ps).length?'?'+new URLSearchParams(ps).toString():'');};
  const fromN=(page-1)*cfg.ITEMS_PER_PAGE+1, toN=Math.min(page*cfg.ITEMS_PER_PAGE,total);
  const filterTabs=total>0&&Object.keys(typeCounts).length?`<div class="filter-tabs"><a href="${tagFilterUrl('')}" class="filter-tab ${!type?'active':''}">Semua</a>${Object.entries(typeCounts).map(([t,c])=>`<a href="${tagFilterUrl(t)}" class="filter-tab ${type===t?'active':''}"><i class="fas ${TYPE_ICONS[t]||'fa-file'}"></i> ${ucfirst(t)} (${c})</a>`).join('')}</div>`:'';
  const breadcrumbHtml=renderBreadcrumb([{name:'Beranda',url:homeUrl(cfg)},{name:'Tag',url:'/'+cfg.PATH_TAG},{name:'#'+tag,url:null}],cfg);
  const tagHeader=`<div class="tag-header"><div class="container">${breadcrumbHtml}
<div class="tag-hero"><i class="fas fa-tag"></i><span>#${h(tag)}</span></div>
<p class="page-desc">${total>0?`Menampilkan ${numberFormat(fromN)}–${numberFormat(toN)} dari <strong>${numberFormat(total)}</strong> konten`:'Tidak ada konten dengan tag ini.'}</p>
${filterTabs}</div></div>`;
  let contentSection='';
  if (errorMsg) contentSection=`<div class="no-results"><div class="no-results-icon"><i class="fas fa-exclamation-triangle"></i></div><h2>Terjadi Kesalahan</h2><p>${h(errorMsg)}</p><div class="no-results-actions"><a href="${homeUrl(cfg)}" class="btn btn-outline"><i class="fas fa-home"></i> Beranda</a></div></div>`;
  else if (!items.length) contentSection=`<div class="no-results"><div class="no-results-icon"><i class="fas fa-tag"></i></div><h2>Tag "${h(tag)}" tidak ditemukan</h2><p>Belum ada konten dengan tag ini.</p><div class="no-results-actions"><a href="${homeUrl(cfg)}" class="btn btn-outline"><i class="fas fa-home"></i> Beranda</a></div></div>`;
  else contentSection=renderBanner('before_grid',cfg,request,adNonce)+renderGrid(items,cfg,true,request,adNonce)+renderBanner('after_grid',cfg,request,adNonce)+renderPagination(pagination, p=>tagFilterUrl(type,p));
  const relTagsWidget=relatedTags.length?`<aside class="widget"><h2 class="widget-title"><i class="fas fa-tags"></i> Tag Terkait</h2><div class="tag-cloud">${relatedTags.map(t=>`<a href="${h(tagUrl(t,cfg))}" class="tag">#${h(t)}</a>`).join('')}</div></aside>`:'';
  const main=`${tagHeader}<main id="main-content" class="container"><div class="layout-main">
<section>${contentSection}</section>
<aside class="sidebar">${renderBanner('sidebar_top',cfg,request,adNonce)}${relTagsWidget}${renderBanner('sidebar_mid',cfg,request,adNonce)}${renderTrendingWidget(trending,cfg)}${renderBanner('sidebar_bottom',cfg,request,adNonce)}</aside>
</div></main>`;
  return new Response(head+nav+main+renderFooter(cfg,request,adNonce), { status:200, headers:htmlHeaders(cfg,'list') });
}

async function handleCategory(request, cfg, client, seo, segments) {
  const type=(segments[1]||'').toLowerCase().replace(/[^a-z]/g,'');
  const validTypes=getContentTypes(cfg);
  if (!validTypes.includes(type)) return handle404(cfg,seo,request);
  const url=new URL(request.url);
  const page=Math.max(1, parseInt(url.searchParams.get('page')||segments[2]||'1'));
  const [mediaResult, trendingResult]=await Promise.all([
    client.getMediaList({page,per_page:cfg.ITEMS_PER_PAGE,type,sort:'newest'}),
    client.getTrending(cfg.TRENDING_COUNT,type),
  ]);
  const items=mediaResult?.data||[], pagination=mediaResult?.meta?.pagination||{}, trending=trendingResult?.data||[];
  const typeLabel={video:'Video',album:'Album'}[type]||ucfirst(type);
  const typeIcon={video:'fa-video',album:'fa-images'}[type]||'fa-file';
  const pageTitle=`${typeLabel}${page>1?' — Halaman '+page:''} | ${cfg.WARUNG_NAME}`;
  const pageDesc=`Kumpulan ${typeLabel.toLowerCase()} terbaru di ${cfg.WARUNG_NAME}. ${numberFormat(pagination.total||0)} konten tersedia.`;
  const canonical=seo.canonical('/'+cfg.PATH_CATEGORY+'/'+type+(page>1?'/'+page:''));
  const prevUrl=page>1?seo.canonical('/'+cfg.PATH_CATEGORY+'/'+type+(page>2?'/'+(page-1):'')):null;
  const _catTotalPages=pagination.total_pages||(pagination.total&&cfg.ITEMS_PER_PAGE?Math.ceil(pagination.total/cfg.ITEMS_PER_PAGE):1);
  const _catHasNext=(pagination.has_next!==undefined)?pagination.has_next:(page<_catTotalPages);
  const nextUrl=_catHasNext?seo.canonical('/'+cfg.PATH_CATEGORY+'/'+type+'/'+(page+1)):null;
  const extraHead=seo.itemListSchema(items,canonical,cfg)+seo.breadcrumbSchema([{name:'Beranda',url:'/'},{name:typeLabel,url:null}],'/'+cfg.PATH_CATEGORY+'/'+type)+getUniqueTheme(cfg);
  const adNonce=generateNonce();
  const head=renderHead({ title:pageTitle, desc:pageDesc, canonical, ogImage:cfg.SEO_OG_IMAGE, ogType:'website', cfg, seo, request, extraHead, prevUrl, nextUrl, extraNonces:[adNonce] });
  const nav=renderNavHeader({cfg});
  const breadcrumbHtml=renderBreadcrumb([{name:'Beranda',url:homeUrl(cfg)},{name:typeLabel,url:null}],cfg);
  const pageHeader=`<div class="page-header"><div class="container">
${breadcrumbHtml}
<div class="page-label"><i class="fas ${typeIcon}"></i> Kategori</div>
<h1 class="page-title">${h(typeLabel)}</h1>
${pagination.total?`<p class="page-desc">${numberFormat(pagination.total)} konten${page>1?' — Halaman '+page:''}</p>`:''}
</div></div>`;
  let contentSection='';
  if (!items.length) contentSection=`<div class="empty-state"><i class="fas fa-folder-open"></i><p>Tidak ada konten ${h(typeLabel.toLowerCase())} saat ini.</p></div>`;
  else contentSection=renderBanner('before_grid',cfg,request,adNonce)+renderGrid(items,cfg,true,request,adNonce)+renderBanner('after_grid',cfg,request,adNonce)+renderPagination(pagination, p=>'/'+cfg.PATH_CATEGORY+'/'+type+(p>1?'/'+p:''));
  const main=`${pageHeader}<main id="main-content" class="container"><div class="layout-main">
<section>${contentSection}</section>
<aside class="sidebar">${renderBanner('sidebar_top',cfg,request,adNonce)}${renderTrendingWidget(trending,cfg)}${renderBanner('sidebar_bottom',cfg,request,adNonce)}</aside>
</div></main>`;
  return new Response(head+nav+main+renderFooter(cfg,request,adNonce), { status:200, headers:htmlHeaders(cfg,'list') });
}

function handleStaticPage(cfg, seo, request, slug) {
  const env=cfg._env||{};
  const ev=(key,fallback)=>env[key]||cfg[key]||fallback;
  const faqData=[
    { q:'Apakah gratis?', a:'Ya, sepenuhnya gratis tanpa daftar.' },
    { q:'Cara melaporkan konten?', a:`Kirim email ke ${cfg.CONTACT_EMAIL}.` },
    { q:'Apakah perlu registrasi?', a:'Tidak, Anda bisa langsung menonton tanpa mendaftar.' },
  ];
  const pages={
    [cfg.PATH_ABOUT.toLowerCase()]:{ title:ev('PAGE_ABOUT_TITLE','Tentang Kami'), icon:'fa-info-circle', desc:ev('PAGE_ABOUT_DESC','Tentang '+cfg.WARUNG_NAME), content:ev('PAGE_ABOUT_CONTENT',`<h2>Tentang ${h(cfg.WARUNG_NAME)}</h2><p>${h(cfg.WARUNG_NAME)} adalah platform streaming gratis yang hadir untuk memberikan pengalaman menonton terbaik. Akses ribuan konten video dan album tanpa registrasi, kapan saja dan di mana saja.</p><p>Kami berkomitmen untuk menyediakan konten berkualitas dengan kecepatan streaming optimal.</p>`) },
    [cfg.PATH_CONTACT.toLowerCase()]:{ title:ev('PAGE_CONTACT_TITLE','Hubungi Kami'), icon:'fa-envelope', desc:ev('PAGE_CONTACT_DESC','Kontak '+cfg.WARUNG_NAME), content:ev('PAGE_CONTACT_CONTENT',`<h2>Hubungi Kami</h2><p>Ada pertanyaan atau masukan? Kami siap membantu.</p><address><p><strong>Email:</strong> <a href="mailto:${h(cfg.CONTACT_EMAIL)}">${h(cfg.CONTACT_EMAIL)}</a></p><p><strong>Nama:</strong> ${h(cfg.CONTACT_EMAIL_NAME)}</p></address>`) },
    [cfg.PATH_FAQ.toLowerCase()]:{ title:ev('PAGE_FAQ_TITLE','FAQ'), icon:'fa-question-circle', desc:ev('PAGE_FAQ_DESC','Pertanyaan yang sering diajukan tentang '+cfg.WARUNG_NAME), content:ev('PAGE_FAQ_CONTENT',`<h2>Pertanyaan Umum</h2><div class="faq-list"><details><summary>Apakah layanan ini gratis?</summary><p>Ya, sepenuhnya gratis tanpa registrasi.</p></details><details><summary>Cara melaporkan konten yang bermasalah?</summary><p>Kirim email ke <a href="mailto:${h(cfg.CONTACT_EMAIL)}">${h(cfg.CONTACT_EMAIL)}</a></p></details><details><summary>Apakah perlu daftar akun?</summary><p>Tidak perlu, langsung tonton tanpa mendaftar.</p></details></div>`), schema:seo.faqSchema(faqData) },
    [cfg.PATH_TERMS.toLowerCase()]:{ title:ev('PAGE_TERMS_TITLE','Syarat & Ketentuan'), icon:'fa-file-contract', desc:ev('PAGE_TERMS_DESC','Syarat dan Ketentuan penggunaan '+cfg.WARUNG_NAME), content:ev('PAGE_TERMS_CONTENT',`<h2>Syarat &amp; Ketentuan</h2><p>Dengan menggunakan ${h(cfg.WARUNG_NAME)}, Anda setuju:</p><ul><li>Konten hanya untuk penggunaan pribadi dan non-komersial.</li><li>Dilarang mendistribusikan ulang tanpa izin tertulis.</li><li>Pengguna bertanggung jawab atas penggunaan layanan.</li></ul><p>Terakhir diperbarui: ${new Date().toLocaleDateString('id-ID',{year:'numeric',month:'long'})}</p>`) },
    [cfg.PATH_PRIVACY.toLowerCase()]:{ title:ev('PAGE_PRIVACY_TITLE','Kebijakan Privasi'), icon:'fa-lock', desc:ev('PAGE_PRIVACY_DESC','Kebijakan Privasi '+cfg.WARUNG_NAME), content:ev('PAGE_PRIVACY_CONTENT',`<h2>Kebijakan Privasi</h2><p>Kami menghargai privasi Anda:</p><ul><li>Kami mengumpulkan data anonim untuk meningkatkan layanan.</li><li>Kami tidak menjual data pribadi kepada pihak ketiga.</li><li>Cookie digunakan untuk meningkatkan pengalaman browsing.</li></ul><p>Pertanyaan: <a href="mailto:${h(cfg.CONTACT_EMAIL)}">${h(cfg.CONTACT_EMAIL)}</a></p><p>Terakhir diperbarui: ${new Date().toLocaleDateString('id-ID',{year:'numeric',month:'long'})}</p>`) },
    [cfg.PATH_DMCA.toLowerCase()]:{ title:ev('PAGE_DMCA_TITLE','Kebijakan DMCA'), icon:'fa-copyright', desc:ev('PAGE_DMCA_DESC','Kebijakan DMCA '+cfg.WARUNG_NAME), content:ev('PAGE_DMCA_CONTENT',`<h2>Kebijakan DMCA</h2><p>${h(cfg.WARUNG_NAME)} menghormati hak kekayaan intelektual. Kirim laporan ke:</p><address><p><strong>Email:</strong> <a href="mailto:${h(cfg.CONTACT_EMAIL)}">${h(cfg.CONTACT_EMAIL)}</a></p></address><p>Laporan harus menyertakan: identifikasi karya, URL konten, informasi kontak Anda, dan pernyataan keakuratan informasi.</p><p>Kami merespons dalam <strong>3 hari kerja</strong>.</p>`) },
  };
  const page=pages[slug];
  if (!page) return handle404(cfg,seo,request);
  const canonical=seo.canonical('/'+slug);
  const pageMetaTitle=page.title+' | '+cfg.WARUNG_NAME;
  const extraHead=(page.schema||'')+getUniqueTheme(cfg)+seo.breadcrumbSchema([{name:'Beranda',url:'/'},{name:page.title,url:null}],'/'+slug);
  const head=renderHead({ title:pageMetaTitle, desc:page.desc, canonical, ogImage:cfg.SEO_OG_IMAGE, ogType:'website', noindex:false, cfg, seo, request, extraHead });
  const nav=renderNavHeader({cfg});
  const breadcrumbHtml=renderBreadcrumb([{name:'Beranda',url:homeUrl(cfg)},{name:page.title,url:null}],cfg);
  const body=`<main id="main-content" class="container" style="padding-top:2rem;padding-bottom:3rem">
${breadcrumbHtml}
<article style="max-width:800px;margin:0 auto;background:var(--bg-card,#1e222b);border-radius:var(--border-radius,8px);padding:2rem 2.5rem;box-shadow:var(--shadow-sm)">
  <header><p class="page-label"><i class="fas ${h(page.icon)}"></i> ${h(page.title)}</p></header>
  <div class="static-content" style="line-height:1.8;color:var(--text-color)">${page.content}</div>
</article>
</main>`;
  return new Response(head+nav+body+renderFooter(cfg,request,''), { status:200, headers:htmlHeaders(cfg,'page') });
}

async function handleSitemap(request, cfg, client, env, honeyPrefix, cannibal=null) {
  const ua=request.headers.get('User-Agent')||'';
  const isGoogle=ua.includes('Googlebot')||ua.includes('Google-InspectionTool');
  const phase=getMoonPhase();
  const salt=env.SITEMAP_SALT||cfg.WARUNG_DOMAIN;
  const shuffleSeed=hashSeed(salt+':'+phase+':'+new Date().getUTCHours()+':'+new Date().getUTCDay());
  let urls=[];
  if (isGoogle) {
    const baseUrl='https://'+cfg.WARUNG_DOMAIN;
    const today=new Date().toISOString().slice(0,10);
    urls=[
      {loc:baseUrl+'/',changefreq:'daily',priority:'1.0',lastmod:today},
      {loc:baseUrl+'/'+cfg.PATH_SEARCH,changefreq:'weekly',priority:'0.5'},
      ...getContentTypes(cfg).map(t=>({loc:baseUrl+'/'+cfg.PATH_CATEGORY+'/'+t,changefreq:'daily',priority:'0.9',lastmod:today})),
    ];
    [cfg.PATH_ABOUT,cfg.PATH_CONTACT,cfg.PATH_FAQ,cfg.PATH_DMCA,cfg.PATH_TERMS,cfg.PATH_PRIVACY].forEach(slug=>{
      urls.push({loc:baseUrl+'/'+slug,changefreq:'monthly',priority:'0.6'});
    });

    // ── Keyword cannibalize landing pages — priority 0.8, update daily ──
    if (cannibal) {
      cannibal.getAllUrls().forEach(kwUrl=>{
        urls.push({loc:kwUrl,changefreq:'daily',priority:'0.8',lastmod:today});
      });
    }

    try {
      const [trendingRes,recentRes]=await Promise.all([client.getTrending(100),client.getMediaList({page:1,per_page:100,sort:'newest'})]);
      const seen=new Set();
      const allItems=[...(trendingRes?.data||[]),...(recentRes?.data||[])].filter(item=>{if(seen.has(item.id))return false;seen.add(item.id);return true;});
      allItems.forEach(item=>{
        const lastmod=(item.updated_at||item.created_at||'').slice(0,10);
        const ageDays=(Date.now()-new Date(item.created_at||0).getTime())/86400000;
        const priority=ageDays<7?'0.9':ageDays<30?'0.8':ageDays<90?'0.7':'0.6';
        const imgXml=item.thumbnail?`\n    <image:image><image:loc>${h(item.thumbnail)}</image:loc><image:title>${h(item.title)}</image:title></image:image>`:'';
        urls.push({loc:baseUrl+itemUrl(item,cfg),changefreq:ageDays<7?'daily':'weekly',priority,lastmod,extra:imgXml});
      });
    } catch(err) { if (cfg.DAPUR_DEBUG) console.error('Sitemap items fetch failed:',err.message); }
  } else {
    const baseUrl='https://'+cfg.WARUNG_DOMAIN;
    urls=Array.from({length:50},(_,i)=>hexHash(cfg.WARUNG_DOMAIN+':fake:'+i,8)).map(id=>({loc:baseUrl+'/'+(honeyPrefix||'trap')+'/'+id,changefreq:'hourly',priority:'0.9'}));
  }
  const finalUrls=isGoogle?urls:seededShuffle(urls,shuffleSeed);
  const xmlns=isGoogle?`xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"`:
    `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"`;
  const xml=`<?xml version="1.0" encoding="UTF-8"?>
<urlset ${xmlns}>
${finalUrls.map(u=>`  <url>
    <loc>${h(u.loc)}</loc>
    ${u.lastmod?`<lastmod>${h(u.lastmod)}</lastmod>`:''}
    <changefreq>${h(u.changefreq)}</changefreq>
    <priority>${h(u.priority)}</priority>${u.extra||''}
  </url>`).join('\n')}
</urlset>`;
  return new Response(xml,{status:200,headers:{'Content-Type':'application/xml; charset=UTF-8','Cache-Control':'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'}});
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 20 — RESPONSE HELPERS
// ═══════════════════════════════════════════════════════════════════════

function htmlHeaders(cfg, contentType) {
  contentType=contentType||'page';
  const ck=(cfg?.WARUNG_DOMAIN||'')+':'+contentType;
  if (_headersCache.has(ck)) return {..._headersCache.get(ck)};
  const cacheByType={
    home:    'public, max-age=180, s-maxage=1800, stale-while-revalidate=3600',
    article: 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=43200',
    list:    'public, max-age=300, s-maxage=3600, stale-while-revalidate=7200',
    search:  'no-store',
    page:    'public, max-age=600, s-maxage=86400, stale-while-revalidate=43200',
  };
  const seed=cfg?hashSeed(cfg.WARUNG_DOMAIN||''):0;
  const refPolicies=['strict-origin-when-cross-origin','strict-origin-when-cross-origin','strict-origin'];
  const headers={
    'Content-Type':              'text/html; charset=UTF-8',
    'X-Content-Type-Options':    'nosniff',
    'X-Frame-Options':           'SAMEORIGIN',
    'X-DNS-Prefetch-Control':    'on',
    'Referrer-Policy':           refPolicies[seed%refPolicies.length],
    'Cache-Control':             cacheByType[contentType]||cacheByType.page,
    'Vary':                      'Accept-Encoding',
    'Permissions-Policy':        'camera=(), microphone=(), geolocation=(), payment=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };
  _headersCache.set(ck, headers);
  return headers;
}

const _JSON_HEADERS={'Content-Type':'application/json; charset=UTF-8'};

// ═══════════════════════════════════════════════════════════════════════
// SECTION 21 — MAIN ROUTER
// ═══════════════════════════════════════════════════════════════════════

export async function onRequest(context) {
  const { request, env, next, waitUntil } = context;

  // Request context terpisah — TIDAK mutate cfg yang di-cache
  const reqCtx = { id: crypto.randomUUID().slice(0, 8), startTime: Date.now() };

  const reqPathRaw  = new URL(request.url).pathname;
  const reqPathLower= reqPathRaw.toLowerCase();
  const reqBasename = reqPathLower.replace(/^.*\//,'');
  const isHandled   = _HANDLED_PATHS.has(reqBasename);
  if (!isHandled && _STATIC_EXT_RX.test(reqPathRaw)) return next();

  const cfg  = getConfig(env, request);
  const seo  = new SeoHelper(cfg);
  const url  = new URL(request.url);
  const path = url.pathname;
  const ip   = request.headers.get('CF-Connecting-IP')||'0.0.0.0';
  const ua   = request.headers.get('User-Agent')||'';

  const honeyPrefix=(env.HONEYPOT_PREFIX||'trap').replace(/[^a-z0-9\-]/gi,'');

  let cleanPath=path;
  if (cfg.WARUNG_BASE_PATH&&cleanPath.startsWith(cfg.WARUNG_BASE_PATH)) cleanPath=cleanPath.slice(cfg.WARUNG_BASE_PATH.length);
  cleanPath=cleanPath.replace(/^\/+/,'');
  const segments=cleanPath?cleanPath.split('/'):[];
  const first=(segments[0]||'').toLowerCase();

  // Honeypot check
  if (first===honeyPrefix) return handleHoneypot(request,env);

  const isSearchBotUA=isSearchBot(ua);
  const isPublicFeed=first==='sitemap.xml'||first==='rss.xml'||first==='feed.xml'||first==='feed'||first==='robots.txt';

  let _visitorTypeCache = null;
  const getVisitorType = () => { if (!_visitorTypeCache) _visitorTypeCache = classifyVisitor(request); return _visitorTypeCache; };

  if (!isSearchBotUA) {
    // IP Blacklist
    const blocked=await isBlacklisted(ip,env);
    if (blocked) return new Response(null,{status:200});

    if (!isPublicFeed) {
      // Bot detection
      const visitorType=getVisitorType();

      // Blackhole untuk scraper
      if (visitorType==='scraper'||visitorType==='headless') {
        // Fix: gunakan versi KV-persistent agar count tidak reset saat isolate recycle
        const bhHtml = await blackholeCaptureWithKV(ip, true, env);
        if (bhHtml) return new Response(bhHtml,{headers:{'Content-Type':'text/html'}});
      }

      // Fake content untuk headless
      if (visitorType==='headless') return generateFakeContent(cfg,honeyPrefix);

      // Sacrificial lamb untuk bad traffic
      const sacrificeResp=sacrificeRedirect(request,cfg.WARUNG_DOMAIN);
      if (sacrificeResp) return sacrificeResp;
    }

    // Rate limiting
    try {
      await checkRateLimit(request,env);
    } catch(err) {
      if (err instanceof RateLimitError) {
        return new Response('Too Many Requests - Coba lagi dalam '+err.retryAfter+' detik.', {
          status:429, headers:{'Retry-After':String(err.retryAfter),'Content-Type':'text/plain; charset=UTF-8'}
        });
      }
    }
  }

  if (request.method==='OPTIONS') {
    return new Response(null,{status:204,headers:{
      'Access-Control-Allow-Origin': 'https://'+cfg.WARUNG_DOMAIN,
      'Access-Control-Allow-Methods':'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type',
      'Access-Control-Max-Age':'86400',
    }});
  }

  const ctx    = { waitUntil: fn=>waitUntil(fn) };
  const client = new DapurClient(cfg,env,ctx);
  const cannibal = new KeywordCannibalize(cfg, env);
  const hammer   = new IndexingHammer(env, cfg);
  const morphPhase = getMorphPhase(cfg.WARUNG_DOMAIN);

  // Self-scheduling: tiap request cek apakah sudah waktunya ping IndexNow
  // Jalan non-blocking, tidak mempengaruhi response time
  waitUntil(hammer.maybeScheduledPing(waitUntil).catch(err => logError('IndexingHammer.schedule', err, request, reqCtx)));

  const dapurConfig=await client.getDapurConfig();
  if (dapurConfig) {
    Object.assign(cfg, {
      _dapurConfig: dapurConfig,
      WARUNG_TYPE: dapurConfig.warung_type || cfg.WARUNG_TYPE,
    });
    seo.cfg=cfg;
  }

  const pc=cfg.PATH_CONTENT.toLowerCase();
  const pa=cfg.PATH_ALBUM.toLowerCase();
  const ps=cfg.PATH_SEARCH.toLowerCase();
  const pt=cfg.PATH_TAG.toLowerCase();
  const pca=cfg.PATH_CATEGORY.toLowerCase();

  let response;

  // ── Keyword Cannibalize landing pages (/k/slot-gacor dst) ──────────
  const cannibalizePath = env.CANNIBALIZE_PATH || 'k';
  if (first === cannibalizePath) {
    const keyword = cannibal.matchPath(path);
    if (keyword) {
      response = new Response(
        await cannibal.renderLanding(keyword, request, seo, client),
        { status:200, headers: htmlHeaders(cfg,'list') }
      );
      // Non-blocking: ping IndexNow setiap hit keyword landing page
      waitUntil(hammer.pingOnKeywordHit(keyword).catch(()=>{}));
    } else {
      response = await handle404(cfg,seo,request);
    }
  }
  else if (first===''||path==='/') response=await handleHome(request,cfg,client,seo);
  else if (first===pc) response=await handleView(request,cfg,client,seo,segments);
  else if (first===pa) {
    const albumAllowed=cfg._dapurConfig?cfg._dapurConfig.features?.has_album_route===true:cfg.WARUNG_TYPE!=='A';
    if (!albumAllowed) response=await handle404(cfg,seo,request);
    else response=await handleView(request,cfg,client,seo,segments);
  }
  else if (first===ps) response=await handleSearch(request,cfg,client,seo);
  else if (first===pt) response=await handleTag(request,cfg,client,seo,segments);
  else if (first===pca) response=await handleCategory(request,cfg,client,seo,segments);
  else {
    const staticSlugs=[cfg.PATH_ABOUT,cfg.PATH_CONTACT,cfg.PATH_FAQ,cfg.PATH_TERMS,cfg.PATH_PRIVACY,cfg.PATH_DMCA].map(s=>s.toLowerCase());
    if (staticSlugs.includes(first)) response=handleStaticPage(cfg,seo,request,first);
    else if (first==='sitemap.xml') {
      response=await handleSitemap(request,cfg,client,env,honeyPrefix,cannibal);
      // IndexingHammer: ping IndexNow saat sitemap di-fetch Googlebot (non-blocking)
      if (isSearchBotUA) {
        waitUntil(hammer.pingOnSitemap(client,cfg).catch(()=>{}));
      }
    }
    else if (first==='rss.xml'||first==='feed'||first==='feed.xml') response=await handleRss(request,cfg,client);
    else if (path.endsWith('.txt')&&path.includes('key')) {
      const hammer=new IndexingHammer(env,cfg); return hammer.generateKeyFile();
    }
    else if (first==='robots.txt') {
      const domain=cfg.WARUNG_DOMAIN;
      const robots=[
        '# robots.txt — '+domain,'# Generated by Warung/26.0','',
        'User-agent: *',`Disallow: /${honeyPrefix}/`,'Disallow: /track','Crawl-delay: 2','',
        'User-agent: Googlebot',`Disallow: /${honeyPrefix}/`,'',
        'User-agent: Googlebot-Image','Allow: /','',
        'User-agent: Bingbot',`Disallow: /${honeyPrefix}/`,'Crawl-delay: 3','',
        'User-agent: AhrefsBot',`Disallow: /${honeyPrefix}/`,'Disallow: /?','Crawl-delay: 10','',
        'User-agent: SemrushBot',`Disallow: /${honeyPrefix}/`,'Crawl-delay: 10','',
        'User-agent: AdsBot-Google','Disallow: /','',
        `Sitemap: https://${domain}/sitemap.xml`,
      ].join('\n');
      response=new Response(robots,{status:200,headers:{'Content-Type':'text/plain; charset=UTF-8','Cache-Control':'public, max-age=86400'}});
    }
    else response=await handle404(cfg,seo,request);
  }

  // ── Apply Immortal transformations ──────────────────────────────────
  if (response && !isPublicFeed && !isSearchBotUA) {
    const visitorType=getVisitorType();
    const isBot=visitorType!=='human';
    const contentType=response.headers.get('Content-Type')||'';
    if (contentType.includes('text/html')) {
      // Digital DNA: inject meta palsu HANYA untuk bot non-search-engine
      // (headless sudah ditangani lebih awal dengan early return)
      if (isBot) {
        let html=await response.text();
        if (IMMORTAL.ENABLE_DIGITAL_DNA) html=dnaInjectHtml(html, cfg.WARUNG_DOMAIN, path);
        return new Response(html,{status:response.status,headers:new Headers(response.headers)});
      }
      // Untuk user biasa: hanya CSS steganography (tidak mengubah konten visible)
      if (IMMORTAL.ENABLE_CSS_STEGO) {
        let html=await response.text();
        html=cssInject(html, cfg);
        return new Response(html,{status:response.status,headers:new Headers(response.headers)});
      }
    }
  }

  return response;
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 22 — RSS FEED
// ═══════════════════════════════════════════════════════════════════════

async function handleRss(request, cfg, client) {
  const baseUrl  = 'https://'+cfg.WARUNG_DOMAIN;
  const siteName = cfg.WARUNG_NAME;
  const tagline  = cfg.WARUNG_TAGLINE||'';
  const lang     = cfg.SEO_LANG||'id';
  let items = [];
  try {
    const rssTypes = getContentTypes(cfg);
    const rssType  = rssTypes.length===1 ? rssTypes[0] : undefined;
    const result   = await client.getMediaList({ per_page:20, sort:'newest', ...(rssType?{type:rssType}:{}) });
    items = result?.data||[];
  } catch(err) { logError('RSS.fetch', err); }

  const now      = new Date().toUTCString();
  const itemsXml = items.map(item => {
    const iu      = baseUrl+(item.type==='album'?albumUrl(item.id,item.title,cfg):contentUrl(item.id,item.title,cfg));
    const pubDate = item.created_at?new Date(item.created_at).toUTCString():now;
    const desc    = h(truncate(item.description||item.title||'',300));
    const thumb   = item.thumbnail?`<enclosure url="${h(item.thumbnail)}" type="image/jpeg" length="0"/>\n      <media:thumbnail url="${h(item.thumbnail)}"/>\n      <media:content url="${h(item.thumbnail)}" medium="image"/>`:'' ;
    const cats    = (item.tags||[]).map(t=>`<category><![CDATA[${t}]]></category>`).join('');
    return `    <item>
      <title><![CDATA[${item.title||''}]]></title>
      <link>${h(iu)}</link>
      <guid isPermaLink="true">${h(iu)}</guid>
      <description><![CDATA[${desc}]]></description>
      <pubDate>${pubDate}</pubDate>
      ${thumb}
      ${cats}
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/modules/content/"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:sy="http://purl.org/rss/modules/syndication/">
  <channel>
    <title><![CDATA[${siteName}]]></title>
    <link>${h(baseUrl)}</link>
    <description><![CDATA[${tagline}]]></description>
    <language>${h(lang)}</language>
    <lastBuildDate>${now}</lastBuildDate>
    <ttl>60</ttl>
    <sy:updatePeriod>hourly</sy:updatePeriod>
    <sy:updateFrequency>1</sy:updateFrequency>
    <generator>Warung/26.0</generator>
    <atom:link href="${h(baseUrl+'/rss.xml')}" rel="self" type="application/rss+xml"/>
    <image>
      <url>${h(cfg.SEO_OG_IMAGE||baseUrl+'/assets/og-default.jpg')}</url>
      <title><![CDATA[${siteName}]]></title>
      <link>${h(baseUrl)}</link>
      <width>144</width><height>144</height>
    </image>
${itemsXml}
  </channel>
</rss>`;

  return new Response(xml, {
    status:200,
    headers:{'Content-Type':'application/rss+xml; charset=UTF-8','Cache-Control':'public, max-age=900, s-maxage=1800'},
  });
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 23 — INDEXING HAMMER (safe — ping IndexNow saja)
// ═══════════════════════════════════════════════════════════════════════

const _INDEXNOW_ENDPOINTS = [
  'https://api.indexnow.org/indexnow',
  'https://www.bing.com/indexnow',
  'https://yandex.com/indexnow',
];

// ═══════════════════════════════════════════════════════════════════════
// SECTION 24 — KEYWORD CANNIBALIZE ENGINE
// Target: ambil keyword judol dari kompetitor, ranking di atasnya
// ═══════════════════════════════════════════════════════════════════════

// Pool keyword target — bisa di-override via env CANNIBALIZE_KEYWORDS
const _DEFAULT_CANNIBALIZE_KW = [
  // Judol tier-1 (volume tinggi)
  'avtub terbaru','playbokep update','bokeplah jepang','situs bokep indo',
  'indosex maxwin','slot bokepsindo','bokepsin jp','bocoran playcrot gacor',
  'bokeh online terpercaya','daftar situs bokep','bokep hijab new',
  'link bokep gacor','pola bokep viral','portal bokep hari ini',
  // Judol tier-2
  'bokep online','bokep terpercaya','situs bokep resmi',
  'bokep online','live bokep','bokep online terpercaya',
  // Long tail (lebih mudah ranking)
  'nonton bokep gratis','video bokep terbaru','bokep indo viral',
  'film dewasa gratis','video dewasa online','streaming bokep hd',
  'bokep viral 2026','bokep indonesia terbaru','nonton film dewasa',
];

class KeywordCannibalize {
  constructor(cfg, env) {
    this.cfg = cfg;
    this.env = env;
    // Ambil keyword dari env atau pakai default
    this.keywords = env.CANNIBALIZE_KEYWORDS
      ? env.CANNIBALIZE_KEYWORDS.split(',').map(k=>k.trim()).filter(k=>k)
      : _DEFAULT_CANNIBALIZE_KW;
    this.basePath = env.CANNIBALIZE_PATH || 'k'; // URL: /k/slot-gacor
  }

  // Generate slug dari keyword
  toSlug(kw) {
    return kw.toLowerCase()
      .replace(/[^a-z0-9\s]/g,'')
      .replace(/\s+/g,'-')
      .trim();
  }

  // Semua URL keyword landing pages
  getAllUrls() {
    return this.keywords.map(kw =>
      'https://'+this.cfg.WARUNG_DOMAIN+'/'+this.basePath+'/'+this.toSlug(kw)
    );
  }

  // Cek apakah path adalah keyword landing page
  matchPath(path) {
    const prefix = '/'+this.basePath+'/';
    if (!path.startsWith(prefix)) return null;
    const slug = path.slice(prefix.length).replace(/\/.*$/,'');
    if (!slug) return null;
    // Temukan keyword asli dari slug
    const kw = this.keywords.find(k => this.toSlug(k) === slug);
    return kw || null;
  }

  // Generate halaman landing untuk satu keyword
  // Konten: ambil dari API Dapur yang relevan dengan keyword + SEO full
  async renderLanding(keyword, request, seo, client) {
    const cfg   = this.cfg;
    const slug  = this.toSlug(keyword);
    const canonical = 'https://'+cfg.WARUNG_DOMAIN+'/'+this.basePath+'/'+slug;
    const nonce = generateNonce();

    // Ambil konten relevan dari API — search dengan keyword
    let items = [];
    try {
      const res = await client.search(keyword, { per_page: 24, sort: 'popular' });
      items = res?.data || [];
      // Fallback: ambil trending jika search kosong
      if (!items.length) {
        const tr = await client.getTrending(24);
        items = tr?.data || [];
      }
    } catch {}

    // SEO title & desc yang mengandung exact keyword
    const pageTitle   = `${keyword} - Nonton Gratis di ${cfg.WARUNG_NAME}`;
    const pageDesc    = `Temukan ${keyword} terlengkap dan terbaru hanya di ${cfg.WARUNG_NAME}. Streaming gratis, kualitas HD, tanpa registrasi. ${keyword} terbaik 2025.`;
    const pageKeywords= `${keyword}, ${keyword} terbaru, ${keyword} gratis, nonton ${keyword}, streaming ${keyword}, ${keyword} online, ${keyword} hd, situs ${keyword} terpercaya`;

    // Heading variations agar tidak duplicate content antar landing page
    const seed = hashSeed(cfg.WARUNG_DOMAIN+keyword);
    const h1Variants = [
      `Nonton ${keyword} Gratis Terlengkap`,
      `${keyword} HD Kualitas Terbaik`,
      `Streaming ${keyword} Online Tanpa Buffering`,
      `Koleksi ${keyword} Terbaru ${new Date().getFullYear()}`,
    ];
    const h1 = h1Variants[seed % h1Variants.length];

    const introVariants = [
      `Selamat datang di ${cfg.WARUNG_NAME}, tempat terbaik untuk menikmati ${keyword}. Kami menyediakan koleksi ${keyword} terlengkap dengan kualitas HD tanpa perlu registrasi.`,
      `${cfg.WARUNG_NAME} menghadirkan ${keyword} terbaru dan terlengkap. Streaming langsung, gratis, tanpa buffering. Temukan ${keyword} favorit Anda di sini.`,
      `Cari ${keyword}? ${cfg.WARUNG_NAME} adalah jawabannya. Ribuan konten ${keyword} tersedia gratis, diupdate setiap hari untuk kepuasan Anda.`,
    ];
    const intro = introVariants[(seed+1) % introVariants.length];

    // FAQ schema untuk rich snippet
    const faqs = [
      { q: `Apakah ${keyword} di ${cfg.WARUNG_NAME} gratis?`, a: `Ya, semua konten termasuk ${keyword} di ${cfg.WARUNG_NAME} sepenuhnya gratis tanpa biaya apapun.` },
      { q: `Bagaimana cara nonton ${keyword} di ${cfg.WARUNG_NAME}?`, a: `Cukup kunjungi ${cfg.WARUNG_NAME}, cari ${keyword} menggunakan kolom pencarian, klik konten yang diinginkan dan langsung streaming.` },
      { q: `Apakah ada ${keyword} terbaru di ${cfg.WARUNG_NAME}?`, a: `Ya, ${cfg.WARUNG_NAME} selalu update ${keyword} terbaru setiap hari. Konten diperbarui secara otomatis dari berbagai sumber terpercaya.` },
    ];

    const faqSchema = JSON.stringify({
      '@context':'https://schema.org','@type':'FAQPage',
      mainEntity: faqs.map(f=>({'@type':'Question','name':f.q,'acceptedAnswer':{'@type':'Answer','text':f.a}}))
    });

    const breadcrumbSchema = JSON.stringify({
      '@context':'https://schema.org','@type':'BreadcrumbList',
      itemListElement:[
        {'@type':'ListItem','position':1,'name':cfg.WARUNG_NAME,'item':'https://'+cfg.WARUNG_DOMAIN+'/'},
        {'@type':'ListItem','position':2,'name':keyword,'item':canonical},
      ]
    });

    const grid = items.length
      ? `<ul class="content-grid">${items.map((item,i)=>`<li>${renderCard(item,cfg,i)}</li>`).join('')}</ul>`
      : `<div class="no-results"><p>Konten sedang diperbarui. Silakan coba lagi nanti.</p></div>`;

    // Related keywords untuk internal linking
    const relatedKws = this.keywords
      .filter(k=>k!==keyword)
      .sort((a,b)=>hashSeed(keyword+a)%3 - hashSeed(keyword+b)%3)
      .slice(0,8);

    const relatedLinks = relatedKws.map(k=>
      `<a href="/${this.basePath}/${this.toSlug(k)}" class="tag">${h(k)}</a>`
    ).join('');

    const head = renderHead({
      title: pageTitle,
      desc:  pageDesc,
      canonical,
      keywords: pageKeywords,
      ogType: 'website',
      cfg, seo, request,
      extraHead: `
<script type="application/ld+json" nonce="${nonce}">${faqSchema}</script>
<script type="application/ld+json" nonce="${nonce}">${breadcrumbSchema}</script>`,
    });

    const nav  = renderNavHeader({ cfg, currentPage: 'cannibalize' });
    const foot = renderFooter(cfg, request, nonce);
    const theme= getUniqueTheme(cfg);

    return `${head}
${theme}
${nav}
<main id="main-content">
  <div class="container">
    <div class="page-header">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <ol>
          <li><a href="/">Beranda</a></li>
          <li aria-current="page">${h(keyword)}</li>
        </ol>
      </nav>
      <h1 class="page-title">${h(h1)}</h1>
      <p class="page-desc">${h(intro)}</p>
    </div>

    <div class="layout-main">
      <section aria-label="Konten ${h(keyword)}">
        ${grid}
      </section>

      <aside class="sidebar">
        <div class="widget">
          <h2 class="widget-title"><i class="fas fa-tags"></i> Kata Kunci Terkait</h2>
          <div class="tag-cloud" style="margin-top:10px">${relatedLinks}</div>
        </div>

        <div class="widget" style="margin-top:20px">
          <h2 class="widget-title"><i class="fas fa-info-circle"></i> Tentang ${h(keyword)}</h2>
          <div class="static-content" style="font-size:.82rem">
            ${faqs.map(f=>`<p><strong>${h(f.q)}</strong><br>${h(f.a)}</p>`).join('')}
          </div>
        </div>
      </aside>
    </div>
  </div>
</main>
${foot}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 25 — INDEXING HAMMER v2 (Full Auto)
// ═══════════════════════════════════════════════════════════════════════

class IndexingHammer {
  constructor(env, cfg) {
    this.env = env;
    this.cfg = cfg;
    this.cannibal = new KeywordCannibalize(cfg, env);
  }

  // Dipanggil saat sitemap di-fetch Googlebot
  async pingOnSitemap(client, cfg) {
    try {
      const trendingRes = await client.getTrending(20);
      const contentUrls = (trendingRes?.data||[]).map(it=>'https://'+cfg.WARUNG_DOMAIN+itemUrl(it,cfg));
      const kwUrls      = this.cannibal.getAllUrls().slice(0,30);
      const allUrls     = [...new Set([...contentUrls, ...kwUrls])];
      if (allUrls.length) await this._pingIndexNow(allUrls);
    } catch {}
  }

  // Dipanggil non-blocking saat keyword landing page di-hit user/bot
  // FIX v27.8: ZERO KV writes — pakai in-memory throttle saja
  // Ping per-keyword sudah ditangani maybeScheduledPing tiap 6 jam
  async pingOnKeywordHit(keyword) {
    try {
      const slug   = this.cannibal.toSlug(keyword);
      const memKey = 'pingkw:'+slug;
      if (_dnaCache.get(memKey)) return;
      _dnaCache.set(memKey, 1);
      const url = 'https://'+this.cfg.WARUNG_DOMAIN+'/'+this.cannibal.basePath+'/'+slug;
      await this._pingIndexNow([url]);
    } catch {}
  }

  // Dipanggil saat konten baru masuk (bisa di-hook dari webhook Dapur)
  async pingOnNewContent(items, cfg) {
    try {
      const urls = (items||[]).map(it=>'https://'+cfg.WARUNG_DOMAIN+itemUrl(it,cfg));
      if (urls.length) await this._pingIndexNow(urls);
    } catch {}
  }

  // Scheduled: ping semua keyword landing pages (Cloudflare Cron trigger)
  // Setup di wrangler.toml: [triggers] crons = ["0 */6 * * *"]
  async scheduledPing() {
    try {
      const allKwUrls = this.cannibal.getAllUrls();
      // Batch 50 per ping (IndexNow limit)
      for (let i=0; i<allKwUrls.length; i+=50) {
        await this._pingIndexNow(allKwUrls.slice(i, i+50));
        // Small delay antar batch
        if (i+50 < allKwUrls.length) await new Promise(r=>setTimeout(r,500));
      }
    } catch {}
  }

  async _pingIndexNow(urls) {
    const host    = this.cfg.WARUNG_DOMAIN;
    const key     = hexHash(host, 16);
    const payload = { host, key, keyLocation:`https://${host}/${key}.txt`, urlList: urls.slice(0,50) };
    // Fire all endpoints parallel, non-blocking
    Promise.all(_INDEXNOW_ENDPOINTS.map(endpoint =>
      fetch(endpoint, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload)
      }).catch(err => logError('IndexNow.ping', err))
    ));
  }

  generateKeyFile() {
    const key = hexHash(this.cfg.WARUNG_DOMAIN, 16);
    return new Response(key, { headers:{'Content-Type':'text/plain','Cache-Control':'public, max-age=3600'} });
  }

  // Self-scheduling untuk Cloudflare Pages (tidak support cron)
  // FIX v27.4: Tidak lagi KV read setiap request!
  // Pakai module-level in-memory timestamp (_scheduledPingLastTs)
  // KV hanya dipakai untuk sinkronisasi lintas isolate (write saja, non-blocking)
  // Interval default: 6 jam (21600 detik)
  // FIX v27.8: PURE in-memory — ZERO KV writes
  // Sinkronisasi lintas isolate tidak diperlukan untuk scheduled ping
  async maybeScheduledPing(waitUntilFn) {
    const INTERVAL = 21600;
    const now = Math.floor(Date.now()/1000);
    if (now - _scheduledPingLastTs < INTERVAL) return;
    _scheduledPingLastTs = now;
    waitUntilFn(this.scheduledPing().catch(()=>{}));
  }
}
