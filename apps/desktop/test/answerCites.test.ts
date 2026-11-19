import { describe, expect, test } from "bun:test";
import { mailCites } from "../src/renderer/answerCites";

const arianna = "icloud-454a5afa:1:7963";
const other = "icloud-454a5afa:1:100";

describe("mailCites", () => {
  test("drops the id line and keeps the message you can open", () => {
    const answer = [
      "Yes. The closest match is from **Arianna Kleynburg**:",
      "",
      "**Subject:** Re: lvup premier sign up",
      "",
      `**ID:** [${arianna}]`,
      "",
      "That's the only Arianna email in this list about LvlUp Premier.",
    ].join("\n");
    const cited = mailCites(answer, [other, arianna]);
    expect(cited.ids).toEqual([arianna]);
    expect(cited.text).not.toContain(arianna);
    expect(cited.text).not.toMatch(/ID/i);
    expect(cited.text).toContain("Arianna Kleynburg");
    expect(cited.text).toContain("Re: lvup premier sign up");
  });

  test("keeps ids in the order they were named", () => {
    const cited = mailCites(
      `First [${other}], then [${arianna}].`,
      [arianna, other],
    );
    expect(cited.ids).toEqual([other, arianna]);
    expect(cited.text).toBe("First, then.");
  });

  test("does not treat a shorter id as a second cite inside a longer one", () => {
    const cited = mailCites(`See [${arianna}]`, [arianna, "icloud-454a5afa"]);
    expect(cited.ids).toEqual([arianna]);
  });

  test("leaves an answer with no known id unchanged", () => {
    const answer = "Nothing in this view matches.";
    expect(mailCites(answer, [arianna])).toEqual({ text: answer, ids: [] });
  });
});
