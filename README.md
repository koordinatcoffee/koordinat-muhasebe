# Koordinat Muhasebe

Koordinat Coffee Factory için gelir, gider ve kasa takip uygulaması.
React + Vite ile web'de geliştirilir, Supabase'de veri tutar ve Electron ile Windows / macOS masaüstü uygulaması olarak paketlenir.

## Modüller

| Sayfa | Ne girilir |
|---|---|
| **Günlük Kasa** | Her gün için **nakit** + **kredi kartı** satış toplamı. Toplam otomatik hesaplanır. Bir güne tek kayıt girilir; aynı tarih seçilirse kayıt güncellenir. İsteğe bağlı olarak tutar ürün gruplarına (sıcak kahve, soğuk içecek, tatlı…) dağıtılabilir. |
| **Yapılan Ödemeler** | Kime, ne kadar, hangi yöntemle ödendi (tedarikçi, kira, maaş, vergi…). "Kime ne ödedik" özeti. |
| **Yapılacak Ödemeler** | Ne zaman, kime, ne kadar ödenecek. Gecikmiş / önümüzdeki 7 gün / toplam bekleyen ve aylara göre döküm. **Ödendi** ile kayıt Yapılan Ödemeler'e geçer; o ödeme silinirse tekrar bekleyene döner. |
| **Raporlar** | Aylık / yıllık / tarih aralığı kâr-zarar, kâr marjı, gider dağılımı, kime ne ödendiği, ödeme yöntemine göre giriş-çıkış, aylık veya günlük döküm, tüm hareketler. **Yazdır / PDF** ve **Excel'e aktar**. |
| **Ayarlar** | Gelir ve gider kategorileri (ana grup → alt kalem). |

### Kategoriler

Kategoriler iki seviyelidir; varsayılan liste `supabase/schema.sql` içindedir (20 gelir, 87 gider kalemi).

- **Gelir grupları:** Kafe Satışları (sıcak/soğuk kahve, soğuk içecek, tatlı, yiyecek…), Perakende Satış (paket kahve, ekipman, hediyelik), Kanal ve Kurumsal Satış (online platform, toptan, catering), Diğer Gelirler
- **Gider grupları:** Ürün Maliyeti, Ambalaj ve Sarf Malzeme, Personel, Kira ve Mekân, Faturalar, Vergi/Resmi/Muhasebe, Bakım/Onarım/Ekipman, Temizlik ve Hijyen, Pazarlama, Finansal Giderler ve Komisyonlar, Lojistik, Yazılım ve Abonelikler, Diğer

Raporlarda gelir ve giderler bu gruplara göre dökülür. Ayrıca kafe işletmelerinde takip edilen **maliyet oranları** gösterilir: ürün maliyeti, personel, kira ve ambalaj giderlerinin gelire oranı.

### Hesaplama

```
Toplam Gelir = Kasa (nakit + kredi kartı) + Diğer gelirler
Toplam Gider = Giderler + Yapılan ödemeler
Net Kâr/Zarar = Toplam Gelir − Toplam Gider
Kâr Marjı    = Net / Toplam Gelir
```

> Yapılacak ödemeler, **Ödendi** denene kadar kâr-zarara girmez.
> Eski Gelir - Gider Defteri kayıtları (`income` / `expense`) raporlarda hesaba katılmaya devam eder.

## Kurulum

1. **Bağımlılıklar:** `npm install`
2. **Supabase anahtarı:** `.env.example` dosyasını `.env` olarak kopyalayın ve `VITE_SUPABASE_ANON_KEY` değerini girin
   (Supabase → Project Settings → API → `anon public`).
3. **Veritabanı:** Supabase → SQL Editor → `supabase/schema.sql` içeriğini yapıştırıp çalıştırın.
   Tablolar, güvenlik kuralları (RLS) ve varsayılan kategoriler oluşur. Tekrar çalıştırmak güvenlidir.
4. **Kullanıcı:** Supabase → Authentication → Users → **Add user** ile e-posta/şifre oluşturun
   ("Auto Confirm User" işaretli olsun). Dışarıdan kayıt olunmasın diye Authentication → Sign In / Providers altında
   "Allow new users to sign up" kapatılabilir.

## Geliştirme

