# Kral Tırpan: model üretim rehberi

Bu dosya, oyuna girecek her modelin nasıl üretileceğini anlatır: üretim promptu, poligon ve doku
bütçesi, yön ve orijin, iskelet ve animasyonlar, dışa aktarma ayarları.
Oyun şu an her şeyi kodla (geçici modeller) çiziyor. Bir GLB hazır olunca `public/models/` klasörüne
koyup `models.json`'a eklemeniz yeterli, kod değişmez (bkz. en alt).

---

## 1. İş akışı (Simitçi Koş ile aynı)

1. **Üret:** Tripo (veya Meshy / Rodin) ile metinden ya da görselden 3D üretin. Aşağıdaki promptlar
   İngilizce, çünkü bu araçlar İngilizcede daha iyi sonuç veriyor. Mümkünse önce bir görsel üretin
   (Midjourney / DALL·E vb. ile aynı prompt + "front view, white background"), sonra **image-to-3D**
   kullanın; tutarlılık çok daha iyi oluyor.
2. **Üretim ayarları (Tripo):** Style: *Cartoon / Stylized* (gerçekçi değil), Quad: kapalı,
   Texture: açık, PBR: açık, **Face limit**: tablodaki üçgen bütçesi.
3. **Temizle (Blender):** Fazla parçaları sil, yere oturt, ölçeklendir, **Ctrl+A → All Transforms**.
   Bütçeyi aşarsa *Decimate* (Collapse) uygula.
4. **İskelet (yalnızca işçi):** Mixamo (bölüm 4).
5. **Dışa aktar:** glTF Binary `.glb` (bölüm 5).
6. **Sıkıştır (isteğe bağlı, önerilir):**
   ```bash
   npx @gltf-transform/cli optimize girdi.glb cikti.glb --compress meshopt --texture-compress webp --texture-size 1024
   ```

---

## 2. Genel kurallar (her model için)

| Ayar | Değer |
|---|---|
| Format | `.glb` (glTF 2.0 Binary) |
| Birim | metre, gerçek boyut (oyun yine de yüksekliğe göre ölçekler) |
| Yukarı ekseni | +Y |
| Ön yüz | **+Z** (Blender'da modelin önü **-Y**'ye bakmalı; glTF dışa aktarımı bunu +Z yapar) |
| Orijin | aksi yazmadıkça **tabanın ortası** (yere değdiği noktanın merkezi) |
| Stil | stilize / low-poly, yumuşak renkler, Karadeniz doğası; çizgi film, gerçekçi değil |
| Malzeme | PBR Metallic-Roughness; metalik 0 (metal parçalar hariç), roughness 0,6–0,9 |
| Doku | **Base Color 1024×1024** (işçi ve tırpan için 2048 olabilir), sRGB. Normal map isteğe bağlı 1024. Metal/Roughness/AO tek dokuda (ORM) 512 |
| Doku sayısı | model başına **tek atlas** (bir malzeme, bir doku seti) idealdir |
| Şeffaflık | yalnızca yaprak kartlarında **Alpha Clip** (Blend kullanmayın) |
| İsimlendirme | küçük harf, Türkçe karakter yok: `isci.glb`, `ocak1.glb` |

### Üçgen ve doku bütçesi

