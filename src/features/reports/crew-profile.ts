const PROFILE_KEY = "planit-crew-profile";

export function readCrewProfile(): { teamId?: string; author?: string } {
  try {
    const value = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "{}");
    return {
      teamId: typeof value?.teamId === "string" ? value.teamId : undefined,
      author: typeof value?.author === "string" ? value.author : undefined,
    };
  } catch {
    return {};
  }
}

export function saveCrewProfile(teamId: string, author: string) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ teamId, author }));
}
