import { outdent } from "jsr:@cspotcode/outdent@0.8.0";

// This is effectively the version of the Go wrapper
// & allows us to re-release a previously released version
// with a new wrapper by bumping this number.
export const BUILD_NO = 2;

export const BUILD_NO_RELEASE_NOTES = {
  2: outdent`
    Use python -m venv --copies so that we don't symlink to the host
    python and embed python with-in the venv as originally intended.

    Yes unfortunately this increases the overall size of our binary but thats ok.
    I'm happy to sacrifice some disk space for reliability & compatibility.
  `,
} as const;
