#!/usr/bin/env -S deno run -qA --ext=ts
import { outdent } from "jsr:@cspotcode/outdent@0.8.0";
import { $ } from "jsr:@david/dax@0.44.1";
import { exists } from "jsr:@std/fs@1.0.20";
import { z } from "jsr:@zod/zod@4.2.0";
import ky from "npm:ky@1.14.1";
import { BUILD_NO, BUILD_NO_RELEASE_NOTES } from "./build_no.ts";

// Double check we actually have something to publish
if (!await exists("./bin/linux-64/az")) {
  console.log("nothing to publish");
  Deno.exit(0);
}

// Move the downloaded artifacts from the build jobs into a structure that we can publish to a github release
await Deno.mkdir(`./dist`);
await Deno.copyFile("./bin/linux-64/az", "./dist/az-linux-64");
await Deno.copyFile("./bin/osx-64/az", "./dist/az-osx-64");
await Deno.copyFile("./bin/osx-arm64/az", "./dist/az-osx-arm64");
await Deno.copyFile("./bin/win-64/az.exe", "./dist/az-win-64.exe");

// Grab the version from one of the compiled binaries
await $`chmod +x ./dist/az-linux-64`;
const version = await $`./dist/az-linux-64 --version`.captureCombined().text().then((_) => {
  const parts = _.split("\n")[0].split(" ");
  return parts[parts.length - 1];
});

// Build the release notes
const upstreamReleaseNotes = await ky.get(
  "https://raw.githubusercontent.com/MicrosoftDocs/azure-docs-cli/refs/heads/main/docs-ref-conceptual/Latest-version/release-notes-azure-cli.md",
).text();
const versionHeader = `Version ${version}`;
const versionIndex = upstreamReleaseNotes.indexOf(versionHeader);
if (versionIndex === -1) throw new Error(`Release notes for version ${version} not found in upstream release notes`);

// Find the start of the version section (after the version header line)
const sectionStart = versionIndex + versionHeader.length;

// Find the next version header to determine where this version's notes end
const nextVersionIndex = upstreamReleaseNotes.indexOf("\n## ", sectionStart + versionHeader.length);

const versionNotes = nextVersionIndex === -1
  ? upstreamReleaseNotes.substring(sectionStart).trim()
  : upstreamReleaseNotes.substring(sectionStart, nextVersionIndex).trim();

// If the build no has incremented, lets show the release notes for that change.
const lastBuildNo = parseInt(
  z.array(z.object({ tagName: z.string() })).parse(await $`gh release list --limit 1 --json tagName`.json())[0].tagName
    .split("+")[1],
);
const buildNoReleaseNotes = BUILD_NO > lastBuildNo
  ? outdent`
    ## Go Wrapper Changes

    ${BUILD_NO_RELEASE_NOTES[BUILD_NO]}

  `
  : "";

const releaseNotes = `${buildNoReleaseNotes}${versionNotes}

_see: <https://github.com/MicrosoftDocs/azure-docs-cli/blob/main/docs-ref-conceptual/Latest-version/release-notes-azure-cli.md>_
`;

// Publish the github release
await $`gh release create ${version}+${BUILD_NO} ./dist/* -F -`.stdinText(releaseNotes);