| Dosya | Ne | Oyundaki boy | Üçgen | Doku |
|---|---|---|---|---|
| `isci.glb` | İşçi, 35-40 yaş (iskeletli, animasyonlu) | 1,75 m | 6–10 bin | 2048 atlas |
| `eller.glb` | FPV için eldivenli eller + kol yeni | – | 2–3 bin | 1024 |
| `tirpan.glb` | Kral tırpan (parçalı) | 1,6 m boy | 2–4 bin | 1024 (veya 2048) |
| `ocak1/2/3.glb` | Fındık ocağı (3 varyant) | 3 m | 2–4 bin her biri | 1024 |
| `tas1/2.glb` | Ota gömülü taş | 0,25 m | 100–300 | 512 |
| `bidon.glb` | Benzin bidonu + misina makarası + kasa | 0,6 m | 600–1200 | 512 |
| `ev.glb` | Karadeniz evi | 7 m | 2–4 bin | 1024 |
| `agac1/2.glb` | Ladin + kızılağaç (bahçe kenarı) | 6–8 m | 600–1500 | 512 |
| `kovan.glb` | Arı kovanı (`hive`) | 0,75 m | 1–2 bin | 1024 |
| `tavuk.glb` | Tavuk (`hen`), evin önünde gezer | 0,4 m | 1–2 bin | 1024 |
| `yilan.glb` | Yılan (`snake`), otun içinden kaçar | 0,12 m yükseklik | ~1 bin | 1024 |
| `hortum.glb` | Sarılı bahçe hortumu (`hose`), çitin dışında | 0,35 m | ~800 | 1024 |
| `yayla.glb` | Yayla evi (`hut`) | 5 m | 2–3 bin | 1024 |
| `cami.glb` | Köy camii (`mosque`) | 12 m | 2–4 bin | 1024 |
| `mezar.glb` | Mezar taşı (`grave`) | 1,1 m | ~500 | 1024 |
| `sirt_motoru.glb` | Sırt motoru (`backpack`), işçinin sırtında | 0,6 m | 3–4 bin | 1024 |
| `kulaklik.glb` | Kulaklık (`earmuffs`), işçinin başında | 0,2 m | ~600 | 1024 |
| `bidon.glb` | Benzin bidonu (`fuelcan`), pat patın kasasında | 0,45 m | ~800 | 1024 |
| `makara.glb` | Misina makarası (`spool`), kasada bidonun yanında | 0,25 m | ~500 | 1024 |

Görseller (`public/textures`, WebP 256×256): müşteri portreleri `dede/teyze/remzi/sukriye/muhtar/imam/belediye/arici.webp`
(üstten kare kırpılır, yüz çembere oturur); dükkân `shop-emektar/usta/sirt/yuvarlak/koseli/burgulu/kulaklik/siperlik/depo/kalin/kafa/motor/cizme.webp`
(beyaz zeminde kareye tamamlanır). Orijinaller `assets-src/gorseller` içinde.
Dosya yoksa oyun ikon gösterir; koyunca kendiliğinden görünür.
| `direk.glb` | Ahşap çit direği | 1,2 m | 50–100 | 256 |

Mobil hedef: sahnenin tamamı ~300 bin üçgen. Ot zaten ~150 bin kullanıyor. Ocaklar 30'a kadar
tekrar ediyor, bu yüzden ocak bütçesine özellikle uyun.

---

## 3. Modeller ve promptlar

Her prompta **stil eki** ekleyin:

> `stylized low-poly game asset, soft hand-painted textures, clean shapes, mobile game, Black Sea Turkey rural style, neutral lighting, white background`

Olumsuz prompt (destekleyen araçlarda):

> `realistic, photoscan, noisy texture, extra limbs, floating parts, text, logo, watermark, base plate, ground plane`

### 3.1 İşçi (`isci.glb`)

> A fit Turkish farm worker from the Black Sea region, **about 35 to 40 years old**, athletic build,
> broad shoulders, flat stomach, short dark hair, short neat dark beard, confident friendly face,
> wearing a dark grey baseball cap, a red and dark-blue checked flannel shirt with sleeves rolled up
> to the forearms, a dark olive work vest with pockets, dark work trousers and black rubber boots,
> work gloves tucked in the back pocket, **nothing hanging from the body, no tools, no harness,
> no straps, no machine**.
> **Strict A-pose: both arms straight and fully extended, angled 45 degrees down from the shoulders,
> elbows straight, wrists straight in line with the forearms, hands open and flat, palms facing the
> thighs, fingers straight and together, thumbs slightly apart, perfectly symmetrical left and right,
> legs straight, feet shoulder-width apart pointing forward.** Full body, front view, neutral
> expression, even studio lighting, plain white background, stylized 3D game character

Neden böyle:
- **Yaş:** 35–40 yaş, fit; göbek ve beyaz bıyık yok.
- **A-pose:** Kollar 45° aşağıda. Yapay zekâ görsel üreticileri T-pozda kolları sık bozuyor (bilek
  düşüyor, dirsek kırılıyor). A-pose çok daha temiz çıkıyor, Mixamo da sorunsuz iskelet takıyor.
  Mutlaka T-pose isterseniz "arms straight out horizontally at shoulder height, palms facing down"
  yazın, ama önce A-pose deneyin.
