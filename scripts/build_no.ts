import { outdent } from "jsr:@cspotcode/outdent@0.8.0";

// This is effectively the version of the Go wrapper
// & allows us to re-release a previously released version
// with a new wrapper by bumping this number.
export const BUILD_NO = 3;

export const BUILD_NO_RELEASE_NOTES = {
  3: outdent`
    Our venv still does not have everything needed to function standalone.
    There is still some sort of environment isolation problem that we need to solve.

    By running the tests in completely isolated github action runners we are
    simulating the real world scenario more closely.
  `,
  2: outdent`
    Use python -m venv --copies so that we don't symlink to the host
    python and embed python with-in the venv as originally intended.

    Yes unfortunately this increases the overall size of our binary but thats ok.
    I'm happy to sacrifice some disk space for reliability & compatibility.
  `,
} as const;
