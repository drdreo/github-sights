// Quick script to debug GitHub API repo visibility
// Usage: deno run --allow-net --allow-read --allow-env test.ts
//
// Create a .env file in the root with:
//   GITHUB_TOKEN=ghp_your_token_here

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { Octokit } from "npm:octokit";

const token = Deno.env.get("GITHUB_TOKEN");
if (!token) {
    console.error("Set GITHUB_TOKEN in .env or environment");
    Deno.exit(1);
}

const org = Deno.args[0];
const octokit = new Octokit({ auth: token });

// 1. Check auth
const { data: user } = await octokit.rest.users.getAuthenticated();
const scopeHeader = (await octokit.request("GET /")).headers["x-oauth-scopes"] || "";
console.log(`Authenticated as: ${user.login}`);
console.log(`Scopes: ${scopeHeader}`);

// 2. Check org membership
try {
    const { data: membership } = await octokit.rest.orgs.getMembershipForAuthenticatedUser({ org });
    console.log(`Org membership: role=${membership.role}, state=${membership.state}`);
} catch (e: unknown) {
    console.log(`Org membership check failed: ${(e as Error).message}`);
}

// 3. List repos via REST (same call our app uses)
console.log(`\n--- repos.listForOrg(${org}, type=all) ---`);
const restRepos = await octokit.paginate(octokit.rest.repos.listForOrg, {
    org,
    per_page: 100,
    type: "all"
});
console.log(`Total repos: ${restRepos.length}`);
const forks = restRepos.filter((r) => r.fork);
const priv = restRepos.filter((r) => r.private);
console.log(
    `  Forks: ${forks.length}, Private: ${priv.length}, Public non-fork: ${restRepos.length - forks.length - priv.length}`
);

// 4. Try different type filters
for (const type of ["public", "private", "member", "internal"] as const) {
    try {
        const repos = await octokit.paginate(octokit.rest.repos.listForOrg, {
            org,
            per_page: 100,
            type
        });
        console.log(`  type="${type}": ${repos.length} repos`);
    } catch {
        console.log(`  type="${type}": failed`);
    }
}

// 5. Try a specific repo we know exists
const testRepo = Deno.args[1];
console.log(`\n--- Check specific repo: ${org}/${testRepo} ---`);
try {
    const { data: repo } = await octokit.rest.repos.get({ owner: org, repo: testRepo });
    console.log(`Found: ${repo.full_name} (private=${repo.private}, fork=${repo.fork})`);
} catch (e: unknown) {
    console.log(`Not found or no access: ${(e as Error).message}`);
}

console.log("\nDone.");
