# Koordinat Muhasebe

Koordinat Coffee Factory için gelir, gider ve kasa takip uygulaması.
React + Vite ile web'de geliştirilir, Supabase'de veri tutar ve Electron ile Windows / macOS masaüstü uygulaması olarak paketlenir.

## Modüller

| Sayfa | Ne girilir |
|---|---|
| **Günlük Kasa** | **Şube seçilerek** her gün için **nakit** + **kredi kartı** satış toplamı. Her şubenin kasası ayrıdır; bir şubeye bir güne tek kayıt girilir, aynı şube ve tarih seçilirse kayıt güncellenir. İsteğe bağlı olarak tutar ürün gruplarına dağıtılabilir. Ay sonunda şubelere göre toplam. |
| **Yapılan Ödemeler** | Kime, ne kadar, hangi yöntemle ödendi (tedarikçi, kira, maaş, vergi…). Firma/kişinin **IBAN** ve **telefonu**, **fatura no** ve **fatura tutarı**; her faturanın **kalan borcu** (kısmi ödeme). "Kime ne ödedik" ve "Açık faturalar" özetleri. |
| **Yapılacak Ödemeler** | Ne zaman, kime, ne kadar ödenecek (IBAN, telefon, fatura bilgileriyle). Gecikmiş / önümüzdeki 7 gün / toplam bekleyen ve aylara göre döküm. **Ödendi** ile kayıt Yapılan Ödemeler'e geçer; **Ödenmedi** ile işaretlenir (bekleyen listesinde kalır). Ödeme silinirse bağlı yapılacak ödeme kaydı da silinir. |
| **Personel Avansları** | Personel listesi ve aylık net maaş (maaş geçmişiyle), verilen **avanslar** ve **maaş ödemeleri**. Her ay için devreden + hakediş − avans − ödeme hesabıyla **ay sonu kim alacaklı** (personel mi, biz mi). Avans ve maaş ödemeleri Yapılan Ödemeler'e (Avans / Net Maaşlar kategorisi) otomatik eklenir; oradan değil bu sayfadan düzenlenir. |
| **Raporlar** | Aylık / yıllık / tarih aralığı kâr-zarar, kâr marjı, gider dağılımı, kime ne ödendiği, ödeme yöntemine göre giriş-çıkış, aylık veya günlük döküm, tüm hareketler. **Yazdır / PDF** ve **Excel'e aktar**. |
| **Ayarlar** | Şifre değiştirme (herkes), kullanıcı ve şube yönetimi (yönetici), gelir ve gider kategorileri (ana grup → alt kalem). |