- **Üstünde hiçbir şey olmasın:** askı kayışı, motor, alet yok. Kayış ve tırpan ayrı model olacak,
  gövdeye yapışırsa iskelet bozulur.
- **Görseli kontrol edin:** iki kol simetrik mi, bilekler düz mü, parmaklar birleşik mi, eller
  bacağa değmiyor mu (arada boşluk olmalı)? Değilse görseli yeniden üretin; 3D'ye bozuk görseli vermeyin.
- Yüz basit kalsın, ağız/göz animasyonu yok. Şapka kafaya oturmuş, gövdeyle tek mesh olsun.

Olumsuz prompt (destekleyen araçlarda bunu da ekleyin):

> `old man, elderly, grey hair, white moustache, belly, harness, straps, backpack, tool, machine,
> trimmer, bent elbows, drooping wrists, hands on hips, crossed arms, asymmetrical pose, T-pose with
> bent arms, fingers spread, holding anything`

### 3.2 FPV eller (`eller.glb`), birinci şahıs kamerası için

> Pair of first-person view game hands wearing worn brown leather work gloves, holding a bicycle-style
> handlebar grip in each hand (handlebar not included), with red and dark-blue checked flannel sleeves
> rolled up to mid-forearm, forearms only, cut cleanly below the elbow, stylized

- **İki ayrı obje:** `hand_L` ve `hand_R`. İskelet gerekmez, sabit "kavrama" pozunda.
- Her elin **orijini avuç içindeki tutuş noktası** olsun (gidon borusunun geçeceği yer).
- Kol **-Z yönüne** uzansın (dirseğe doğru), avuç tutuş ekseni X boyunca.
- Oyun her eli gidon tutamağına koyar ve kolu omuza doğru çevirir.

### 3.3 Kral tırpan (`tirpan.glb`)

> A side-mounted petrol brush cutter (string trimmer), two-stroke engine at the back with an orange and
> white plastic housing, translucent fuel tank, red primer bulb, choke lever, black pull-start handle
> on the side, a long straight aluminium drive shaft, a wide bicycle-style handlebar with black rubber
> grips and a throttle trigger on the right grip, a shoulder strap hook ring on the shaft, a gearbox at
> the end with an orange semicircular safety guard and a bump-feed nylon line head with orange line,
> lying straight, side view

Yön ve orijin (önemli):
- Şaft **+Z boyunca** uzansın: motor -Z ucunda, misina kafası +Z ucunda.
- **Orijin = askı kancası** (motorun biraz önü, şaftın üstündeki halka).
- Toplam boy ~1,6 m. Kafa, şaft ekseninde dursun (oyun eğimi kendisi verir).
- Gidon kancanın ~0,4 m önünde, şafta dik.

Parçaları **ayrı obje olarak, şu isimlerle** bırakın (oyun bunları hareket ettirecek):

| Obje adı | Ne | Oyunda |
|---|---|---|
| `Head` | misina kafası (dönen kısım), orijini dönme ekseninde | gazla döner |
| `Guard` | koruma siperi | sabit |
| `Grip_L`, `Grip_R` | gidon tutamakları, orijin tutamağın ortası | eller buraya gelir |
| `Trigger` | gaz tetiği | gaza basınca döner |
| `PrimerBulb` | pompa | basınca küçülür |
| `ChokeLever` | jikle kolu, orijin pivotta | jikle çekilince döner |
| `StartHandle` | çekme ipi tutamağı | ip çekilince uzaklaşır |
| `Exhaust` | egzoz çıkışı (küçük boş obje olabilir) | duman buradan çıkar |

### 3.4 Fındık ocağı (`ocak1.glb`, `ocak2.glb`, `ocak3.glb`)

> A Turkish hazelnut bush (fındık ocağı) as grown in the Black Sea region: one root clump with 8 to 12
> thin, slightly curved grey-brown stems spreading outward like a vase, bare stems up to about 1.2 m,
> then a wide rounded crown of broad serrated green leaves, with a few clusters of green-husked
> hazelnuts hanging under the leaves, total height 3 m, crown width 3 m, a little dry leaf litter on
> the ground at the base

