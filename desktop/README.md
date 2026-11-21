# BioSfere Veri Atölyesi

Fotoğrafları gönderi gruplarına ayıran, **bilgisayarda** tür önerisi üreten ve BioSfere'nin admin paneline aktarılabilecek ZIP hazırlayan Tkinter uygulaması.

## Başlatma

Bu `desktop` klasörünü bütün dosyalarıyla indirin. Python 3 kurulu olmalı. Mac'te `BioSfere-Baslat.command`, Windows'ta `BioSfere-Baslat.bat` dosyasını çalıştırın. Başlatıcı, uyumlu Python 3.12 ortamını ve bağımlılıkları klasörün içine kurar. Mac dosya çalıştırma izni istemiyorsa Terminal'de `zsh BioSfere-Baslat.command` kullanılabilir.

Elle kurulum: Python **3.12** ile `python -m venv .venv`, ortamı etkinleştirin, `pip install -r requirements.txt`, ardından `python biosfere_data_maker.py`. Tkinter Python kurulumunda bulunmalıdır. Linux'ta dağıtımınızın Python/Tk paketini kurun.

İlk analizde birkaç GB model ve takson vektörü indirilir. İnternet ve yeterli disk alanı gerekir. Sonraki analizler yereldir; ücretli servis, API anahtarı, token veya sorgu kotası kullanılmaz. CPU, uyumlu NVIDIA CUDA ve Apple MPS desteklenir; donanıma göre analiz uzun sürebilir. `.cache` klasörünü koruyun. Yeterli bellek yoksa diğer ağır uygulamaları kapatın. Gelişmiş kurulumda `BIOSFERE_CACHE_DIR` ile önbellek konumu seçilebilir.

## Kullanım

1. **Fotoğraf ekle** ile görüntüleri açın. Örneğin 1, 2, 3'ü tıklayıp **Seçileni yeni gönderi yap** deyin. Sonra 4, 5'i başka bir gönderi yapın. Shift ile aralık seçebilirsiniz. Yeşil çerçeve seçimi, renkli zemin gönderi grubunu gösterir. Bir fotoğraf bir gruba aittir; başka gruba eklerseniz taşınır.
2. **Analiz et** her grubun **bütün fotoğraflarını** birlikte değerlendirir. Aynı gruba aynı canlıya ait kareleri koyun. En yüksek puanlı tür önerilir; beş adaydan birini de seçebilirsiniz. Âlemden türe kadar alanlar doldurulur. Puan, kalibre edilmiş kesinlik yüzdesi değildir. Tür tayini öneridir, özellikle benzer türlerde doğrulama gerekir.
3. Sağdan gönderiyi seçin; sistematiği, Türkçe adı, açıklamayı, tarih ve kaynak kullanıcı adını düzenleyin. Kaynak kullanıcı adı sitedeki gönderici hesabı olarak kullanılmaz.
4. Fotoğrafta EXIF GPS varsa enlem/boylam doldurulur. GPS yoksa **Haritadan konum seç** ile sağ tıklayıp gerçek gözlem yerini işaretleyin veya koordinatları yazın. İl ve yer bilgisini düzenleyin. **Bu konumu tüm gruplara uygula**, yalnızca aynı yerde çekilmiş gözlemler için kullanılır. Koordinatı eksik kayıt dışarı aktarılmaz; uygulama konum uydurmaz. Harita OpenStreetMap döşemeleri için internet kullanır.
5. **ZIP dışa aktar** `data.json` ve `photos/gonderi1.1.webp` gibi dosyaları üretir. Görüntüler yönleri düzeltilerek en fazla 3840 piksele ve 7,5 MB'ye hazırlanır; görüntü içindeki GPS kaldırılır, konum JSON'da kalır. Orijinal fotoğrafları ayrıca saklayın.
6. BioSfere → Admin → **Veri aktarımı ve bulut** → ZIP/RAR seç → **Kimin adına kaydedilsin?** listesinden kullanıcı veya BioSfere → **Veriyi ekle**. Mevcut gönderiler silinmez. BioSfere bir kullanıcı hesabı oluşturmaz; profil ve itibar puanı yoktur.

