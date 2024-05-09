## Connmapper

System internet connection visualizer.

[![hydrapp CI](https://github.com/pojntfx/connmapper/actions/workflows/hydrapp.yaml/badge.svg)](https://github.com/pojntfx/connmapper/actions/workflows/hydrapp.yaml)

## Overview

Visualize your system's internet connections on a globe.

## Installation

See [INSTALLATION.html](https://pojntfx.github.io/connmapper//docs/main/INSTALLATION.html).

## Reference

### Command Line Arguments

All arguments passed to the binary will be forwarded to the browser used to display the frontend.

### Environment Variables

| Name                     | Description                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `HYDRAPP_BACKEND_LADDR`  | Listen address for the backend (`localhost:0` by default)                                                   |
| `HYDRAPP_FRONTEND_LADDR` | Listen address for the frontend (`localhost:0` by default)                                                  |
| `HYDRAPP_BROWSER`        | Binary of browser to display the frontend with                                                              |
| `HYDRAPP_TYPE`           | Type of browser to display the frontend with (one of `chromium`, `firefox`, `epiphany`, `lynx` and `dummy`) |
| `HYDRAPP_SELFUPDATE`     | Whether to check for updates on launch (disabled if OS provides an app update mechanism)                    |

## Acknowledgements

- [pojntfx/hydrapp](https://github.com/pojntfx/hydrapp) provides the application framework.

## Contributing

To contribute, please use the [GitHub flow](https://guides.github.com/introduction/flow/) and follow our [Code of Conduct](./CODE_OF_CONDUCT.md).

To build and start a development version of Connmapper locally, run the following:

```shell
$ git clone https://github.com/pojntfx/connmapper.git
$ cd connmapper
$ go generate ./...
$ go install .
# Linux
$ sudo setcap cap_net_raw,cap_net_admin=eip "$(which connmapper)"
$ connmapper
# macOS
$ sudo connmapper
```

To start the backend and open the frontend in a browser instead of an application window during development, run the following:

```shell
$ go install .
# Start the backend in the first terminal
# Linux
$ sudo setcap cap_net_raw,cap_net_admin=eip "$(which connmapper)"
$ HYDRAPP_BACKEND_LADDR=localhost:1337 HYDRAPP_TYPE=dummy connmapper
# macOS
$ sudo HYDRAPP_BACKEND_LADDR=localhost:1337 HYDRAPP_TYPE=dummy connmapper
# Start the frontend in a second terminal
$ cd pkg/frontend
$ npm run dev
# Now open http://localhost:1234 in your browser
```

To build the DEB, RPM, Flatpak, MSI, EXE, DMG, APK, and static binaries for all other platforms, run the following:

```shell
$ hydrapp build
# You can find the built packages in the out/ directory
```

If you only want to build certain packages or for certain architectures, for example to only build the APKs, pass `--exclude` like in the following:

```shell
$ hydrapp build --exclude '(binaries|deb|rpm|flatpak|msi|dmg|docs|tests)'
```

For more information, see the [hydrapp documentation](https://github.com/pojntfx/hydrapp).

## License

Connmapper (c) 2024 Felicitas Pojtinger and contributors

SPDX-License-Identifier: AGPL-3.0-or-later
