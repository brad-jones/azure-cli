# azure-cli

_NB: No affiliation with Microsoft, use at own risk._

**What:** This project produces a fairly simple Go wrapper that when executed
extracts an embedded Python venv containing the Azure CLI and then executes it.

**Why:** Because installing python CLI apps, especially the Azure CLI can be painful.

- <https://github.com/Azure/azure-cli/issues/23397>
- <https://github.com/Azure/azure-cli/issues/16526>
- <https://github.com/Azure/azure-cli/issues/7387>
- <https://github.com/Azure/azure-cli/pull/16115>

**How:**

- Github actions runs daily and checks if a new version of Azure CLI has been published to <https://pypi.org/project/azure-cli/>
- For Linux & MacOS we create a brand new venv, then use pip to install azure-cli.
- For Windows we just download the pre-built venv from <https://github.com/Azure/azure-cli/releases>
- Then the venv is put into a tarball and embedded into a simple wrapper program written in Go.
- Upon first execution, the Go wrapper will extract the embedded tarball to your OS's temp directory.
- Then it simply executes the python azure cli module.

## Installation

Download the appropriate binary for your OS from <https://github.com/brad-jones/azure-cli/releases>.

Rename it to `az` and place it on your `PATH`.

### Pixi / Conda

This is also published as a conda package to <https://prefix.dev/channels/brads-forge/packages/azure-cli>.

- Add my channel `pixi workspace channel add https://prefix.dev/brads-forge`
- Then Install with `pixi add azure-cli`

_see: <https://pixi.sh/>_\
_also: <https://prefix.dev/>_
