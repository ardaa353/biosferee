# BioSfere

BioSfere, canlı gözlemlerini fotoğraflar, konum ve bilimsel sınıflandırmayla paylaşmak için kullanılan bir saha kayıt uygulamasıdır.

## Render

Node.js 24 kullanın. Yerel ve Render Native kurulumunda derleme komutu `npm ci --include=dev && npm run build`, başlatma komutu `npm start` şeklindedir. Docker dağıtımı için depodaki Dockerfile aynı derlemeyi çalıştırır. Uygulama Render’ın verdiği `PORT` değerini kullanır.

Mevcut MySQL bağlantısı `DATABASE_URL` ile ayarlanır. Fotoğraf yüklemelerinde `VITE_CLOUDINARY_CLOUD_NAME` ve `VITE_CLOUDINARY_UPLOAD_PRESET` kullanılır. İstemciye açık olan bu iki değer derleme sırasında okunur. Sunucuda aynı bulut için `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` ve `CLOUDINARY_API_SECRET` değişkenleri fotoğraf silme işlemlerini sağlar. Özel anahtarları Render’ın Environment bölümünde saklayın.

## Fotoğraflar

Gözlem ve profil fotoğrafları cihazda hazırlanıp doğrudan Cloudinary’ye yüklenir. Büyük görüntüler orantılı biçimde küçültülür. Gözlem görsellerinde uzun kenar en çok 3840 piksel, profilde 1024 pikseldir. Tarayıcının doğrudan okuyabildiği formatlara ek olarak HEIC/HEIF ve TIFF için gerektiğinde ek bir çözücü yüklenir. Uyumlu kamera RAW dosyalarında gömülü JPEG önizlemesi kullanılır. Yeniden kodlanması gereken hareketli dosyaların ilk karesi saklanır. Özgün RAW arşivleme ayrı bir işlemdir. Depolama hesabının kotası geçerlidir.

## Tür kataloğu ve fotoğraftan öneri

Catalogue of Life’ın 16 Ekim 2026 XR sürümü 2.504.814 tür düzeyinde kayıt içerir. Render derlemesi sabit sürümün arşivini indirir, SHA-256 özetini doğrular ve yaklaşık 266 MiB boyutunda bir SQLite indeksi üretir. Çalışan uygulama bu yerel indekste bilimsel adları, eş adları ve katalogda bulunan Türkçe adları arar. Bir sonucu seçmek üst basamakları doldurur. Kaynakta bulunmayan basamaklar elle tamamlanabilir. [Katalog ve veri lisansı](db/CATALOGUE.md)

Sekiz görüntü modeli cihazın işlemcisinde bir Web Worker içinde çalışır. Bir genel model gözlemde görülen canlı grubunu belirler. Bitki, kuş, böcek, memeli, sürüngen ve iki yaşamlı, örümceğimsi ve mantar modelleri yalnızca ilgili fotoğraflar için açılır. Modeller sunucudan indirilir ve tarayıcı tarafından önbelleğe alınır. Tanıma için API anahtarı veya tahmin başına ücret yoktur. Model kapsamı katalogdan daha dardır. Güçlü ve katalogdaki bir türle eşleşen tahmin boş formu doldurabilir. Kullanıcının yaptığı düzenlemeler korunur. Konum seçildiğinde, 100 km içinde aynı tür için BioSfere gözlemi varsa adayın yanında görünür. [Model kaynakları ve lisanslar](public/identification/NOTICE.txt)

## Doğrulama

`npm run check` TypeScript denetimini, `npm test` regresyon testlerini çalıştırır. Geliştirme sunucusu `npm run dev` ile açılır. Yerel kataloğu ilk geliştirme oturumundan önce hazırlamak için `npm run prebuild` kullanılabilir.

## Bulut fotoğraf temizliği

Fotoğraf kaldırma, gönderi veya hesap silme, profil fotoğrafını değiştirme ve moderasyonla kaldırma işlemleri Cloudinary temizliği oluşturur. Silinecek dosya aynı MySQL işleminde kalıcı kuyruğa yazılır. Sunucu hemen temizliği başlatır ve başarısız işlemleri yeniden dener. Başka bir gönderi veya profil tarafından kullanılan aynı fotoğraf korunur. Cloudinary'nin silme yanıtı doğrulanır ve CDN geçersizleştirmesi istenir.