**Şubeler:** Yalnızca günlük kasa şube bazındadır. Ödemeler, yapılacak ödemeler, personel ve kategoriler tüm şubeler için ortaktır; Özet ve Raporlar tüm şubelerin toplamını gösterir (Raporlar'da ayrıca şube kırılımı vardır). Şubeler eklenmeden önce girilen kasa kayıtları ilk şubeye ("Merkez") aktarılır.

Özet, Günlük Kasa, Yapılan / Yapılacak Ödemeler ve Raporlar sayfalarında **Excel'e aktar** düğmesi biçimli bir `.xlsx` dosyası indirir (her bölüm ayrı sayfa, para ve tarih biçimleri, toplam satırları, A4 yazdırma ayarı).

IBAN ve telefon firma/kişi adına göre saklanır; aynı ad tekrar seçildiğinde otomatik dolar. Bir faturanın kalan borcu = fatura tutarı − aynı firma ve fatura no ile yapılan ödemelerin toplamı.

### Kategoriler

Kategoriler iki seviyelidir; varsayılan liste `supabase/schema.sql` içindedir (20 gelir, 87 gider kalemi).

- **Gelir grupları:** Kafe Satışları (sıcak/soğuk kahve, soğuk içecek, tatlı, yiyecek…), Perakende Satış (paket kahve, ekipman, hediyelik), Kanal ve Kurumsal Satış (online platform, toptan, catering), Diğer Gelirler
- **Gider grupları:** Ürün Maliyeti, Ambalaj ve Sarf Malzeme, Personel, Kira ve Mekân, Faturalar, Vergi/Resmi/Muhasebe, Bakım/Onarım/Ekipman, Temizlik ve Hijyen, Pazarlama, Finansal Giderler ve Komisyonlar, Lojistik, Yazılım ve Abonelikler, Diğer

Raporlarda gelir ve giderler bu gruplara göre dökülür. Ayrıca kafe işletmelerinde takip edilen **maliyet oranları** gösterilir: ürün maliyeti, personel, kira ve ambalaj giderlerinin gelire oranı.

### Hesaplama

```
Toplam Gelir = Kasa (nakit + kredi kartı) + Diğer gelirler
Toplam Gider = Yapılan ödemeler
Net Kâr/Zarar = Toplam Gelir − Toplam Gider
Kâr Marjı    = Net / Toplam Gelir
```

> Yapılacak ödemeler, **Ödendi** denene kadar kâr-zarara girmez.
> Eski Gelir - Gider Defterinin gider kayıtları (`expense`) `schema.sql` ile Yapılan Ödemeler'e taşınır; eski gelir kayıtları (`income`) "Diğer gelirler" olarak sayılır.
> Bir kayıt silinince ondan türeyen kayıtlar da silinir (ödeme ↔ yapılacak ödeme, personel avansı → ödeme, kullanılmayan IBAN / telefon kartı).

### Kullanıcılar ve yetkiler

- **Yönetici** tüm sayfaları görür ve Ayarlar → Kullanıcılar'dan kullanıcı ekler (e-posta + şifre), şifresini sıfırlar, aktif / pasif yapar ve hangi sayfaları açabileceğini seçer.
- **Kullanıcı** için her sayfa ayrı ayarlanır: **Yok** (sayfa görünmez), **Görüntüle** (kayıtları görür, Excel'e aktarır; ekleyemez / değiştiremez / silemez) veya **Düzenle** (tüm işlemler). Ekleme / değiştirme / silme veritabanında (RLS) da "Düzenle" yetkisine bağlıdır. Okuma her aktif kullanıcıya açıktır (Özet ve Raporlar tüm tabloları birleştirir); personel verisi yalnızca Personel Avansları yetkisiyle okunur.
- **Pasif** kullanıcı giriş yapamaz, açık oturumu kapatılır ve hiçbir veriye erişemez.
- `schema.sql` ilk çalıştırıldığında mevcut tüm hesaplar yönetici olur. Supabase panelinden sonradan eklenen hesaplar pasif başlar (ilk hesap hariç); kullanıcıları uygulamadan ekleyin.
- Kullanıcı oluşturma `admin_create_user` SQL fonksiyonuyla doğrudan `auth.users` tablosuna yazar (service role anahtarı uygulamaya konmaz).

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
| `employees` / `employee_salaries` / `employee_entries` | Personel; maaş geçmişi (`valid_from` ayından itibaren); avans (`advance`) ve maaş ödemesi (`salary_payment`) kayıtları. Her kayıt `transactions.employee_entry_id` ile bir ödeme kaydına yansıtılır. |
| `app_users` | Panel kullanıcıları: `user_id` (auth.users), `email`, `full_name`, `is_admin`, `is_active`, `allowed_pages` (görebildiği sayfalar), `editable_pages` (düzenleyebildiği sayfalar) |
| `categories` | `name`, `type` (`income` / `expense`), `group_name`, `sort_order` |
| `branches` | Şubeler: `name` (tekil), `sort_order` |
| `daily_registers` | Günlük kasa: `branch_id`, `date` (şube + tarih tekil), `cash`, `card`, `total` (otomatik), `sales_breakdown` (jsonb), `note` |
| `transactions` | `date`, `type` (`income` / `expense` / `payment`), `category`, `counterparty`, `payment_method` (`cash` / `card` / `bank_transfer` / `other`), `amount`, `description`, `invoice_no`, `invoice_amount` |
| `counterparties` | Firma / kişi iletişim bilgisi: `name` (tekil), `iban`, `phone` |
| `invoice_balances` (view) | Fatura başına `invoice_amount`, `paid_amount`, `remaining_amount`, `last_payment_date` |
| `planned_payments` | Yapılacak ödemeler: `due_date`, `category`, `counterparty`, `payment_method`, `amount`, `description`, `invoice_no`, `invoice_amount`, `transaction_id` (ödendiğinde oluşan `payment` kaydı; boşsa bekliyor). `pay_planned_payment(planned_id, paid_on)` fonksiyonu ödemeyi tek adımda kaydeder. |

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
  hooks/useAccess.js              Signed-in user's profile and page access
  lib/
    supabaseClient.js             Supabase client
    api.js                        Data access (daily registers, transactions, planned payments, categories)
    plannedPayments.js            Due status and totals of planned payments
    summary.js                    Profit/loss calculations, monthly/daily breakdowns
    categories.js                 Category groups, cost ratios, grouping helpers
    format.js                     Currency, date, amount parsing, labels
    excel.js                      Formatted .xlsx export (exceljs, loaded on demand)
    invoices.js                   Invoice balance lookup, remaining debt
    payroll.js                    Staff salary proration and month-end balances
  components/
    layout/AppLayout.jsx          Sidebar, mobile top bar and drawer
    payments/PaymentFields.jsx    Counterparty (IBAN, phone) and invoice form fields
    reports/GroupedAmountTable.jsx
    settings/                     PasswordChangeForm, UserManager
    ui/                           PageHeader, StatCard, MoneyInput, MonthPicker, CategorySelect, Alert, EmptyState
  pages/                          Login, Dashboard, DailyRegister, Transactions (payments made), PlannedPayments, Employees, Reports, Settings
  assets/brand/                   logo-compact.png, logo-full.png
  styles/global.css               Design tokens, layout, responsive and print styles
```
