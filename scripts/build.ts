#!/usr/bin/env -S deno run -qA --ext=ts
import { $ } from "jsr:@david/dax@0.44.1";
import { zip } from "jsr:@deno-library/compress@0.5.6";
import { crypto } from "jsr:@std/crypto@1.0.5";
import { encodeHex } from "jsr:@std/encoding@1.0.10";
import { emptyDir } from "jsr:@std/fs@1.0.20";
import { dirname, join } from "jsr:@std/path@1.1.3";
import { z } from "jsr:@zod/zod@4.2.0";
import ky from "npm:ky@1.14.1";
import { BUILD_NO } from "./build_no.ts";

// Grab the python version
// Need it for finding system libs
const pythonVersion = (await $`python -V`.text()).split(" ")[1].trim();
const shortPythonVersion = pythonVersion.split(".").slice(0, 2).join(".");

// Compare the latest version from pypi with the latest tag of this repo
const latestVersion = z.object({ info: z.object({ version: z.string() }) }).parse(
  await ky.get(`https://pypi.org/pypi/azure-cli/json`).json(),
).info.version;

console.log(`latest version: ${latestVersion}`);

const latestTags = z.array(z.object({ tagName: z.string() })).parse(await $`gh release list --json tagName`.json());
if (latestTags.find((_) => _.tagName === `${latestVersion}+${BUILD_NO}`)) {
  console.log(`nothing to do, ${latestVersion} is already published`);
  Deno.exit(0);
}

// Cleanup the previous build artifacts if any
const venvPath = join(import.meta.dirname!, "../src/venv");
console.log(`cleaning previous build artifacts...`);
await emptyDir(venvPath);

const exeSuffix = Deno.build.os === "windows" ? ".exe" : "";
const binPath = join(import.meta.dirname!, "../bin/az" + exeSuffix);
await emptyDir(dirname(binPath));

const tarballPath = join(import.meta.dirname!, "../src/venv.tar.gz");
try {
  await Deno.remove(tarballPath);
} catch {
  // swallow error when file does not exist
}

const zipFilePath = join(import.meta.dirname!, "../src/venv.zip");
try {
  await Deno.remove(zipFilePath);
} catch {
  // swallow error when file does not exist
}

if (Deno.build.os === "windows") {
  // Just download the pre-built windows venv direct from the source
  const zipUrl =
    `https://github.com/Azure/azure-cli/releases/download/azure-cli-${latestVersion}/azure-cli-${latestVersion}-x64.zip`;
  console.log(`downloading ${zipUrl}`);
  const response = await ky.get(zipUrl);
  if (!response.ok) throw new Error(`failed to download windows venv`);
  const zipFile = await Deno.open(zipFilePath, { create: true, write: true });
  await response.body!.pipeTo(zipFile.writable);
  console.log("extracting zip file...");
  await zip.uncompress(zipFilePath, venvPath);
} else {
  // Create the venv
  console.log(`creating new venv`);
  await $`python -m venv --copies ${venvPath}`;

  const pipPath = join(venvPath, "bin", "pip");

  console.log(`updating pip`);
  await $`${pipPath} install -U pip setuptools`;

  console.log(`installing azure-cli`);
  await $`${pipPath} install -U ${`azure-cli==${latestVersion}`}`;

  //if (Deno.build.os === "darwin") {
  //  await $`brew install tree`;
  //}

  //console.log("VENV TREE");
  //await $`tree ${venvPath}`;

  //console.log("PIXI TREE");
  //await $`tree ${join(import.meta.dirname!, `../.pixi/envs/default`)}`;

  console.log(`copying system libs into venv`);
  const systemPythonLibs = join(import.meta.dirname!, `../.pixi/envs/default/lib/python${shortPythonVersion}`);
  await $`sh -c ${`cp -r ${`${systemPythonLibs}/.`} ${`${venvPath}/lib/python${shortPythonVersion}/`}`}`;
}

// Create the venv tarball
console.log(`compressing venv to ${tarballPath}`);
await $`tar -czf ${tarballPath} -C ${venvPath} .`;

const tarballHash = encodeHex(await crypto.subtle.digest("SHA-256", await Deno.readFile(tarballPath)));
console.log(`tarball hash: ${tarballHash}`);

// Build the go wrapper
const goMainPath = join(import.meta.dirname!, "../src/main.go");
let goSrc = await Deno.readTextFile(goMainPath);
goSrc = goSrc.replace(/var venvTarballSha256 = ".*?"/, `var venvTarballSha256 = "${tarballHash}"`);
await Deno.writeTextFile(goMainPath, goSrc);
await $`go build -o ${binPath} ${goMainPath}`.env("CGO_ENABLED", "0");
