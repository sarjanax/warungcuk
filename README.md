# Warung Engine — Complete Documentation

## 📦 Required Environment Variables

### 🔷 Core Configuration

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `WARUNG_DOMAIN` | Main domain (without protocol) | `example.com` | ✅ Yes |
| `WARUNG_NAME` | Site name / brand | `SikatSaja` | ✅ Yes |
| `WARUNG_BASE_URL` | Full base URL | `https://example.com` | ✅ Yes |
| `WARUNG_TYPE` | Site type: `A` (video only), `B` (album only), `C` (mixed) | `A` | ✅ Yes |
| `WARUNG_TAGLINE` | Site tagline | `Streaming gratis terbaik` | No |
| `ITEMS_PER_PAGE` | Items per page (default: 24) | `24` | No |
| `RELATED_COUNT` | Number of related items (default: 8) | `8` | No |
| `TRENDING_COUNT` | Number of trending items (default: 10) | `10` | No |

### 🔷 Dapur API Connection

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `DAPUR_BASE_URL` | Dapur API base URL | `https://dapur.dukunseo.com` | ✅ Yes |
| `DAPUR_API_KEY` | API key for authentication | `your-api-key-here` | ✅ Yes |
| `DAPUR_CACHE_TTL` | Cache TTL in seconds (default: 300) | `300` | No |
| `DAPUR_DEBUG` | Enable debug mode | `true` / `false` | No |

### 🔷 Path Configuration (URL Slugs)

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `PATH_CONTENT` | Content/view path | `tonton` | `watch` |
| `PATH_ALBUM` | Album path | `album` | `gallery` |
| `PATH_SEARCH` | Search path | `cari` | `search` |
| `PATH_CATEGORY` | Category path | `kategori` | `category` |
| `PATH_TAG` | Tag path | `tag` | `tag` |
| `PATH_DMCA` | DMCA page | `dmca` | `dmca` |
| `PATH_TERMS` | Terms page | `terms` | `terms` |
| `PATH_PRIVACY` | Privacy page | `privacy` | `privacy` |
| `PATH_FAQ` | FAQ page | `faq` | `faq` |
| `PATH_CONTACT` | Contact page | `contact` | `contact` |
| `PATH_ABOUT` | About page | `about` | `about` |

### 🔷 SEO Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `SEO_DEFAULT_DESC` | Default meta description | `Streaming gratis tanpa registrasi` |
| `SEO_KEYWORDS` | Default keywords | `streaming, video, gratis` |
| `SEO_OG_IMAGE` | Default OG image URL | `/assets/og-default.jpg` |
| `SEO_OG_IMAGE_W` | OG image width | `1200` |
| `SEO_OG_IMAGE_H` | OG image height | `630` |
| `SEO_TWITTER_SITE` | Twitter handle | `@sitatsaja` |
| `SEO_LANG` | Site language | `id` |
| `SEO_LOCALE` | Site locale | `id_ID` |

### 🔷 Ads Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `ADS_ENABLED` | Enable/disable ads | `true` / `false` |
| `ADS_ADSENSE_CLIENT` | Google AdSense client ID | `ca-pub-123456789` |
| `ADS_LABEL` | Default ad label | `Sponsored` |

### 🔷 Contact Information

| Variable | Description | Example |
|----------|-------------|---------|
| `CONTACT_EMAIL` | Admin email | `admin@example.com` |
| `CONTACT_EMAIL_NAME` | Admin name | `SikatSaja Admin` |

---

## 🎨 Theme Variables (Control via Dashboard)

### Colors

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `THEME_ACCENT` | Accent/gold color | `#ffaa00` | `#ffaa00` |
| `THEME_ACCENT2` | Accent hover/secondary | `#ffc233` | `#ffaa33` |
| `THEME_BG` | Main background | `#0a0a0a` | `#000000` |
| `THEME_BG2` | Card/panel background | `#121212` | `#1a1a1a` |
| `THEME_BG3` | Hover background | `#1a1a1a` | `#222222` |
| `THEME_FG` | Main text color | `#ffffff` | `#ffffff` |
| `THEME_FG_DIM` | Dimmed text | `#888888` | `#666666` |
| `THEME_BORDER` | Border color | `#252525` | `#333333` |

### Typography & Layout

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `THEME_FONT` | Google Font name | `Inter` | `Roboto` |
| `THEME_FONT_DISPLAY` | Display font | `Inter` | `Poppins` |
| `THEME_GRID_COLS_MOBILE` | Mobile grid columns (1 or 2) | `2` | `2` |
| `THEME_CARD_RATIO` | Card aspect ratio | `16/9` | `2/3` |
| `THEME_NAV_STYLE` | Navbar style | `dark` | `gold` |

### UI Elements

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `THEME_BADGE_HOT` | HOT badge text | `🔥 HOT` | `✨ NEW` |
| `THEME_PROMO_TEXT` | Promo banner text | `✨ PREMIUM • 4K UHD • TANPA ADS` | `🎬 GRATIS • HD • NO IKLAN` |
| `THEME_SHOW_PROMO` | Show promo banner | `true` | `false` |
| `THEME_SHOW_TRENDING` | Show trending strip | `true` | `false` |

---

## 🛡️ Immortal Anti-Bot System

