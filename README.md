# Kral Tırpan

Three.js + TypeScript + Vite ile yazılan, Capacitor ile Android/iOS'a paketlenecek 3D mobil ot biçme
simülatörü. İlk bölümler Karadeniz fındık bahçelerinde: dayı kral tırpanla ocakların arasındaki otu biçer.

## Çalıştırma

```bash
npm install
npm run dev        # http://localhost:5173 (telefondan aynı ağla açılabilir)
npm test           # oyun mantığı testleri (bot 4 bahçeyi de biçebiliyor mu)
npm run build      # tip kontrolü + dist/
npm run smoke      # dist/ üzerinde headless Chrome testi + test-output/ ekran görüntüleri
```

Android ilk kurulum: `npx cap add android`, sonra `npm run cap:sync` ve `npx cap open android`.

## Oynanış

- **Kamera:** varsayılan birinci şahıs (FPV); göz tuşu arkadan bakan kameraya geçirir.
- **Kontroller:** sol joystick yukarı/aşağı yürür, sağa/sola döner; sağ yarıda sürükle = etrafa bak.
  **Gaz pedi:** basılı = gaz, basılıyken sağa sola kaydır = misina kafasını yönet (otomatik savurma yok).
- **Motor:** pompa ×3 → (soğuksa) jikle → ipi hızlı çek → öksürünce jikleyi bırak → çek. Jikle açık
  kalırsa boğulur. STOP motoru durdurur. Uzun ağır işte ısınır, hararet yaparsa durur; soğumasını bekle
  ya da (ödüllü) reklam izle. Soğuk motor ilk saniyelerde tam güç vermez.
- **Misina:** aşınır, MİSİNA ile makaradan çıkar. Kısa misinayla taşa vurunca komple kopar: motoru
  durdur, MİSİNA TAK'a basılı tut. Makara biterse bidona dön.
- Ocağa vurmak ücretten keser; benzin/misina masrafı ücretten düşer. %90 biçince iş biter; 3 yıldız.
- Dükkan: depo, kalın misina, geniş kafa, güçlü motor (daha az ısınır), çivili çizme.
- Egzoz dumanı gaza göre; soğukta beyaz, sıcakta koyu. Sesler tamamen sentez (bkz. `src/audio/audio.ts`).
- Reklam şimdilik sahte (`src/platform/ads.ts`); gerçek AdMob aynı fonksiyona bağlanacak.
- Modeller: `docs/MODELS.md` (promptlar, bütçeler, iskelet, dışa aktarma).

## Mimari

```
src/game/      Saf oyun mantığı (Three.js'siz, testli)
  config.ts      Bahçeler, ayarlar, yükseltmeler
  field.ts       Arazi yüksekliği, 25 cm'lik ot ızgarası, ocak/taş yerleşimi, süpürülen kapsülle biçme
  session.ts     60 Hz sabit adım: yürüme, eğim, savurma, misina/benzin, çarpmalar, ücret
render/
  grass.ts       Instanced ot öbekleri; boyları ızgaradan bir R8 dokusuyla GPU'da okunur
  world.ts       Arazi (biçilen yer anız rengine döner), gökyüzü, sırtlar, ocaklar, taşlar, çit, ev
  worker.ts      Dayı + kral tırpan, yürüme/gövde döndürme, kolların gidona uzanması
  props.ts       Prosedürel geçici modeller
  models.ts      public/models/models.json'daki GLB'leri yükler (docs/MODELS.md)
audio/         Web Audio ile sentez: iki zamanlı motor, misina vınlaması, ot hışırtısı, kuşlar
input/ ui/ platform/   Joystick/klavye, Capacitor (titreşim, kayıt, geri tuşu)
```

Performans: ot karo başına 1 çizim çağrısı (6×6 m karolar, ekran dışı olanlar atlanır).
1. bahçede orta kalitede ~94 çizim çağrısı / ~124 bin üçgen. Kalite: düşük/orta/yüksek + FPS düşerse otomatik düşürme.
