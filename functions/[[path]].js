/**
 * functions/[[path]].js — Warung • Cloudflare Pages Functions
 * ═══════════════════════════════════════════════════════════════
 * VERSION: v29.5 — "ADS FIX: popunder juicyads & semua slot iklan berfungsi 100%"
 * AUTHOR:  dukunseo.com
 *
 * FIXES:
 *  - Slot popunder khusus dengan bypass CSP & sanitasi
 *  - Bypass inject nonce untuk iklan popunder
 *  - Domain juicyads di-allowlist di CSP
 *  - Event handler dipertahankan untuk popunder
 *  - Semua slot iklan dipastikan bisa muncul
 *
 * ══ NEW ENV VARIABLES ═══════════════════════════════════════
 *  ADS_CODE_POPUNDER_D   Kode popunder DESKTOP (juicyads/exoclick dll)
 *  ADS_CODE_POPUNDER_M   Kode popunder MOBILE
 *  ADS_HEADER_TOP_DESKTOP   Kode iklan header DESKTOP
 *  ADS_HEADER_TOP_MOBILE    Kode iklan header MOBILE
 *  ADS_MID_GRID_DESKTOP     Kode iklan mid grid DESKTOP
 *  ADS_MID_GRID_MOBILE      Kode iklan mid grid MOBILE
 *  ADS_AFTER_GRID_DESKTOP   Kode iklan after grid DESKTOP
 *  ADS_AFTER_GRID_MOBILE    Kode iklan after grid MOBILE
 *  ADS_SIDEBAR_TOP_DESKTOP  Kode iklan sidebar top DESKTOP
 *  ADS_SIDEBAR_TOP_MOBILE   Kode iklan sidebar top MOBILE
 *  ADS_AFTER_CONTENT_DESKTOP Kode iklan after content DESKTOP
 *  ADS_AFTER_CONTENT_MOBILE  Kode iklan after content MOBILE
 *  ADS_FOOTER_TOP_DESKTOP    Kode iklan footer top DESKTOP
 *  ADS_FOOTER_TOP_MOBILE     Kode iklan footer top MOBILE
 * ═════════════════════════════════════════════════════════════
 */

'use strict';

// ── Module-level constants ───────────────────────────────────────────────────
const _STATIC_EXT_RX  = /\.(?:css|js|mjs|map|ico|png|jpg|jpeg|gif|svg|webp|avif|woff|woff2|ttf|eot|otf|mp4|webm|ogg|mp3|wav|json|txt|xml|pdf|zip|gz|br)$/i;
const _HANDLED_PATHS   = new Set(['sitemap.xml','rss.xml','feed.xml','feed','robots.txt']);
const _SEARCHBOT_RX    = /Googlebot|bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|Sogou|Exabot|facebot|ia_archiver|Google-InspectionTool/i;
const _BOT_UA_RX       = /HeadlessChrome|Headless|PhantomJS|SlimerJS|Scrapy|python-requests|Go-http-client|curl\/|wget\//i;
const _MOBILE_UA_RX    = /Mobile|Android|iPhone|iPad/i;
const _SCRAPER_BOTS    = ['SemrushBot','AhrefsBot','MJ12bot','DotBot','BLEXBot','MegaIndex','SeznamBot'];
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
  'hot', 'seksi', 'sensual', 'dewasa',
  'cantik', 'mesra', 'berani', 'eksklusif',
  'viral', 'trending', 'populer', 'hits', 'mantap',
  'gratis', 'online', 'live', '24jam',
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
const _ERROR_LOG_TTL = 60000;
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
  get(key) {
    if (!super.has(key)) return undefined;
    const val = super.get(key);
    super.delete(key);
    super.set(key, val);
    return val;
  }
  set(key, value) {
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
  has(key) {
    if (!this.data.has(key)) return false;
    if (Date.now() - this.ts.get(key) > this.ttl) { this._del(key); return false; }
    return true;
  }
  _del(key) { this.data.delete(key); this.ts.delete(key); }
}

// ── Module-level in-memory state ─────────────────────────────
let _scheduledPingLastTs = 0;
const _dapurConfigMemCache = new LRUMap(10);
const _blCacheTTL = 300000;

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
const _immortalEnvCache = new LRUMap(5);
const _seoCache        = new LRUMap(10);
const _cannibalCache   = new LRUMap(10);
const _hammerCache     = new LRUMap(10);
const _reqCfgCache     = new LRUMap(20);

// ── Immortal env loader ────────────────────────────────────
function applyImmortalEnv(env) {
  const sig = [
    env.IMMORTAL_DIGITAL_DNA, env.IMMORTAL_CSS_STEGO, env.IMMORTAL_GHOST_BODY,
    env.IMMORTAL_BLACKHOLE, env.IMMORTAL_SACRIFICIAL_LAMB,
    env.IMMORTAL_BLACKHOLE_MAX, env.IMMORTAL_SACRIFICE_ENERGY,
    env.IMMORTAL_RATE_WINDOW, env.IMMORTAL_RATE_MAX, env.IMMORTAL_SCRAPER_RATE_MAX,
    env.IMMORTAL_CSS_OPACITY, env.IMMORTAL_DNA_POOL,
  ].join('|');
  if (_immortalEnvCache.has(sig)) return;
  _immortalEnvCache.set(sig, true);
  const bool = (k, d) => env[k] !== undefined ? env[k] === 'true' : d;
  const int  = (k, d) => { if (env[k] === undefined) return d; const v = parseInt(env[k], 10); return (isNaN(v)||v<0) ? d : v; };
  const flt  = (k, d) => { if (env[k] === undefined) return d; const v = parseFloat(env[k]); return (isNaN(v)||v<0) ? d : v; };
  IMMORTAL.ENABLE_DIGITAL_DNA      = bool('IMMORTAL_DIGITAL_DNA',      IMMORTAL.ENABLE_DIGITAL_DNA);
  IMMORTAL.ENABLE_CSS_STEGO        = bool('IMMORTAL_CSS_STEGO',        IMMORTAL.ENABLE_CSS_STEGO);
  IMMORTAL.ENABLE_GHOST_BODY       = bool('IMMORTAL_GHOST_BODY',       IMMORTAL.ENABLE_GHOST_BODY);
  IMMORTAL.ENABLE_BLACKHOLE        = bool('IMMORTAL_BLACKHOLE',        IMMORTAL.ENABLE_BLACKHOLE);
  IMMORTAL.ENABLE_SACRIFICIAL_LAMB = bool('IMMORTAL_SACRIFICIAL_LAMB', IMMORTAL.ENABLE_SACRIFICIAL_LAMB);
  IMMORTAL.BLACKHOLE_MAX_REQUESTS  = int ('IMMORTAL_BLACKHOLE_MAX',    IMMORTAL.BLACKHOLE_MAX_REQUESTS);
  IMMORTAL.SACRIFICE_ENERGY_MAX    = int ('IMMORTAL_SACRIFICE_ENERGY', IMMORTAL.SACRIFICE_ENERGY_MAX);
  IMMORTAL.RATE_LIMIT_WINDOW       = int ('IMMORTAL_RATE_WINDOW',      IMMORTAL.RATE_LIMIT_WINDOW);
  IMMORTAL.RATE_LIMIT_MAX          = int ('IMMORTAL_RATE_MAX',         IMMORTAL.RATE_LIMIT_MAX);
  IMMORTAL.SCRAPER_RATE_MAX        = int ('IMMORTAL_SCRAPER_RATE_MAX', IMMORTAL.SCRAPER_RATE_MAX);
  IMMORTAL.CSS_OPACITY             = flt ('IMMORTAL_CSS_OPACITY',      IMMORTAL.CSS_OPACITY);
  if (env.IMMORTAL_DNA_POOL) {
    const pool = env.IMMORTAL_DNA_POOL.split(',').map(k=>k.trim()).filter(k=>k.length>1);
    if (pool.length >= 5) IMMORTAL.DNA_POOL = pool;
  }
}

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

