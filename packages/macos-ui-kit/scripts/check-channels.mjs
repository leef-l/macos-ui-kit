// Report whether every distribution channel carries the version in package.json.
//
// The public registry once sat seven versions behind the other three because
// nothing looked. This is the look: one command, one table, non-zero exit when a
// channel disagrees, so a release is finished or it is not.
import {readFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "leef-l/macos-ui-kit";

const run = (command, args) => {
    try {
        // `shell` on Windows: `npm` is a .cmd shim, and execFileSync cannot start
        // one without it — the call came back empty and the channel read as
        // unreachable instead of as behind.
        return execFileSync(command, args, {
            cwd: PKG,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
            shell: process.platform === "win32",
        }).trim();
    } catch {
        return "";
    }
};

const pkg = JSON.parse(await readFile(join(PKG, "package.json"), "utf8"));
const local = pkg.version;

const channels = [
    {
        name: "package.json",
        version: local,
        how: "the version being released",
    },
    {
        name: "GitHub Release",
        version: run("gh", ["release", "list", "--repo", REPO, "--limit", "20", "--json", "tagName", "--jq", ".[].tagName"])
            .split("\n")
            .map((tag) => tag.replace(/^v/, ""))
            .find((v) => /^\d+\.\d+\.\d+/.test(v)) ?? "",
        how: "gh release list",
    },
    {
        name: "GitHub Packages",
        version: run("gh", ["api", `users/leef-l/packages/npm/macos-ui-kit/versions`, "--jq", ".[0].name"]),
        how: "gh api users/…/packages",
    },
    {
        name: "npm (public)",
        version: run("npm", ["view", pkg.name, "version", "--registry=https://registry.npmjs.org"]),
        how: "npm view --registry=npmjs.org",
    },
];

let behind = 0;
console.log(`${pkg.name} — local ${local}\n`);
for (const channel of channels) {
    const state = channel.version === local ? "ok      " : "BEHIND  ";
    if (channel.version !== local) behind++;
    const shown = channel.version || "(unreachable)";
    console.log(`  ${state}${channel.name.padEnd(18)} ${shown.padEnd(10)} ${channel.how}`);
}

if (behind === 0) {
    console.log("\nevery channel carries the released version");
    process.exit(0);
}

console.log(`\n${behind} channel(s) do not carry ${local}.`);
if (channels.find((c) => c.name === "npm (public)")?.version !== local) {
    console.log("public npm needs a token with write access to the package:");
    console.log("  add a repository secret NPM_TOKEN, then run the Publish workflow");
}
process.exit(1);