**Projeyi kaydet/aç** düzenlemeleri ve grupları JSON olarak saklar; özgün fotoğraf yollarını kullanır. Fotoğrafları taşımayın. Proje dosyası siteye aktarılan ZIP'ten farklıdır.

## İsteğe bağlı görsel açıklama

Sınıflandırıcı varsayılan olarak düzenlenebilir bir tür önerisi açıklaması hazırlar. Fotoğrafta görülen özelliklerden daha ayrıntılı Türkçe metin üretmek için ücretsiz, yerel [Ollama](https://ollama.com/) uygulamasını açın. **Açıklama modelini hazırla** düğmesi `qwen3-vl:2b` modelini indirir; sonra **Yerel yapay zekâyla açıklama** kutusunu işaretleyin. Bu model de bilgisayarda çalışır; görseller ücretli bir API'ye gönderilmez. Sınıflandırıcı bellekten çıkarıldıktan sonra açıklama aşaması başlar. Metni yayımlamadan önce kontrol edin. Ollama kapalıysa tür önerileri korunur.

## Model, kapsam ve lisanslar

- [BioCLIP 2](https://huggingface.co/imageomics/bioclip-2), MIT, sabit sürüm `2957b322090f9cb17ae72c71981c7218a28d81e0`.
- [TreeOfLife-200M takson vektörleri](https://huggingface.co/datasets/imageomics/TreeOfLife-200M/tree/main/embeddings), sabit sürüm `5f2dc493b3dc0e544438a04038ab15faa646b749`. Eğitim kapsamı yaklaşık **952 bin taksondur**; bu sabit sürümün yayımlanmış sınıflandırma dizininde **867.455 takson adayı** bulunur. bitki, hayvan, mantar ve başka gruplar. Bilinen her canlı türünü veya mikroskobik düzeyde kesin teşhisi kapsadığı iddia edilmez. Veri kümesinin özgün görselleri indirilmez; yayımlanan adlar/vektörler kullanılır. Kaynakların lisans koşulları geçerlidir; ücretsiz olmak lisanssız olmak anlamına gelmez.
- Ön işleme [resmî pybioclip](https://github.com/Imageomics/pybioclip) tam kare 224×224 akışına dayanır. Bütün grup görüntülerinin normalize vektörleri ortalanıp bütün yayımlanmış takson vektörleriyle karşılaştırılır. Vektörler bellek eşlemeli okunur; metin kodlayıcısı tutulmaz.
- İsteğe bağlı [Qwen3-VL 2B](https://ollama.com/library/qwen3-vl:2b), Apache 2.0.
- Görsel dosyaları ve oluşturduğunuz verinin paylaşım haklarını siz belirleyin; modeller kaynak fotoğrafların haklarını değiştirmez.

## Arşiv sözleşmesi

Kökte `data.json`, `photos/` altında gönderi görüntüleri bulunur. JSON: `format: "biosfere-dataset"`, `version: 1`, benzersiz `archiveId`, `posts` dizisi. Her gönderi benzersiz `id`, açıklama, `kingdom/phylum/className/orderName/family/genus/species/commonName`, `city/locality`, sayısal `lat/lng`, ISO tarih, `author`, `images: ["./photos/gonderi1.1.webp"]` alanlarını içerir. Model kaynağı ve adaylar `metadata.analysis` içindedir. Site bu biçimi ZIP ve şifresiz RAR olarak okuyabilir. Program ZIP üretir.

Sunucuda MySQL şema güncelleme yetkisi ve Cloudinary `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` (veya `CLOUDINARY_URL`) gerekir. Anahtarlar ZIP'e, kaynak koda veya masaüstü uygulamasına konmaz. Silinen asıl dosya ve otomatik yedekleri kalıcı kuyrukla temizlenir; Cloudinary kota/yetki hatalarında tekrar denenir. Önceki silmelerden kalan yedekler admin panelindeki temizleme düğmesiyle kuyruğa alınabilir.
