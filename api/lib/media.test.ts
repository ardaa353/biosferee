import { describe, expect, it } from "vitest";
import {
  cloudAssetUrl,
  cloudPublicId,
  cloudResourceType,
  isCloudinaryMediaUrl,
} from "./cloudImages";
import { isVideoFile, isVideoUrl } from "../../contracts/media";
import { videoPoster, videoSource } from "../../src/lib/videoUrls";
describe("Photo and video compatibility", () => {
  it("distinguishes media resources that share a Cloudinary public ID", () => {
    const image = cloudAssetUrl("biosfere/posts/a") + ".jpg";
    const video = cloudAssetUrl("biosfere/posts/a", "video") + ".mp4";
    expect(cloudPublicId(image)).toBe(cloudPublicId(video));
    expect(cloudResourceType(image)).toBe("image");
    expect(cloudResourceType(video)).toBe("video");
    expect(
      isCloudinaryMediaUrl(video.replace("res.cloudinary.com", "example.org")),
    ).toBe(false);
  });
  it("recognizes old images, videos and portable archive files", () => {
    expect(isVideoUrl("./photos/gonderi1.1.mp4")).toBe(true);
    expect(isVideoFile({ name: "IMG_1234.MOV", type: "" })).toBe(true);
    expect(isVideoUrl("https://example.org/old.jpg")).toBe(false);
    const url = "https://res.cloudinary.com/demo/video/upload/v1/clip.mov";
    expect(videoSource(url)).toContain("vc_h264,ac_aac/v1/clip.mp4");
    expect(videoPoster(url)).toContain("so_0,c_limit,w_720,q_auto/v1/clip.jpg");
  });
});
