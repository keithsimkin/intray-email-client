import { describe, expect, test } from "bun:test";
import { mailSnippet, readablePreview } from "../src/shared/mailSnippet";

describe("mailSnippet", () => {
  test("skips delivery headers and keeps the body", () => {
    const source = [
      "Return-Path: <arianna@lvlup.vc>",
      "Received: from p00-icloudmta by p149-mailgateway",
      "Original-Recipient: rfc822;keithsimkin@buynsell.ug",
      "",
      "You are invited to the flagship masterclass on Wednesday.",
    ].join("\n");
    expect(mailSnippet(source)).toBe(
      "You are invited to the flagship masterclass on Wednesday.",
    );
  });

  test("a header-only slice does not become the preview", () => {
    expect(
      mailSnippet("Return-Path: <a@b.co>\nReceived: from mx\n"),
    ).toBe("");
  });
});

describe("readablePreview", () => {
  test("hides a collapsed header dump", () => {
    expect(
      readablePreview(
        "Return-path: <arianna@lvlup.vc> Original-recipient: rfc822;keithsimkin@buynsell.ug Received: from p00-icloudmta",
      ),
    ).toBe("");
  });

  test("keeps a normal sentence", () => {
    expect(readablePreview("Wednesday at 12:00, same link as last month.")).toBe(
      "Wednesday at 12:00, same link as last month.",
    );
  });
});
