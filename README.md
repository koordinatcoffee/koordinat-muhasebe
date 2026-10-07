# Koordinat Muhasebe

Koordinat Coffee Factory için gelir, gider ve kasa takip uygulaması.
React + Vite ile web'de geliştirilir, Supabase'de veri tutar ve Electron ile Windows / macOS masaüstü uygulaması olarak paketlenir.

## Modüller

| Sayfa | Ne girilir |
|---|---|
| **Günlük Kasa** | Her gün için **nakit** + **kredi kartı** satış toplamı. Toplam otomatik hesaplanır. Bir güne tek kayıt girilir; aynı tarih seçilirse kayıt güncellenir. İsteğe bağlı olarak tutar ürün gruplarına (sıcak kahve, soğuk içecek, tatlı…) dağıtılabilir. |
| **Gelir - Gider Defteri** | Kasa dışı gelirler (toptan satış vb.) ve harcamalar (peçete, süt, kira…). Kategori, firma, ödeme yöntemi, açıklama. |
| **Yapılan Ödemeler** | Kime, ne kadar, hangi yöntemle ödendi (tedarikçi, kira, maaş, vergi…). "Kime ne ödedik" özeti. |
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

> Bir harcamayı **ya** Gider Defterine **ya da** Ödemelere girin, ikisine birden değil — ikisi de toplam gidere eklenir.
> Günlük satışlar Kasa'ya girilir; aynı satışı ayrıca "Gelir" olarak girmeyin.

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
npm run dist:mac   # release/ altında .dmg
npm run dist:win   # release/ altında Windows kurulum (.exe)
npm run dist       # ikisi birden
```

- Supabase adresi ve anahtarı build sırasında uygulamaya gömülür; `.env` build öncesi dolu olmalı.
- Windows kurulumu macOS'tan da alınabilir; sorun çıkarsa Windows bilgisayarda `npm install && npm run dist:win` çalıştırın.
- Uygulama ikonu için `build/icon.icns` (mac) ve `build/icon.ico` (Windows) dosyalarını ekleyin.
- İmzasız macOS uygulaması ilk açılışta uyarı verebilir: Finder'da sağ tık → Aç.

## Proje yapısı

```
electron/main.cjs      Electron ana süreci
supabase/schema.sql    Veritabanı şeması
src/lib/               Supabase bağlantısı, veri erişimi, hesaplamalar, biçimlendirme, CSV
src/pages/             Özet, Kasa, Hareketler (defter + ödemeler), Raporlar, Ayarlar, Giriş
src/components/        Menü ve ortak bileşenler
```
