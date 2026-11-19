import { describe, expect, test } from "bun:test";
import { imapUidSet } from "../src/main/providers/imap/uidSet";

describe("imapUidSet", () => {
  test("collapses consecutive UIDs into ranges", () => {
    expect(imapUidSet([1, 2, 3, 7, 9, 10])).toBe("1:3,7,9:10");
  });

  test("sorts and dedupes without touching single UIDs", () => {
    expect(imapUidSet([10, 2, 2, 4])).toBe("2,4,10");
  });

  test("ignores unusable values", () => {
    expect(imapUidSet([])).toBe("");
    expect(imapUidSet([0, -1, Number.NaN])).toBe("");
    expect(imapUidSet([5])).toBe("5");
  });
});