- Orijin kökün tam ortası. Gövdeler köke yakın toplansın: oyunda dipte 0,4 m yarıçapta ot yok.
- **Dallar 1–1,2 m'ye kadar çıplak:** oyuncu dibi görüp etrafını temizleyebilmeli.
- Yapraklar: birkaç yuvarlak "yaprak kümesi" mesh'i **ya da** alpha-clip yaprak kartları (kart sayısı ≤ 150).
- 3 varyant: biri dar ve uzun, biri geniş ve basık, biri genç ve seyrek.

### 3.5 Taş (`tas1.glb`, `tas2.glb`)

> A small weathered grey field stone, rounded with flat bottom, some moss on top, 25 cm wide

- Altı düz. Oyun taşın üçte birini toprağa gömer.

### 3.6 Bidon ve makara (`bidon.glb`)

> A red plastic 5 litre petrol jerrycan with a black spout, next to a spool of orange nylon trimmer
> line and a small old wooden crate, grouped together on the ground

- Orijin grubun ortası, yerde. Oyuncu buraya gelince benzin ve misina dolar.

### 3.7 Karadeniz evi (`ev.glb`)

> A traditional Black Sea Turkish village house: whitewashed stone ground floor, upper floor of dark
> wooden timber frame with infill, small wooden balcony, hipped roof with rusty red corrugated tin,
> small windows with blue frames, a few steps to the door

- Arka planda durur, iç mekân yok. Arka yüz basit olabilir.

### 3.8 Ağaçlar, çay, çit (isteğe bağlı)

- `agac1.glb`: *A tall dark green spruce tree, stylized, layered cone shape, 7 m.*
- `agac2.glb`: *A black alder tree with a rounded crown, stylized, 6 m.*
- `cay.glb`: *A 3 m long row of trimmed Turkish tea bushes, dense rounded hedge, 0.9 m high.*
- `direk.glb`: *An old rough wooden fence post, slightly crooked, 1.2 m.*

---

## 4. İskelet ve animasyon (işçi)

### 4.1 Mixamo ile iskelet

