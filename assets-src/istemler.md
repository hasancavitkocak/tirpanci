# Kral Tırpan: üretilecek modeller, dokular, sesler

Dosyaları üretince `C:\Users\hkocak\Downloads` klasörüne koy, adı aşağıdaki gibi olsun (ya da bana söyle, ben çeviririm).

## Hepsi için geçerli isterler

| Ne | Değer |
|---|---|
| Format | GLB (doku içine gömülü) |
| Ölçü | Gerçek ölçü, 1 birim = 1 metre |
| Yön | Y yukarı, ön yüz +Z |
| Pivot (orijin) | Tabanın ortası (zeminde duran nokta) |
| Zemin | Altında zemin, plaka, gölge düzlemi olmasın |
| Malzeme | Tek malzeme (tek doku atlası) |
| Doku | 1024×1024 (ev ve ahır en fazla 2048) |
| Yazı | Üzerinde hiç yazı olmasın, yazıları oyunda kendim basıyorum |
| Stil | Önceki modeller gibi: stylized, hafif çizgi film, yumuşak renkler |

Üçgen sayıları üst sınırdır, altında kalması iyi (telefon ısınmasın). Tripo'da "Face limit" ya da "Polycount" ayarına yazılacak sayı bu.

**Hayvanlar (köpek, inek) için ek:**
- Rigli (iskeletli) olsun.
- Animasyonlar yerinde oynasın (in place / root motion yok).
- 30 fps.
- Klip adları aşağıda yazdığım gibi olsun.

---

## A. Karadere köyü

### A1. Karadere evi: `karadere-ev.glb`
- **Üçgen:** en fazla 15.000
- **Doku:** 2048
- **Ölçü:** 10 m geniş, 8 m derin, 9 m yüksek

> Stylized low-poly Black Sea (Karadeniz) village house, two storeys: ground floor of rough grey stacked stone, upper floor of dark weathered wooden planks with a long wooden balcony on the front, red clay tile hip roof with a stone chimney, small wooden shutters, wooden stairs to the side. Warm, cosy, game asset, clean shapes, no ground, no text. About 10 m wide, 8 m deep, 9 m tall.

### A2. Serender (ahşap ambar): `serender.glb`
- **Üçgen:** en fazla 5.000
- **Ölçü:** 3 m geniş, 6 m yüksek

> Stylized low-poly Turkish Black Sea "serender" granary: small wooden storage house raised on four tall wooden stilts with flat round stone discs on top of each stilt, plank walls, steep wooden shingle roof, small door and a loose wooden ladder. Game asset, no ground, no text. About 3 m wide, 6 m tall.

### A3. Köy giriş kemeri: `karadere-kemer.glb`
- **Üçgen:** en fazla 6.000
- **Ölçü:** 7 m geniş, 5 m yüksek
- **Not:** Tabela boş olsun.

> Stylized low-poly rustic village entrance arch: two stacked-stone pillars, a heavy wooden beam across the top with a blank wooden name board hanging from it, two small iron lanterns, a little red tile cap on each pillar. Game asset, no ground, the board must be blank (no text). About 7 m wide, 5 m tall.

### A4. Kuru taş duvar parçası: `tas-duvar.glb`
- **Üçgen:** en fazla 1.500
- **Ölçü:** tam 4 m uzun, 0.9 m yüksek, 0.6 m kalın
- **Not:** İki ucu düz olsun, parçalar uç uca eklenecek.

> Stylized low-poly dry stone wall segment, irregular grey and mossy stones stacked without mortar, slightly uneven top, a few small grass tufts at the base. Straight piece exactly 4 m long, 0.9 m tall, 0.6 m thick, both ends flat so pieces line up. Game asset, no ground.

### A5. Karadere arka planı (gökyüzü panoraması): `gokyuzu-karadere.jpg`
Şu anki `gokyuzu.jpg` ile aynı düzende olmalı, yoksa oyunda kayar:
- **Boyut:** 4096×2048 (2:1)
- **Sol-sağ kenar:** Birbirine dikişsiz bağlansın, panorama tam tur dönüyor.
- **Yükseklik düzeni:** Üst yarı gök. Ufuk çizgisi yukarıdan yaklaşık %55'te, dağ ve orman bandı %35 ile %57 arasında. Alttaki %43 düz, tek renk koyu yeşil (#2E5E2A gibi), içinde hiçbir şey olmasın.
- **Güneş:** Görselde güneş olmasın, güneşi oyun kendisi çiziyor.

