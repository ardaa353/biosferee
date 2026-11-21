# BioSfere tür kataloğu

BioSfere, Catalogue of Life 16 Ekim 2026 Extended Release sınıflandırmasını kullanır. Bu sürümün ChecklistBank kimliği `316691`, DOI’si `10.48580/dgzlf` ve veri lisansı Creative Commons Atıf 4.0’dır. Kaynak gösterimi için Bánki, O., Roskov, Y., Döring, M., ve diğerleri (2026), *Catalogue of Life (2026-10-16 XR)*, Catalogue of Life Foundation, Amsterdam. [Yayın ve katkıda bulunanlar](https://doi.org/10.48580/dgzlf) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

Derleme, 73.743.076 baytlık sabit TextTree arşivini indirir ve SHA-256 özetini denetler. Python 3 standart kütüphanesi arşivden âlem, şube, sınıf, takım, familya, cins ve tür için salt okunur bir SQLite indeksi üretir. Kaynakta yer alan eş adlar kabul edilen ada yönlendirilir. Geçici kabul görmüş ve soyu tükenmiş taksonlar da sürümde yer alır. Dallarda kaynakta eksik kalan basamaklar kullanıcıya boş döner. Fotoğraf modelinin tanıyabildiği sınıflar ayrı bir kümedir. [TextTree arşivi](https://download.checklistbank.org/col/monthly/2026-10-16_xr_txtree.zip)

`db/col-name-details.tsv.gz` aynı sürümün yapılandırılmış CoLDP verisinden türetilmiş küçük bir ektir. Birden fazla kelime içeren alışılmadık bilimsel adların tam yazımını ve CoL'de Türkçe adı bulunan taksonların adlarını korur. Türün Türkçe adı aile ve âlem eşlemesiyle ilişkilendirilir. [CoLDP kaynağı](https://download.checklistbank.org/col/monthly/2026-10-16_xr_coldp.zip)

## Render ve yerel geliştirme

Node.js 24 ve Python 3 ile `node db/prepare-catalog.mjs` çalıştırılır. Hazır indeks `dist/data/col-2026-10-16-xr.sqlite` yolundadır. Uygulama aramaları yerel dosyada yapar. Yeni bir makinedeki ilk derleme için arşiv sunucusuna erişim gerekir. Derleyici, mevcut bir doğrulanmış kopyayı yeniden kullanır. Diskte geçici bir dosyaya yazdığı için yarıda kesilen bir kurulum çalışan indeksin üzerine yazmaz.

| Değişken | İşlev |
| --- | --- |
| `COL_ARCHIVE_PATH` | İndirilmiş resmî TextTree ZIP dosyasını çevrimdışı derlemek için tam yol |
| `COL_CACHE_DIR` | Arşiv ve doğrulanan indeksin derlemeler arasında saklandığı dizin |
| `COL_DATABASE_PATH` | Derleme çıktısı ve çalışan sunucu için isteğe bağlı SQLite yolu |

Geliştirici, Türkçe ad ekini aynı sürümün CoLDP arşivinden `python3 db/catalog.py extract-details COL.zip db/col-name-details.tsv.gz` ile yeniden oluşturabilir. Bu yalnızca veriyi yenilerken gerekir. `catalog.py` iki resmî arşivin de sabit SHA-256 değerlerini içerir.
