## Connmapper

![Logo](./docs/logo-readme.png)

System internet connection visualizer.

[![hydrapp CI](https://github.com/pojntfx/connmapper/actions/workflows/hydrapp.yaml/badge.svg)](https://github.com/pojntfx/connmapper/actions/workflows/hydrapp.yaml)
![Go Version](https://img.shields.io/badge/go%21version-%3E=1.19-61CFDD.svg)
[![Go Reference](https://pkg.go.dev/badge/github.com/pojntfx/connmapper.svg)](https://pkg.go.dev/github.com/pojntfx/connmapper)
[![Matrix](https://img.shields.io/matrix/connmapper:matrix.org)](https://matrix.to/#/#connmapper:matrix.org?via=matrix.org)

## Overview

![A screenshot of the globe on a system with lots of internet connections](./docs/globe.png)

Connmapper is an app to visualize your system's internet connections on a globe.

It enables you to ...

- **Do real-time analysis**: Thanks to `libpcap`, Connmapper can get your system's packets in near real-time, and display their properties such as protocols, packet lengths or peer addresses.
- **Get visual insights**: By looking up the source and destination IPs for each connection in a local copy of the [MaxMind GeoIP2 database](https://www.maxmind.com/en/geoip2-databases), Connmapper can get the source and destination coordinates of every packet in your system and plot them on a globe.
- **Explore historical data**: Thanks to its integrated CSV export feature, Connmapper can also be used to aggregate connection data and analyze it externally.

## Installation

See [INSTALLATION.html](https://pojntfx.github.io/connmapper//docs/stable/INSTALLATION.html).

## Usage

### 1. Setting Up the Database

Upon first launching Connmapper, it will ask you to enter your free license key for the GeoIP2 database. After entering it, it will download the database for you:

![A screenshot of the license key/DB download screen](./docs/db-download.png)

### 2. Selecting Your Capture Device

Once the database has been set up, you can choose your preferred capture device, which is the device you want to analyze packets from. On the first launch, it might ask you to temporarily give it admin privileges so that it can give itself permission to capture from network devices:

![A screenshot of the capture device selection dialog](./docs/permissions.png)

### 3. Getting Real-Time Insights

Once you've started tracing the device, a globe showing all the currently active connections on your system should appear. If you hover over one, you can get additional information:

![A screenshot of the globe on a system with lots of internet connections while hovering over one of them](./docs/globe-info.png)

By opening the traffic inspector through the inspect traffic button on the bottom right, you can get more detailed information:

![A screenshot of the traffic inspector in full screen mode](./docs/traffic-inspector.png)

Note that you can also minimize the traffic inspector or open it in a new window by clicking on the respective controls in the headerbar.

### 4. Exporting Historical Data

So far we've only looked at real-time data. To analyze historic data, you can select the summarized view in the traffic inspector. It is also possible to sort individual columns in the table, which for example allows you to find the host that you've sent the most data too:

![A screenshot of the traffic inspector in summarized mode](./docs/traffic-inspector-summarized.png)

Here you can also download the collected data as a CSV file for further analysis:

![A screenshot of LibreOffice writer displaying the captured data](./docs/csv.png)

🚀 **That's it!** We hope you enjoy using Connmapper.

## Reference

### Settings

You can open the settings through the settings button in the top right; here you can configure many aspects of the application such as cache sizes or polling intervals:

![A screenshot of the settings dialog](./docs/settings.png)

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
- [google/gopacket](https://github.com/google/gopacket) provides the library that the packets are being parsed with.
- [oschwald/geoip2-golang](https://github.com/oschwald/geoip2-golang) provides the library for reading the GeoIP2 database.

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

Note that you can also set `HYDRAPP_BACKEND_LADDR` to a fixed value, `HYDRAPP_TYPE` to `dummy` and serve the frontend yourself to develop in your browser of choice directly.

Have any questions or need help? Chat with us [on Matrix](https://matrix.to/#/#connmapper:matrix.org?via=matrix.org)!

## License

Connmapper (c) 2023 Felicitas Pojtinger and contributors

SPDX-License-Identifier: AGPL-3.0-or-later