Sunucu, `cloud_image_deletions` tablosunu ilk kullanımda otomatik oluşturur. Veritabanı kullanıcısının tablo oluşturma izni ve Render'da doğru `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_CLOUD_NAME` değerleri gerekir. Asıl dosyanın ardından otomatik yedekler de silinir; yalnızca `destroy` çağrısı yapmak Cloudinary yedek depolamasını boşaltmaz. Önceki silmelerden kalan yedekler admin panelinde listelenip dosya seçilerek temizlenebilir. Etkin bir dosya bu yedek temizleme yolu üzerinden silinmez.


## Veri aktarımı ve masaüstü hazırlama

Admin panelindeki **Veri aktarımı ve bulut** sekmesi profil fotoğraflarını dışarıda tutarak `data.json` + `photos/` içeren ZIP indirir. Şifresiz ZIP/RAR içe aktarımı mevcut kayıtlara ekleme yapar. Gönderen mevcut kullanıcılar arasından veya profil/itibar sahibi olmayan **BioSfere** olarak seçilir; kaynak yazar adı yalnızca kaynak metadata içinde korunur. Fotoğraflar dosya adlarıyla JSON kaydına bağlıdır. Yarım kalan aktarım açık sayfada tekrarlandığında tamamlanan kayıtlar yinelenmez; kaydedilmemiş yüklemeler iki saatten sonra temizlenir.

[Python Tkinter Veri Atölyesi](desktop/README.md), fotoğrafları gruplandırır, varsayılan çevrim içi BioCLIP 2 veya isteğe bağlı yerel model ile her gruptaki bütün fotoğraflardan sistematik önerir, düzenlenebilir sonuçlar ve haritadan koordinat seçimi sağlar; aynı ZIP biçimini üretir. Admin panelinden uygulamanın kaynak ZIP'i de indirilebilir. Varsayılan çevrim içi mod büyük model indirmez; ortak servisin erişim koşulları geçerlidir. Yerel modda ilk model indirmesi büyüktür, sonraki analizler bilgisayarda çalışır.

Aktarım tabloları ilk kullanımda oluşturulur ve `posts.author_id` anonim gönderici için nullable yapılır. Sunucunun MySQL `CREATE`/`ALTER` yetkisi ve Cloudinary sunucu anahtarları gerekir. Fotoğraflar admin tarayıcısından imzalı olarak doğrudan Cloudinary'ye gider, Render diski geçici arşiv deposu olarak kullanılmaz. Parolalar, oturumlar, e-posta/telefon ve profil fotoğrafları taşınabilir gözlem arşivine dahil edilmez.


## Web gözlem atölyesi ve indirmesiz çevrim içi analiz

Admin → **Gözlem veri atölyesi** (`/yonetim?sekme=atolye`) üzerinden fotoğraflar çoklu seçilip gönderilere ayrılır; grup başına bütün kareler değerlendirilir; sistematik, açıklama taslağı, tarih ve harita konumu düzenlenir. ZIP/RAR verisi düzenlemek üzere açılabilir. Fotoğraflı ZIP indirilebilir veya mevcut kullanıcılardan biri/BioSfere seçilip doğrudan siteye eklenebilir. Tarayıcı taslağı fotoğraflarla IndexedDB'ye kaydedilebilir. Sekmeler arası geçişte açık atölye korunur.

Varsayılan analiz, resmî Imageomics BioCLIP 2 Hugging Face Space'inin herkese açık Gradio API'sini kullanır; model ağırlıkları kullanıcıya veya Render'a indirilmez. İkinci yöntem BioCLIP Image Search Lite üzerinden 200M+ görsel dizininde benzerlik arar. Bütün grup fotoğraflarının sonuçları birleştirilir; kaynaklar ve puanlar metadata içinde saklanır. Fotoğrafların yalnızca küçültülmüş, EXIF/GPS içermeyen kopyaları çevrim içi sağlayıcıya gönderilir. Hizmetler paylaşımlıdır; sıra, kesinti veya erişim sınırı olabilir. Ücretli API anahtarı yoktur; sınırsız/garantili erişim iddiası yoktur. Hata ve kota sınırlarında kullanıcıya durum gösterilir, aşılmaya çalışılmaz.

Tarayıcı modelleri isteğe bağlı üçüncü yöntemdir; küçük model dosyaları alır ve daha dar tür kapsamına sahiptir. Büyük veri kataloğunda bir adın bulunması, o türün her analiz modeli tarafından görselden tanınabildiği anlamına gelmez. GPS bulunmayan gözlemlerin konumu kullanıcı tarafından seçilir.

Python atölyesi de varsayılan olarak çevrim içi çalışır. Hafif `requirements.txt` model indirmez; ağır yerel model bağımlılıkları yalnızca isteğe bağlı `requirements-local.txt` içindedir. Ayrıntılar [masaüstü kullanım kılavuzunda](desktop/README.md).
