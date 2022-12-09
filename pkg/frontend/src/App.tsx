import {
  Button,
  Flex,
  FlexItem,
  Modal,
  ModalVariant,
  Select,
  SelectOption,
  SelectVariant,
  Title,
} from "@patternfly/react-core";
import {
  AngleUpIcon,
  CompressIcon,
  ExpandIcon,
  TimesIcon,
} from "@patternfly/react-icons";
import {
  TableComposable,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@patternfly/react-table";
import { bind } from "@pojntfx/dudirekta";
import { useCallback, useEffect, useState } from "react";
import ReactGlobeGl from "react-globe.gl";
import { useWindowSize } from "usehooks-ts";
import earthTexture from "./8k_earth_nightmap.jpg";
import earthElevation from "./8k_earth_normal_map.png";
import universeTexture from "./8k_stars_milky_way.jpg";
import "./main.scss";

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

interface ITracedConnectionDetails extends ITracedConnection {
  timestamp: number;
  length: number;
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
    TraceDevice: async (name: string): Promise<void> => {},
    GetConnections: async (): Promise<ITracedConnection[]> => [],
    GetPackets: async (): Promise<ITracedConnectionDetails[]> => [],
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
      {
        GetEscalationPermission: (restart: boolean) => {
          if (restart) {
            // eslint-disable-next-line no-restricted-globals
            return confirm(
              "Connmapper requires admin privileges to capture packets. We'll ask you to authorize this in the next step, then restart the application."
            );
          }

          // eslint-disable-next-line no-restricted-globals
          return confirm(
            "Connmapper requires admin privileges to capture packets. We'll ask you to authorize this in the next step."
          );
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
    if (ready) {
      (async () => {
        const devices = await remote.ListDevices();

        setDevices(devices);
      })();
    }
  }, [ready]);

  const [deviceSelectorIsOpen, setDeviceSelectorIsOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [tracing, setTracing] = useState(false);

  const [arcs, setArcs] = useState<IArc[]>([]);

  useEffect(() => {
    if (tracing) {
      const interval = setInterval(async () => {
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
                conn.srcCountryName || "Unknown country"
              }, ${conn.srcCityName || "unknown city"}, ${conn.srcLongitude}, ${
                conn.srcLatitude
              }) → ${conn.dstIP} (${
                conn.dstCountryName || "Unknown country"
              }, ${conn.dstCityName || "unknown city"}, ${conn.dstLongitude}, ${
                conn.dstLatitude
              })`,
              coords: [
                [conn.srcLongitude, conn.srcLatitude],
                [conn.dstLongitude, conn.dstLatitude],
              ],
              incoming: conn.srcCountryName ? true : false,
            };
          })
        );
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [tracing]);

  const { width, height } = useWindowSize();

  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isInspectorMinimized, setIsInspectorMinimized] = useState(true);

  return ready ? (
    tracing ? (
      <>
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
          arcColor={(d: any) => ((d as IArc).incoming ? "#A30000" : "#ACE12E")}
          globeImageUrl={earthTexture as string}
          bumpImageUrl={earthElevation as string}
          backgroundImageUrl={universeTexture as string}
          width={width}
          height={height}
        />

        {!isInspectorOpen && (
          <Button
            variant="primary"
            icon={<AngleUpIcon />}
            className="pf-x-button--cta"
            onClick={() => setIsInspectorOpen(true)}
          >
            {" "}
            Inspect Traffic
          </Button>
        )}

        <Modal
          variant={ModalVariant.large}
          isOpen={isInspectorOpen}
          showClose={false}
          onEscapePress={() => setIsInspectorOpen(false)}
          aria-labelledby="traffic-inspector-title"
          header={
            <Flex
              spaceItems={{ default: "spaceItemsMd" }}
              direction={{ default: "row" }}
              justifyContent={{ default: "justifyContentSpaceBetween" }}
              alignItems={{ default: "alignItemsCenter" }}
            >
              <FlexItem>
                <Title id="traffic-inspector-title" headingLevel="h1">
                  Traffic Inspector
                </Title>
              </FlexItem>

              <FlexItem>
                <Flex
                  spaceItems={{ default: "spaceItemsXs" }}
                  direction={{ default: "row" }}
                  justifyContent={{ default: "justifyContentCenter" }}
                  alignItems={{ default: "alignItemsCenter" }}
                >
                  {isInspectorMinimized ? (
                    <Button
                      variant="plain"
                      aria-label="Expand"
                      onClick={() => setIsInspectorMinimized(false)}
                    >
                      <ExpandIcon />
                    </Button>
                  ) : (
                    <Button
                      variant="plain"
                      aria-label="Compress"
                      onClick={() => setIsInspectorMinimized(true)}
                    >
                      <CompressIcon />
                    </Button>
                  )}

                  <Button
                    variant="plain"
                    aria-label="Minimize"
                    onClick={() => setIsInspectorOpen(false)}
                  >
                    <TimesIcon />
                  </Button>
                </Flex>
              </FlexItem>
            </Flex>
          }
          className={
            isInspectorMinimized
              ? "pf-c-modal-box"
              : "pf-c-modal-box--fullscreen"
          }
        >
          <RealtimeTrafficTable
            getPackets={remote.GetPackets}
            addLocalLocation={addLocalLocation}
          />
        </Modal>
      </>
    ) : (
      <Flex
        className="pf-u-p-lg pf-u-h-100"
        spaceItems={{ default: "spaceItemsMd" }}
        direction={{ default: "column" }}
        justifyContent={{ default: "justifyContentCenter" }}
        alignItems={{ default: "alignItemsCenter" }}
      >
        <FlexItem className="pf-x-c-title">
          <Title headingLevel="h1">Connmapper</Title>
        </FlexItem>

        <FlexItem>
          <Flex direction={{ default: "row" }}>
            <FlexItem>
              <Select
                variant={SelectVariant.single}
                isOpen={deviceSelectorIsOpen}
                onToggle={(isOpen) => setDeviceSelectorIsOpen(isOpen)}
                selections={selectedDevice}
                onSelect={(_, selection) => {
                  setSelectedDevice(selection.toString());
                  setDeviceSelectorIsOpen(false);
                }}
              >
                {devices.map((d, i) => (
                  <SelectOption value={d} key={i}>
                    {d}
                  </SelectOption>
                ))}
              </Select>
            </FlexItem>

            <FlexItem>
              <Button
                variant="primary"
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
                Trace device
              </Button>
            </FlexItem>
          </Flex>
        </FlexItem>
      </Flex>
    )
  ) : (
    <span>"Loading ..."</span>
  );
};

interface IRealtimeTrafficTableProps {
  getPackets: () => Promise<ITracedConnectionDetails[]>;
  addLocalLocation: (packet: ITracedConnection) => void;
}

const RealtimeTrafficTable: React.FC<IRealtimeTrafficTableProps> = ({
  getPackets,
  addLocalLocation,
}) => {
  const [realtimePackets, setRealtimePackets] = useState<
    ITracedConnectionDetails[]
  >([]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const packets = await getPackets();

      setRealtimePackets(
        packets.map((p) => {
          addLocalLocation(p);

          return p;
        })
      );
    }, 100);

    return () => clearInterval(interval);
  }, []);

  return (
    <TableComposable
      aria-label="Simple table"
      variant="compact"
      borders={false}
      isStriped
      isStickyHeader
    >
      <Thead noWrap>
        <Tr>
          <Th>Timestamp</Th>

          <Th>Layer</Th>
          <Th>Next Layer</Th>
          <Th>Length</Th>

          <Th>Src IP</Th>
          <Th>Src Location</Th>
          <Th>Src Coordinates</Th>

          <Th>Dst IP</Th>
          <Th>Dst Location</Th>
          <Th>Dst Coordinates</Th>
        </Tr>
      </Thead>
      <Tbody>
        {realtimePackets.map((packet, i) => (
          <Tr isHoverable key={i}>
            <Td>{packet.timestamp}</Td>

            <Td>{packet.layerType}</Td>
            <Td>{packet.nextLayerType}</Td>
            <Td>{packet.length}</Td>

            <Td>{packet.srcIP}</Td>
            <Td>
              {packet.srcCityName || "Unknown city"},{" "}
              {packet.srcCountryName || "unknown country"}
            </Td>
            <Td>
              {packet.srcLatitude}, {packet.srcLongitude}
            </Td>

            <Td>{packet.dstIP}</Td>
            <Td>
              {packet.dstCityName || "Unknown city"},{" "}
              {packet.dstCountryName || "unknown country"}
            </Td>
            <Td>
              {packet.dstLatitude}, {packet.dstLongitude}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </TableComposable>
  );
};

export default App;
