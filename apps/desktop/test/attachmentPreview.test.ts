import { describe, expect, test } from "bun:test";
import {
  attachmentKind,
  describeAttachment,
  formatByteSize,
  shouldListAttachment,
} from "../src/shared/attachmentPreview";

describe("attachmentKind", () => {
  test("uses the content type when the name is generic", () => {
    expect(attachmentKind("application/pdf", "download")).toBe("pdf");
    expect(attachmentKind("image/png")).toBe("image");
    expect(attachmentKind("text/csv", "numbers.bin")).toBe("text");
    expect(attachmentKind("audio/mpeg")).toBe("audio");
    expect(attachmentKind("video/mp4")).toBe("video");
  });

  test("falls back to the file extension for octet-stream", () => {
    expect(attachmentKind("application/octet-stream", "Receipt-1842.PDF")).toBe(
      "pdf",
    );
    expect(attachmentKind("application/octet-stream", "notes.md")).toBe("text");
    expect(attachmentKind("application/octet-stream", "clip.heic")).toBe(
      "other",
    );
  });

  test("leaves office files and archives for another app", () => {
    expect(
      attachmentKind(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Brief.docx",
      ),
    ).toBe("other");
    expect(attachmentKind("application/zip", "photos.zip")).toBe("other");
  });
});

describe("shouldListAttachment", () => {
  test("lists explicit files and skips inline signature images", () => {
    expect(
      shouldListAttachment({
        filename: "Q4 Roadmap.pdf",
        contentType: "application/pdf",
        disposition: "attachment",
      }),
    ).toBe(true);
    expect(
      shouldListAttachment({
        filename: "logo.png",
        contentType: "image/png",
        disposition: "inline",
        contentId: "<logo@mail>",
        related: true,
      }),
    ).toBe(false);
    expect(
      shouldListAttachment({
        filename: "photo.jpg",
        contentType: "image/jpeg",
        disposition: "attachment",
        contentId: "<photo@mail>",
      }),
    ).toBe(true);
    expect(
      shouldListAttachment({
        contentType: "text/plain",
      }),
    ).toBe(false);
    expect(
      shouldListAttachment({
        filename: "invite.ics",
        contentType: "text/calendar",
        disposition: "inline",
      }),
    ).toBe(true);
  });
});

describe("describeAttachment", () => {
  test("keeps a readable name and fills one in when the part has none", () => {
    expect(
      describeAttachment({
        filename: " Q4\nRoadmap.pdf ",
        contentType: "application/pdf; name=\"Q4.pdf\"",
        index: 0,
      }),
    ).toEqual({
      name: "Q4 Roadmap.pdf",
      contentType: "application/pdf",
      kind: "pdf",
    });
    expect(
      describeAttachment({
        contentType: "application/pdf",
        index: 1,
      }).name,
    ).toBe("Attachment 2.pdf");
  });
});

describe("formatByteSize", () => {
  test("matches the sizes shown on attachment chips", () => {
    expect(formatByteSize(84 * 1024)).toBe("84 KB");
    expect(formatByteSize(2.4 * 1024 * 1024)).toBe("2.4 MB");
    expect(formatByteSize(0)).toBe("0 B");
  });
});
