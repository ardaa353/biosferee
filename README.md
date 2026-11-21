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
