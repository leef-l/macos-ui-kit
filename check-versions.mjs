/**
 * Fail the release if the READMEs advertise a version other than the one in
 * package.json.
 *
 * This exists because it happened: 0.4.1 was published before the install URLs
 * were updated, so the tarball's README told readers to download the 0.4.0
 * release. Every install path in the document was wrong, and npm versions are
 * immutable, so the only fix was another version.
 *
 * The check runs in `prepublishOnly`, before the build, so a release that would
 * ship stale documentation stops instead of going out.
 */
import {readFile} from "node:fs/promises";
import {join} from "node:path";

const ROOT = join(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
const version = manifest.version;

const files = ["README.md", "README.zh-CN.md"];
const problems = [];

for (const name of files) {
    let text;
    try {
        text = await readFile(join(ROOT, name), "utf8");
    } catch {
        continue; // A missing translation is not this check's business.
    }

    // Every release URL and every bare version tag in the document.
    const refs = new Set();
    for (const match of text.matchAll(/releases\/download\/v(\d+\.\d+\.\d+)\//g)) {
        refs.add(match[1]);
    }
    for (const match of text.matchAll(/@leef-l\/macos-ui-kit@(\d+\.\d+\.\d+)/g)) {
        refs.add(match[1]);
    }

    for (const ref of refs) {
        if (ref !== version) {
            problems.push(`${name}: references ${ref}, package.json says ${version}`);
        }
    }
}

if (problems.length > 0) {
    console.error("check-versions: the documentation is out of step with the release:");
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error(`  update the install URLs to ${version}, then publish.`);
    process.exit(1);
}

console.log(`check-versions: ${files.length} document(s) agree on ${version}`);
