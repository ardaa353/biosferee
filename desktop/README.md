# BioSfere Veri Atölyesi

Fotoğrafları gönderi gruplarına ayırın; türleri tahmin ettirin; sistematiği, açıklamayı ve konumu düzenleyip BioSfere'ye uygun ZIP üretin.

## Kurulum yapmadan webden kullanma

[Admin paneli → Gözlem veri atölyesi](https://biosferee.onrender.com/yonetim?sekme=atolye) aynı işlemleri tarayıcıda yapar: çoklu fotoğraf seçme ve gruplama, bütün grup fotoğraflarından analiz, düzenlenebilir adaylar ve sistematik, açıklama taslağı, haritada konum, mevcut ZIP/RAR verisini açıp düzenleme, fotoğraflı ZIP indirme ve doğrudan siteye ekleme. **Python gerekmez.** Gönderici olarak mevcut kullanıcı veya profil/itibar hesabı olmayan **BioSfere** seçilir.

## Masaüstünde başlatma

Bu klasörü bütün dosyalarıyla indirin. Mac'te `BioSfere-Baslat.command`, Windows'ta `BioSfere-Baslat.bat` dosyasını çalıştırın. Python 3 kurulu olmalıdır. Başlatıcı uyumlu Python 3.12 ortamını ve hafif istemci bağımlılıklarını kurar.

**Varsayılan analiz çevrim içidir; büyük model dosyaları indirilmez.** Ücretli API anahtarı veya token satın alma gerektirmez. Imageomics'in herkese açık Hugging Face servisleri kullanılır. Bunlar paylaşımlı araştırma servisleridir: sıra, kesinti veya sağlayıcı erişim sınırı olabilir. Kesintisiz ve sınırsız erişim garantisi verilmez; sınırlar aşılmaya çalışılmaz. Fotoğrafların EXIF/konum bilgisi çıkarılmış, küçültülmüş kopyaları analiz için bu servislere gönderilir.

Elle kurulum: Python 3.12 ile sanal ortam oluşturun, `pip install -r requirements.txt`, ardından `python biosfere_data_maker.py`. Tkinter Python kurulumunda bulunmalıdır; Linux'ta dağıtımınızın Python/Tk paketini kurun.

## Analiz yöntemleri

- **Çevrim içi BioCLIP 2:** Fotoğrafları [resmî BioCLIP 2 servisine](https://huggingface.co/spaces/imageomics/bioclip-2-demo) gönderir; âlemden türe kadar adaylar döner. Bütün grup fotoğraflarının aday puanları birleştirilir. Model bilgisayarınıza indirilmez.
- **200M+ görselde ara:** [BioCLIP Image Search Lite](https://huggingface.co/spaces/imageomics/bioclip-image-search-lite), büyük TreeOfLife görsel dizininde benzer kareleri arar. En yakın kayıtların sistematik bilgileri bütün grup fotoğrafları üzerinden birleştirilir. Arama sırası puanı teşhis olasılığı değildir. Kaynak bağlantıları analiz metadata içinde korunur; kaynak fotoğraflar sizin gözleminizin fotoğrafı olarak ZIP'e eklenmez.
- **Yerel BioCLIP 2 (isteğe bağlı):** Çevrim dışı analiz isteyenler `pip install -r requirements-local.txt` ile ağır bağımlılıkları kurabilir. Bu modda ilk kullanımda birkaç GB model/vektör indirilir. Yaklaşık 952 bin takson üzerinde eğitilmiş modelin sabit yerel dizininde 867.455 aday vardır. CPU, Apple MPS ve CUDA desteklenir. Bu modun ilk indirmesi yalnızca yerel seçeneği çalıştırınca yapılır.

Model kapsamı bilinen her canlıyı veya mikroskobik düzeyde kesin teşhisi kapsamaz. Sonuçlar düzenlenebilir önerilerdir; puanlar kalibre edilmiş kesinlik yüzdesi değildir.

## Kullanım

1. **Fotoğraf ekle** ile görüntüleri açın. Örneğin 1, 2, 3'ü seçip **Seçileni yeni gönderi yap**, sonra 4 ve 5'i seçip başka gönderi oluşturun. Shift ile aralık seçilir. Yeşil çerçeve seçimi, renkli zemin grubu gösterir. Başka gruba eklenen fotoğraf taşınır.
2. Analiz yöntemini seçip **Analiz et** düğmesine basın. Aynı gruptaki bütün fotoğraflar değerlendirilir. En yüksek puanlı aday doldurulur; beş aday arasından başka tür seçebilirsiniz.
3. Her gönderiyi seçip sistematiği, Türkçe adı, açıklamayı, tarih ve kaynak kullanıcı adını değiştirin. Varsayılan açıklama sistematik önerisinden oluşturulan düzenlenebilir taslaktır. Fotoğrafta görülen özelliklere ilişkin uzun metni kontrol ederek yazın.
4. EXIF GPS varsa koordinat alınır. Yoksa **Haritadan konum seç** ile gerçek gözlem yerini seçin veya enlem/boylam yazın. İl ve yer alanlarını düzenleyin. Koordinatsız gönderi dışarı aktarılmaz. Aynı yerde çekilen gruplarda **Bu konumu tüm gruplara uygula** kullanılabilir.
5. **ZIP dışa aktar** ile `data.json` + `photos/gonderi1.1.webp` gibi eşleşen fotoğraflar oluşur. Orijinalleri ayrıca saklayın; görüntüler en fazla 3840 piksele ve 7,5 MB'ye hazırlanır. Konum JSON'da tutulur.
6. Admin → **Veri aktarımı ve bulut** → ZIP/RAR seç → gönderen kullanıcı veya BioSfere seç → **Veriyi ekle**. Mevcut gözlemlere eklenir. Kaynak kullanıcı adı yalnızca metadata olarak korunur; sitedeki gönderici seçiminiz kullanılır.

**Projeyi kaydet/aç** masaüstü düzenlemelerini JSON olarak saklar; özgün fotoğraf yollarını kullanır. Web atölyesindeki **Taslağı sakla/aç** fotoğraflarla birlikte aynı tarayıcıya kaydeder. Tarayıcı verilerini temizlemeyin; taşınabilir son veriyi ZIP olarak indirin.

## İsteğe bağlı yerel görsel açıklama

Ücretsiz [Ollama](https://ollama.com/) uygulaması açıkken **Açıklama modelini hazırla** düğmesi `qwen3-vl:2b` modelini indirir. Ardından isteğe bağlı yerel açıklama kutusu seçilebilir. Bu ayrı özellik model indirmesi gerektirir; varsayılan çevrim içi tür tahmininde gerekli değildir. Ollama kapalıysa tür önerileri korunur. Web atölyesi sınıflandırma sonucundan açıklama taslağı üretir; tarayıcıdan bilgisayarınızdaki Ollama'ya bağlanmaz.

## Kaynaklar ve lisanslar

- [BioCLIP 2](https://huggingface.co/imageomics/bioclip-2), MIT. İsteğe bağlı yerel ağırlık sürümü `2957b322090f9cb17ae72c71981c7218a28d81e0`.
- [TreeOfLife-200M](https://huggingface.co/datasets/imageomics/TreeOfLife-200M), yerel vektör sürümü `5f2dc493b3dc0e544438a04038ab15faa646b749`.
- [BioCLIP Image Search Lite kaynak kodu](https://github.com/Imageomics/bioclip-image-search-lite), MIT; çevrim içi veri kapsamı ve hizmet koşulları sağlayıcıya bağlıdır.
- [Gradio istemcisi](https://www.gradio.app/guides/getting-started-with-the-python-client), herkese açık API'lerle iletişim kurar; gizli iNaturalist API'leri kullanılmaz.
- İsteğe bağlı [Qwen3-VL 2B](https://ollama.com/library/qwen3-vl:2b), Apache 2.0.

Fotoğraflarınızın ve derlediğiniz verinin paylaşım haklarını siz belirleyin. Ücretsiz erişim lisanssızlık anlamına gelmez.

## Arşiv sözleşmesi

Kökte `data.json`, `photos/` altında gönderi görüntüleri bulunur. JSON `format: "biosfere-dataset"`, `version: 1`, benzersiz `archiveId`, `posts` dizisini içerir. Her gönderide `id`, açıklama, `kingdom/phylum/className/orderName/family/genus/species/commonName`, `city/locality`, sayısal `lat/lng`, ISO tarih, `author` ve `images: ["./photos/gonderi1.1.webp"]` bulunur. Kaynak ve adaylar `metadata.analysis` içindedir. Site şifresiz ZIP ve RAR okur; atölyeler ZIP üretir. Profil fotoğrafları dahil edilmez.
