import { describe, expect, test } from "bun:test";
import {
  blurEmailsInHtml,
  classifyMail,
  isMarketingAddress,
  sanitizeCreatorBlur,
  shouldBlurAddress,
  shouldBlurName,
  shouldBlurPreview,
  shouldBlurSubject,
  splitEmailParts,
  type CreatorBlurPrefs,
} from "../src/renderer/creatorMode";

const own = new Set(["pranav@gmail.com", "pranav@intray.app"]);

function prefs(
  creatorBlur: CreatorBlurPrefs["creatorBlur"],
  creatorMode = true,
): CreatorBlurPrefs {
  return { creatorMode, creatorBlur };
}

describe("classifyMail", () => {
  test("own addresses win over marketing-looking local parts", () => {
    expect(classifyMail({ email: "pranav@gmail.com" }, own)).toBe("own");
  });

  test("no-reply and newsletter platforms are marketing", () => {
    expect(isMarketingAddress("noreply+alerts@github.com")).toBe(true);
    expect(classifyMail({ email: "news@substack.com" }, own)).toBe("marketing");
    expect(
      classifyMail(
        { email: "hello@brand.com", subject: "20% off this week" },
        own,
      ),
    ).toBe("marketing");
  });

  test("a person writing to you is personal", () => {
    expect(
      classifyMail(
        {
          email: "ava@northwind.io",
          name: "Ava Martin",
          subject: "Thursday review",
        },
        own,
      ),
    ).toBe("personal");
  });
});

describe("creator blur options", () => {
  test("off blurs nothing", () => {
    const off = prefs(["addresses", "names", "subjects"], false);
    expect(shouldBlurAddress(off, "personal")).toBe(false);
    expect(shouldBlurName(off, "marketing")).toBe(false);
    expect(shouldBlurSubject(off, "own")).toBe(false);
  });

  test("all addresses covers every kind, including names", () => {
    const all = prefs(["addresses"]);
    for (const kind of ["personal", "marketing", "own"] as const) {
      expect(shouldBlurAddress(all, kind)).toBe(true);
      expect(shouldBlurName(all, kind)).toBe(true);
      expect(shouldBlurSubject(all, kind)).toBe(false);
    }
  });

  test("personal and marketing can be selected on their own", () => {
    const personal = prefs(["personal"]);
    expect(shouldBlurAddress(personal, "personal")).toBe(true);
    expect(shouldBlurName(personal, "personal")).toBe(true);
    expect(shouldBlurAddress(personal, "marketing")).toBe(false);
    expect(shouldBlurName(personal, "marketing")).toBe(false);
    expect(shouldBlurAddress(personal, "own")).toBe(false);

    const marketing = prefs(["marketing"]);
    expect(shouldBlurAddress(marketing, "marketing")).toBe(true);
    expect(shouldBlurAddress(marketing, "personal")).toBe(false);
  });

  test("subjects and previews follow the address filter", () => {
    const personalSubjects = prefs(["personal", "subjects", "previews"]);
    expect(shouldBlurSubject(personalSubjects, "personal")).toBe(true);
    expect(shouldBlurPreview(personalSubjects, "personal")).toBe(true);
    expect(shouldBlurSubject(personalSubjects, "marketing")).toBe(false);
    expect(shouldBlurPreview(personalSubjects, "marketing")).toBe(false);

    const allSubjects = prefs(["subjects"]);
    expect(shouldBlurSubject(allSubjects, "marketing")).toBe(true);
    expect(shouldBlurPreview(allSubjects, "own")).toBe(false);
  });

  test("names can blur without hiding addresses", () => {
    const names = prefs(["names"]);
    expect(shouldBlurName(names, "personal")).toBe(true);
    expect(shouldBlurAddress(names, "personal")).toBe(false);
  });

  test("saved options drop unknown ids", () => {
    expect(sanitizeCreatorBlur(["personal", "nope", "personal", "subjects"])).toEqual([
      "personal",
      "subjects",
    ]);
    expect(sanitizeCreatorBlur("addresses")).toEqual([]);
  });
});

describe("email masking", () => {
  test("splits addresses out of a sentence", () => {
    expect(splitEmailParts("Write ava@northwind.io today")).toEqual([
      { kind: "text", value: "Write " },
      { kind: "email", value: "ava@northwind.io" },
      { kind: "text", value: " today" },
    ]);
  });

  test("wraps text addresses and leaves tags and style alone", () => {
    const html =
      '<style>.x{content:"a@b.co"}</style><a href="mailto:ava@northwind.io">ava@northwind.io</a>';
    const next = blurEmailsInHtml(html, (email) => email.startsWith("ava@"));
    expect(next).toContain('.x{content:"a@b.co"}');
    expect(next).toContain('href="mailto:ava@northwind.io"');
    expect(next).toContain(
      '<span class="intray-creator-blur">ava@northwind.io</span>',
    );
  });
});
