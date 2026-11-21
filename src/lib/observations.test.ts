import { describe, expect, it } from "vitest";
import { confident, rankPhotos, broadGroup } from "./identification";
import { contain } from "./photos";
import { photoUrl } from "./photoUrls";
describe("Fotoğraf ve taksonomi", () => {
  it("portre, panorama ve küçük görüntülerin en boy oranını korur", () => {
    expect(contain(6000, 3000, 3840)).toEqual([3840, 1920]);
    expect(contain(2500, 5000, 3840)).toEqual([1920, 3840]);
    expect(contain(80, 64, 3840)).toEqual([80, 64]);
  });
  it("eski görsel adreslerini ve imzalı bağlantıları korur", () => {
    const outside = "https://example.org/file.jpg";
    const signed = "https://res.cloudinary.com/demo/image/upload/s--x--/v1/a.jpg";
    expect(photoUrl(outside, 720)).toBe(outside);
    expect(photoUrl(signed, 720)).toBe(signed);
    expect(photoUrl("https://res.cloudinary.com/demo/image/upload/v1/a.jpg", 720)).toContain("c_limit,w_720,f_auto,q_auto");
  });
  it("çelişkili fotoğraflardan otomatik tür seçmez", () => {
    const first = { name: "Ara macao", score: 0.96, group: "bird" as const };
    const other = { name: "Pica pica", score: 0.96, group: "bird" as const };
    expect(confident(rankPhotos([[first], [other]]))).toBe(false);
    expect(confident(rankPhotos([[first], [first]]))).toBe(true);
    expect(confident(rankPhotos([[], []]))).toBe(false);
  });
  it("bir fotoğrafta aynı adın farklı modellerden gelmesini iki oy olarak saymaz", () => {
    const bird = { name: "Ara macao", score: 0.6, group: "bird" as const };
    expect(rankPhotos([[bird, bird]])[0].score).toBe(0.6);
    expect(broadGroup(88)).toBe("bird");
    expect(broadGroup(324)).toBe("insect");
    expect(broadGroup(992)).toBe("fungus");
  });
});
