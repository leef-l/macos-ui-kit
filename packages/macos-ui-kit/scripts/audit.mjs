// Run the whole audit suite.
//
// Every audit is a standalone script that hosts the preview build itself and
// drives a headless browser over CDP, so the runner's job is only: build the
// preview once, then run each script in order and collect the verdicts. They are
// sequential on purpose — each one spawns its own Chrome on its own debugging
// port, and running them together would make a failure hard to attribute.
import {spawn} from "node:child_process";
import {readdir, access} from "node:fs/promises";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(PKG, "..", "..");
const FRONTEND = join(REPO, "frontend");
const PREVIEW = join(FRONTEND, "dist-preview");

const run = (command, args, cwd) =>
    new Promise((resolve) => {
        const child = spawn(command, args, {cwd, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32"});
        let out = "";
        child.stdout.on("data", (chunk) => { out += chunk.toString(); });
        child.stderr.on("data", (chunk) => { out += chunk.toString(); });
        child.on("close", (code) => resolve({code, out}));
    });

const exists = async (path) => {
    try { await access(path); return true; } catch { return false; }
};

// The kit's `dist` is what the frontend type-checks and bundles against, so a
// stale build would audit the previous release.
console.log("audit: building the kit");
const kit = await run("npm", ["run", "build"], PKG);
if (kit.code !== 0) {
    console.error(kit.out);
    process.exit(1);
}

console.log("audit: building the preview");
const preview = await run("npx", ["vite", "build", "--config", "vite.preview.config.ts"], FRONTEND);
if (preview.code !== 0) {
    console.error(preview.out);
    process.exit(1);
}
if (!(await exists(PREVIEW))) {
    console.error(`audit: ${PREVIEW} was not produced by the preview build`);
    process.exit(1);
}

const dir = join(PKG, "audit");
const scripts = (await readdir(dir)).filter((name) => name.endsWith(".mjs")).sort();

const results = [];
for (const script of scripts) {
    process.stdout.write(`\n=== ${script}\n`);
    const started = Date.now();
    // cwd inside `audit/`: the scripts write their screenshots next to themselves,
    // so a run leaves nothing in the package root.
    const result = await run(process.execPath, [join(dir, script)], dir);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    // Two verdict formats, because the older audits print "N/M assertions OK"
    // (N passed out of M run) and the newer ones "N passed, M failed". Both are
    // read here rather than rewriting a script that already reports correctly.
    const pair = result.out.match(/(\d+) passed, (\d+) failed/);
    // Three shapes: "N/M assertions OK" (N passed out of M run, so failures are the
    // difference), "N assertions passed, M failed" (M is already the failure count)
    // and "N passed, M failed". Conflating the first two is how a green run
    // reported "-13 failed".
    const ratio = result.out.match(/(\d+)\/(\d+) assertions OK/);
    const counted = result.out.match(/(\d+) assertions passed,\s*(\d+) failed/);
    const failures = result.out.split("\n").filter((line) => /^(FAIL |check FAIL)/.test(line));
    let pass = 0;
    let fail = failures.length;
    if (pair) {
        pass = Number(pair[1]);
        fail = Number(pair[2]);
    } else if (ratio) {
        pass = Number(ratio[1]);
        fail = Number(ratio[2]) - Number(ratio[1]);
    } else if (counted) {
        pass = Number(counted[1]);
        fail = Number(counted[2]);
    }
    console.log(result.out.trimEnd());
    results.push({script, ok: result.code === 0, pass, fail, seconds, failures});
}

const totalPass = results.reduce((sum, r) => sum + r.pass, 0);
const totalFail = results.reduce((sum, r) => sum + r.fail, 0);

console.log("\n=== summary");
for (const r of results) {
    const state = r.ok ? "ok  " : "FAIL";
    console.log(`${state} ${r.script.padEnd(26)} ${String(r.pass).padStart(3)} passed  ${String(r.fail).padStart(2)} failed  ${r.seconds}s`);
}
console.log(`\n${results.length} audits, ${totalPass} assertions passed, ${totalFail} failed`);

if (totalFail > 0) {
    console.log("\nfailures:");
    for (const r of results) {
        for (const line of r.failures) console.log(`  ${r.script}: ${line}`);
    }
}

process.exit(totalFail > 0 || results.some((r) => !r.ok) ? 1 : 0);
