import { useEffect, useState } from "react";
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
}

export default () => {
  const [remote, setRemote] = useState({
    ListDevices: async (): Promise<string[]> => [],
    ListenOnDevice: async (name: string) => {},
  });

  const [packets, setPackets] = useState<ITracedPacket[]>([]);

  useEffect(() => {
    bind(
      () =>
        new WebSocket(
          new URLSearchParams(window.location.search).get("socketURL") ||
            "ws://localhost:1337"
        ),
      {
        HandleTracedPacket: async (packet: ITracedPacket) => {
          setPackets((oldPackets) => [packet, ...oldPackets].slice(0, 100));
        },
      },
      remote,
      setRemote
    );
  }, []);

  const [devices, setDevices] = useState<string[]>([]);

  return (
    <main>
      <h1>Connmapper</h1>

      {packets.length <= 0 ? (
        <>
          <button
            onClick={async () => {
              const devices = await remote.ListDevices();

              setDevices(devices);
            }}
          >
            List devices
          </button>

          <ul>
            {devices.map((d) => (
              <li>
                <div>{d}</div>

                <div>
                  <button onClick={() => remote.ListenOnDevice(d)}>
                    Listen on device
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <table>
          <caption>System internet traffic</caption>
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
            {packets.map((p) => (
              <tr>
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
      )}
    </main>
  );
};