1. Blender'da A-pozdaki işçiyi **FBX** olarak dışa aktarın (Apply Transform açık, ölçek 1).
2. [mixamo.com](https://www.mixamo.com) → **Upload Character** → işaretçiler: çene, bilekler,
   dirsekler, dizler, kasık. **Skeleton LOD: Standard (65)**, parmaklar dahil.
3. Kemik isimleri `mixamorig:` ile başlamalı, **değiştirmeyin**. Oyun bunları arıyor:
   `Hips, Spine, Spine1, Spine2, Neck, Head, LeftArm, LeftForeArm, LeftHand, RightArm, RightForeArm, RightHand`.

### 4.2 İndirilecek animasyonlar

Her birini **"In Place" işaretli**, **30 fps**, **Without Skin** (ilki With Skin) FBX olarak indirin.

| Klip adı (GLB içinde) | Mixamo'da ara | Not |
|---|---|---|
| `Idle` | "Idle" / "Standing Idle" | kollar hafif önde |
| `Walk` | "Walking" | In Place |
| `WalkBack` | "Walking Backwards" | In Place |
| `TurnL`, `TurnR` | "Left Turn" / "Right Turn" | yerinde dönme |
| `Pull` | "Pulling" / "Pull Lever" | ip çekme (çalıştırma) |
| `Bump` | "Hammering" (kısa kırp) | kafayı yere vurma |
| `Wipe` | "Wiping Sweat" / "Tired" | motor hararet yapınca |
| `Victory` | "Victory" / "Cheering" | bahçe bitince |

- Kollar animasyonda ne yaparsa yapsın, oyun **ellerini IK ile tırpanın gidonuna** taşıyacak.
  Gövde ve bacaklar animasyondan gelir. Gövdenin sağa sola dönüşünü de oyun ekler.
- Klip isimleri büyük/küçük harf duyarsız; oyun `walk`, `idle` gibi parçaları arıyor.

### 4.3 Blender'da birleştirme

1. İskeletli modeli (With Skin) içe aktarın. Diğer FBX'leri içe aktarıp her birinin **Action**'ını
   ana iskelete atayın (Action Editor), sonra fazla iskeletleri silin.
2. Her action'a yukarıdaki adı verin ve **Fake User** (F) işaretleyin.
3. Ölçek: Mixamo 0,01 ile gelebilir. İskeleti seçin, ölçeği 1 yapıp **Apply → All Transforms**.

---

## 5. GLB dışa aktarma ayarları (Blender → File → Export → glTF 2.0)

- Format: **glTF Binary (.glb)**
- Include: *Selected Objects* (yalnızca model + iskelet)
- Transform: **+Y Up** açık
- Data → Mesh: *Apply Modifiers* açık, *UVs* açık, *Normals* açık, *Vertex Colors* gerekirse
- Data → Material: *Export*, Images: *Automatic* (JPEG dokular küçük olur)
- Animation (işçi için): **Animation** açık, *Group by NLA Track* kapalı, **Export all actions**
  (veya *Actions* modu), *Always Sample Animations* açık, *Skinning* açık, *Shape Keys* kapalı
- Compression: kapalı (sıkıştırmayı gltf-transform ile yapın)

**Kontrol:** dosyayı [gltf-viewer.donmccurdy.com](https://gltf-viewer.donmccurdy.com) üzerine
sürükleyin. Model ayakta mı, yüzü +Z'ye mi bakıyor, animasyonlar listede mi?

---

## 6. Oyundaki efektler (kodla yapılıyor, model gerekmez)

| Efekt | Nasıl |
|---|---|
| Rüzgârda sallanan ot | GPU shader'ı, öbek başına faz |
| Misina rüzgârı | dönen kafanın yakınındaki otlar dışa yatar |
| Biçilen alan | otun boyu dokuya yazılır; yer açık yeşil anıza döner |
| Ot kırpıntıları | kafadan savrulan yeşil parçacıklar |
| Egzoz dumanı | gaza göre artar; soğuk motorda beyaz, harareti yaklaştıkça koyu |
| Taş kıvılcımı | taşa vurunca turuncu parçacık + kamera sarsıntısı |
| Ocak darbesi | ocak sallanır, yaprak düşer |
| Misina bulanıklığı | yüksek devirde dönen disk, düşük devirde tek tek misina |
| Ocak saydamlaşması | kamerayla oyuncu arasında kalan ocak şeffaflaşır |

İsteğe bağlı olarak ileride sizden şunlar istenebilir (şimdilik gerekmiyor):
- `duman.png` 128×128, beyaz yumuşak duman lekesi (alfa)
- `ot.png` 256×512, tek ot yaprağı (alfa)
- **Gerçek motor kaydı:** WAV 44,1 kHz mono. Ayrı ayrı: rölanti döngüsü (5 sn), tam gaz döngüsü (5 sn),
  ip çekme, öksürme, çalışma, durma. Telefonla, rüzgârsız, 1–2 m mesafeden kaydedin.

---

## 7. Oyuna ekleme

`public/models/models.json`:

```json
{
  "worker": "isci.glb",
  "hands": "eller.glb",
  "trimmer": "tirpan.glb",
  "bush": ["ocak1.glb", "ocak2.glb", "ocak3.glb"],
  "stone": ["tas1.glb", "tas2.glb"],
  "depot": "bidon.glb",
  "house": "ev.glb"
}
```

Listede olmayan her şey geçici modelle kalır. Yüklenemeyen bir dosya oyunu bozmaz.

### Teslim kontrol listesi

- [ ] `.glb`, +Y yukarı, ön yüz +Z, orijin doğru yerde
- [ ] Transformlar uygulanmış (ölçek 1, dönüş 0)
- [ ] Üçgen bütçesi içinde, doku ≤ 1024 (işçi/tırpan ≤ 2048)
- [ ] Tırpanın parça isimleri tablodaki gibi
- [ ] İşçide `mixamorig:` kemikleri ve `Idle`, `Walk` klipleri var
- [ ] glTF viewer'da doğru görünüyor
