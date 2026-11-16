import ava from "./avatar-ava.jpg";
import daniel from "./avatar-daniel.jpg";
import jordan from "./avatar-jordan.jpg";
import maya from "./avatar-maya.jpg";
import noah from "./avatar-noah.jpg";
import pranav from "./avatar-pranav.jpg";
import priya from "./avatar-priya.jpg";
import sam from "./avatar-sam.jpg";

/** Demo persona photos keyed by email (lowercase). */
export const personaAvatars: Record<string, string> = {
  "ava@northwind.io": ava,
  "daniel@ledgerly.com": daniel,
  "maya@acme.co": maya,
  "sam@patel.family": sam,
  // Distinct faces per linked mailbox so the account rail is easy to scan.
  "pranav@intray.app": pranav,
  "pranav@gmail.com": jordan,
  "pranav@outlook.com": noah,
  "priya@intray.app": priya,
  "jordan@intray.app": jordan,
  "noah@northwind.io": noah,
  "alex@ledgerly.com": daniel,
};

export function avatarForEmail(email: string): string | undefined {
  return personaAvatars[email.trim().toLowerCase()];
}
