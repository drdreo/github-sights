const RECENT_OWNERS_KEY = "github-sights:recent-owners";

export function getRecentOwners(): string[] {
    try {
        const stored = localStorage.getItem(RECENT_OWNERS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

export function addRecentOwner(owner: string): void {
    const owners = getRecentOwners().filter((o) => o.toLowerCase() !== owner.toLowerCase());
    owners.unshift(owner);
    localStorage.setItem(RECENT_OWNERS_KEY, JSON.stringify(owners.slice(0, 10)));
}
