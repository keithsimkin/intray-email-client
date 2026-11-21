export type LicenseStatus = {
  email: string;
  plan: "lifetime";
  issuedAt: number;
};

export type LicenseActivateResult =
  | { ok: true; license: LicenseStatus }
  | { ok: false; error: string };
