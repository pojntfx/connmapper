import {
  Button,
  Flex,
  FlexItem,
  Modal,
  ModalVariant,
  Select,
  SelectOption,
  SelectVariant,
  TextInput,
  Title,
  ToggleGroup,
  ToggleGroupItem,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from "@patternfly/react-core";
import {
  CompressIcon,
  ExpandIcon,
  ListIcon,
  OutlinedClockIcon,
  OutlinedWindowRestoreIcon,
  TableIcon,
  TimesIcon,
} from "@patternfly/react-icons";
import {
  TableComposable,
  Tbody,
  Td,
  Th,
  Thead,
  ThProps,
  Tr,
} from "@patternfly/react-table";
import { bind } from "@pojntfx/dudirekta";
import React, { useCallback, useEffect, useState } from "react";
import ReactGlobeGl from "react-globe.gl";
import NewWindow from "react-new-window";
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
    SetIsSummarized: async (summarized: boolean): Promise<void> => {},
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
    if (!ready) {
      return;
    }

    (async () => {
      const devices = await remote.ListDevices();

      setDevices(devices);
    })();
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
                conn.srcCountryName && conn.srcCityName
                  ? conn.srcCountryName + ", " + conn.srcCityName
                  : conn.srcCountryName || conn.srcCityName || "-"
              }, ${conn.srcLongitude}, ${conn.srcLatitude}) → ${conn.dstIP} (${
                conn.dstCountryName && conn.dstCityName
                  ? conn.dstCountryName + ", " + conn.dstCityName
                  : conn.dstCountryName || conn.dstCityName || "-"
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

      return () => clearInterval(interval);
    }
  }, [tracing]);

  const { width, height } = useWindowSize();

  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isInspectorMinimized, setIsInspectorMinimized] = useState(true);

  const [isSummarized, setIsSummarized] = useState(false);

  useEffect(() => {
    if (!ready) {
      return;
    }

    (async () => {
      await remote.SetIsSummarized(isSummarized);
    })();
  }, [ready, isSummarized]);

  const [searchQuery, setSearchQuery] = useState("");
  const [regexErr, setRegexErr] = useState(false);

  const [inWindow, setInWindow] = useState(false);

  const [modalTransparent, setModalTransparent] = useState(true);

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
            icon={<TableIcon />}
            className="pf-x-button--cta"
            onClick={() => {
              setModalTransparent(false);
              setIsInspectorOpen(true);
            }}
          >
            {" "}
            Inspect Traffic
          </Button>
        )}

        {isInspectorOpen && (
          <InWindowOrModal
            inWindow={inWindow}
            open={isInspectorOpen}
            setOpen={(open) => {
              if (!open) {
                setInWindow(false);
              }

              setIsInspectorOpen(open);
            }}
            setInWindow={(inWindow) => {
              if (!inWindow) {
                setModalTransparent(false);
              }

              setInWindow(inWindow);
            }}
            minimized={isInspectorMinimized}
            modalTransparent={modalTransparent}
            setModalTransparent={setModalTransparent}
            header={
              <Flex
                spaceItems={{ default: "spaceItemsMd" }}
                direction={{ default: "row" }}
                justifyContent={{ default: "justifyContentSpaceBetween" }}
                alignItems={{ default: "alignItemsCenter" }}
              >
                <FlexItem>
                  <Title
                    id="traffic-inspector-title"
                    headingLevel="h1"
                    className={inWindow ? "pf-u-ml-md" : ""}
                  >
                    Traffic Inspector
                  </Title>
                </FlexItem>

                <FlexItem>
                  <Toolbar>
                    <ToolbarContent>
                      <ToolbarItem>
                        <TextInput
                          type="text"
                          aria-label="Filter by regex"
                          placeholder="Filter by regex"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e)}
                          validated={regexErr ? "error" : "default"}
                        />
                      </ToolbarItem>

                      <ToolbarItem>
                        <ToggleGroup aria-label="Select your output mode">
                          <ToggleGroupItem
                            icon={<OutlinedClockIcon />}
                            text="Real-time"
                            isSelected={!isSummarized}
                            onChange={() => setIsSummarized(false)}
                            className="pf-c-toggle-group__item--centered"
                          />

                          <ToggleGroupItem
                            icon={<ListIcon />}
                            text="Summarized"
                            isSelected={isSummarized}
                            onChange={() => setIsSummarized(true)}
                            className="pf-c-toggle-group__item--centered"
                          />
                        </ToggleGroup>
                      </ToolbarItem>

                      <ToolbarItem>
                        {inWindow ? (
                          <>
                            <Button
                              variant="plain"
                              aria-label="Add back to main window"
                              onClick={() => setInWindow(false)}
                            >
                              <OutlinedWindowRestoreIcon />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="plain"
                              aria-label="Open in new window"
                              onClick={() => setInWindow(true)}
                            >
                              <OutlinedWindowRestoreIcon />
                            </Button>

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
                                onClick={() => {
                                  setIsInspectorMinimized(true);
                                  setModalTransparent(false);
                                }}
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
                          </>
                        )}
                      </ToolbarItem>
                    </ToolbarContent>
                  </Toolbar>
                </FlexItem>
              </Flex>
            }
          >
            <RealtimeTrafficTable
              getPackets={remote.GetPackets}
              addLocalLocation={addLocalLocation}
              searchQuery={searchQuery}
              setRegexErr={setRegexErr}
            />
          </InWindowOrModal>
        )}
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

