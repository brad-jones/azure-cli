import { $ } from "jsr:@david/dax@0.44.1";

const exeSuffix = Deno.build.os === "windows" ? ".exe" : "";

Deno.test("version some test", async () => {
  await $`./bin/az${exeSuffix} --version`;
});

Deno.test("help smoke test", async () => {
  await $`./bin/az${exeSuffix} --help`;
});
