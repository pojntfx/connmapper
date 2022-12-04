import { useEffect, useRef, useState } from "react";
import { bind } from "@pojntfx/dudirekta";

interface ITracedPacket {
  layerType: string;
  nextLayerType: string;
  length: number;

  srcIP: string;
  srcCountryName: string;
  srcCityName: string;
  srcLongitude: number;
  srcLatitude: number;

  dstIP: string;
  dstCountryName: string;
  dstCityName: string;
  dstLongitude: number;
  dstLatitude: number;

  firstSeen: number;
  lastSeen: number;
}

enum SortingType {
  FIRST_SEEN = 1,
  LAST_SEEN = 2,
  LAYER_TYPE = 3,
  NEXT_LAYER_TYPE = 4,
  LENGTH = 5,
  SRC_COUNTRY = 6,
  DST_COUNTRY = 7,
}

export default () => {
  const [remote, setRemote] = useState({
    ListDevices: async (): Promise<string[]> => [],
    ListenOnDevice: async (name: string) => {},
  });

  const [packets, setPackets] = useState<ITracedPacket[]>([]);
  const [knownHosts, setKnownHosts] = useState<ITracedPacket[]>([]);
  const [ready, setReady] = useState(false);
  const currentLocation = useRef<GeolocationCoordinates>();

  useEffect(() => {
    bind(
      () =>
        new WebSocket(
          new URLSearchParams(window.location.search).get("socketURL") ||
            "ws://localhost:1337"
        ),
      {
        HandleTracedPacket: async (newPackets: ITracedPacket[]) => {
          newPackets.forEach((newPacket) => {
            setPackets((oldPackets) => {
              if (
                !newPacket.srcLatitude &&
                !newPacket.srcLongitude &&
                currentLocation.current
              ) {
                newPacket.srcLatitude = currentLocation.current.latitude;
                newPacket.srcLongitude = currentLocation.current.longitude;
              }

              return [newPacket, ...oldPackets].slice(
                0,
                systemInternetTrafficLimit.current
              );
            });

            setKnownHosts((oldPackets) => {
              if (
                !newPacket.srcLatitude &&
                !newPacket.srcLongitude &&
                currentLocation.current
              ) {
                newPacket.srcLatitude = currentLocation.current.latitude;
                newPacket.srcLongitude = currentLocation.current.longitude;
              }

              const knownHostIndex = oldPackets.findIndex(
                (oldPacket) =>
                  oldPacket.layerType == newPacket.layerType &&
                  oldPacket.nextLayerType == newPacket.nextLayerType &&
                  oldPacket.srcIP == newPacket.srcIP &&
                  oldPacket.dstIP == newPacket.dstIP
              );

              if (knownHostIndex === -1) {
                return [
                  {
                    ...newPacket,
                    firstSeen: newPacket.firstSeen,
                    lastSeen: newPacket.lastSeen,
                  },
                  ...oldPackets,
                ];
              }

              return oldPackets.map((oldPacket, i) => {
                if (i === knownHostIndex) {
                  return {
                    ...oldPacket,
                    length: oldPacket.length + newPacket.length,
                    lastSeen: newPacket.lastSeen,
                  };
                }

                return oldPacket;
              });
            });
          });
        },
      },
      remote,
      setRemote,
      {
        onOpen: () => setReady(true),
      }
    );

    (async () => {
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej)
        );

        currentLocation.current = pos.coords;
      } catch (e) {
        alert((e as Error).message);
      }
    })();
  }, []);

  const [devices, setDevices] = useState<string[]>([]);

  useEffect(() => {
    if (ready) {
      (async () => {
        const devices = await remote.ListDevices();

        setDevices(devices);
      })();
    }
  }, [ready]);

  const [selectedDevice, setSelectedDevice] = useState("");
  const [tracing, setTracing] = useState(false);

  const [sortingType, setSortingType] = useState<SortingType>(
    SortingType.FIRST_SEEN
  );

  const [knownHostsLimit, setKnownHostsLimit] = useState(50);
  const systemInternetTrafficLimit = useRef(50);

  return (
    <main>
      <h1>Connmapper</h1>

      {ready ? (
        tracing ? (
          <>
            <section id="system-internet-traffic">
              <a href="#system-internet-traffic">
                <h2>System Internet Traffic</h2>
              </a>

              <label htmlFor="systems-internet-traffic-limit">Limit</label>
              <input
                name="systems-internet-traffic-limit"
                id="systems-internet-traffic-limit"
                type="number"
                value={systemInternetTrafficLimit.current}
                onChange={(e) =>
                  (systemInternetTrafficLimit.current = parseInt(
                    e.target.value
                  ))
                }
              />

              <table>
                <thead>
                  <tr>
                    <th>Layer Type</th>
                    <th>Next Layer Type</th>
                    <th>Length</th>

                    <th>Source IP</th>
                    <th>Source country</th>
                    <th>Source city</th>
                    <th>Source longitude</th>
                    <th>Source latitude</th>

                    <th>Destination IP</th>
                    <th>Destination country</th>
                    <th>Destination city</th>
                    <th>Destination longitude</th>
                    <th>Destination latitude</th>
                  </tr>
                </thead>
                <tbody>
                  {packets.map((p, i) => (
                    <tr key={i}>
                      <td>{p.layerType}</td>
                      <td>{p.nextLayerType}</td>
                      <td>{p.length}</td>

                      <td>{p.srcIP}</td>
                      <td>{p.srcCountryName}</td>
                      <td>{p.srcCityName}</td>
                      <td>{p.srcLongitude}</td>
                      <td>{p.srcLatitude}</td>

                      <td>{p.dstIP}</td>
                      <td>{p.dstCountryName}</td>
                      <td>{p.dstCityName}</td>
                      <td>{p.dstLongitude}</td>
                      <td>{p.dstLatitude}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section id="unique-hosts">
              <a href="#unique-hosts">
                <h2>Unique Hosts</h2>
              </a>

              <label htmlFor="unique-hosts-limit">Limit</label>
              <input
                name="unique-hosts-limit"
                id="unique-hosts-limit"
                type="number"
                value={knownHostsLimit}
                onChange={(e) => setKnownHostsLimit(parseInt(e.target.value))}
              />

              <table>
                <thead>
                  <tr>
                    <th>
                      First seen <br />
                      <button
                        onClick={() => setSortingType(SortingType.FIRST_SEEN)}
                      >
                        Sort
                      </button>
                    </th>
                    <th>
                      Last seen <br />
                      <button
                        onClick={() => setSortingType(SortingType.LAST_SEEN)}
                      >
                        Sort
                      </button>
                    </th>

                    <th>
                      Layer Type <br />
                      <button
                        onClick={() => setSortingType(SortingType.LAYER_TYPE)}
                      >
                        Sort
                      </button>
                    </th>
                    <th>
                      Next Layer Type <br />
                      <button
                        onClick={() =>
                          setSortingType(SortingType.NEXT_LAYER_TYPE)
                        }
                      >
                        Sort
                      </button>
                    </th>
                    <th>
                      Length <br />
                      <button
                        onClick={() => setSortingType(SortingType.LENGTH)}
                      >
                        Sort
                      </button>
                    </th>

                    <th>Source IP</th>
                    <th>
                      Source country <br />
                      <button
                        onClick={() => setSortingType(SortingType.SRC_COUNTRY)}
                      >
                        Sort
                      </button>
                    </th>
                    <th>Source city</th>
                    <th>Source longitude</th>
                    <th>Source latitude</th>

                    <th>Destination IP</th>
                    <th>
                      Destination country
                      <br />
                      <button
                        onClick={() => setSortingType(SortingType.DST_COUNTRY)}
                      >
                        Sort
                      </button>
                    </th>
                    <th>Destination city</th>
                    <th>Destination longitude</th>
                    <th>Destination latitude</th>
                  </tr>
                </thead>
                <tbody>
                  {knownHosts
                    .sort((a, b) => {
                      switch (sortingType) {
                        case SortingType.LAST_SEEN:
                          return b.lastSeen - a.lastSeen;
                        case SortingType.LAYER_TYPE:
                          return b.layerType.localeCompare(a.layerType);
                        case SortingType.NEXT_LAYER_TYPE:
                          return b.nextLayerType.localeCompare(a.nextLayerType);
                        case SortingType.LENGTH:
                          return b.length - a.length;
                        case SortingType.SRC_COUNTRY:
                          return b.srcCountryName.localeCompare(
                            a.srcCountryName
                          );
                        case SortingType.DST_COUNTRY:
                          return b.dstCountryName.localeCompare(
                            a.dstCountryName
                          );
                        default:
                          return b.firstSeen - a.firstSeen;
                      }
                    })
                    .slice(0, knownHostsLimit)
                    .map((p, i) => (
                      <tr key={i}>
                        <td>{new Date(p.firstSeen).toLocaleTimeString()}</td>
                        <td>{new Date(p.lastSeen).toLocaleTimeString()}</td>

                        <td>{p.layerType}</td>
                        <td>{p.nextLayerType}</td>
                        <td>{p.length}</td>

                        <td>{p.srcIP}</td>
                        <td>{p.srcCountryName}</td>
                        <td>{p.srcCityName}</td>
                        <td>{p.srcLongitude}</td>
                        <td>{p.srcLatitude}</td>

                        <td>{p.dstIP}</td>
                        <td>{p.dstCountryName}</td>
                        <td>{p.dstCityName}</td>
                        <td>{p.dstLongitude}</td>
                        <td>{p.dstLatitude}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </section>
          </>
        ) : (
          <>
            <select onChange={(e) => setSelectedDevice(e.target.value)}>
              {devices.map((d, i) => (
                <option value={d} key={i}>
                  {d}
                </option>
              ))}
            </select>

            <button
              onClick={() => {
                (async () => {
                  try {
                    await remote.ListenOnDevice(selectedDevice || devices[0]);

                    setTracing(true);
                  } catch (e) {
                    alert((e as Error).message);
                  }
                })();
              }}
            >
              Trace traffic on device
            </button>
          </>
        )
      ) : (
        "Loading ..."
      )}
    </main>
  );
};
