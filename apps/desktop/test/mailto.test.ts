import { describe, expect, test } from "bun:test";
import {
  extractMailto,
  findMailtoArg,
  parseMailto,
} from "../src/shared/mailto";

describe("parseMailto", () => {
  test("reads a single address", () => {
    expect(parseMailto("mailto:alice@example.com")).toEqual({
      to: [{ name: "alice@example.com", email: "alice@example.com" }],
      cc: [],
      bcc: [],
      subject: "",
      body: "",
    });
  });

  test("a bare mailto opens a blank message", () => {
    expect(parseMailto("mailto:")).toEqual({
      to: [],
      cc: [],
      bcc: [],
      subject: "",
      body: "",
    });
  });

  test("fills to, cc, bcc, subject, and body", () => {
    const draft = parseMailto(
      "mailto:alice@example.com?cc=bob@example.com&bcc=cara@example.com&subject=Hello%20there&body=Line%0ATwo",
    );
    expect(draft).toEqual({
      to: [{ name: "alice@example.com", email: "alice@example.com" }],
      cc: [{ name: "bob@example.com", email: "bob@example.com" }],
      bcc: [{ name: "cara@example.com", email: "cara@example.com" }],
      subject: "Hello there",
      body: "Line\nTwo",
    });
  });

  test("treats plus as a space in header values and keeps an encoded plus", () => {
    const draft = parseMailto(
      "mailto:alice@example.com?subject=Hello+world&body=1%2B1",
    );
    expect(draft?.subject).toBe("Hello world");
    expect(draft?.body).toBe("1+1");
  });

  test("combines path addresses with to=, and keeps a display name", () => {
    const draft = parseMailto(
      "mailto:Alice%20Smith%3Calice@example.com%3E,bob@example.com?to=cara@example.com",
    );
    expect(draft?.to).toEqual([
      { name: "Alice Smith", email: "alice@example.com" },
      { name: "bob@example.com", email: "bob@example.com" },
      { name: "cara@example.com", email: "cara@example.com" },
    ]);
  });

  test("keeps a comma inside a quoted name", () => {
    const draft = parseMailto(
      'mailto:' + encodeURIComponent('"Alice, Bob" <a@b.co>'),
    );
    expect(draft?.to).toEqual([{ name: "Alice, Bob", email: "a@b.co" }]);
  });

  test("header names are case-insensitive and the first subject wins", () => {
    const draft = parseMailto(
      "mailto:alice@example.com?Subject=First&subject=Second&CC=bob@example.com",
    );
    expect(draft?.subject).toBe("First");
    expect(draft?.cc).toEqual([
      { name: "bob@example.com", email: "bob@example.com" },
    ]);
  });

  test("drops someone already listed on To from Cc and Bcc", () => {
    const draft = parseMailto(
      "mailto:alice@example.com?cc=alice@example.com,bob@example.com&bcc=bob@example.com,cara@example.com",
    );
    expect(draft?.to.map((item) => item.email)).toEqual(["alice@example.com"]);
    expect(draft?.cc.map((item) => item.email)).toEqual(["bob@example.com"]);
    expect(draft?.bcc.map((item) => item.email)).toEqual(["cara@example.com"]);
  });

  test("strips newlines from the subject", () => {
    const draft = parseMailto(
      "mailto:alice@example.com?subject=Hello%0ABcc:%20evil@example.com",
    );
    expect(draft?.subject).toBe("Hello Bcc: evil@example.com");
    expect(draft?.bcc).toEqual([]);
  });

  test("rejects anything that is not a mailto URL", () => {
    expect(parseMailto("https://example.com")).toBeNull();
    expect(parseMailto("javascript:alert(1)")).toBeNull();
    expect(parseMailto("mailto:not-an-email")).toEqual({
      to: [],
      cc: [],
      bcc: [],
      subject: "",
      body: "",
    });
  });
});

describe("findMailtoArg", () => {
  test("finds a quoted mailto among process arguments", () => {
    expect(
      findMailtoArg([
        "C:\\Program Files\\Intray\\Intray.exe",
        "--hidden",
        '"mailto:alice@example.com?subject=Hi"',
      ]),
    ).toBe("mailto:alice@example.com?subject=Hi");
  });

  test("ignores ordinary arguments", () => {
    expect(findMailtoArg(["electron.exe", "out/main/index.js"])).toBeNull();
  });

  test("extractMailto trims and rejects control characters", () => {
    expect(extractMailto("  MAILTO:a@b.co  ")).toBe("MAILTO:a@b.co");
    expect(extractMailto("mailto:a@b.co\nBcc:evil@example.com")).toBeNull();
  });
});