> Seamless 360° equirectangular panorama, 2:1, stylized painted game sky for a Black Sea (Karadeniz) valley village. Top half: soft late-afternoon sky, warm golden haze near the horizon fading to light blue above, a few long thin clouds. Horizon band (from about 35 % to 57 % of the height): steep, deep green mountains densely covered with dark spruce forest, layers of mist lying in the narrow valleys between them, a small stone-and-wood village with red tile roofs and a wooden minaret on one far slope, a thin waterfall on a distant cliff, higher rocky peaks with a little snow far behind. Bottom 43 %: plain flat dark green (#2E5E2A), nothing in it. Left and right edges must join seamlessly. No sun disc, no text, no people.

### A6. Ağaçlar, köprü, dokular
Bunlar için model üretme:
- **Ağaçlar** koddan yapılıyor. Ladin tek bir çizimle yaklaşık 100 üçgen, Tripo ağacının yaklaşık 15'te 1'i; telefon için daha iyi.
- **Taş köprü** elimizde var (`kopru.glb`), Karadere'de onu kullanıyorum.
- **Kaldırım ve çayır dokuları** geldi, oyuna kondu.

---

## B. Boy boyu ot: `boy-ot.png`
- **Format:** PNG, şeffaf arka plan, 2048×512 (4 öbek yan yana)

> Sprite sheet of 4 tall wild grass clumps side by side on a transparent background: tall reed-like grass with seed heads, thick stems, some bent, stylized, front view, flat lighting, each clump as tall as a person.

---

## C. Ot üfleme ve yakma işi
Biçilen ot sırt tipi üfleme makinesiyle tarlanın ortasına üflenir ve orada yakılır. Ateş ile duman oyunda koddan yapılıyor, model gerekmez. (Süpürme makinesinin yerine bu geldi.)

**Sırt tipi üfleme makinesi:** `ufleme-makinesi.glb`
- **Üçgen:** en fazla 4.000
- **Ölçü:** yaklaşık 0.6 m yüksek, borusu 1 m

> Stylized low-poly backpack leaf blower: red two-stroke engine with cooling fins and a pull-start handle on a black backpack frame with shoulder straps, white translucent fuel tank at the bottom, a long black blower tube coming out of the side with a flexible corrugated section and a handle with a throttle lever on the tube. Game asset, no ground, standing upright. About 0.6 m tall, tube about 1 m long.

**Ahır ve önündeki balyalar (dekor, dışarıdan alınmış gibi):**

| Dosya | Üçgen | Ölçü |
|---|---|---|
| `ahir.glb` | en fazla 10.000 (doku 2048) | 8 m geniş, 10 m derin, 7 m yüksek |
| `balya.glb` | en fazla 300 | 1 × 0.5 × 0.4 m |

> Stylized low-poly village wooden barn (ahır) with a stone base, big double wooden door at the front, hay loft opening above with a little hay sticking out, red tile roof. Game asset, no ground. About 8 m wide, 10 m deep, 7 m tall.

> Stylized low-poly rectangular hay bale tied with two strings, golden straw, game asset. 1 m × 0.5 m × 0.4 m.

---

## D. Fırtına sonrası odun işi

| Dosya | Üçgen | Ölçü |
|---|---|---|
| `testere.glb` | en fazla 3.000 | 0.8 m uzun |
| `devrik-agac.glb` | en fazla 6.000 | 10 m uzun |
| `kutuk.glb` | en fazla 300 | 0.5 m uzun, 0.4 m çap |
| `odun-yigini.glb` | en fazla 3.000 | 2 m uzun, 1.2 m yüksek |

> Stylized low-poly orange chainsaw, chain bar about 45 cm, top handle and rear handle, pull-start cord grip on the side, worn and used look. Game asset, no ground. About 0.8 m long.

> Stylized low-poly fallen tree after a storm: a thick oak trunk lying on its side with a torn root plate and soil at one end, several broken branches with leaves at the other end. Game asset, no ground. About 10 m long.

> Stylized low-poly cut log round, oak, bark on the outside, visible rings on both cut faces. Game asset. 0.5 m long, 0.4 m diameter.

> Stylized low-poly neat stack of split firewood against a low wooden frame, game asset, no ground. About 2 m long, 1.2 m tall.

---

## E. Bal işi (sonraya kaldı)
Şimdilik üretme, sonra döneceğiz.

---

## F. Motor çapa

| Dosya | Üçgen | Ölçü |
|---|---|---|
| `motor-capa.glb` | en fazla 4.000 | 1.4 m uzun |
| `capali-toprak.png` | PNG 1024, seamless | |

> Stylized low-poly walk-behind garden rotary tiller (motor çapa): small red petrol engine, two curved handlebars with grips and a throttle lever, rotating blade tines underneath instead of wheels, one small front transport wheel. Game asset, no ground. About 1.4 m long.

> Seamless tileable top-down texture of freshly tilled dark garden soil with loose clods and small furrows, stylized, flat lighting, no shadows.

---

## G. Hayvanlar (rigli + animasyonlu)

| Dosya | Üçgen | Ölçü | Animasyon klipleri |
|---|---|---|---|
| `kopek.glb` | en fazla 8.000 | omuz 0.8 m | `idle`, `walk`, `run`, `sit`, `bark` |
| `inek.glb` | en fazla 10.000 | omuz 1.4 m | `idle`, `walk`, `run`, `eat` |

> Stylized low-poly Turkish village shepherd dog (Karabash / Kangal type), cream-beige short coat with a black muzzle and black ears, curled tail, sturdy and friendly, wearing a simple leather collar. Game character, quadruped, about 0.8 m tall at the shoulder, no ground.

> Stylized low-poly village cow, brown and white patches, short horns, a small brass bell on a leather strap around its neck, friendly cartoon face. Game character, quadruped, about 1.4 m tall at the shoulder, no ground.

**İnek için not (ilk denemede yürüyüş bozuktu, arka bacaklar dizden öne kırılıyordu):** Riglemeden önce model T-poz gibi düz dursun: dört bacak dik ve hafif açık, diz bükük olmasın, baş ileri bakıyor. Gerekirse istemin sonuna şunu ekle: "standing straight in a neutral pose, all four legs straight and vertical, slightly apart, head forward". Riglerken "Diğer" (dört ayaklı) seç; animasyon olarak yürüme ve varsa durma (idle) ve otlama (eat).

---

## H. Akşamüstü işi: `gaz-lambasi.glb`
- **Üçgen:** en fazla 1.500
- **Ölçü:** 0.35 m yüksek

> Stylized low-poly old kerosene lantern (gaz lambası), red-painted metal frame, glass chimney, wire handle on top, small flame inside. Game asset. 0.35 m tall.

---

## I. Sesler
- **Kaynak:** Gerçek kayıt, sentez değil. freesound.org'da lisansı "CC0" olanlar uygun.
- **Format:** wav ya da mp3. Döngü (loop) olanlar 5–20 sn ve başı-sonu kesik olmasın.

| Dosya | Ne | Süre |
|---|---|---|
| ~~testere sesleri~~ | geldi (rölanti ve tam gaz tek kayıttan kesildi) | |
| `ufleme.wav` | sırt tipi üfleme makinesi (leaf blower) çalışırken, döngü; mümkünse rölanti ve tam gaz ayrı | 5–10 sn |
| `ates.wav` | ot yığını yanarken çıtırtı, döngü | 10–20 sn |
| `kopek-havla-2/3.wav` | köpek havlaması, iri köpek (~~1~~ geldi; iki farklı daha) | 1–2 sn |
| ~~`inek.wav`~~ | geldi | |
| `inek-cani.wav` | inek çanı, döngü | 5–10 sn |
| `motor-capa.wav` | motor çapa çalışırken, döngü | 5–10 sn |
| `aksam.wav` | cırcır böceği ve ağustos böceği ambiyansı, döngü | 20–60 sn |

---

## Öncelik sırası (yapım sırasıyla aynı)
1. ~~Karadere~~: ev, arka plan, serender, kemer, taş duvar hepsi geldi
2. ~~H gaz lambası~~ iptal: akşam işi ineklerin ahıra getirilmesi oldu; lambalar (kafa lambası, sokak, kapı) koddan çiziliyor
3. G ~~köpek~~ geldi ve oyunda; inek geldi ama yürüyüşü bozuk, yeniden rigle (aşağıdaki not); C ~~ahır~~ ve ~~balya~~ geldi
4. C sırt tipi üfleme makinesi
5. ~~D odun seti~~ hepsi geldi, odun işi oyunda (kalan: testere sesleri, I bölümünde)
6. F motor çapa (~~çapalı toprak dokusu~~ ve ~~motor çapa GLB~~ geldi; dönen bıçakları koddan yapacağım, model tek parça olsa da olur)
7. ~~B boy boyu ot~~ geldi
8. I sesler (her işin sesi o işle birlikte de gelebilir)
9. E bal (sonra)
