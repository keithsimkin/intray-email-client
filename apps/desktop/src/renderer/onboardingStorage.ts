const KEY = "intray.onboarding.v1";

export type OnboardingRecord = {
  version: 1;
  completed: boolean;
  completedAt?: string;
  skippedAccount?: boolean;
};

export function loadOnboarding(): OnboardingRecord {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { version: 1, completed: false };
    const parsed = JSON.parse(raw) as Partial<OnboardingRecord>;
    return {
      version: 1,
      completed: Boolean(parsed.completed),
      completedAt: parsed.completedAt,
      skippedAccount: parsed.skippedAccount,
    };
  } catch {
    return { version: 1, completed: false };
  }
}

export function isOnboardingComplete(): boolean {
  return loadOnboarding().completed;
}

export function completeOnboarding(opts?: {
  skippedAccount?: boolean;
}): OnboardingRecord {
  const next: OnboardingRecord = {
    version: 1,
    completed: true,
    completedAt: new Date().toISOString(),
    skippedAccount: opts?.skippedAccount,
  };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
