import { bind } from "@pojntfx/dudirekta";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactGlobeGl from "react-globe.gl";
import earthTexture from "./8k_earth_nightmap.jpg";
import earthElevation from "./8k_earth_normal_map.png";
import universeTexture from "./8k_stars_milky_way.jpg";
import { useWindowSize } from "usehooks-ts";
import "./main.css";
import { Title } from "@patternfly/react-core";

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
  label: string;
  coords: number[][];
  incoming: boolean;
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

const App = () => {
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
        const conns = await remote.GetConnections();

        setArcs((oldArcs) =>
          conns.map((conn) => {
            const oldArc = oldArcs.find(
              (arc) => arc.id === getTracedConnectionID(conn)
            );

            if (oldArc) {
              return oldArc;
            }

            addLocalLocation(conn);

            return {
              id: getTracedConnectionID(conn),
              label: `${conn.layerType}/${conn.nextLayerType} ${conn.srcIP} (${
                conn.srcCountryName || "Your country"
              }, ${conn.srcCityName || "unknown city"}, ${conn.srcLongitude}, ${
                conn.srcLatitude
              }) → ${conn.dstIP} (${conn.dstCountryName || "Your country"}, ${
                conn.dstCityName || "unknown city"
              }, ${conn.dstLongitude}, ${conn.dstLatitude})`,
              coords: [
                [conn.srcLongitude, conn.srcLatitude],
                [conn.dstLongitude, conn.dstLatitude],
              ],
              incoming: conn.srcCountryName ? true : false,
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
            arcLabel={(d: any) => (d as IArc).label}
            arcStartLng={(d: any) => (d as IArc).coords[0][0]}
            arcStartLat={(d: any) => (d as IArc).coords[0][1]}
            arcEndLng={(d: any) => (d as IArc).coords[1][0]}
            arcEndLat={(d: any) => (d as IArc).coords[1][1]}
            arcDashLength={0.05}
            arcDashGap={0.1}
            arcDashAnimateTime={10000}
            arcsTransitionDuration={500}
            arcStroke={() => 0.25}
            arcColor={(d: any) =>
              (d as IArc).incoming ? "#A30000" : "#ACE12E"
            }
            globeImageUrl={earthTexture as string}
            bumpImageUrl={earthElevation as string}
            backgroundImageUrl={universeTexture as string}
            width={width}
            height={height}
          />
        ) : (
          <>
            <Title headingLevel="h1">Connmapper</Title>

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

export default App;