interface ITrafficTableProps {
  getPackets: () => Promise<ITracedConnectionDetails[]>;
  addLocalLocation: (packet: ITracedConnection) => void;
  searchQuery: string;
  setRegexErr: (err: boolean) => void;
}

const RealtimeTrafficTable: React.FC<ITrafficTableProps> = ({
  getPackets,
  addLocalLocation,
  searchQuery,
  setRegexErr,
}) => {
  const [packets, setPackets] = useState<ITracedConnectionDetails[]>([]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const packets = await getPackets();

      setPackets(
        packets.map((p) => {
          addLocalLocation(p);

          return p;
        })
      );
    }, 100);

    return () => clearInterval(interval);
  }, []);

  const [activeSortIndex, setActiveSortIndex] = useState<number | undefined>();
  const [activeSortDirection, setActiveSortDirection] = useState<
    "asc" | "desc" | undefined
  >();

  const sortableKeys = [
    "timestamp",
    "layerType",
    "nextLayerType",
    "length",

    "srcCountryName",

    "dstCountryName",
  ];

  const getSort = useCallback(
    (columnIndex: number): ThProps["sort"] => ({
      columnIndex,
      sortBy: {
        index: activeSortIndex,
        direction: activeSortDirection,
      },
      onSort: (_event, index, direction) => {
        setActiveSortIndex(index);
        setActiveSortDirection(direction);
      },
    }),
    [activeSortDirection, activeSortIndex]
  );

  return (
    <TableComposable
      aria-label="Simple table"
      variant="compact"
      borders={false}
      isStickyHeader
    >
      <Thead noWrap>
        <Tr>
          <Th sort={getSort(0)}>Timestamp</Th>

          <Th sort={getSort(1)}>Layer</Th>
          <Th sort={getSort(2)}>Next Layer</Th>
          <Th sort={getSort(3)}>Length</Th>

          <Th>Src IP</Th>
          <Th sort={getSort(4)}>Src Location</Th>
          <Th>Src Coordinates</Th>

          <Th>Dst IP</Th>
          <Th sort={getSort(5)}>Dst Location</Th>
          <Th>Dst Coordinates</Th>
        </Tr>
      </Thead>
      <Tbody>
        {packets
          .filter((p) => {
            try {
              const rv =
                searchQuery.trim().length <= 0
                  ? true
                  : new RegExp(searchQuery, "gi").test(
                      Object.values(p).join(" ").toLowerCase()
                    );

              setRegexErr(false);

              return rv;
            } catch (e) {
              console.error("Could not process search:", e);

              setRegexErr(true);

              return true;
            }
          })
          .sort((a, b) => {
            if (activeSortIndex === null || activeSortIndex === undefined) {
              return 1;
            }

            const key = sortableKeys[activeSortIndex];

            if (typeof (a as any)[key] === "number") {
              return (
                ((activeSortDirection === "desc" ? (b as any) : (a as any))[
                  key
                ] as number) -
                ((activeSortDirection === "desc" ? (a as any) : (b as any))[
                  key
                ] as number)
              );
            }

            return (activeSortDirection === "desc" ? (b as any) : (a as any))[
              key
            ]
              .toString()
              .localeCompare(
                (activeSortDirection === "desc" ? (a as any) : (b as any))[
                  key
                ].toString()
              );
          })
          .map((packet, i) => (
            <Tr isHoverable key={i}>
              <Td>
                <code>{packet.timestamp}</code>
              </Td>

              <Td>{packet.layerType}</Td>
              <Td>{packet.nextLayerType}</Td>
              <Td>
                <code>{packet.length}</code>
              </Td>

              <Td>
                <code>{packet.srcIP}</code>
              </Td>
              <Td>
                {packet.srcCountryName && packet.srcCityName
                  ? packet.srcCountryName + ", " + packet.srcCityName
                  : packet.srcCountryName || packet.srcCityName || "-"}
              </Td>
              <Td>
                <code>
                  {packet.srcLatitude}, {packet.srcLongitude}
                </code>
              </Td>

              <Td>
                <code>{packet.dstIP}</code>
              </Td>
              <Td>
                {packet.dstCountryName && packet.dstCityName
                  ? packet.dstCountryName + ", " + packet.dstCityName
                  : packet.dstCountryName || packet.dstCityName || "-"}
              </Td>
              <Td>
                <code>
                  {packet.dstLatitude}, {packet.dstLongitude}
                </code>
              </Td>
            </Tr>
          ))}
      </Tbody>
    </TableComposable>
  );
};