const _cfgCacheMap = new LRUMap(10);
function safeParseInt(val, defaultValue) {
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : Math.max(0, parsed);
}
function getConfig(env, request) {
  const { domain, name } = detectDomainInfo(env, request);
  const envSig = (env.PATH_CONTENT||'')+(env.PATH_ALBUM||'')+(env.PATH_SEARCH||'')+(env.PATH_CATEGORY||'')+(env.PATH_TAG||'')+(env.WARUNG_TYPE||'')+(env.WARUNG_NAME||'')+(env.ITEMS_PER_PAGE||'')+(env.RELATED_COUNT||'')+(env.TRENDING_COUNT||'');
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
    ITEMS_PER_PAGE: safeParseInt(env.ITEMS_PER_PAGE, 24),
    RELATED_COUNT:  safeParseInt(env.RELATED_COUNT,  8),
    TRENDING_COUNT: safeParseInt(env.TRENDING_COUNT, 10),
    DEFAULT_THUMB:  baseUrl + '/assets/no-thumb.jpg',
    ADS_ENABLED:          (env.ADS_ENABLED || 'true') === 'true',
    ADS_ADSENSE_CLIENT:    env.ADS_ADSENSE_CLIENT || '',
    ADS_LABEL:             env.ADS_LABEL || '',
    ADS_CODE_TOP_D:  env.ADS_CODE_TOP_D  || '',
    ADS_CODE_TOP_M:  env.ADS_CODE_TOP_M  || '',
    ADS_CODE_BTM_D:  env.ADS_CODE_BTM_D  || '',
    ADS_CODE_BTM_M:  env.ADS_CODE_BTM_M  || '',
    ADS_CODE_SDB_D:  env.ADS_CODE_SDB_D  || '',
    ADS_CODE_SDB_M:  env.ADS_CODE_SDB_M  || '',
    // ── Slot khusus popunder ───────────────────────────────────
    ADS_CODE_POPUNDER_D: env.ADS_CODE_POPUNDER_D || '',
    ADS_CODE_POPUNDER_M: env.ADS_CODE_POPUNDER_M || '',
    // ── Slot iklan baru ───────────────────────────────────────
    ADS_HEADER_TOP_DESKTOP: env.ADS_HEADER_TOP_DESKTOP || '',
    ADS_HEADER_TOP_MOBILE: env.ADS_HEADER_TOP_MOBILE || '',
    ADS_MID_GRID_DESKTOP: env.ADS_MID_GRID_DESKTOP || '',
    ADS_MID_GRID_MOBILE: env.ADS_MID_GRID_MOBILE || '',
    ADS_AFTER_GRID_DESKTOP: env.ADS_AFTER_GRID_DESKTOP || '',
    ADS_AFTER_GRID_MOBILE: env.ADS_AFTER_GRID_MOBILE || '',
    ADS_SIDEBAR_TOP_DESKTOP: env.ADS_SIDEBAR_TOP_DESKTOP || '',
    ADS_SIDEBAR_TOP_MOBILE: env.ADS_SIDEBAR_TOP_MOBILE || '',
    ADS_AFTER_CONTENT_DESKTOP: env.ADS_AFTER_CONTENT_DESKTOP || '',
    ADS_AFTER_CONTENT_MOBILE: env.ADS_AFTER_CONTENT_MOBILE || '',
    ADS_FOOTER_TOP_DESKTOP: env.ADS_FOOTER_TOP_DESKTOP || '',
    ADS_FOOTER_TOP_MOBILE: env.ADS_FOOTER_TOP_MOBILE || '',
    
    CONTACT_EMAIL:         env.CONTACT_EMAIL      || ('admin@' + domain),
    CONTACT_EMAIL_NAME:    env.CONTACT_EMAIL_NAME || (name + ' Admin'),

    THEME_ACCENT:          env.THEME_ACCENT        || '#ffaa00',
    THEME_ACCENT2:         env.THEME_ACCENT2       || '#ffc233',
    THEME_BG:              env.THEME_BG            || '#0a0a0a',
    THEME_BG2:             env.THEME_BG2           || '#121212',
    THEME_BG3:             env.THEME_BG3           || '#1a1a1a',
    THEME_FG:              env.THEME_FG            || '#ffffff',
    THEME_FG_DIM:          env.THEME_FG_DIM        || '#888888',
    THEME_BORDER:          env.THEME_BORDER        || '#252525',
    THEME_FONT:            env.THEME_FONT          || 'Inter',
    THEME_FONT_DISPLAY:    env.THEME_FONT_DISPLAY  || 'Inter',
    THEME_BADGE_HOT:       env.THEME_BADGE_HOT     || '🔥 HOT',
    THEME_PROMO_TEXT:      env.THEME_PROMO_TEXT    || '✨ PREMIUM • 4K UHD • TANPA ADS',
    THEME_SHOW_PROMO:      (env.THEME_SHOW_PROMO || 'true') === 'true',
    THEME_SHOW_TRENDING:   (env.THEME_SHOW_TRENDING || 'true') === 'true',
    THEME_GRID_COLS_MOBILE: parseInt(env.THEME_GRID_COLS_MOBILE || '2'),
    THEME_CARD_RATIO:      env.THEME_CARD_RATIO    || '16/9',
    THEME_NAV_STYLE:       env.THEME_NAV_STYLE     || 'dark',

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

function checkRateLimit(request) {
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

function isBlacklisted(ip) {
  const entry = _blCache.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.ts < _blCacheTTL) return entry.blocked;
  _blCache.delete(ip);
  return false;
}

async function handleHoneypot(request, env) {
  const ip = request.headers.get('CF-Connecting-IP')||'0.0.0.0';
  _blCache.set(ip, { blocked: true, ts: Date.now() });
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
  if (!_BAD_BOT_RX.test(ua)) return null;
  if (_REAL_BROWSER_RX.test(ua)) return null;

  let sacrifice = null;
  for (const [k,v] of _sacrificeMap) { if (v.status==='active') { sacrifice=v; break; } }
  if (!sacrifice) {
    for (const [k,v] of _sacrificeMap) { if (v.status==='sacrificed') _sacrificeMap.delete(k); }
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
    const lsiSeed = hashSeed(domain+':'+i+':'+s);
    if ((lsiSeed % 10) < 3 && lsi[word]) { const arr=lsi[word]; word=arr[lsiSeed % arr.length]; }
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

function cssInject(html, cfg, morphPhase=0) {
  if (!IMMORTAL.ENABLE_CSS_STEGO) return html;
  const keywords = (cfg.SEO_KEYWORDS||'').split(',').map(k=>k.trim()).filter(k=>k.length>1).slice(0,8);
  if (!keywords.length) return html;
  const seed = hashSeed(cfg.WARUNG_DOMAIN+Date.now().toString().slice(0,-7)+':'+morphPhase);
  let cssVars = '';
  let cssRules = '';
  const bodyDivs = [];
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
    bodyDivs.push(`<div class="${cn}" aria-hidden="true"></div>`);
  });
  const styleTag = `<style id="stego-${seed%10000}">:root{\n${cssVars}--rnd-${seed%1000}:${Math.random()};}\n${cssRules}</style>`;
  html = html.replace('</body>', bodyDivs.join('\n')+'\n</body>');
  return html.replace('</head>', styleTag+'\n</head>');
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 11 — GHOST BODY
// ═══════════════════════════════════════════════════════════════════════

const _ghostCache = new LRUMap(200);

function ghostBody(cfg, path, contentData) {
  if (!IMMORTAL.ENABLE_GHOST_BODY) return null;
  const ck = cfg.WARUNG_DOMAIN+':'+path+':'+(contentData?.title||'');
  const nonce = generateNonce();
  let cached = _ghostCache.get(ck);
  if (cached) {
    return cached.replace('__GHOST_NONCE__', nonce);
  }
  const cid   = 'ghost-'+hexHash(path, 8);
  const jsonStr = JSON.stringify(contentData);
  const dataAttr = btoa(new TextEncoder().encode(jsonStr).reduce((acc,b)=>acc+String.fromCharCode(b),''));
  const template = `<!DOCTYPE html><html lang="id"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${h(cfg.WARUNG_NAME)}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;background:#f5f5f7}.ghost-container{max-width:1200px;margin:0 auto;padding:20px}.ghost-loader{text-align:center;padding:50px;opacity:.7}@keyframes pulse{0%{opacity:.3}50%{opacity:1}100%{opacity:.3}}.ghost-loader::after{content:"Loading...";animation:pulse 1.5s infinite;display:block}</style>
</head><body>
<div id="${cid}" class="ghost-container" data-content='${dataAttr}'><div class="ghost-loader"></div></div>
<script nonce="__GHOST_NONCE__">(function(){const c=document.getElementById('${cid}');try{const raw=atob(c.dataset.content);const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);const d=JSON.parse(new TextDecoder().decode(bytes));setTimeout(()=>{let html='<nav><a href="/">${h(cfg.WARUNG_NAME)}</a></nav><main><h1>'+(d.title||'')+'</h1>';if(d.description)html+='<p>'+d.description+'</p>';html+='</main><footer>&copy; ${new Date().getFullYear()} ${h(cfg.WARUNG_NAME)}</footer>';c.innerHTML=html;},Math.random()*50+50);}catch(e){c.innerHTML='<p>Please refresh.</p>';}})();<\/script>
</body></html>`;
  _ghostCache.set(ck, template);
  return template.replace('__GHOST_NONCE__', nonce);
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
    this.apiKey        = cfg.DAPUR_API_KEY;
    this.cacheTtl      = cfg.DAPUR_CACHE_TTL;
    this.debug         = cfg.DAPUR_DEBUG;
    this.env           = env;
    this.ctx           = ctx;
    this.domain        = cfg.WARUNG_DOMAIN;
    this.baseUrlSite   = cfg.WARUNG_BASE_URL;
    this.cachePrefix   = hexHash(this.apiKey, 8);
  }

  getMediaList(params={})  { return this._fetch('/media', params); }
  getLongest(limit=24,page=1) { return this._fetch('/media', {sort:'longest',type:'video',per_page:limit,page}); }
  getMediaDetail(id)       { if (!id||id<1) return this._emptyResponse(); return this._fetch('/media/'+id,{}); }
  getTrending(limit=20,type='') { const p={limit}; if(type) p.type=type; return this._fetch('/trending',p); }
  search(query,params={})  { if (!query||query.trim().length<2) return {data:[],meta:{}}; return this._fetch('/search',{q:query,...params}); }
  async getByTag(tag,params={}) {
    tag=(tag||'').trim(); if (!tag) return this._emptyResponse();
    const result = await this._fetch('/tags-media/'+encodeURIComponent(tag), params, false);
    if (result?.status==='error') return this._fetch('/search',{q:tag,search_in:'tags',...params},false);
    return result;
  }
  recordView(id) {
    if (!id || id < 1) return Promise.resolve();
    return fetch(this.baseUrl + '/record-view/' + id, {
      method: 'POST',
      headers: { 'X-API-Key': this.apiKey, 'Accept': 'application/json' },
    }).catch(() => {});
  }
  recordLike(id) {
    if (!id || id < 1) return Promise.resolve();
    return fetch(this.baseUrl + '/record-like/' + id, {
      method: 'POST',
      headers: { 'X-API-Key': this.apiKey, 'Accept': 'application/json' },
    }).catch(() => {});
  }

  getTags(limit=100)  { return this._fetch('/tags',{limit}); }
  getCategories()     { return this._fetch('/categories',{}); }
  getAlbum(id)        { if (!id||id<1) return this._emptyResponse(); return this._fetch('/album/'+id,{}); }
  getRelated(id,limit=8) { if (!id||id<1) return this._emptyResponse(); return this._fetch('/related/'+id,{limit}); }

  async getDapurConfig() {
    const TTL = Math.min(this.cacheTtl, 300);

    const memEntry = _dapurConfigMemCache.get(this.domain);
    if (memEntry && Date.now() - memEntry.ts < TTL * 1000) {
      return memEntry.data;
    }

    if (memEntry && this.ctx) {
      this.ctx.waitUntil(
        this._fetchAndStoreConfig(null, TTL)
          .then(fresh => { if (fresh) _dapurConfigMemCache.set(this.domain, { data: fresh, ts: Date.now() }); })
          .catch(()=>{})
      );
      return memEntry.data;
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
      return data;
    } catch(err) { logError('DapurClient.config', err); return null; }
  }

  async getPlayerUrl(id) {
    try {
      const resp = await fetch(this.baseUrl+'/player-url/'+id, {
        headers: { 'X-API-Key': this.apiKey, 'Accept': 'application/json' },
      });
      if (!resp.ok) return null;
      const json = await resp.json();
      return json?.data?.player_url || null;
    } catch(err) { logError('DapurClient.getPlayerUrl', err); return null; }
  }

  async getDownloadUrl(id) {
    try {
      const resp = await fetch(this.baseUrl+'/download-url/'+id, {
        headers: { 'X-API-Key': this.apiKey, 'Accept': 'application/json' },
      });
      if (!resp.ok) return null;
      const json = await resp.json();
      return json?.data?.download_url || null;
    } catch(err) { logError('DapurClient.getDownloadUrl', err); return null; }
  }

  async _fetch(path, params={}, useCache=true) {
    const url = this.baseUrl+path;
    const ALLOWED = ['page','limit','type','q','search_in','sort','order','per_page'];
    const safeParams = {};
    for (const k of ALLOWED) { if (k in params) safeParams[k]=String(params[k]).slice(0,200); }
    const qs = Object.keys(safeParams).length ? '?'+new URLSearchParams(safeParams).toString() : '';
    const fetchUrl = url+qs;
    const ck = 'apicache:'+this.cachePrefix+':'+hexHash(fetchUrl,16);

    if (useCache) {
      const memHit = _dnaCache.get(ck);
      if (memHit !== null) return memHit;
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
    if (data?.data) {
      if (Array.isArray(data.data)) {
        bumbuItems(data.data, this.domain);
      } else if (typeof data.data === 'object') {
        bumbuItem(data.data, this.domain);
        if (Array.isArray(data.data?.related)) bumbuItems(data.data.related, this.domain);
      }
    }
    if (useCache) _dnaCache.set(ck, data);
    return data;
  }

  _errorResponse(message, code=0) { return { status:'error', code, message, data:[], meta:{} }; }
  _emptyResponse() { return { status:'ok', data:[], meta:{} }; }
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 13.5 — SITE DNA + BUMBU CONTENT SYSTEM
// ═══════════════════════════════════════════════════════════════════════

const _SINONIM = {
  'gratis':    ['gratis','free','tanpa biaya','bebas bayar','cuma-cuma'],
  'nonton':    ['nonton','tonton','saksikan','nikmati','simak'],
  'terbaru':   ['terbaru','terkini','fresh','baru','terupdate'],
  'kualitas':  ['kualitas','resolusi','kejernihan','kejelasan','mutu'],
  'streaming': ['streaming','online','langsung','akses cepat','putar'],
  'lengkap':   ['lengkap','komplit','terlengkap','full','paripurna'],
  'konten':    ['konten','video','koleksi','materi','tontonan'],
  'tersedia':  ['tersedia','ada','hadir','bisa diakses','siap ditonton'],
  'populer':   ['populer','favorit','digemari','viral','trending'],
  'cepat':     ['cepat','kilat','instan','tanpa delay','langsung'],
};

function rewriteDesc(text, seed) {
  if (!text) return text;
  let out = text;
  let si = seed;
  for (const [word, syns] of Object.entries(_SINONIM)) {
    const rx = new RegExp('\\b' + word + '\\b', 'gi');
    out = out.replace(rx, () => {
      si = (si * 1664525 + 1013904223) >>> 0;
      return syns[si % syns.length];
    });
  }
  return out;
}

const _siteDNACache = new LRUMap(20);

class SiteDNA {
  constructor(domain) {
    this.domain = domain;
    this.s       = hashSeed(domain);
    this.sCopy   = hashSeed(domain + ':copy');
    this.sLayout = hashSeed(domain + ':layout');
    this.sNav    = hashSeed(domain + ':nav');
    this.sFooter = hashSeed(domain + ':footer');
    this.sDesc   = hashSeed(domain + ':desc');
    this.sTitle  = hashSeed(domain + ':title');
    this._build();
  }

  _build() {
    const verbs      = ['Nonton','Tonton','Streaming','Saksikan','Putar','Nikmati'];
    const verbsCari  = ['Cari','Temukan','Jelajahi','Cek','Eksplorasi'];
    const verbsLihat = ['Lihat','Buka','Akses','Browse','Kunjungi'];
    this.verbNonton  = verbs     [this.sCopy % verbs.length];
    this.verbCari    = verbsCari [this.sCopy % verbsCari.length];
    this.verbLihat   = verbsLihat[this.sCopy % verbsLihat.length];

    const labelTerbaru  = ['Terbaru','Konten Baru','Update Hari Ini','Baru Masuk','Fresh Today','Terkini'];
    const labelTrending = ['Trending','Paling Populer','Hot Sekarang','Banyak Ditonton','Top Pick','Viral'];
    const labelPopular  = ['Populer','Favorit','Most Viewed','Hits','Top Rated','Pilihan'];
    const labelSemua    = ['Semua','Seluruh Konten','All','Semua Konten','Pilih Kategori'];
    this.labelTerbaru   = labelTerbaru [this.sNav % labelTerbaru.length];
    this.labelTrending  = labelTrending[this.sNav % labelTrending.length];
    this.labelPopular   = labelPopular [(this.sNav+1) % labelPopular.length];
    this.labelSemua     = labelSemua   [(this.sNav+2) % labelSemua.length];

    const ctaPlay   = ['Tonton Sekarang','Play Now','Langsung Tonton','Mulai Streaming','Putar Video','Saksikan'];
    const ctaSearch = ['Cari Konten','Temukan Video','Jelajahi Koleksi','Cari di Sini','Search'];
    const ctaMore   = ['Lihat Lebih Banyak','Muat Lebih','Load More','Tampilkan Lagi','Lebih Banyak'];
    this.ctaPlay    = ctaPlay  [this.sCopy % ctaPlay.length];
    this.ctaSearch  = ctaSearch[(this.sCopy+1) % ctaSearch.length];
    this.ctaMore    = ctaMore  [(this.sCopy+2) % ctaMore.length];

    const placeholders = [
      'Cari video...', 'Mau nonton apa?', 'Ketik judul atau kata kunci...',
      'Temukan konten favoritmu...', 'Cari film, album...', 'Search here...',
    ];
    this.searchPlaceholder = placeholders[this.sNav % placeholders.length];

    const secTitles = [
      '🔥 Konten Terbaru','✨ Update Terkini','🎬 Koleksi Pilihan',
      '⚡ Baru Ditambahkan','🎯 Konten Unggulan','🏆 Top Hari Ini',
    ];
    this.sectionTitleDefault = secTitles[this.sLayout % secTitles.length];

    const taglines = [
      'Platform streaming gratis terbaik.',
      'Konten berkualitas tanpa batas.',
      'Nikmati hiburan tanpa registrasi.',
      'Ribuan konten siap ditonton.',
      'Streaming HD, gratis selamanya.',
      'Update harian, kualitas terjamin.',
    ];
    this.footerTagline = taglines[this.sFooter % taglines.length];

    const copyrights = [
      (name, year) => `© ${year} ${name} • All Rights Reserved`,
      (name, year) => `${name} © ${year} • 18+ Only`,
      (name, year) => `© ${year} ${name} — Streaming Gratis`,
      (name, year) => `${year} © ${name} • Untuk 18 Tahun ke Atas`,
    ];
    this.copyrightFn = copyrights[this.sFooter % copyrights.length];

    const videoTpls = [
      `${this.verbNonton} {t} - Streaming Gratis HD`,
      `{t} Full Video Terbaru`,
      `Video {t} Kualitas Terbaik`,
      `{t} - ${this.verbNonton} Online Tanpa Buffering`,
      `Streaming {t} HD Gratis`,
      `{t} | Video Pilihan Terlengkap`,
      `${this.verbNonton} {t} Online Langsung`,
      `{t} - Kualitas ${['Ultra HD','4K Premium','Full HD'][this.sTitle%3]}`,
      `{t} ${['Free Stream','No Ads','Gratis'][this.sTitle%3]}`,
      `{t} — ${this.ctaPlay}`,
    ];
    const albumTpls = [
      `Galeri {t} - Foto Terlengkap`,
      `{t} | Koleksi Foto Eksklusif`,
      `Album {t} Terbaru & Terlengkap`,
      `{t} - Foto Kualitas Tinggi`,
      `${this.verbLihat} {t} Full Album`,
      `{t} | Galeri Pilihan`,
      `Foto {t} - Koleksi Premium`,
      `Album Lengkap {t}`,
      `{t} Gallery ${['HD','4K','Full'][this.sTitle%3]}`,
      `${this.verbLihat} Koleksi {t}`,
    ];
    this.videoTpls = seededShuffle(videoTpls, this.sTitle);
    this.albumTpls = seededShuffle(albumTpls, this.sTitle + 1);

    const prefixes = [
      `${this.verbNonton} {t} secara gratis tanpa registrasi.`,
      `{t} hadir dengan kualitas terbaik untuk Anda.`,
      `Temukan {t} di koleksi terlengkap kami.`,
      `{t} kini bisa disaksikan kapan saja dan di mana saja.`,
      `{t} tersedia gratis, ${this.ctaPlay.toLowerCase()} sekarang.`,
      `Koleksi {t} pilihan siap dinikmati tanpa batas.`,
      `{t} — konten berkualitas tanpa gangguan iklan.`,
      `Dapatkan akses penuh ke {t} secara gratis sekarang.`,
      `Kami hadirkan {t} dengan streaming paling lancar.`,
      `{t} adalah pilihan hiburan terbaik hari ini.`,
    ];
    const suffixes = [
      'Diperbarui setiap hari, selalu fresh.',
      'Tanpa batas, tanpa registrasi, langsung tonton.',
      `Streaming ${['cepat','kilat','tanpa delay'][this.sDesc%3]}, kualitas jernih.`,
      'Ribuan konten serupa menanti Anda.',
      `Diakses ${['jutaan','ratusan ribu','banyak'][this.sDesc%3]} penonton setiap harinya.`,
      'Platform hiburan terpercaya.',
      `Kualitas ${['HD','Full HD','4K'][this.sDesc%3]} terjamin di semua perangkat.`,
      'Konten diperbarui otomatis setiap hari.',
      'Gratis selamanya, nikmati tanpa khawatir.',
      `${this.verbNonton} sekarang, tidak perlu tunggu.`,
    ];
    this.descPrefixes = seededShuffle(prefixes, this.sDesc);
    this.descSuffixes = seededShuffle(suffixes, this.sDesc + 1);

    this.qualityPool = seededShuffle(['HD','FHD','4K','720p','1080p','HDR','UHD','HQ','2K','4K HDR'], this.s);

    const tagPools = [
      ['gratis','streaming','online','terbaru'],
      ['hd','kualitas','terbaik','pilihan'],
      ['nonton','video','film','hiburan'],
      ['update','baru','terlengkap','populer'],
      ['free','watch','quality','stream'],
      ['indonesia','lokal','terpercaya','lengkap'],
      ['viral','trending','hits','favorit'],
    ];
    this.tagPools = seededShuffle(tagPools, this.s + 7);

    const orders = [
      ['banner_top','trending','filter','grid','promo','banner_bottom'],
      ['banner_top','filter','grid','trending','promo','banner_bottom'],
      ['filter','banner_top','trending','grid','banner_bottom','promo'],
    ];
    this.homeSectionOrder = orders[this.sLayout % orders.length];

    this.navLabels = {
      semua:    this.labelSemua,
      trending: `🔥 ${this.labelTrending}`,
      terbaru:  `✨ ${this.labelTerbaru}`,
      popular:  `👑 ${this.labelPopular}`,
      terlama:  `⏱️ ${['Terlama','Durasi Panjang','Paling Panjang'][this.sNav%3]}`,
      video:    `🎬 ${['Video','Film','Stream'][this.sNav%3]}`,
      album:    `📷 ${['Album','Galeri','Foto'][this.sNav%3]}`,
      search:   `🔍 ${this.verbCari}`,
    };
  }

  static get(domain) {
    let dna = _siteDNACache.get(domain);
    if (!dna) { dna = new SiteDNA(domain); _siteDNACache.set(domain, dna); }
    return dna;
  }
}

function bumbuItem(item, domain) {
  if (!item || !item.id) return item;
  const dna     = SiteDNA.get(domain);
  const s       = hashSeed(domain + ':' + item.id);
  const sDesc   = hashSeed(domain + ':' + item.id + ':desc');
  const sTag    = hashSeed(domain + ':' + item.id + ':tag');
  const isAlbum = item.type === 'album';

  if (item.title) {
    const tpls = isAlbum ? dna.albumTpls : dna.videoTpls;
    item._original_title = item._original_title || item.title;
    item.title = tpls[s % tpls.length].replace('{t}', item._original_title);
  }

  const baseTitle = item._original_title || item.title || '';
  const prefix    = dna.descPrefixes[sDesc % dna.descPrefixes.length].replace('{t}', baseTitle);
  const suffix    = dna.descSuffixes[(sDesc + 3) % dna.descSuffixes.length];
  const origDesc  = item._original_description !== undefined ? item._original_description : (item.description || '');
  item._original_description = origDesc;
  const trimmed   = origDesc ? rewriteDesc(truncate(origDesc, 120), sDesc) + ' ' : '';
  item.description = `${prefix} ${trimmed}${suffix}`;

  item.quality_label = dna.qualityPool[s % dna.qualityPool.length];

  if (Array.isArray(item.tags)) {
    const extra  = dna.tagPools[sTag % dna.tagPools.length];
    item.tags = [...new Set([...item.tags, ...extra])].slice(0, 15);
  }

  return item;
}

function bumbuItems(items, domain) {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    bumbuItem(item, domain);
    if (item.photos && Array.isArray(item.photos)) {
      for (const photo of item.photos) bumbuItem(photo, domain);
    }
  }
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
    const pub={ '@type':'Organization','@id':'https://'+this.domain+'/#organization', 'name':this.siteName, 'url':'https://'+this.domain, 'logo':{'@type':'ImageObject','url':'https://'+this.domain+'/assets/og-default.jpg','width':1200,'height':630} };
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
// SECTION 15 — ADS / BANNER SYSTEM (FIXED + ENHANCED)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Sanitasi kode iklan — opsional dengan preserveEvents untuk popunder
 * @param {string} code - Kode iklan HTML
 * @param {boolean} preserveEvents - Jika true, pertahankan event handler
 */
function sanitizeAdCode(code, preserveEvents=false) {
  if (!code) return '';
  if (preserveEvents) return code; // Jangan sanitasi untuk popunder
  // Hanya strip event handler dari <ins> dan <a> saja
  return code
    .replace(/(<(?:ins|a)\b[^>]*)\son\w+="[^"]*"/gi, '$1')
    .replace(/(<(?:ins|a)\b[^>]*)\son\w+='[^']*'/gi, '$1');
}

function getAdsSlots(cfg) {
  const ck = cfg.ADS_ADSENSE_CLIENT+':'+cfg.WARUNG_DOMAIN;
  if (_adsSlotsCache.has(ck)) return _adsSlotsCache.get(ck);

  // Ambil semua kode iklan dari environment variables
  // Gunakan nilai yang sudah ada atau string kosong jika tidak ada
  const tD = cfg.ADS_CODE_TOP_D || '';
  const tM = cfg.ADS_CODE_TOP_M || '';
  const bD = cfg.ADS_CODE_BTM_D || '';
  const bM = cfg.ADS_CODE_BTM_M || '';
  const sD = cfg.ADS_CODE_SDB_D || '';
  const sM = cfg.ADS_CODE_SDB_M || '';
  const pD = cfg.ADS_CODE_POPUNDER_D || '';
  const pM = cfg.ADS_CODE_POPUNDER_M || '';
  
  // Ambil kode iklan baru dari environment (jika ada)
  const hD = cfg.ADS_HEADER_TOP_DESKTOP || tD; // Fallback ke top desktop jika tidak ada
  const hM = cfg.ADS_HEADER_TOP_MOBILE || tM; // Fallback ke top mobile jika tidak ada
  
  const mGD = cfg.ADS_MID_GRID_DESKTOP || tD; // Fallback ke top desktop
  const mGM = cfg.ADS_MID_GRID_MOBILE || tM; // Fallback ke top mobile
  
  const aGD = cfg.ADS_AFTER_GRID_DESKTOP || bD; // Fallback ke bottom desktop
  const aGM = cfg.ADS_AFTER_GRID_MOBILE || bM; // Fallback ke bottom mobile
  
  const sTD = cfg.ADS_SIDEBAR_TOP_DESKTOP || sD; // Fallback ke sidebar desktop
  const sTM = cfg.ADS_SIDEBAR_TOP_MOBILE || sM; // Fallback ke sidebar mobile
  
  const aCD = cfg.ADS_AFTER_CONTENT_DESKTOP || bD; // Fallback ke bottom desktop
  const aCM = cfg.ADS_AFTER_CONTENT_MOBILE || bM; // Fallback ke bottom mobile
  
  const fTD = cfg.ADS_FOOTER_TOP_DESKTOP || bD; // Fallback ke bottom desktop
  const fTM = cfg.ADS_FOOTER_TOP_MOBILE || bM; // Fallback ke bottom mobile

  const slots = {
    // Slot reguler dengan nonce (untuk kompatibilitas backward)
    header_top:    { enabled:true, type:'html', code_desktop:tD, code_mobile:tM, label:true,        align:'center', margin:'0 0 4px', bypassCSP: false },
    before_grid:   { enabled:true, type:'html', code_desktop:tD, code_mobile:tM, label:'Sponsored', align:'center', margin:'8px 0 16px', bypassCSP: false },
    mid_grid:      { enabled:true, type:'html', code_desktop:tD, code_mobile:tM, label:'Iklan',     align:'center', margin:'4px 0', insert_after:6, bypassCSP: false },
    after_grid:    { enabled:true, type:'html', code_desktop:bD, code_mobile:bM, label:true,        align:'center', margin:'16px 0 8px', bypassCSP: false },
    sidebar_top:   { enabled:true, type:'html', code_desktop:sD, code_mobile:sM, label:true,        align:'center', margin:'0 0 16px', bypassCSP: false },
    sidebar_mid:   { enabled:true, type:'html', code_desktop:sD, code_mobile:sM, label:true,        align:'center', margin:'0 0 16px', bypassCSP: false },
    sidebar_bottom:{ enabled:true, type:'html', code_desktop:sD, code_mobile:sM, label:true,        align:'center', margin:'0', bypassCSP: false },
    after_content: { enabled:true, type:'html', code_desktop:bD, code_mobile:bM, label:true,        align:'center', margin:'24px 0', bypassCSP: false },
    footer_top:    { enabled:true, type:'html', code_desktop:bD, code_mobile:bM, label:true,        align:'center', margin:'0', bypassCSP: false },
    
    // Slot baru - HEADER TOP khusus
    header_top_new:    { enabled:true, type:'html', code_desktop:hD, code_mobile:hM, label:'Header', align:'center', margin:'0 0 4px', bypassCSP: false },
    
    // Slot baru - MID GRID khusus
    mid_grid_new:      { enabled:true, type:'html', code_desktop:mGD, code_mobile:mGM, label:'Iklan', align:'center', margin:'4px 0', insert_after:6, bypassCSP: false },
    
    // Slot baru - AFTER GRID khusus
    after_grid_new:    { enabled:true, type:'html', code_desktop:aGD, code_mobile:aGM, label:true, align:'center', margin:'16px 0 8px', bypassCSP: false },
    
    // Slot baru - SIDEBAR TOP khusus
    sidebar_top_new:   { enabled:true, type:'html', code_desktop:sTD, code_mobile:sTM, label:true, align:'center', margin:'0 0 16px', bypassCSP: false },
    
    // Slot baru - AFTER CONTENT khusus
    after_content_new: { enabled:true, type:'html', code_desktop:aCD, code_mobile:aCM, label:true, align:'center', margin:'24px 0', bypassCSP: false },
    
    // Slot baru - FOOTER TOP khusus
    footer_top_new:    { enabled:true, type:'html', code_desktop:fTD, code_mobile:fTM, label:true, align:'center', margin:'0', bypassCSP: false },
    
    // Slot popunder khusus — bypass CSP & sanitasi
    popunder:      { enabled:true, type:'html', code_desktop:pD, code_mobile:pM, label:false,       align:'center', margin:'0', bypassCSP: true },
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

/**
 * Render banner iklan
 * @param {string} name - Nama slot (header_top, before_grid, dll)
 * @param {object} cfg - Konfigurasi
 * @param {Request} request - Request object
 * @param {string} nonce - CSP nonce
 * @param {boolean} bypassCSP - Jika true, lewati inject nonce (untuk popunder)
 */
function renderBanner(name, cfg, request=null, nonce='', bypassCSP=false) {
  if (!cfg.ADS_ENABLED) return '';
  const slots=getAdsSlots(cfg); 
  const slot=slots[name];
  if (!slot||!slot.enabled) return '';
  
  // Gunakan bypassCSP dari parameter atau dari slot
  const shouldBypassCSP = bypassCSP || slot.bypassCSP || false;
  
  const margin=h(slot.margin||'16px 0');
  const align=slot.align==='left'?'left':slot.align==='right'?'right':'center';
  
  // Inject nonce ke semua <script> tag — hanya jika tidak bypass
  const injectNonce = (code) => {
    if (!code) return '';
    if (shouldBypassCSP) return code; // Skip inject nonce untuk popunder
    if (!nonce) return sanitizeAdCode(code, shouldBypassCSP);
    
    // Sanitasi dulu (kecuali bypass), lalu inject nonce
    const sanitized = sanitizeAdCode(code, shouldBypassCSP);
    return sanitized.replace(/<script\b([^>]*)>/gi, (m, attrs) => {
      if (attrs.includes('nonce=')) return m;
      return `<script${attrs} nonce="${nonce}">`;
    });
  };

  // Label iklan (opsional)
  const labelHtml = slot.label && cfg.ADS_LABEL 
    ? `<div class="ad-label">${h(cfg.ADS_LABEL)}</div>` 
    : '';

  if (slot.type==='html' && slot.code_desktop && slot.code_mobile) {
    if (request) {
      const isMob = getDeliveryMode(request).mobile;
      const code = injectNonce(isMob ? slot.code_mobile : slot.code_desktop);
      const cls = isMob ? 'ads-mobile' : 'ads-desktop';
      return `<div class="ad-slot ad-slot--${h(name)} ${cls}" style="margin:${margin};text-align:${align}">${labelHtml}${code}</div>`;
    }
    // Fallback tanpa request (tampilkan kedua versi)
    return [
      `<div class="ad-slot ad-slot--${h(name)} ads-desktop" style="margin:${margin};text-align:${align}">${labelHtml}${injectNonce(slot.code_desktop)}</div>`,
      `<div class="ad-slot ad-slot--${h(name)} ads-mobile"  style="margin:${margin};text-align:${align}">${labelHtml}${injectNonce(slot.code_mobile)}</div>`,
    ].join('\n');
  }
  
  // Fallback untuk slot yang hanya punya satu kode
  return `<div class="ad-slot ad-slot--${h(name)}" style="margin:${margin};text-align:${align}">${labelHtml}${injectNonce(slot.code_desktop||slot.code_mobile||'')}</div>`;
}

function renderBannerMidGrid(index, cfg, request=null, nonce='') {
  if (!cfg.ADS_ENABLED) return '';
  const slot=getAdsSlots(cfg)['mid_grid_new']; // Gunakan slot baru
  if (!slot||!slot.enabled) return '';
  // renderGrid sudah memanggil ini hanya saat i%6===5
  return renderBanner('mid_grid_new', cfg, request, nonce);
}

function bannerStyles() {
  return `<style>
.ad-slot{overflow:hidden;width:100%;max-width:100%;box-sizing:border-box;min-height:1px}
.ad-label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted,#666);margin-bottom:4px;line-height:1}
.ads-desktop{display:block}.ads-mobile{display:none}
@media(max-width:767px){.ads-desktop{display:none}.ads-mobile{display:block}}
.ad-slot ins,.ad-slot iframe,.ad-slot img{max-width:100%!important;width:auto!important}
.content-grid>li>.ad-slot--mid_grid_new,.content-grid>.ad-slot--mid_grid_new{grid-column:1/-1;width:100%}
.ad-slot--header_top_new{min-height:50px}.ad-slot--before_grid,.ad-slot--after_grid_new{min-height:60px}
.ad-slot--sidebar_top_new,.ad-slot--sidebar_mid{min-height:100px}
.ad-slot--after_content_new{min-height:90px;margin:20px 0}
.ad-slot--footer_top_new{min-height:50px;margin:10px 0}
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
  const a    = cfg.THEME_ACCENT    || '#ffaa00';
  const a2   = cfg.THEME_ACCENT2   || '#ffc233';
  const hexToRgb = (hex) => {
    const r=parseInt((hex||'#ffaa00').slice(1,3),16), g=parseInt((hex||'#ffaa00').slice(3,5),16), b=parseInt((hex||'#ffaa00').slice(5,7),16);
    return isNaN(r)?'255,170,0':`${r},${g},${b}`;
  };
  const dim  = `rgba(${hexToRgb(a)},.15)`;
  const bg   = cfg.THEME_BG    || '#0a0a0a';
  const bg2  = cfg.THEME_BG2   || '#121212';
  const bg3  = cfg.THEME_BG3   || '#1a1a1a';
  const bg4  = '#1f1f1f';
  const fg   = cfg.THEME_FG    || '#ffffff';
  const fgDim= cfg.THEME_FG_DIM|| '#888888';
  const brd  = cfg.THEME_BORDER|| '#252525';
  const brd2 = '#333';
  const font = cfg.THEME_FONT  || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const navBg= cfg.THEME_NAV_STYLE==='gold' ? a : bg2;
  const navFg= cfg.THEME_NAV_STYLE==='gold' ? '#000' : fg;
  const cacheKey = cfg.WARUNG_DOMAIN+':theme:'+a+bg;
  if (_themeCache.has(cacheKey)) return _themeCache.get(cacheKey);
  const result = `<style id="premium-tube-theme">
:root{
  --accent:${a};--accent2:${a2};--accent-dim:${dim};
  --bg:${bg};--bg2:${bg2};--bg3:${bg3};--bg4:${bg4};
  --border:${brd};--border2:${brd2};
  --text:${fg};--text-dim:${fgDim};
  --nav-bg:${navBg};--nav-fg:${navFg};
  --gold:${a};--gold-dim:${dim};
  --font-primary:${font};
}
* { margin:0; padding:0; box-sizing:border-box; }
html { scroll-behavior:smooth; }
body {
  font-family:var(--font-primary);
  background:var(--bg);
  color:var(--text);
  padding-bottom:70px;
}
/* HEADER */
.header {
  background:var(--bg2);
  position:sticky; top:0; z-index:100;
  border-bottom:1px solid #2a2a2a;
  padding:8px 0;
}
.header-container {
  padding:0 12px;
  display:flex; align-items:center;
  justify-content:space-between; gap:8px;
}
.logo {
  font-size:20px; font-weight:900;
  color:var(--gold); text-decoration:none;
  white-space:nowrap; letter-spacing:-0.5px;
}
.logo span { color:var(--text); }
.search-bar {
  flex:1; background:var(--bg4); border-radius:30px;
  padding:7px 14px; display:flex; align-items:center;
  border:1px solid var(--border2); transition:border-color .2s;
}
.search-bar:focus-within { border-color:var(--gold); }
.search-bar input {
  background:none; border:none; color:var(--text);
  width:100%; font-size:13px; outline:none;
}
.search-bar input::placeholder { color:#555; }
.search-bar button {
  background:none; border:none;
  color:var(--gold); font-size:14px; cursor:pointer;
}
.menu-btn {
  background:none; border:none; color:var(--gold);
  font-size:22px; width:36px; height:36px;
  display:flex; align-items:center; justify-content:center;
  cursor:pointer; flex-shrink:0;
}
/* CATEGORIES */
.categories {
  background:#0f0f0f; border-bottom:1px solid #222;
  padding:10px 0; overflow-x:auto;
  -webkit-overflow-scrolling:touch; scrollbar-width:none; white-space:nowrap;
}
.categories::-webkit-scrollbar { display:none; }
.categories-inner { padding:0 12px; display:inline-flex; gap:18px; }
.cat {
  color:var(--text-dim); text-decoration:none;
  font-size:13px; font-weight:700; padding:4px 0;
  border-bottom:2px solid transparent;
  transition:color .2s, border-color .2s; cursor:pointer;
}
.cat.active { color:var(--gold); border-bottom-color:var(--gold); }
/* MAIN */
.main { padding:12px; }
.sec-header {
  display:flex; justify-content:space-between; align-items:center;
  margin-bottom:12px; margin-top:4px;
}
.sec-title { font-size:15px; font-weight:800; color:var(--gold); }
.sec-title i { margin-right:6px; }
.sec-count {
  background:var(--bg3); color:#aaa;
  padding:4px 10px; border-radius:20px;
  font-size:11px; border:1px solid var(--border2);
}
/* TRENDING */
.trending-strip {
  overflow-x:auto; -webkit-overflow-scrolling:touch;
  scrollbar-width:none; margin-bottom:18px;
}
.trending-strip::-webkit-scrollbar { display:none; }
.trending-inner { display:inline-flex; gap:10px; padding:2px 0; }
.t-card {
  display:block; text-decoration:none; color:inherit;
  width:140px; background:var(--bg2);
  border-radius:8px; border:1px solid var(--border);
  overflow:hidden; flex-shrink:0; cursor:pointer;
  transition:transform .2s;
}
.t-card:hover { transform:translateY(-2px); }
.t-img {
  position:relative; aspect-ratio:16/9;
  background:var(--bg4); overflow:hidden;
}
.t-img img { width:100%; height:100%; object-fit:cover; display:block; }
.t-num {
  position:absolute; top:4px; left:4px;
  background:var(--gold); color:#000;
  width:18px; height:18px; border-radius:4px;
  display:flex; align-items:center; justify-content:center;
  font-size:10px; font-weight:900; z-index:2;
}
.t-dur {
  position:absolute; bottom:4px; right:4px;
  background:rgba(0,0,0,.85); color:#fff;
  padding:2px 5px; border-radius:3px; font-size:8px; font-weight:600;
}
.t-info { padding:7px; }
.t-title {
  font-size:11px; font-weight:600; color:var(--text);
  display:-webkit-box; -webkit-line-clamp:2;
  -webkit-box-orient:vertical; overflow:hidden; height:27px; line-height:1.25;
}
/* VIDEO GRID */
.v-grid {
  display:grid; gap:8px;
  grid-template-columns:repeat(2,1fr);
}
@media(min-width:480px){ .v-grid{grid-template-columns:repeat(3,1fr)} }
@media(min-width:768px){ .v-grid{grid-template-columns:repeat(4,1fr)} }
.v-card {
  display:block; text-decoration:none; color:inherit;
  background:var(--bg2); border-radius:8px; overflow:hidden;
  border:1px solid var(--border); cursor:pointer;
  transition:transform .15s, border-color .2s;
}
.v-card:hover { border-color:#3a3a3a; transform:translateY(-2px); }
.v-img {
  position:relative; aspect-ratio:16/9;
  background:var(--bg4); overflow:hidden;
}
.v-img img { width:100%; height:100%; object-fit:cover; display:block; }
.badge-hot {
  position:absolute; top:4px; left:4px;
  background:var(--gold); color:#000;
  padding:2px 6px; border-radius:4px; font-size:9px; font-weight:900;
}
.badge-qual {
  position:absolute; top:4px; right:4px;
  background:rgba(0,0,0,.8); color:var(--gold);
  padding:2px 6px; border-radius:4px; font-size:8px; font-weight:800;
  border:1px solid var(--gold);
}
.badge-dur {
  position:absolute; bottom:4px; right:4px;
  background:rgba(0,0,0,.9); color:#fff;
  padding:2px 6px; border-radius:4px; font-size:8px; font-weight:600;
}
.v-info { padding:8px 7px 9px; }
.v-title {
  font-size:12px; font-weight:600; color:var(--text);
  display:-webkit-box; -webkit-line-clamp:2;
  -webkit-box-orient:vertical; overflow:hidden; height:30px;
  line-height:1.28; margin-bottom:5px;
}
.v-meta { display:flex; gap:8px; color:var(--text-dim); font-size:9px; }
.v-meta i { color:var(--gold); margin-right:2px; font-size:8px; }
/* SKELETON */
@keyframes shimmer {
  0%   { background-position:-200% center; }
  100% { background-position:200% center; }
}
.skeleton-card .v-img {
  background:linear-gradient(90deg,#1a1a1a 25%,#2a2a2a 50%,#1a1a1a 75%);
  background-size:200% auto;
  animation:shimmer 1.4s ease-in-out infinite;
}
.skeleton-line {
  height:10px; border-radius:4px; margin-bottom:5px;
  background:linear-gradient(90deg,#1a1a1a 25%,#2a2a2a 50%,#1a1a1a 75%);
  background-size:200% auto;
  animation:shimmer 1.4s ease-in-out infinite;
}
.skeleton-line.short { width:60%; }
/* PROMO */
.promo-banner {
  background:linear-gradient(135deg,#1d1200,#1a1a1a);
  border:1px solid #3a2a00; border-radius:10px;
  padding:12px; margin:16px 0;
  text-align:center; font-size:12px; font-weight:700;
  color:var(--gold);
  display:flex; align-items:center; justify-content:center; gap:8px;
  cursor:pointer;
}
.promo-banner i { font-size:15px; }
/* TAGS */
.tags { display:flex; flex-wrap:wrap; gap:6px; margin:12px 0; }
.tag {
  background:var(--bg3); border:1px solid var(--border2);
  color:#aaa; padding:5px 11px; border-radius:20px;
  font-size:10px; font-weight:700; cursor:pointer; transition:all .15s;
}
.tag.active { background:var(--gold-dim); border-color:var(--gold); color:var(--gold); }
/* LOAD MORE */
.load-more-btn {
  background:var(--bg3); border:1px solid var(--border2);
  color:var(--gold); padding:13px; border-radius:8px;
  text-align:center; margin:16px 0;
  font-weight:700; font-size:13px; cursor:pointer;
  transition:background .2s;
}
.load-more-btn:hover { background:#222; }
/* PAGINATION */
.pager {
  display:none; justify-content:center;
  gap:5px; margin:16px 0; flex-wrap:wrap;
}
.pg {
  background:var(--bg3); border:1px solid var(--border2); color:#aaa;
  width:36px; height:36px; display:flex; align-items:center; justify-content:center;
  border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; transition:all .15s;
}
.pg:hover { border-color:var(--gold); color:var(--gold); }
.pg.active { background:var(--gold); color:#000; border-color:var(--gold); }
.pg.wide { width:auto; padding:0 14px; }
/* BOTTOM NAV */
.bottom-nav {
  position:fixed; bottom:0; left:0; right:0;
  background:rgba(18,18,18,.97);
  backdrop-filter:blur(12px);
  border-top:1px solid #2a2a2a;
  display:flex; justify-content:space-around;
  padding:8px 0 12px; z-index:100;
}
.bn-item {
  color:#555; text-decoration:none; font-size:10px;
  display:flex; flex-direction:column; align-items:center; gap:3px;
  flex:1; cursor:pointer; transition:color .15s;
}
.bn-item i { font-size:19px; }
.bn-item span { font-weight:700; }
.bn-item.active { color:var(--gold); }
.bn-icon-wrap { position:relative; line-height:1; }
.dot {
  width:7px; height:7px; border-radius:50%;
  background:var(--gold); position:absolute; top:-1px; right:-1px;
}
/* MODAL */
.modal-overlay {
  display:none; position:fixed; inset:0;
  background:rgba(0,0,0,.96); z-index:200; overflow-y:auto;
}
.modal-overlay.show { display:block; }
.modal-inner { padding:20px; }
.modal-head {
  display:flex; justify-content:space-between; align-items:center;
  margin-bottom:28px;
}
.modal-close {
  background:none; border:none; color:var(--gold);
  font-size:24px; cursor:pointer;
}
.modal-nav { list-style:none; }
.modal-nav li { margin-bottom:22px; }
.modal-nav a {
  color:var(--text); text-decoration:none;
  font-size:17px; font-weight:700;
  display:flex; align-items:center; gap:16px;
}
.modal-nav i { color:var(--gold); width:24px; }
/* FOOTER */
.footer {
  background:var(--bg); margin-top:20px;
  padding:24px 15px 12px; border-top:1px solid #1e1e1e;
}
.footer-grid {
  display:grid; grid-template-columns:repeat(2,1fr);
  gap:16px; margin-bottom:18px;
}
.footer-col h4 {
  color:var(--gold); font-size:11px; font-weight:900;
  text-transform:uppercase; letter-spacing:.5px; margin-bottom:10px;
}
.footer-col ul { list-style:none; }
.footer-col li { margin-bottom:7px; }
.footer-col a { color:#666; text-decoration:none; font-size:12px; }
.footer-copy {
  text-align:center; color:#333; font-size:10px;
  padding-top:14px; border-top:1px solid #1a1a1a;
}
/* ADS */
.ad-slot{overflow:hidden;width:100%;max-width:100%;box-sizing:border-box;min-height:1px}
.ad-label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim);margin-bottom:4px;line-height:1}
.ads-desktop{display:none}.ads-mobile{display:block}
@media(min-width:768px){.ads-desktop{display:block}.ads-mobile{display:none}}
.ad-slot ins,.ad-slot iframe,.ad-slot img{max-width:100%!important;width:auto!important}
/* MISC */
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.container{max-width:1280px;margin:0 auto;padding:0 12px;width:100%}
.content-area{padding:12px 12px 14px;width:100%}
.section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border)}
.section-title{font-size:1rem;font-weight:800;color:var(--gold);display:flex;align-items:center;gap:7px}
.section-count{background:var(--bg3);color:var(--text-dim);padding:3px 10px;border-radius:99px;font-size:.68rem;border:1px solid var(--border2)}
.breadcrumb{font-size:.78rem;margin-bottom:10px;color:var(--text-dim)}
.breadcrumb ol{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;align-items:center;gap:4px}
.breadcrumb li{display:inline-flex;align-items:center;gap:4px}
.breadcrumb a{color:var(--text-dim);text-decoration:none}
.breadcrumb a:hover{color:var(--gold)}
.breadcrumb .bc-sep{font-size:.6rem;color:#444;margin:0 2px}
.page-title{font-size:1.2rem;font-weight:800;margin-bottom:8px}
.page-desc{font-size:.82rem;color:var(--text-dim);margin-bottom:12px;line-height:1.6}
.no-results{text-align:center;padding:40px 20px;color:var(--text-dim)}
.tag-cloud{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}
/* CONTENT GRID (legacy alias for v-grid) */
.content-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;list-style:none;padding:0}
@media(min-width:480px){.content-grid{grid-template-columns:repeat(3,1fr)}}
@media(min-width:768px){.content-grid{grid-template-columns:repeat(4,1fr)}}
/* VIEW PAGE */
.view-layout{padding:12px;display:flex;flex-direction:column;gap:16px}
@media(min-width:900px){.view-layout{flex-direction:row;align-items:flex-start}.view-content{flex:1 1 0;min-width:0}.view-sidebar{width:320px;flex-shrink:0}}
.player-wrapper{border-radius:8px;overflow:hidden;margin-bottom:14px;background:#000;aspect-ratio:16/9}
.player-wrapper iframe,.player-wrapper video{width:100%;height:100%;border:none;display:block}
.content-title{font-size:1rem;font-weight:800;margin-bottom:8px}
.content-meta{display:flex;flex-wrap:wrap;gap:8px 10px;color:var(--text-dim);font-size:.75rem;margin-bottom:10px}
.content-meta i{color:var(--gold)}
/* CONTENT TAGS */
.content-tags{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
/* ACTION BUTTONS */
.action-buttons{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:8px;font-size:.78rem;font-weight:700;cursor:pointer;border:none;text-decoration:none;transition:all .2s}
.btn-outline{background:transparent;border:1px solid var(--border2);color:var(--text-dim)}
.btn-outline:hover{border-color:var(--gold);color:var(--gold);background:rgba(255,170,0,.07)}
/* WIDGET TITLE (sidebar heading) */
.widget-title{font-size:.9rem;font-weight:800;color:var(--gold);display:flex;align-items:center;gap:7px;margin:0 0 12px;padding-bottom:10px;border-bottom:1px solid var(--border)}
/* RELATED LIST */
.related-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:2px}
.related-list li{border-bottom:1px solid var(--border)}
.related-list li:last-child{border-bottom:none}
.related-item{display:flex;gap:10px;align-items:flex-start;padding:8px 0;text-decoration:none;color:inherit;transition:background .15s;border-radius:6px}
.related-item:hover{background:var(--bg3);padding-left:6px}
.related-item img{width:90px;height:54px;object-fit:cover;border-radius:5px;flex-shrink:0;background:var(--bg3)}
.related-info{flex:1;min-width:0}
.related-title{font-size:.78rem;font-weight:700;color:var(--text);line-height:1.4;margin:0 0 4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.related-meta{display:flex;gap:8px;flex-wrap:wrap;color:var(--text-dim);font-size:.7rem}
.badge-small{background:var(--bg3);border:1px solid var(--border2);color:var(--text-dim);padding:1px 6px;border-radius:4px;font-size:.65rem;font-weight:700;display:inline-flex;align-items:center;gap:3px}
.content-desc{margin:10px 0;font-size:.82rem;line-height:1.6;color:var(--text-dim)}
.full-desc.hidden{display:none}
.read-more{font-size:.76rem;color:var(--gold);margin-top:4px;text-decoration:underline;cursor:pointer;font-weight:700}
/* STATIC PAGES */
.static-content h2{font-size:1.1rem;font-weight:800;margin:20px 0 10px;color:var(--text)}
.static-content p,.static-content li{margin-bottom:9px;line-height:1.75;color:var(--text-dim)}
.static-content ul,.static-content ol{padding-left:18px;margin-bottom:10px}
.static-content address{font-style:normal}
.static-content a{color:var(--gold);text-decoration:underline}
/* ERROR PAGE */
.error-page{text-align:center;padding:60px 20px}
.error-code{font-size:5rem;font-weight:900;color:var(--gold);line-height:1}
.error-message{font-size:1.1rem;font-weight:700;margin:16px 0 8px}
.error-desc{color:var(--text-dim);margin-bottom:24px}
.btn-home{display:inline-flex;align-items:center;gap:8px;background:var(--gold);color:#000;padding:12px 24px;border-radius:8px;font-weight:800;text-decoration:none}
/* SEARCH PAGE */
.search-header{padding:12px 0 8px}
.search-title{font-size:.9rem;color:var(--text-dim);margin-bottom:4px}
.search-title strong{color:var(--text)}
/* PAGINATION */
.pagination{display:flex;align-items:center;justify-content:center;gap:6px;margin:16px 0;flex-wrap:wrap}
.page-btn{background:var(--bg3);border:1px solid var(--border2);color:var(--gold);padding:8px 16px;border-radius:8px;font-size:.8rem;font-weight:700;text-decoration:none;transition:background .2s}
.page-btn:hover{background:#222}
.page-numbers{display:flex;gap:4px;flex-wrap:wrap}
.page-number{background:var(--bg3);border:1px solid var(--border2);color:#aaa;width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:8px;font-size:.78rem;font-weight:700;text-decoration:none;transition:all .15s}
.page-number:hover{border-color:var(--gold);color:var(--gold)}
.page-number.active{background:var(--gold);color:#000;border-color:var(--gold)}
.page-ellipsis{color:var(--text-dim);padding:0 4px;line-height:36px}
/* ALBUM */
.album-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:7px}
.album-thumb-btn{width:100%;cursor:pointer;background:none;border:none;padding:0;border-radius:6px;overflow:hidden;display:block}
.album-thumb{width:100%;height:auto;border-radius:6px;transition:opacity .2s,transform .32s;display:block}
.album-thumb-btn:hover .album-thumb{opacity:.85;transform:scale(1.04)}
/* LIGHTBOX */
.lightbox{position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.95);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(16px)}
.lightbox.hidden{display:none}
.lightbox-content{position:relative;max-width:95vw;max-height:95vh;display:flex;flex-direction:column;align-items:center}
.lightbox-image{max-width:100%;max-height:85vh;object-fit:contain;border-radius:6px}
.lightbox-close{position:absolute;top:-48px;right:0;color:#fff;font-size:1rem;background:rgba(255,255,255,.1);width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.lightbox-nav{display:flex;justify-content:space-between;width:100%;margin-top:12px}
.lightbox-prev,.lightbox-next{color:#fff;background:rgba(255,255,255,.1);width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.lightbox-caption{color:rgba(255,255,255,.4);font-size:.76rem;text-align:center;margin-top:9px}
/* TOAST */
.toast{position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:var(--bg3);border:1px solid var(--gold);color:var(--gold);padding:9px 20px;border-radius:4px;font-size:.78rem;font-weight:700;z-index:9999;pointer-events:none}
#backToTop{position:fixed;bottom:68px;right:10px;z-index:180;width:36px;height:36px;border-radius:8px;background:var(--gold);color:#000;display:flex;align-items:center;justify-content:center;transition:opacity .3s,visibility .3s;font-size:.72rem;opacity:0;visibility:hidden}
.connection-status{position:fixed;bottom:68px;left:50%;transform:translateX(-50%);background:#ef4444;color:#fff;padding:7px 18px;border-radius:4px;font-size:.76rem;display:flex;align-items:center;gap:7px;z-index:400}
/* FILTER TABS */
.filter-tabs{display:flex;gap:6px;flex-wrap:wrap;padding:8px 0}
.filter-tab{padding:6px 14px;border-radius:99px;font-size:.72rem;font-weight:800;flex-shrink:0;display:inline-flex;align-items:center;gap:5px;color:var(--text-dim);border:1px solid var(--border2);background:var(--bg3);transition:all .2s;text-decoration:none}
.filter-tab:hover{background:var(--bg4);color:var(--text)}
.filter-tab.active{background:var(--gold);color:#000;border-color:var(--gold)}
/* CATEGORY STRIP (homepage filter bar) */
.category-strip{background:#0f0f0f;border-bottom:1px solid #222;padding:10px 0;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;white-space:nowrap}
.category-strip::-webkit-scrollbar{display:none}
.category-strip-inner{padding:0 12px;display:inline-flex;gap:8px}
.strip-item{color:var(--text-dim);text-decoration:none;font-size:12px;font-weight:700;padding:5px 12px;border-radius:99px;border:1px solid var(--border2);background:var(--bg3);transition:all .2s;white-space:nowrap;display:inline-flex;align-items:center;gap:5px}
.strip-item:hover{background:var(--bg4);color:var(--text)}
.strip-item.active{background:var(--gold);color:#000;border-color:var(--gold)}
</style>`;
  _themeCache.set(cacheKey, result);
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

  const criticalCss = getUniqueTheme(cfg);

  const dapurDomain = (cfg._env?.DAPUR_BASE_URL||'https://dapur.dukunseo.com').replace(/https?:\/\//,'').split('/')[0];
  
  // CSP yang diperbarui dengan domain juicyads lengkap
  const csp = [
    `default-src 'self' https://${cfg.WARUNG_DOMAIN}`,
    `script-src 'self' 'nonce-${nonce}'${extraNonces.map(n=>` 'nonce-${n}'`).join('')} https://*.magsrv.com https://a.magsrv.com https://*.juicyads.com https://*.juicyadserve.com https://*.juicyadserver.com https://ads.juicyads.com https://www.juicyads.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://cdnjs.cloudflare.com https://fonts.googleapis.com`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com`,
    `font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com`,
    `img-src 'self' data: blob: https:`,
    `media-src 'self' blob: https:`,
    `frame-src 'self' https://*.magsrv.com https://${dapurDomain} https://${cfg.WARUNG_DOMAIN} https://googleads.g.doubleclick.net https://*.juicyads.com https://*.juicyadserve.com https://*.juicyadserver.com https://ads.juicyads.com`,
    `connect-src 'self' https://${cfg.WARUNG_DOMAIN} https://${dapurDomain} https://*.magsrv.com https://*.juicyads.com https://*.juicyadserve.com https://*.juicyadserver.com https://pagead2.googlesyndication.com`,
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
<link rel="dns-prefetch" href="https://ads.juicyads.com">
<link rel="dns-prefetch" href="https://www.juicyads.com">
<link rel="dns-prefetch" href="${h(cfg.DAPUR_BASE_URL||'https://dapur.dukunseo.com')}">
<link rel="preconnect" href="https://a.magsrv.com" crossorigin>
<link rel="preconnect" href="https://ads.juicyads.com" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${criticalCss}
${cfg.THEME_FONT && cfg.THEME_FONT!=='Inter' && !cfg.THEME_FONT.includes('system') ? `<link rel="preload" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(cfg.THEME_FONT)}:wght@400;600;700;800;900&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(cfg.THEME_FONT)}:wght@400;600;700;800;900&display=swap"></noscript>` : ''}
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
  const logo = h(nameParts[0]) + (nameParts[1] ? `<span>${h(nameParts.slice(1).join(' '))}</span>` : '');
  const dna  = SiteDNA.get(cfg.WARUNG_DOMAIN);
  
  return `<body>
<!-- MODAL MENU -->
<div class="modal-overlay" id="modalMenu">
  <div class="modal-inner">
    <div class="modal-head">
      <a href="${homeUrl(cfg)}" class="logo">${logo}</a>
      <button class="modal-close" id="closeModal"><i class="fas fa-times"></i></button>
    </div>
    <ul class="modal-nav">
      <li><a href="${homeUrl(cfg)}"><i class="fas fa-home"></i> Home</a></li>
      <li><a href="${homeUrl(cfg)}?trending=1"><i class="fas fa-fire"></i> ${dna.labelTrending}</a></li>
      <li><a href="${homeUrl(cfg)}?sort=newest"><i class="fas fa-star"></i> ${dna.labelTerbaru}</a></li>
      <li><a href="${homeUrl(cfg)}?sort=longest"><i class="fas fa-clock"></i> ${dna.navLabels.terlama}</a></li>
      <li><a href="${categoryUrl('video', 1, cfg)}"><i class="fas fa-video"></i> Videos</a></li>
      <li><a href="${categoryUrl('album', 1, cfg)}"><i class="fas fa-image"></i> Photos</a></li>
      <li><a href="/${cfg.PATH_SEARCH}"><i class="fas fa-search"></i> ${dna.verbCari}</a></li>
      <li><a href="/${cfg.PATH_DMCA}"><i class="fas fa-shield-alt"></i> DMCA</a></li>
      <li><a href="/${cfg.PATH_CONTACT}"><i class="fas fa-envelope"></i> Kontak</a></li>
    </ul>
  </div>
</div>

<!-- HEADER -->
<header class="header">
  <div class="header-container">
    <button class="menu-btn" id="menuBtn" aria-label="Menu"><i class="fas fa-bars"></i></button>
    <a href="${homeUrl(cfg)}" class="logo">${logo}</a>
    <div class="search-bar">
      <input type="text" placeholder="${h(dna.searchPlaceholder)}" id="navSearchInput" value="${h(q)}">
      <button type="button" id="navSearchBtn" aria-label="${h(dna.verbCari)}"><i class="fas fa-search"></i></button>
    </div>
  </div>
</header>

<!-- CATEGORIES STRIP -->
<nav class="categories">
  <div class="categories-inner" id="catList">
    <a class="cat ${!currentPage || currentPage==='home' || isHome ? 'active' : ''}" href="${homeUrl(cfg)}">${dna.navLabels.semua}</a>
    <a class="cat ${currentPage==='trending' ? 'active' : ''}" href="${homeUrl(cfg)}?trending=1">${dna.navLabels.trending}</a>
    <a class="cat ${currentPage==='latest' ? 'active' : ''}" href="${homeUrl(cfg)}?sort=newest">${dna.navLabels.terbaru}</a>
    <a class="cat ${currentPage==='popular' ? 'active' : ''}" href="${homeUrl(cfg)}?sort=popular">${dna.navLabels.popular}</a>
    <a class="cat ${currentPage==='longest' ? 'active' : ''}" href="${homeUrl(cfg)}?sort=longest">${dna.navLabels.terlama}</a>
    <a class="cat" href="${categoryUrl('video', 1, cfg)}">${dna.navLabels.video}</a>
    <a class="cat" href="${categoryUrl('album', 1, cfg)}">${dna.navLabels.album}</a>
    <a class="cat" href="/${cfg.PATH_TAG}/indonesia">🇮🇩 Indonesia</a>
    <a class="cat" href="/${cfg.PATH_TAG}/korea">🇰🇷 Korea</a>
    <a class="cat" href="/${cfg.PATH_TAG}/japan">🇯🇵 Japan</a>
  </div>
</nav>`;
}

function renderFooter(cfg, request=null, nonce='') {
  const year = new Date().getFullYear();
  const dna  = SiteDNA.get(cfg.WARUNG_DOMAIN);
  
  // Render popunder dengan bypassCSP=true
  const popunder = renderBanner('popunder', cfg, request, nonce, true);
  
  return `${renderBanner('footer_top_new', cfg, request, nonce)} <!-- Menggunakan slot footer baru -->
<!-- FOOTER -->
<footer class="footer">
  <div class="footer-grid">
    <div class="footer-col">
      <h4>${h(cfg.WARUNG_NAME)}</h4>
      <ul>
        <li><a href="/${cfg.PATH_ABOUT}">About Us</a></li>
        <li><a href="/${cfg.PATH_CONTACT}">Contact</a></li>
        <li><a href="/${cfg.PATH_DMCA}">DMCA</a></li>
        <li><a href="/${cfg.PATH_TERMS}">Terms</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4>Kategori</h4>
      <ul>
        <li><a href="${categoryUrl('video', 1, cfg)}">Videos</a></li>
        <li><a href="${categoryUrl('album', 1, cfg)}">Photos</a></li>
        <li><a href="/${cfg.PATH_SEARCH}">${dna.verbCari}</a></li>
        <li><a href="/${cfg.PATH_TAG}">Tags</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4>Negara</h4>
      <ul>
        <li><a href="/${cfg.PATH_TAG}/indonesia">Indonesia</a></li>
        <li><a href="/${cfg.PATH_TAG}/korea">Korea</a></li>
        <li><a href="/${cfg.PATH_TAG}/japan">Japan</a></li>
        <li><a href="/${cfg.PATH_TAG}/barat">Barat</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4>Follow</h4>
      <ul>
        <li><a href="#"><i class="fab fa-twitter"></i> Twitter</a></li>
        <li><a href="#"><i class="fab fa-telegram"></i> Telegram</a></li>
        <li><a href="#"><i class="fab fa-instagram"></i> Instagram</a></li>
      </ul>
    </div>
  </div>
  <p style="text-align:center;font-size:11px;color:#555;margin:8px 0 12px">${h(dna.footerTagline)}</p>
  <div class="footer-copy">${h(dna.copyrightFn(cfg.WARUNG_NAME, year))}</div>
</footer>
${popunder} <!-- Popunder di luar footer biar aman -->

<!-- BOTTOM NAV -->
<nav class="bottom-nav">
  <a class="bn-item active" href="${homeUrl(cfg)}">
    <div class="bn-icon-wrap"><i class="fas fa-home"></i></div>
    <span>Home</span>
  </a>
  <a class="bn-item" href="${homeUrl(cfg)}?trending=1">
    <div class="bn-icon-wrap"><i class="fas fa-fire"></i><span class="dot"></span></div>
    <span>Trending</span>
  </a>
  <a class="bn-item" href="${categoryUrl('video', 1, cfg)}">
    <div class="bn-icon-wrap"><i class="fas fa-video"></i></div>
    <span>Videos</span>
  </a>
  <a class="bn-item" href="${categoryUrl('album', 1, cfg)}">
    <div class="bn-icon-wrap"><i class="fas fa-image"></i></div>
    <span>Photos</span>
  </a>
  <a class="bn-item" href="/profile">
    <div class="bn-icon-wrap"><i class="fas fa-user"></i></div>
    <span>Profile</span>
  </a>
</nav>

<script nonce="${nonce}">
(function() {
  'use strict';
  
  // Modal menu
  const menuBtn = document.getElementById('menuBtn');
  const modalMenu = document.getElementById('modalMenu');
  const closeModal = document.getElementById('closeModal');
  
  if (menuBtn && modalMenu) {
    menuBtn.addEventListener('click', () => {
      modalMenu.classList.add('show');
      document.body.style.overflow = 'hidden';
    });
  }
  
  if (closeModal && modalMenu) {
    closeModal.addEventListener('click', () => {
      modalMenu.classList.remove('show');
      document.body.style.overflow = '';
    });
  }
  
  if (modalMenu) {
    // Klik overlay tutup modal
    modalMenu.addEventListener('click', (e) => {
      if (e.target === modalMenu) {
        modalMenu.classList.remove('show');
        document.body.style.overflow = '';
      }
    });
    // Klik link di dalam modal → tutup modal dulu lalu navigasi
    modalMenu.querySelectorAll('.modal-nav a').forEach(link => {
      link.addEventListener('click', () => {
        modalMenu.classList.remove('show');
        document.body.style.overflow = '';
      });
    });
  }
  
  // Close modal with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalMenu?.classList.contains('show')) {
      modalMenu.classList.remove('show');
      document.body.style.overflow = '';
    }
  });
  
  // Search functionality
  const doNavSearch = function() {
    const q = document.getElementById('navSearchInput')?.value.trim();
    if (q) {
      window.location.href = '/${cfg.PATH_SEARCH}?q=' + encodeURIComponent(q);
    }
  };
  
  document.getElementById('navSearchBtn')?.addEventListener('click', doNavSearch);
  document.getElementById('navSearchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doNavSearch();
  });
  
  // Category strip click handler
  document.getElementById('catList')?.addEventListener('click', (e) => {
    const cat = e.target.closest('.cat');
    if (!cat) return;
    document.querySelectorAll('.cat').forEach(c => c.classList.remove('active'));
    cat.classList.add('active');
  });
  
  // Back to top button
  const backToTop = document.createElement('button');
  backToTop.id = 'backToTop';
  backToTop.innerHTML = '<i class="fas fa-chevron-up"></i>';
  backToTop.setAttribute('aria-label', 'Kembali ke atas');
  backToTop.style.cssText = 'position:fixed;bottom:80px;right:10px;z-index:99;width:36px;height:36px;border-radius:8px;background:var(--gold);color:#000;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;visibility:hidden;transition:opacity .3s,visibility .3s;';
  
  backToTop.addEventListener('click', () => {
    window.scrollTo({ top:0, behavior:'smooth' });
  });
  
  document.body.appendChild(backToTop);
  
  window.addEventListener('scroll', () => {
    const shouldShow = window.scrollY > 400;
    backToTop.style.opacity = shouldShow ? '1' : '0';
    backToTop.style.visibility = shouldShow ? 'visible' : 'hidden';
  }, { passive: true });
  
  // Set active bottom nav link based on current URL
  try {
    const path = window.location.pathname + window.location.search;
    document.querySelectorAll('.bn-item').forEach(link => {
      const href = link.getAttribute('href');
      if (href && (path === href || (href !== '/' && path.startsWith(href.split('?')[0])))) {
        document.querySelectorAll('.bn-item').forEach(i => i.classList.remove('active'));
        link.classList.add('active');
      }
    });
  } catch (e) {}
})();
<\/script>
<div id="connectionStatus" class="connection-status" role="status" aria-live="polite" style="display:none"><i class="fas fa-wifi" aria-hidden="true"></i><span>Koneksi terputus...</span></div>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 18 — CARD, GRID, PAGINATION, WIDGETS
// ═══════════════════════════════════════════════════════════════════════

function renderCard(item, cfg, index=99) {
  const durationBadge=item.type==='video'&&item.duration>0?`<span class="badge-dur">${formatDuration(item.duration)}</span>`:'';
  const thumbUrl=safeThumb(item,cfg);
  const srcset=`${h(thumbUrl)}?w=320 320w, ${h(thumbUrl)}?w=640 640w`;
  const isAboveFold=index<4;
  const imgAttrs=isAboveFold?`loading="eager" fetchpriority="high" decoding="async"`:`loading="lazy" decoding="async"`;
  const iUrl=item.type==='album'?albumUrl(item.id,item.title,cfg):contentUrl(item.id,item.title,cfg);
  const shortTitle=mbSubstr(item.title,0,60);
  
  // Badge HOT dan QUAL
  const hotBadge=index%6===0&&cfg.THEME_BADGE_HOT?`<span class="badge-hot">${h(cfg.THEME_BADGE_HOT)}</span>`:'';
  const qualBadge=item.quality?`<span class="badge-qual">${h(item.quality)}</span>`:'<span class="badge-qual">HD</span>';
  
  // Meta data
  const views = formatViews(item.views||0);
  const timeAgo = item.created_at ? formatDate(item.created_at) : '';
  
  return `<a class="v-card" href="${h(iUrl)}">
    <div class="v-img">
      <img src="${h(thumbUrl)}" srcset="${srcset}" sizes="(max-width:480px) 320px, 640px" alt="${h(shortTitle)}" ${imgAttrs} width="320" height="180" onerror="this.src='${h(cfg.DEFAULT_THUMB)}'">
      ${hotBadge}
      ${qualBadge}
      ${durationBadge}
    </div>
    <div class="v-info">
      <div class="v-title">${h(shortTitle)}</div>
      <div class="v-meta">
        <span><i class="fas fa-eye"></i>${views}</span>
        ${timeAgo?`<span><i class="fas fa-clock"></i>${timeAgo}</span>`:''}
      </div>
    </div>
  </a>`;
}

function renderGrid(items, cfg, midBannerEnabled=true, request=null, nonce='') {
  let html='<div class="v-grid">';
  items.forEach((item,i) => { 
    html+=renderCard(item,cfg,i); 
    if (midBannerEnabled && i%6===5) html+=renderBannerMidGrid(i,cfg,request,nonce);
  });
  html+='</div>';
  return html;
}

function renderPagination(pagination, buildUrl) {
  if (!pagination) return '';
  const page  = pagination.current_page || pagination.page || 1;
  const total = pagination.total_pages  || pagination.last_page || pagination.pageCount || 1;
  if (total <= 1) return '';
  const hasPrev = pagination.has_prev !== undefined ? pagination.has_prev : page > 1;
  const hasNext = pagination.has_next !== undefined ? pagination.has_next : page < total;
  let html=`<nav class="pagination" aria-label="Navigasi halaman">`;
  if (hasPrev) html+=`<a href="${buildUrl(page-1)}" class="page-btn" rel="prev"><i class="fas fa-chevron-left" aria-hidden="true"></i> Sebelumnya</a>`;
  html+='<div class="page-numbers">';
  const showPages=[];
  if (total<=7) { for (let p=1;p<=total;p++) showPages.push(p); }
  else {
    showPages.push(1); if (page>3) showPages.push('…');
    for (let p=Math.max(2,page-1);p<=Math.min(total-1,page+1);p++) showPages.push(p);
    if (page<total-2) showPages.push('…'); showPages.push(total);
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


function renderTrendingMobile(trending, cfg) {
  if (!trending?.length) return '';
  
  return `<div class="trending-strip">
    <div class="trending-inner">
      ${trending.slice(0,8).map((item,i)=>`
        <a class="t-card" href="${h(itemUrl(item,cfg))}">
          <div class="t-img">
            <img src="${h(safeThumb(item,cfg))}" alt="" loading="lazy" width="140" height="79">
            <span class="t-num">${i+1}</span>
            <span class="t-dur">${item.duration ? formatDuration(item.duration) : ''}</span>
          </div>
          <div class="t-info">
            <div class="t-title">${h(mbSubstr(item.title,0,40))}</div>
          </div>
        </a>
      `).join('')}
    </div>
  </div>`;
}

function renderBreadcrumb(items, cfg) {
  return `<nav class="breadcrumb" aria-label="Breadcrumb">
<ol itemscope itemtype="https://schema.org/BreadcrumbList">
${items.map((item,i)=>`<li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">${item.url?`<a href="${h(item.url)}" itemprop="item"><span itemprop="name">${h(item.name)}</span></a>`:`<span itemprop="name" aria-current="page">${h(item.name)}</span>`}<meta itemprop="position" content="${i+1}">${i<items.length-1?`<i class="fas fa-chevron-right bc-sep" aria-hidden="true"></i>`:''}</li>`).join('\n')}
</ol></nav>`;
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 19 — PAGE HANDLERS
// ═══════════════════════════════════════════════════════════════════════

async function handle404(cfg, seo, request) {
  const canonical=seo.canonical('/404');
  const footNonce=generateNonce();
  const head=renderHead({ title:'404 - Halaman Tidak Ditemukan | '+cfg.WARUNG_NAME, desc:'Halaman yang kamu cari tidak ditemukan di '+cfg.WARUNG_NAME+'.', canonical, ogImage:cfg.SEO_OG_IMAGE, ogType:'website', noindex:true, cfg, seo, request, extraHead:'', extraNonces:[footNonce] });
  const nav=renderNavHeader({cfg});
  const body=`<main id="main-content"><section class="error-page"><div class="container"><div class="error-content">
  <div class="error-icon"><i class="fas fa-exclamation-triangle"></i></div>
  <h1 class="error-title">404</h1>
  <p class="error-subtitle">Halaman Tidak Ditemukan</p>
  <p class="error-desc">URL yang Anda kunjungi tidak ada atau sudah dihapus.</p>
  <div class="error-actions"><a href="${homeUrl(cfg)}" class="btn btn-primary"><i class="fas fa-home"></i> Beranda</a><a href="${searchUrl('',cfg)}" class="btn btn-outline"><i class="fas fa-search"></i> Cari</a></div>
</div></div></section></main>`;
  return new Response(head+nav+body+renderFooter(cfg,request,footNonce), { status:404, headers:htmlHeaders(cfg,'page') });
}

async function handleHome(request, cfg, client, seo) {
  const url=new URL(request.url);
  const page=Math.max(1, parseInt(url.searchParams.get('page')||'1'));
  const type=getContentTypes(cfg).includes(url.searchParams.get('type')||'') ? url.searchParams.get('type') : '';
  const sortParam=url.searchParams.get('sort')||'';
  const isTrending=url.searchParams.has('trending')||url.searchParams.get('trending')==='1';
  const sortOrder = isTrending ? 'popular' : (['newest','popular','views','longest'].includes(sortParam) ? sortParam : 'newest');
  const deliveryMode=getDeliveryMode(request);
  const [mediaResult, trendingResult] = await Promise.all([
    client.getMediaList({ page, per_page:cfg.ITEMS_PER_PAGE, type:type||undefined, sort:sortOrder }),
    client.getTrending(cfg.TRENDING_COUNT, getContentTypes(cfg).length===1?getContentTypes(cfg)[0]:''),
  ]);
  const trending=trendingResult?.data||[];
  const items=mediaResult?.data||[], pagination=mediaResult?.meta?.pagination||mediaResult?.meta||{};
  const paginationTotal = pagination.total_pages||pagination.last_page||pagination.pageCount||1;
  const pageTitle=page>1?`${cfg.WARUNG_NAME} - Halaman ${page}`:`${cfg.WARUNG_NAME} — ${cfg.WARUNG_TAGLINE}`;
  const pageDesc=page>1?`Halaman ${page} — ${cfg.SEO_DEFAULT_DESC}`:cfg.SEO_DEFAULT_DESC;
  let canonical;
  const buildCanonicalParams = (pg=page) => {
    const p = new URLSearchParams();
    if (type) p.set('type', type);
    if (isTrending) p.set('trending', '1');
    else if (sortParam && sortParam !== 'newest') p.set('sort', sortParam);
    if (pg > 1) p.set('page', String(pg));
    const qs = p.toString();
    return qs ? `/?${qs}` : '/';
  };
  canonical = seo.canonical(buildCanonicalParams(), request);
  const homeExtraHead=(!type&&!isTrending&&!sortParam&&page===1)
    ? seo.websiteSchema('https://'+cfg.WARUNG_DOMAIN+'/'+cfg.PATH_SEARCH+'?q={search_term_string}')+seo.itemListSchema(items,canonical,cfg)
    : seo.itemListSchema(items,canonical,cfg);
  const prevUrl=page>1?seo.canonical(buildCanonicalParams(page-1)):null;
  const nextUrl=page<paginationTotal?seo.canonical(buildCanonicalParams(page+1)):null;
  const adNonce=generateNonce();
  const dna = SiteDNA.get(cfg.WARUNG_DOMAIN);
  const head=renderHead({ title:pageTitle, desc:pageDesc, canonical, ogImage:cfg.SEO_OG_IMAGE, ogType:'website', noindex:false, cfg, seo, request, deliveryMode, extraHead:homeExtraHead, prevUrl, nextUrl, extraNonces:[adNonce] });
  const nav=renderNavHeader({ cfg, isHome:!isTrending&&!sortParam, currentPage: isTrending?'trending':sortParam==='popular'?'popular':sortParam==='newest'?'latest':sortParam==='longest'?'longest':'' });
  const filterTabsItems=getContentTypes(cfg).map(t=>{
    const meta=TYPE_META[t]||{label:ucfirst(t),icon:'fa-file'};
    return `<a href="/?type=${t}" class="strip-item ${type===t?'active':''}" role="tab"><i class="fas ${meta.icon}" aria-hidden="true"></i> ${meta.label}</a>`;
  }).join('');
  const filterTabs=`<a href="/" class="strip-item ${!type&&!sortParam&&!isTrending?'active':''}" role="tab">Semua</a>${filterTabsItems}`;
  let contentSection='';
  if (!items.length) {
    contentSection=`<div class="empty-state"><i class="fas fa-folder-open"></i><p>Tidak ada konten tersedia saat ini.</p></div>`;
  } else {
    contentSection=renderBanner('header_top_new',cfg,request,adNonce) // Menggunakan slot header baru
      +renderBanner('before_grid',cfg,request,adNonce)
      +renderGrid(items,cfg,true,request,adNonce)
      +(cfg.THEME_SHOW_PROMO?`<div class="promo-banner"><i class="fas fa-crown"></i> ${h(cfg.THEME_PROMO_TEXT)} <i class="fas fa-crown"></i></div>`:'')
      +renderBanner('after_grid_new',cfg,request,adNonce) // Menggunakan slot after grid baru
      +renderPagination(pagination, p=>{
        const params=new URLSearchParams();
        if (type) params.set('type',type);
        if (isTrending) params.set('trending','1');
        else if (sortParam&&sortParam!=='newest') params.set('sort',sortParam);
        if (p>1) params.set('page',String(p));
        const qs=params.toString();
        return qs?`/?${qs}`:'/';
      });
  }
  const sectionTitle = isTrending ? dna.navLabels.trending
    : sortParam==='popular' ? dna.navLabels.popular
    : sortParam==='newest'  ? dna.navLabels.terbaru
    : sortParam==='longest' ? dna.navLabels.terlama
    : type ? ucfirst(h(type))
    : dna.sectionTitleDefault;
  const main=`<main id="main-content">${renderBanner('header_top',cfg,request,adNonce)}<nav class="category-strip" aria-label="Filter kategori"><div class="category-strip-inner">${filterTabs}</div></nav>${cfg.THEME_SHOW_TRENDING&&!deliveryMode?.lite?renderTrendingMobile(trending,cfg):''}<div class="container"><div class="layout-main">
<section class="content-area">
  <div class="section-header"><h2 class="section-title"><i class="fas fa-fire" aria-hidden="true"></i> ${sectionTitle}${page>1?` <span class="section-page">— Hal. ${page}</span>`:''}</h2></div>
  ${contentSection}
</section>
</div></div></main>`;
  return new Response(head+nav+main+renderFooter(cfg,request,adNonce), { status:200, headers:htmlHeaders(cfg,'home') });
}

async function handleView(request, cfg, client, seo, segments) {
  const id=parseInt(segments[1]||'0');
  if (!id||id<1) return handle404(cfg,seo,request);
  const reqPath=(segments[0]||'').toLowerCase();
  if (cfg.WARUNG_TYPE==='A'&&reqPath===cfg.PATH_ALBUM.toLowerCase()) return handle404(cfg,seo,request);
  if (cfg.WARUNG_TYPE==='B'&&reqPath===cfg.PATH_CONTENT.toLowerCase()) return handle404(cfg,seo,request);
  const [itemResult, relatedResult]=await Promise.all([client.getMediaDetail(id), client.getRelated(id,cfg.RELATED_COUNT)]);
  if (!itemResult?.data||itemResult?.status==='error') return handle404(cfg,seo,request);
  const _ua = request.headers.get('User-Agent') || '';
  if (!isSearchBot(_ua) && !isScraperBot(_ua) && client.ctx?.waitUntil) {
    client.ctx.waitUntil(client.recordView(id));
  }
  const media=itemResult?.data;
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
  const extraHead=seo.contentSchema(media,canonical,playerUrl)+seo.breadcrumbSchema([{name:'Beranda',url:'/'},{name:ucfirst(type),url:'/'+cfg.PATH_CATEGORY+'/'+type},{name:media.title,url:null}],pageUrl);
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
<script nonce="${adNonce}">var _lb={idx:0,photos:${JSON.stringify(albumPhotos.map(p=>p.url))},titles:${JSON.stringify(albumPhotos.map(()=>media.title))}};function openLightbox(src,i,t){_lb.idx=i;var img=document.getElementById('lightbox-img'),cap=document.getElementById('lightbox-caption'),lb=document.getElementById('lightbox');img.src=src;img.alt=t+' - Foto '+(i+1);cap.textContent=t+' ('+(i+1)+' / '+_lb.photos.length+')';lb.classList.remove('hidden');document.body.style.overflow='hidden';lb.querySelector('.lightbox-close').focus();}function closeLightbox(e){if(!e||e.target===e.currentTarget||e.target.closest('.lightbox-close')){var lb=document.getElementById('lightbox');lb.classList.add('hidden');document.body.style.overflow='';}}function navigateLightbox(d){var n=(_lb.idx+d+_lb.photos.length)%_lb.photos.length;_lb.idx=n;var img=document.getElementById('lightbox-img'),cap=document.getElementById('lightbox-caption');img.src=_lb.photos[n];cap.textContent=_lb.titles[n]+' ('+(n+1)+' / '+_lb.photos.length+')';}(function(){var lb=document.getElementById('lightbox'),lc=document.getElementById('lightboxClose'),lp=document.getElementById('lightboxPrev'),ln=document.getElementById('lightboxNext');if(lb)lb.addEventListener('click',function(e){if(e.target===lb)closeLightbox(e);});if(lc)lc.addEventListener('click',closeLightbox);if(lp)lp.addEventListener('click',function(){navigateLightbox(-1);});if(ln)ln.addEventListener('click',function(){navigateLightbox(1);});document.querySelectorAll('.js-lightbox-open').forEach(function(btn){btn.addEventListener('click',function(){openLightbox(btn.dataset.src,parseInt(btn.dataset.idx),btn.dataset.title);});});})();document.addEventListener('keydown',function(e){var lb=document.getElementById('lightbox');if(lb&&!lb.classList.contains('hidden')){if(e.key==='Escape')closeLightbox();if(e.key==='ArrowLeft')navigateLightbox(-1);if(e.key==='ArrowRight')navigateLightbox(1);}});<\/script>`:'';
  const pageScript=`<script nonce="${adNonce}">function copyLink(btn){var url=btn.dataset.url||location.href;if(navigator.clipboard){navigator.clipboard.writeText(url).then(()=>showToast('Link disalin!')).catch(()=>fallbackCopy(url));}else fallbackCopy(url);}function fallbackCopy(text){var ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;opacity:0;top:-999px';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');showToast('Link disalin!');}catch{prompt('Salin link:',text);}document.body.removeChild(ta);}function showToast(msg){var ex=document.querySelector('.toast');ex&&ex.remove();var t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.parentNode&&t.remove(),2200);}function shareContent(){if(navigator.share){navigator.share({title:${JSON.stringify(media.title)},url:location.href}).catch(()=>{});}else copyLink({dataset:{url:location.href}});}function toggleDesc(btn){var id=btn.getAttribute('aria-controls'),fd=document.getElementById(id);if(!fd)return;var open=btn.getAttribute('aria-expanded')==='true';fd.classList.toggle('hidden',open);fd.setAttribute('aria-hidden',String(open));btn.setAttribute('aria-expanded',String(!open));btn.textContent=open?'Baca selengkapnya':'Tutup';}
(function(){var cp=document.getElementById('btnCopyLink'),sh=document.getElementById('btnShare');if(cp)cp.addEventListener('click',function(){copyLink(this);});if(sh)sh.addEventListener('click',shareContent);document.querySelectorAll('.js-toggle-desc').forEach(function(b){b.addEventListener('click',function(){toggleDesc(this);});});})();<\/script>`;
  const breadcrumbHtml=renderBreadcrumb([{name:'Beranda',url:homeUrl(cfg)},{name:ucfirst(type),url:categoryUrl(type,1,cfg)},{name:mbSubstr(media.title,0,40),url:null}],cfg);
  const main=`<main id="main-content" class="view-main"><div class="view-layout">
<article class="view-content">
  ${breadcrumbHtml}${playerHtml}${contentInfo}${renderBanner('after_content_new',cfg,request,adNonce)} <!-- Menggunakan slot after content baru -->
</article>
<aside class="view-sidebar">
  <h2 class="widget-title"><i class="fas fa-layer-group"></i> Konten Terkait</h2>
  ${relatedHtml}
  ${popularTags?`<section><h3 class="widget-title" style="margin-top:16px"><i class="fas fa-tags"></i> Tag</h3><div class="tag-cloud">${popularTags}</div></section>`:''}
  ${renderBanner('sidebar_top_new',cfg,request,adNonce)} <!-- Menggunakan slot sidebar baru -->
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
      else { items=result?.data||[]; pagination=result?.meta?.pagination||result?.meta||{}; total=pagination.total||0; }
    } catch(err) { if (cfg.DAPUR_DEBUG) console.error('Search error:',err.message); errorMsg='Terjadi kesalahan saat mencari.'; }
  }
  const trending=(await client.getTrending(8).catch(()=>({data:[]})))?.data||[];
  const pageTitle=q?`Cari "${mbSubstr(q,0,50)}"${page>1?' - Hal. '+page:''}  | ${cfg.WARUNG_NAME}`:`Pencarian | ${cfg.WARUNG_NAME}`;
  const pageDesc=q?`Hasil pencarian untuk "${q}" — ${numberFormat(total)} konten di ${cfg.WARUNG_NAME}.`:'Cari video dan album di sini.';
  const canonical=seo.canonical('/'+cfg.PATH_SEARCH+(q?'?q='+encodeURIComponent(q):''),request);
  const adNonce=generateNonce();
  const head=renderHead({ title:pageTitle, desc:pageDesc, canonical, ogImage:cfg.SEO_OG_IMAGE, ogType:'website', noindex:!q, cfg, seo, request, extraHead:'', extraNonces:[adNonce] });
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
      +renderBanner('header_top_new',cfg,request,adNonce) // Menggunakan slot header baru
      +renderBanner('before_grid',cfg,request,adNonce)
      +renderGrid(items,cfg,true,request,adNonce)
      +renderBanner('after_grid_new',cfg,request,adNonce) // Menggunakan slot after grid baru
      +renderPagination(pagination, p=>filterUrl(type,p));
  }
  const allTags={};
  items.forEach(item=>(item.tags||[]).forEach(t=>{allTags[t]=(allTags[t]||0)+1;}));
  const topTags=Object.entries(allTags).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([t])=>t);
  const tagsHtml=topTags.length?`<div class="tag-cloud" style="margin:14px 0">${topTags.map(t=>`<a href="${h(tagUrl(t,cfg))}" class="tag">#${h(t)}</a>`).join('')}</div>`:'';
  const main=`${pageHeader}<main id="main-content"><div class="container"><div class="layout-main">
<section class="content-area">${contentSection}${tagsHtml}</section>
</div></div></main>`;
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
  const result=await client.getByTag(tag,params);
  const items=result?.data||[], pagination=result?.meta?.pagination||result?.meta||{}, total=pagination.total||0;
  const errorMsg=result?.status==='error'?(result.message||'Gagal mengambil data tag.'):'';
  const typeCounts={};
  items.forEach(item=>{typeCounts[item.type]=(typeCounts[item.type]||0)+1;});
  const relatedTagsMap={};
  items.forEach(item=>(item.tags||[]).forEach(t=>{if(t.toLowerCase()!==tag.toLowerCase())relatedTagsMap[t]=(relatedTagsMap[t]||0)+1;}));
  const relatedTags=Object.entries(relatedTagsMap).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([t])=>t);
  const pageTitle=`#${tag}${page>1?' - Hal. '+page:''} | ${cfg.WARUNG_NAME}`;
  const pageDesc=`Konten bertag "${tag}" di ${cfg.WARUNG_NAME}. ${numberFormat(total)} konten tersedia.`;
  const canonical=seo.canonical('/'+cfg.PATH_TAG+'/'+encodeURIComponent(tag.toLowerCase()));
  const extraHead=seo.breadcrumbSchema([{name:'Beranda',url:'/'},{name:'Tag',url:'/'+cfg.PATH_TAG},{name:'#'+tag,url:null}],'/'+cfg.PATH_TAG+'/'+encodeURIComponent(tag.toLowerCase()));
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
  else contentSection=renderBanner('header_top_new',cfg,request,adNonce) // Menggunakan slot header baru
    +renderBanner('before_grid',cfg,request,adNonce)
    +renderGrid(items,cfg,true,request,adNonce)
    +renderBanner('after_grid_new',cfg,request,adNonce) // Menggunakan slot after grid baru
    +renderPagination(pagination, p=>tagFilterUrl(type,p));
  const main=`${tagHeader}<main id="main-content"><div class="container"><div class="layout-main">
<section class="content-area">${contentSection}</section>
</div></div></main>`;
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
  const trending=trendingResult?.data||[];
  const items=mediaResult?.data||[], pagination=mediaResult?.meta?.pagination||mediaResult?.meta||{};
  const typeLabel={video:'Video',album:'Album'}[type]||ucfirst(type);
  const typeIcon={video:'fa-video',album:'fa-images'}[type]||'fa-file';
  const pageTitle=`${typeLabel}${page>1?' — Halaman '+page:''} | ${cfg.WARUNG_NAME}`;
  const pageDesc=`Kumpulan ${typeLabel.toLowerCase()} terbaru di ${cfg.WARUNG_NAME}. ${numberFormat(pagination.total||0)} konten tersedia.`;
  const canonical=seo.canonical('/'+cfg.PATH_CATEGORY+'/'+type+(page>1?'/'+page:''));
  const prevUrl=page>1?seo.canonical('/'+cfg.PATH_CATEGORY+'/'+type+(page>2?'/'+(page-1):'')):null;
  const nextUrl=pagination.has_next?seo.canonical('/'+cfg.PATH_CATEGORY+'/'+type+'/'+(page+1)):null;
  const extraHead=seo.itemListSchema(items,canonical,cfg)+seo.breadcrumbSchema([{name:'Beranda',url:'/'},{name:typeLabel,url:null}],'/'+cfg.PATH_CATEGORY+'/'+type);
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
  else contentSection=renderBanner('header_top_new',cfg,request,adNonce) // Menggunakan slot header baru
    +renderBanner('before_grid',cfg,request,adNonce)
    +renderGrid(items,cfg,true,request,adNonce)
    +renderBanner('after_grid_new',cfg,request,adNonce) // Menggunakan slot after grid baru
    +renderPagination(pagination, p=>'/'+cfg.PATH_CATEGORY+'/'+type+(p>1?'/'+p:''));
  const main=`${pageHeader}<main id="main-content"><div class="container"><div class="layout-main">
<section class="content-area">${contentSection}</section>
</div></div></main>`;
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
  const footNonce=generateNonce();
  const extraHead=(page.schema||'')+seo.breadcrumbSchema([{name:'Beranda',url:'/'},{name:page.title,url:null}],'/'+slug);
  const head=renderHead({ title:pageMetaTitle, desc:page.desc, canonical, ogImage:cfg.SEO_OG_IMAGE, ogType:'website', noindex:false, cfg, seo, request, extraHead, extraNonces:[footNonce] });
  const nav=renderNavHeader({cfg});
  const breadcrumbHtml=renderBreadcrumb([{name:'Beranda',url:homeUrl(cfg)},{name:page.title,url:null}],cfg);
  const body=`<main id="main-content" class="container" style="padding-top:2rem;padding-bottom:3rem">
${breadcrumbHtml}
<article style="max-width:800px;margin:0 auto;background:var(--bg-card,#1e222b);border-radius:var(--border-radius,8px);padding:2rem 2.5rem;box-shadow:var(--shadow-sm)">
  <header><p class="page-label"><i class="fas ${h(page.icon)}"></i> ${h(page.title)}</p></header>
  <div class="static-content" style="line-height:1.8;color:var(--text-color)">${page.content}</div>
</article>
</main>`;
  return new Response(head+nav+body+renderFooter(cfg,request,footNonce), { status:200, headers:htmlHeaders(cfg,'page') });
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
  const cached = _headersCache.get(ck);
  if (cached) return cached;
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
  applyImmortalEnv(env);

  const reqCtx = { id: crypto.randomUUID().slice(0, 8), startTime: Date.now() };

  const url         = new URL(request.url);
  const reqPathRaw  = url.pathname;
  const reqPathLower= reqPathRaw.toLowerCase();
  const reqBasename = reqPathLower.replace(/^.*\//,'');
  const isHandled   = _HANDLED_PATHS.has(reqBasename);
  if (!isHandled && _STATIC_EXT_RX.test(reqPathRaw)) return next();

  const cfg  = getConfig(env, request);
  let seo = _seoCache.get(cfg.WARUNG_DOMAIN);
  if (!seo) { seo = new SeoHelper(cfg); _seoCache.set(cfg.WARUNG_DOMAIN, seo); }
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
    if (isBlacklisted(ip)) return new Response(null,{status:200});

    if (!isPublicFeed) {
      const visitorType=getVisitorType();

      if (visitorType==='scraper'||visitorType==='headless') {
        const bhHtml = await blackholeCaptureWithKV(ip, true, env);
        if (bhHtml) return new Response(bhHtml,{headers:{'Content-Type':'text/html'}});
      }

      if (visitorType==='headless') {
        const ghost = ghostBody(cfg, path, { title: cfg.WARUNG_NAME, description: cfg.SEO_DEFAULT_DESC });
        return ghost
          ? new Response(ghost, { status:200, headers:{'Content-Type':'text/html; charset=UTF-8','Cache-Control':'no-store'} })
          : generateFakeContent(cfg, honeyPrefix);
      }

      const sacrificeResp=sacrificeRedirect(request,cfg.WARUNG_DOMAIN);
      if (sacrificeResp) return sacrificeResp;
    }

    try {
      checkRateLimit(request);
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
  let cannibal = _cannibalCache.get(cfg.WARUNG_DOMAIN);
  if (!cannibal) { cannibal = new KeywordCannibalize(cfg, env); _cannibalCache.set(cfg.WARUNG_DOMAIN, cannibal); }
  let hammer = _hammerCache.get(cfg.WARUNG_DOMAIN);
  if (!hammer) { hammer = new IndexingHammer(env, cfg); _hammerCache.set(cfg.WARUNG_DOMAIN, hammer); }
  const morphPhase = getMorphPhase(cfg.WARUNG_DOMAIN);
  waitUntil(hammer.maybeScheduledPing(waitUntil).catch(err => logError('IndexingHammer.schedule', err, request, reqCtx)));

  const dapurConfig=await client.getDapurConfig();
  let reqCfg;
  if (dapurConfig) {
    const rcKey = cfg.WARUNG_DOMAIN + ':' + (dapurConfig.warung_type||'') + ':' + (dapurConfig.features ? JSON.stringify(dapurConfig.features) : '');
    reqCfg = _reqCfgCache.get(rcKey);
    if (!reqCfg) {
      reqCfg = Object.assign(Object.create(null), cfg, {
        _dapurConfig: dapurConfig,
        WARUNG_TYPE: dapurConfig.warung_type || cfg.WARUNG_TYPE,
      });
      _reqCfgCache.set(rcKey, reqCfg);
    }
  } else {
    reqCfg = cfg;
  }
  seo.cfg = reqCfg;

  const pc=reqCfg.PATH_CONTENT.toLowerCase();
  const pa=reqCfg.PATH_ALBUM.toLowerCase();
  const ps=reqCfg.PATH_SEARCH.toLowerCase();
  const pt=reqCfg.PATH_TAG.toLowerCase();
  const pca=reqCfg.PATH_CATEGORY.toLowerCase();

  let response;

  const cannibalizePath = env.CANNIBALIZE_PATH || 'k';
  if (first === cannibalizePath) {
    const keyword = cannibal.matchPath(path);
    if (keyword) {
      response = new Response(
        await cannibal.renderLanding(keyword, request, seo, client),
        { status:200, headers: htmlHeaders(reqCfg,'list') }
      );
      waitUntil(hammer.pingOnKeywordHit(keyword).catch(()=>{}));
    } else {
      response = await handle404(reqCfg,seo,request);
    }
  }
  else if (first===''||path==='/') response=await handleHome(request,reqCfg,client,seo);
  else if (first===pc) response=await handleView(request,reqCfg,client,seo,segments);
  else if (first===pa) {
    const albumAllowed=reqCfg._dapurConfig?reqCfg._dapurConfig.features?.has_album_route===true:reqCfg.WARUNG_TYPE!=='A';
    if (!albumAllowed) response=await handle404(reqCfg,seo,request);
    else response=await handleView(request,reqCfg,client,seo,segments);
  }
  else if (first===ps) response=await handleSearch(request,reqCfg,client,seo);
  else if (first===pt) response=await handleTag(request,reqCfg,client,seo,segments);
  else if (first===pca) response=await handleCategory(request,reqCfg,client,seo,segments);
  else {
    const staticSlugs=[reqCfg.PATH_ABOUT,reqCfg.PATH_CONTACT,reqCfg.PATH_FAQ,reqCfg.PATH_TERMS,reqCfg.PATH_PRIVACY,reqCfg.PATH_DMCA].map(s=>s.toLowerCase());
    if (staticSlugs.includes(first)) response=handleStaticPage(reqCfg,seo,request,first);
    else if (first==='sitemap.xml') {
      response=await handleSitemap(request,reqCfg,client,env,honeyPrefix,cannibal);
      if (isSearchBotUA) {
        waitUntil(hammer.pingOnSitemap(client,reqCfg).catch(()=>{}));
      }
    }
    else if (first==='rss.xml'||first==='feed'||first==='feed.xml') response=await handleRss(request,reqCfg,client);
    else if (path.endsWith('.txt')&&path.includes('key')) {
      return hammer.generateKeyFile();
    }
    else if (first==='robots.txt') {
      const domain=reqCfg.WARUNG_DOMAIN;
      const rk='robots:'+domain+':'+honeyPrefix;
      let robotsBody = _dnaCache.get(rk);
      if (!robotsBody) {
        robotsBody=[
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
        _dnaCache.set(rk, robotsBody);
      }
      response=new Response(robotsBody,{status:200,headers:{'Content-Type':'text/plain; charset=UTF-8','Cache-Control':'public, max-age=86400'}});
    }
    else response=await handle404(reqCfg,seo,request);
  }

  // ── Apply Immortal transformations ──────────────────────────────────
  if (response && !isPublicFeed && !isSearchBotUA) {
    const visitorType=getVisitorType();
    const isBot=visitorType!=='human';
    const contentType=response.headers.get('Content-Type')||'';
    if (contentType.includes('text/html')) {
      if (IMMORTAL.ENABLE_GHOST_BODY && (visitorType==='scraper'||visitorType==='suspicious')) {
        const ghostHtml = ghostBody(reqCfg, path, {
          title: reqCfg.WARUNG_NAME,
          description: reqCfg.SEO_DEFAULT_DESC,
        });
        if (ghostHtml) return new Response(ghostHtml, {
          status: response.status,
          headers: { 'Content-Type':'text/html; charset=UTF-8', 'Cache-Control':'no-store' },
        });
      }
      if (isBot) {
        let html=await response.text();
        if (IMMORTAL.ENABLE_DIGITAL_DNA) html=dnaInjectHtml(html, reqCfg.WARUNG_DOMAIN, path+':'+morphPhase);
        return new Response(html,{status:response.status,headers:new Headers(response.headers)});
      }
      if (IMMORTAL.ENABLE_CSS_STEGO) {
        let html=await response.text();
        html=cssInject(html, reqCfg, morphPhase);
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
// ═══════════════════════════════════════════════════════════════════════

const _DEFAULT_CANNIBALIZE_KW = [
  'bokep sin','play bokep','av bokep','og bokep',
  'link bokep','bokep viral','bokep hijab','bokep king',
  'raja bokep','bokep lokal','bokep ai',
  'bokep lah','bokep telegram','bokep terabox',
  'bokep online','bokep terpercaya','situs bokep resmi',
  'live bokep','bokep online terpercaya',
  'nonton bokep gratis','video bokep terbaru','bokep indo viral',
  'film dewasa gratis','video dewasa online','streaming bokep hd',
  'bokep viral 2026','bokep indonesia terbaru','nonton film dewasa',
];

class KeywordCannibalize {
  constructor(cfg, env) {
    this.cfg = cfg;
    this.env = env;
    this.keywords = env.CANNIBALIZE_KEYWORDS
      ? env.CANNIBALIZE_KEYWORDS.split(',').map(k=>k.trim()).filter(k=>k)
      : _DEFAULT_CANNIBALIZE_KW;
    this.basePath = env.CANNIBALIZE_PATH || 'k';
  }

  toSlug(kw) {
    return kw.toLowerCase()
      .replace(/[^a-z0-9\s]/g,'')
      .replace(/\s+/g,'-')
      .trim();
  }

  getAllUrls() {
    return this.keywords.map(kw =>
      'https://'+this.cfg.WARUNG_DOMAIN+'/'+this.basePath+'/'+this.toSlug(kw)
    );
  }

  matchPath(path) {
    const prefix = '/'+this.basePath+'/';
    if (!path.startsWith(prefix)) return null;
    const slug = path.slice(prefix.length).replace(/\/.*$/,'');
    if (!slug) return null;
    const kw = this.keywords.find(k => this.toSlug(k) === slug);
    return kw || null;
  }

  async renderLanding(keyword, request, seo, client) {
    const cfg   = this.cfg;
    const slug  = this.toSlug(keyword);
    const canonical = 'https://'+cfg.WARUNG_DOMAIN+'/'+this.basePath+'/'+slug;
    const nonce = generateNonce();

    let items = [];
    try {
      const res = await client.search(keyword, { per_page: 24, sort: 'popular' });
      items = res?.data || [];
      if (!items.length) {
        const tr = await client.getTrending(24);
        items = tr?.data || [];
      }
    } catch {}

    const pageTitle   = `${keyword} - Nonton Gratis di ${cfg.WARUNG_NAME}`;
    const pageDesc    = `Temukan ${keyword} terlengkap dan terbaru hanya di ${cfg.WARUNG_NAME}. Streaming gratis, kualitas HD, tanpa registrasi. ${keyword} terbaik 2025.`;
    const pageKeywords= `${keyword}, ${keyword} terbaru, ${keyword} gratis, nonton ${keyword}, streaming ${keyword}, ${keyword} online, ${keyword} hd, situs ${keyword} terpercaya`;

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
      extraNonces: [nonce],
      extraHead: `
<script type="application/ld+json" nonce="${nonce}">${faqSchema}</script>
<script type="application/ld+json" nonce="${nonce}">${breadcrumbSchema}</script>`,
    });

    const nav  = renderNavHeader({ cfg, currentPage: 'cannibalize' });
    const foot = renderFooter(cfg, request, nonce);

    return `${head}
${nav}
<main id="main-content">
  <div class="container">
    <div class="page-header">
      ${renderBreadcrumb([{name:cfg.WARUNG_NAME,url:'/'},{name:keyword,url:null}], cfg)}
      <h1 class="page-title">${h(h1)}</h1>
      <p class="page-desc">${h(intro)}</p>
    </div>

    <div class="layout-main">
      <section class="content-area" aria-label="Konten ${h(keyword)}">
        ${grid}
        <div class="tag-cloud" style="margin:14px 0">${relatedLinks}</div>
      </section>
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

  async pingOnSitemap(client, cfg) {
    try {
      const trendingRes = await client.getTrending(20);
      const contentUrls = (trendingRes?.data||[]).map(it=>'https://'+cfg.WARUNG_DOMAIN+itemUrl(it,cfg));
      const kwUrls      = this.cannibal.getAllUrls().slice(0,30);
      const allUrls     = [...new Set([...contentUrls, ...kwUrls])];
      if (allUrls.length) await this._pingIndexNow(allUrls);
    } catch {}
  }

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

  async pingOnNewContent(items, cfg) {
    try {
      const urls = (items||[]).map(it=>'https://'+cfg.WARUNG_DOMAIN+itemUrl(it,cfg));
      if (urls.length) await this._pingIndexNow(urls);
    } catch {}
  }

  async scheduledPing() {
    try {
      const allKwUrls = this.cannibal.getAllUrls();
      for (let i=0; i<allKwUrls.length; i+=50) {
        await this._pingIndexNow(allKwUrls.slice(i, i+50));
        if (i+50 < allKwUrls.length) await new Promise(r=>setTimeout(r,500));
      }
    } catch {}
  }

  async _pingIndexNow(urls) {
    const host    = this.cfg.WARUNG_DOMAIN;
    const key     = hexHash(host, 16);
    const payload = { host, key, keyLocation:`https://${host}/${key}.txt`, urlList: urls.slice(0,50) };
    return Promise.all(_INDEXNOW_ENDPOINTS.map(endpoint =>
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

  async maybeScheduledPing(waitUntilFn) {
    const INTERVAL = 21600;
    const now = Math.floor(Date.now()/1000);
    if (now - _scheduledPingLastTs < INTERVAL) return;
    _scheduledPingLastTs = now;
    waitUntilFn(this.scheduledPing().catch(()=>{}));
  }
}