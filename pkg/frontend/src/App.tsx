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
  const [ready, setReady] = useState(false);

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
      setRemote,
      {
        onOpen: () => setReady(true),
      }
    );
  }, []);

  const [devices, setDevices] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      if (ready) {
        const devices = await remote.ListDevices();

        setDevices(devices);
      }
    })();
  }, [ready]);

  const [tracing, setTracing] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState("");

  return (
    <main>
      <h1>Connmapper</h1>

      {!ready && <div>Loading ...</div>}

      {tracing ? (
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
                } catch (e) {
                  alert((e as Error).message);

                  return;
                }

                setTracing(true);
              })();
            }}
          >
            Trace traffic on device
          </button>
        </>
      )}
    </main>
  );
};
