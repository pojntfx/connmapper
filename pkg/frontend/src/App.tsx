import { bind } from "@pojntfx/dudirekta";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactGlobeGl from "react-globe.gl";
import earthTexture from "three-globe/example/img/earth-night.jpg";
import earthElevation from "three-globe/example/img/earth-topology.png";
import universeTexture from "three-globe/example/img/night-sky.png";
import { useWindowSize } from "usehooks-ts";
import "./main.css";

interface ITracedConnection {
  layerType: string;
  nextLayerType: string;

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

interface IArc {
  id: string;
  name: string;
  coords: number[][];
}

const getTracedConnectionID = (connection: ITracedConnection) =>
  connection.layerType +
  "-" +
  connection.nextLayerType +
  "-" +
  connection.srcIP +
  "-" +
  connection.dstIP +
  "-";

export default () => {
  const [remote, setRemote] = useState({
    ListDevices: async (): Promise<string[]> => [],
    TraceDevice: async (name: string) => {},
    GetConnections: async (): Promise<ITracedConnection[]> => [],
  });

  const [ready, setReady] = useState(false);
  const [currentLocation, setCurrentLocation] =
    useState<GeolocationCoordinates>();

  const addLocalLocation = useCallback(
    (packet: ITracedConnection) => {
      if (!packet.srcLatitude && !packet.srcLongitude && currentLocation) {
        packet.srcLatitude = currentLocation.latitude;
        packet.srcLongitude = currentLocation.longitude;
      }

      if (!packet.dstLatitude && !packet.dstLongitude && currentLocation) {
        packet.dstLatitude = currentLocation.latitude;
        packet.dstLongitude = currentLocation.longitude;
      }
    },
    [currentLocation]
  );

  useEffect(() => {
    (async () => {
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej)
        );

        setCurrentLocation(pos.coords);
      } catch (e) {
        alert((e as Error).message);
      }
    })();

    bind(
      () =>
        new WebSocket(
          new URLSearchParams(window.location.search).get("socketURL") ||
            "ws://localhost:1337"
        ),
      {},
      remote,
      setRemote,
      {
        onOpen: () => setReady(true),
      }
    );
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

  const [arcs, setArcs] = useState<IArc[]>([]);

  useEffect(() => {
    if (tracing) {
      setInterval(async () => {
        setArcs(
          (await remote.GetConnections()).map((conn) => {
            addLocalLocation(conn);

            return {
              id: getTracedConnectionID(conn),
              coords: [
                [conn.srcLongitude, conn.srcLatitude],
                [conn.dstLongitude, conn.dstLatitude],
              ],
              name: `${conn.layerType}/${conn.nextLayerType} ${conn.srcIP} (${
                conn.srcCountryName || "Your country"
              }, ${conn.srcCityName || "your city"}, ${conn.srcLongitude}, ${
                conn.srcLatitude
              }) → ${conn.dstIP} (${conn.dstCountryName || "Your country"}, ${
                conn.dstCityName || "your city"
              }, ${conn.dstLongitude}, ${conn.dstLatitude})`,
            };
          })
        );
      }, 1000);
    }
  }, [tracing]);

  const { width, height } = useWindowSize();

  return (
    <main>
      {ready ? (
        tracing ? (
          <ReactGlobeGl
            arcsData={arcs}
            arcLabel={(d: any) => (d as IArc).name}
            arcStartLng={(d: any) => (d as IArc).coords[0][0]}
            arcStartLat={(d: any) => (d as IArc).coords[0][1]}
            arcEndLng={(d: any) => (d as IArc).coords[1][0]}
            arcEndLat={(d: any) => (d as IArc).coords[1][1]}
            arcDashLength={0.4}
            arcDashGap={0.2}
            arcDashAnimateTime={1000}
            arcsTransitionDuration={100}
            globeImageUrl={earthTexture as string}
            bumpImageUrl={earthElevation as string}
            backgroundImageUrl={universeTexture as string}
            width={width}
            height={height}
          />
        ) : (
          <>
            <h1>Connmapper</h1>

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
                    await remote.TraceDevice(selectedDevice || devices[0]);

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