interface IInWindowOrModalProps {
  inWindow: boolean;

  open: boolean;
  setOpen: (open: boolean) => void;
  setInWindow: (open: boolean) => void;
  minimized: boolean;
  modalTransparent: boolean;
  setModalTransparent: (modalTransparent: boolean) => void;

  header: React.ReactNode;
  children: React.ReactNode;
}

const InWindowOrModal: React.FC<IInWindowOrModalProps> = ({
  inWindow,

  open,
  setOpen,
  setInWindow,
  minimized,
  modalTransparent,
  setModalTransparent,

  header,
  children,
}) => {
  if (inWindow) {
    return (
      <NewWindow
        title="Connmapper Traffic Inspector"
        features={{
          width: 1280,
          height: 720,
        }}
        onOpen={(e) => {
          // See https://github.com/rmariuzzo/react-new-window/issues/109#issuecomment-1009683557
          const popupTick = setInterval(() => {
            if (e.closed) {
              clearInterval(popupTick);

              setInWindow(false);
            }
          }, 100);
        }}
      >
        {header}
        {children}
      </NewWindow>
    );
  }

  return (
    <Modal
      variant={ModalVariant.large}
      isOpen={open}
      showClose={false}
      onEscapePress={() => {
        setOpen(false);
        setModalTransparent(true);
      }}
      aria-labelledby="traffic-inspector-title"
      header={
        <div
          className="pf-c-modal-box__header pf-u-px-lg pf-u-pt-lg pf-u-pb-0"
          onMouseEnter={() => setModalTransparent(true)}
          onMouseLeave={() => setModalTransparent(false)}
        >
          {header}
        </div>
      }
      className={
        (minimized ? "pf-c-modal-box" : "pf-c-modal-box--fullscreen") +
        (modalTransparent ? "" : " pf-c-modal-box--transparent")
      }
      onMouseEnter={() => setModalTransparent(true)}
      onMouseLeave={() => setModalTransparent(false)}
    >
      {children}
    </Modal>
  );
};

export default App;