```bash
npm run dev            # Tarayıcıda: http://localhost:5173
npm run electron:dev   # Aynı uygulama Electron penceresinde (canlı yenileme)
```

## Masaüstü uygulaması (build)

```bash
npm run dist:mac   # release/ altında .dmg (Apple Silicon + Intel)
npm run dist:win   # release/ altında Windows kurulum (.exe, x64)
npm run dist       # ikisi birden
```

- Supabase adresi ve anahtarı build sırasında uygulamaya gömülür; `.env` boşsa build durur (`scripts/check-env.mjs`).
- Masaüstü uygulaması her zaman canlı Supabase verisiyle çalışır; internet yoksa üstte uyarı gösterilir.
- **Windows .exe Apple Silicon Mac'te:** NSIS aracı Intel ikilisidir, önce Rosetta kurulmalıdır:
  `softwareupdate --install-rosetta --agree-to-license` → ardından `npm run dist:win`.
- **GitHub Actions ile:** `.github/workflows/desktop-build.yml` Mac'te `.dmg`, Windows'ta `.exe` üretir.
  Repo → Settings → Secrets → Actions altına `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` ekleyin;
  Actions sekmesinden "Desktop build" → Run workflow (veya `v1.0.1` gibi bir tag push'layın). Çıktılar "Artifacts" altında.
- Uygulama ikonu `build/icon.png` (1024×1024, `build/icon-source.jpeg` rozet logosundan üretildi); electron-builder mac ve Windows ikonlarını buradan oluşturur.
- İmzasız macOS uygulaması ilk açılışta uyarı verebilir: Finder'da sağ tık → Aç.

## Responsive

Arayüz masaüstü, tablet ve telefonda çalışır:

- **≥ 1024px:** sabit sol menü
- **< 1024px:** üst bar + açılır menü (hamburger)
- **≤ 720px:** tek sütun formlar, 2 sütun özet kartları, listeler kart görünümüne döner
- **Yazdırma:** A4 düzeni, logo başlıklı rapor

## Veritabanı

| Tablo | Açıklama |
|---|---|
| `categories` | `name`, `type` (`income` / `expense`), `group_name`, `sort_order` |
| `daily_registers` | Günlük kasa: `date` (tekil), `cash`, `card`, `total` (otomatik), `sales_breakdown` (jsonb), `note` |
| `transactions` | `date`, `type` (`income` / `expense` / `payment`), `category`, `counterparty`, `payment_method` (`cash` / `card` / `bank_transfer` / `other`), `amount`, `description` |
| `planned_payments` | Yapılacak ödemeler: `due_date`, `category`, `counterparty`, `payment_method`, `amount`, `description`, `transaction_id` (ödendiğinde oluşan `payment` kaydı; boşsa bekliyor). `pay_planned_payment(planned_id, paid_on)` fonksiyonu ödemeyi tek adımda kaydeder. |

Kategori ve grup adları kullanıcıya görünen etiketlerdir (Türkçe); tablo, sütun ve değer adları İngilizcedir.

## Proje yapısı

```
electron/main.cjs                 Electron main process
supabase/schema.sql               Database schema, RLS, legacy migration, default categories
build/icon.png                    App icon (electron-builder)
public/favicon.png                Browser favicon
src/
  main.jsx, App.jsx               Entry point, auth gate, routes
  config/navigation.js            Route paths and sidebar items
  hooks/useAsync.js               Async data loading hook
  lib/
    supabaseClient.js             Supabase client
    api.js                        Data access (daily registers, transactions, planned payments, categories)
    plannedPayments.js            Due status and totals of planned payments
    summary.js                    Profit/loss calculations, monthly/daily breakdowns
    categories.js                 Category groups, cost ratios, grouping helpers
    format.js                     Currency, date, amount parsing, labels
    csv.js                        Excel-compatible CSV export
  components/
    layout/AppLayout.jsx          Sidebar, mobile top bar and drawer
    reports/GroupedAmountTable.jsx
    ui/                           PageHeader, StatCard, MoneyInput, MonthPicker, CategorySelect, Alert, EmptyState
  pages/                          Login, Dashboard, DailyRegister, Transactions (payments made), PlannedPayments, Reports, Settings
  assets/brand/                   logo-compact.png, logo-full.png
  styles/global.css               Design tokens, layout, responsive and print styles
```