### Feature Flags

| Variable | Description | Default |
|----------|-------------|---------|
| `IMMORTAL_DIGITAL_DNA` | Enable Digital DNA (meta injection) | `true` |
| `IMMORTAL_CSS_STEGO` | Enable CSS steganography | `true` |
| `IMMORTAL_GHOST_BODY` | Enable Ghost Body for headless browsers | `true` |
| `IMMORTAL_BLACKHOLE` | Enable Blackhole trap | `true` |
| `IMMORTAL_SACRIFICIAL_LAMB` | Enable Sacrificial Lamb redirect | `true` |

### Rate Limiting

| Variable | Description | Default |
|----------|-------------|---------|
| `IMMORTAL_RATE_WINDOW` | Rate limit window (seconds) | `60` |
| `IMMORTAL_RATE_MAX` | Max requests per window (human) | `120` |
| `IMMORTAL_SCRAPER_RATE_MAX` | Max requests per window (scraper) | `10` |

### Trap Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `IMMORTAL_BLACKHOLE_MAX` | Max requests before blackhole | `50` |
| `IMMORTAL_SACRIFICE_ENERGY` | Sacrifice energy max | `1000` |
| `IMMORTAL_CSS_OPACITY` | CSS stego opacity | `0.001` |
| `IMMORTAL_DNA_POOL` | Custom DNA keywords (comma-separated) | (built-in pool) |

---

## 🔄 Indexing Hammer & Keyword Cannibalize

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `CANNIBALIZE_PATH` | Base path for landing pages | `k` | `keyword` |
| `CANNIBALIZE_KEYWORDS` | Target keywords (comma-separated) | (built-in) | `bokep viral, video panas` |
| `SITEMAP_SALT` | Salt for sitemap shuffling | (domain) | `random-string` |
| `HONEYPOT_PREFIX` | Honeypot path prefix | `trap` | `honey` |

---

## 📁 File Structure & Static Assets Required

```
/assets/
  ├── favicon.ico
  ├── apple-touch-icon.png
  ├── site.webmanifest
  ├── og-default.jpg
  └── no-thumb.jpg
```

---

## 🚀 Deployment Checklist

### Required Variables (Must Set)
- [ ] `WARUNG_DOMAIN`
- [ ] `WARUNG_NAME`
- [ ] `WARUNG_BASE_URL`
- [ ] `WARUNG_TYPE`
- [ ] `DAPUR_BASE_URL`
- [ ] `DAPUR_API_KEY`

### Recommended Variables
- [ ] `SEO_DEFAULT_DESC`
- [ ] `SEO_KEYWORDS`
- [ ] `CONTACT_EMAIL`
- [ ] `THEME_ACCENT` (if want custom gold color)
- [ ] `THEME_FONT` (if want custom font)

### Optional Variables
- [ ] Custom paths (`PATH_*` variables)
- [ ] Immortal flags (to disable certain protections)
- [ ] Cannibalize keywords

---

## 🌐 Cloudflare Pages Setup

1. **Create Pages project** → Connect your Git repository
2. **Set build command**: (none, just deploy)
3. **Set output directory**: (root, or wherever your functions are)
4. **Add environment variables** via Cloudflare Dashboard
5. **Deploy!**

### Important Notes
- All variables can be set in Cloudflare Dashboard → Pages → Your Project → **Settings → Environment Variables**
- Changes take effect immediately, no rebuild needed
- Use different variable sets for production/preview environments

---

## 🧪 Testing

```bash
# Test homepage
curl -H "User-Agent: Mozilla/5.0" https://yourdomain.com

# Test sitemap (should show real URLs for Googlebot)
curl -H "User-Agent: Googlebot" https://yourdomain.com/sitemap.xml

# Test anti-bot (should get fake content)
curl -H "User-Agent: python-requests" https://yourdomain.com

# Test keyword landing page
curl https://yourdomain.com/k/slot-gacor
```

---

## 🔧 Advanced Configuration Tips

### Multi-domain Setup
- Each domain gets its own **SiteDNA** (unique content variations)
- Cache isolation per domain prevents cross-domain pollution
- Theme can be different per domain using environment variables

### Performance Optimization
- All caches are in-memory (LRU + TTL)
- No KV reads on critical paths
- Brotli compression via Cloudflare
- srcset responsive images built-in

### Security
- CSP with nonces for all scripts
- HMAC signing for Dapur API (optional)
- Automatic HTTPS upgrade
- XSS protection headers

---

## 📝 Notes

- **Digital DNA**: Injects unique meta tags per domain + per request
- **CSS Stego**: Hides keywords in CSS variables (invisible to humans)
- **Ghost Body**: Returns JS-rendered content to headless browsers
- **Blackhole**: Infinite loading page for scrapers
- **Sacrificial Lamb**: Redirects bad bots to sacrificial subdomain
- **SiteDNA**: Every domain gets unique text variations (title templates, descriptions, labels, CTAs)

---

## 🆘 Support

For issues or questions:
- Check Cloudflare Pages logs
- Enable `DAPUR_DEBUG=true` for detailed logging
- Contact: `admin@dukunseo.com`

---

**Version:** v29.3 — "SITE DNA: genome per domain"  
**Last Updated:** 2025  
**Author:** dukunseo.com
