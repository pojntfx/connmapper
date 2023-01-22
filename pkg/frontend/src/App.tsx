import {
  Alert,
  AlertActionCloseButton,
  AlertGroup,
  Button,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  Modal,
  ModalVariant,
  Select,
  SelectOption,
  SelectVariant,
  Spinner,
  Text,
  TextContent,
  TextInput,
  TextVariants,
  Title,
  ToggleGroup,
  ToggleGroupItem,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from "@patternfly/react-core";
import {
  CogIcon,
  CompressIcon,
  DownloadIcon,
  ExpandIcon,
  ListIcon,
  OutlinedClockIcon,
  OutlinedWindowRestoreIcon,
  RedoIcon,
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
import Papa from "papaparse";
import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactGlobeGl from "react-globe.gl";
import NewWindow from "react-new-window";
import { useWindowSize } from "usehooks-ts";
import earthTexture from "./8k_earth_nightmap.jpg";
import earthElevation from "./8k_earth_normal_map.png";
import universeTexture from "./8k_stars_milky_way.jpg";
import logoDark from "./logo-dark.png";
import "./main.scss";

const MAX_PACKET_CACHE_KEY = "latensee.maxPacketCache";
const MAX_CONNECTIONS_CACHE_KEY = "latensee.maxConnectionsCache";
const DB_PATH_KEY = "latensee.dbPath";
const DB_DOWNLOAD_URL_KEY = "latensee.dbDownloadUrl";
const CONNECTIONS_INTERVAL_KEY = "latensee.connectionsInterval";
const PACKETS_INTERVAL_KEY = "latensee.packetsInterval";

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
    OpenExternalLink: async (url: string): Promise<void> => {},
    CheckDatabase: async (): Promise<boolean> => false,
    DownloadDatabase: async (licenseKey: string): Promise<void> => {},
    ListDevices: async (): Promise<string[]> => [],
    TraceDevice: async (name: string): Promise<void> => {},
    GetConnections: async (): Promise<ITracedConnection[]> => [],
    GetPackets: async (): Promise<ITracedConnectionDetails[]> => [],
    SetIsSummarized: async (summarized: boolean): Promise<void> => {},
    SetMaxPacketCache: async (packetCache: number): Promise<void> => {},
    GetMaxPacketCache: async (): Promise<number> => 0,
    SetMaxConnectionsCache: async (
      maxConnectionsCache: number
    ): Promise<void> => {},
    GetMaxConnectionsCache: async (): Promise<number> => 0,
    SetDBPath: async (dbPath: string): Promise<void> => {},
    GetDBPath: async (): Promise<string> => "",
    SetDBDownloadURL: async (dbDownloadURL: string): Promise<void> => {},
    GetDBDownloadURL: async (): Promise<string> => "",
    RestartApp: async (fixPermissions: boolean): Promise<void> => {},
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
  const [dbPath, setDbPath] = useState("");
  const [maxConnectionsCache, setMaxConnectionsCache] = useState(0);
  const [maxPacketCache, setMaxPacketCache] = useState(0);
  const [dbDownloadURL, setDBDownloadURL] = useState("");
  const [isDBDownloadRequired, setIsDBDownloadRequired] = useState(false);

  const connectionsInterval = useRef(
    parseInt(localStorage.getItem(CONNECTIONS_INTERVAL_KEY) || "1000")
  );
  const packetsInterval = useRef(
    parseInt(localStorage.getItem(PACKETS_INTERVAL_KEY) || "100")
  );

  useEffect(() => {
    if (!ready) {
      return;
    }

    (async () => {
      // Rehydrate from localStorage
      setMaxPacketCache(
        parseInt(localStorage.getItem(MAX_PACKET_CACHE_KEY) || "0")
      );

      setMaxConnectionsCache(
        parseInt(localStorage.getItem(MAX_CONNECTIONS_CACHE_KEY) || "0")
      );

      setDbPath(localStorage.getItem(DB_PATH_KEY) || "");

      setDBDownloadURL(localStorage.getItem(DB_DOWNLOAD_URL_KEY) || "");

      // Rehydrate from server and fetch devices
      const [
        newDevices,
        newDBPath,
        newMaxConnectionsCache,
        newMaxPacketCache,
        newDBDownloadURL,
        newIsDBDownloadRequired,
      ] = await Promise.all([
        remote.ListDevices(),
        remote.GetDBPath(),
        remote.GetMaxConnectionsCache(),
        remote.GetMaxPacketCache(),
        remote.GetDBDownloadURL(),
        remote.CheckDatabase(),
      ]);

      setDevices(newDevices);

      // Set local values from server if they aren't set yet
      if ((localStorage.getItem(DB_PATH_KEY) || "").trim().length <= 0) {
        setDbPath(newDBPath);
      }

      if (
        parseInt(localStorage.getItem(MAX_CONNECTIONS_CACHE_KEY) || "0") <= 0
      ) {
        setMaxConnectionsCache(newMaxConnectionsCache);
      }

      if (parseInt(localStorage.getItem(MAX_PACKET_CACHE_KEY) || "0") <= 0) {
        setMaxPacketCache(newMaxPacketCache);
      }

      if (
        (localStorage.getItem(DB_DOWNLOAD_URL_KEY) || "").trim().length <= 0
      ) {
        setDBDownloadURL(newDBDownloadURL);
      }

      setIsDBDownloadRequired(newIsDBDownloadRequired);
    })();
  }, [ready]);

  useEffect(() => {
    if (!ready || maxPacketCache <= 0) {
      return;
    }

    localStorage.setItem(MAX_PACKET_CACHE_KEY, maxPacketCache.toString());

    (async () => {
      await remote.SetMaxPacketCache(maxPacketCache);
    })();
  }, [ready, maxPacketCache]);

  useEffect(() => {
    if (!ready || maxConnectionsCache <= 0) {
      return;
    }

    localStorage.setItem(
      MAX_CONNECTIONS_CACHE_KEY,
      maxConnectionsCache.toString()
    );

    (async () => {
      await remote.SetMaxConnectionsCache(maxConnectionsCache);
    })();
  }, [ready, maxConnectionsCache]);

  useEffect(() => {
    if (!ready || dbPath.trim().length <= 0) {
      return;
    }

    localStorage.setItem(DB_PATH_KEY, dbPath);

    (async () => {
      await remote.SetDBPath(dbPath);
    })();
  }, [ready, dbPath]);

  useEffect(() => {
    if (!ready || dbDownloadURL.trim().length <= 0) {
      return;
    }

    localStorage.setItem(DB_DOWNLOAD_URL_KEY, dbDownloadURL);

    (async () => {
      await remote.SetDBDownloadURL(dbDownloadURL);
    })();
  }, [ready, dbDownloadURL]);

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
      }, connectionsInterval.current);

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

  const [isInspectorTransparent, setIsInspectorTransparent] = useState(true);

  const [filteredPackets, setFilteredPackets] = useState<
    ITracedConnectionDetails[]
  >([]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSettingsTransparent, setIsSettingsTransparent] = useState(true);

  const [showRestartWarning, setShowRestartWarning] = useState(false);
  const [showReloadWarning, setShowReloadWarning] = useState(false);

  const [licenseKey, setLicenseKey] = useState("");
  const [dbIsDownloading, setDBIsDownloading] = useState(false);

  const handleExternalLink = useCallback(
    (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
      e.preventDefault();

      (async () => {
        try {
          await remote.OpenExternalLink((e.target as HTMLAnchorElement).href);
        } catch (e) {
          alert((e as Error).message);
        }
      })();
    },
    [remote]
  );

  return ready ? (
    <>
      <AlertGroup isToast isLiveRegion>
        {!(!showRestartWarning || isSettingsOpen) && (
          <Alert
            variant="warning"
            title="App restart required"
            actionClose={
              <AlertActionCloseButton
                title="Close alert"
                variantLabel="Close alert"
                onClose={() => setShowRestartWarning(false)}
              />
            }
          >
            Changes to the database path can only be applied with by restarting
            the app.
            <Button
              variant="warning"
              isSmall
              icon={<RedoIcon />}
              onClick={() => remote.RestartApp(false)}
              className="pf-u-mt-sm"
            >
              {" "}
              Restart app
            </Button>
          </Alert>
        )}

        {!(!showReloadWarning || isSettingsOpen) && !showRestartWarning && (
          <Alert
            variant="info"
            title="App reload required"
            actionClose={
              <AlertActionCloseButton
                title="Close alert"
                variantLabel="Close alert"
                onClose={() => setShowReloadWarning(false)}
              />
            }
          >
            Changes to the polling duration can only be applied with by
            reloading the app.
            <Button
              variant="primary"
              isSmall
              icon={<RedoIcon />}
              onClick={() => window.location.reload()}
              className="pf-u-mt-sm"
            >
              {" "}
              Reload app
            </Button>
          </Alert>
        )}
      </AlertGroup>

      <Modal
        isOpen={isDBDownloadRequired}
        className="pf-u-mt-0 pf-u-mb-0 pf-c-modal-box--db-download"
        showClose={false}
        aria-labelledby="db-download-modal-title"
        header={
          <div className="pf-u-pl-lg pf-u-pt-md pf-u-pb-0 pf-u-pr-md">
            <Title id="db-download-modal-title" headingLevel="h1">
              Database Download
            </Title>
          </div>
        }
        actions={[
          <Button
            key={1}
            variant="primary"
            form="db-download"
            type="submit"
            disabled={dbIsDownloading}
          >
            {dbIsDownloading && (
              <Spinner
                isSVG
                size="md"
                aria-label="Database download spinner"
                className="pf-c-spinner--button"
              />
            )}{" "}
            Download database
          </Button>,
        ]}
      >
        <TextContent className="pf-u-mb-md">
          <Text component={TextVariants.p}>
            Connmapper requires the GeoLite2 City database to resolve IP
            addresses to their physical location, which you have not downloaded
            yet. Please grab your free license key by visiting{" "}
            <Text
              component={TextVariants.a}
              href="https://support.maxmind.com/hc/en-us/articles/4407111582235-Generate-a-License-Key"
              target="_blank"
              onAuxClick={handleExternalLink}
              onClick={handleExternalLink}
            >
              support.maxmind.com
            </Text>{" "}
            and enter it below:
          </Text>
        </TextContent>

        <Form
          id="db-download"
          onSubmit={(e) => {
            e.preventDefault();

            if (licenseKey.trim().length <= 0) {
              return;
            }

            (async () => {
              try {
                setDBIsDownloading(true);

                await remote.DownloadDatabase(licenseKey);

                setDBIsDownloading(false);

                setIsDBDownloadRequired(false);
              } catch (e) {
                alert((e as Error).message);
              }
            })();
          }}
          noValidate={false}
        >
          <FormGroup label="License key" isRequired fieldId="license-id">
            <TextInput
              isRequired
              type="password"
              id="license-id"
              name="license-id"
              value={licenseKey}
              onChange={(e) => {
                const v = e.trim();

                if (v.length <= 0) {
                  console.error("Could not work with empty license key");

                  return;
                }

                setLicenseKey(v);
              }}
            />
          </FormGroup>
        </Form>
      </Modal>

      {!isDBDownloadRequired && !isSettingsOpen && (
        <Button
          variant="plain"
          aria-label="Settings"
          className="pf-x-settings"
          onClick={() => {
            setIsSettingsTransparent(false);
            setIsSettingsOpen(true);
          }}
        >
          <CogIcon />
        </Button>
      )}

      <Modal
        isOpen={isSettingsOpen}
        onEscapePress={() => setIsSettingsOpen(false)}
        className={
          "pf-u-mt-0 pf-u-mb-0 pf-c-modal-box--settings" +
          (isSettingsTransparent ? "" : " pf-c-modal-box--transparent")
        }
        showClose={false}
        aria-labelledby="settings-modal-title"
        header={
          <div
            className="pf-u-pl-lg pf-u-pt-md pf-u-pb-0 pf-u-pr-md"
            onMouseEnter={() => setIsSettingsTransparent(true)}
            onMouseLeave={() => setIsSettingsTransparent(false)}
          >
            <Flex
              spaceItems={{ default: "spaceItemsMd" }}
              direction={{ default: "row" }}
              justifyContent={{ default: "justifyContentSpaceBetween" }}
              alignItems={{ default: "alignItemsCenter" }}
            >
              <FlexItem>
                <Title id="settings-modal-title" headingLevel="h1">
                  Settings
                </Title>
              </FlexItem>

              <FlexItem>
                <Button
                  variant="plain"
                  aria-label="Close"
                  onClick={() => setIsSettingsOpen(false)}
                >
                  <TimesIcon />
                </Button>
              </FlexItem>
            </Flex>
          </div>
        }
        actions={[
          <Button
            key={1}
            variant="primary"
            form="settings"
            onClick={() => setIsSettingsOpen(false)}
          >
            OK
          </Button>,
        ]}
        onMouseEnter={() => setIsSettingsTransparent(true)}
        onMouseLeave={() => setIsSettingsTransparent(false)}
      >
        <Form
          id="settings"
          onSubmit={(e) => {
            e.preventDefault();

            setIsSettingsOpen(false);
          }}
          noValidate={false}
        >
          <FormGroup
            label="Maximum packet cache length"
            isRequired
            fieldId="max-packet-cache"
          >
            <TextInput
              isRequired
              type="number"
              id="max-packet-cache"
              name="max-packet-cache"
              value={maxPacketCache}
              onChange={(e) => {
                const v = parseInt(e);

                if (isNaN(v)) {
                  console.error("Could not parse max packet cache");

                  return;
                }

                setMaxPacketCache(v);
              }}
            />
          </FormGroup>

          <FormGroup
            label="Maximum connections cache length"
            isRequired
            fieldId="max-connections-cache"
          >
            <TextInput
              isRequired
              type="number"
              id="max-connections-cache"
              name="max-connections-cache"
              value={maxConnectionsCache}
              onChange={(e) => {
                const v = parseInt(e);

                if (isNaN(v)) {
                  console.error("Could not parse max connections cache");

                  return;
                }

                setMaxConnectionsCache(v);
              }}
            />
          </FormGroup>

          <FormGroup label="GeoLite2 DB path" isRequired fieldId="db-path">
            <TextInput
              isRequired
              type="text"
              id="db-path"
              name="db-path"
              value={dbPath}
              onChange={(e) => {
                const v = e.trim();

                if (v.length <= 0) {
                  console.error("Could not work with empty path");

                  return;
                }

                setDbPath(v);
                setShowRestartWarning(true);
              }}
            />
          </FormGroup>

          <FormGroup
            label="GeoLite2 DB download URL"
            isRequired
            fieldId="db-download-url"
          >
            <TextInput
              isRequired
              type="text"
              id="db-download-url"
              name="db-download-url"
              value={dbDownloadURL}
              onChange={(e) => {
                const v = e.trim();

                if (v.length <= 0) {
                  console.error("Could not work with empty download URL");

                  return;
                }

                setDBDownloadURL(v);
                setShowRestartWarning(true);
              }}
            />
          </FormGroup>

          <FormGroup
            label="Packet polling interval (in milliseconds)"
            isRequired
            fieldId="packet-polling-interval"
          >
            <TextInput
              isRequired
              type="number"
              id="packet-polling-interval"
              name="packet-polling-interval"
              defaultValue={packetsInterval.current}
              onChange={(e) => {
                const v = parseInt(e);

                if (isNaN(v)) {
                  console.error("Could not parse packet polling interval");

                  return;
                }

                packetsInterval.current = v;

                localStorage.setItem(PACKETS_INTERVAL_KEY, v.toString());

                setShowReloadWarning(true);
              }}
            />
          </FormGroup>

          <FormGroup
            label="Connections polling interval (in milliseconds)"
            isRequired
            fieldId="connections-polling-interval"
          >
            <TextInput
              isRequired
              type="number"
              id="connections-polling-interval"
              name="connections-polling-interval"
              defaultValue={connectionsInterval.current}
              onChange={(e) => {
                const v = parseInt(e);

                if (isNaN(v)) {
                  console.error("Could not parse connections polling interval");

                  return;
                }

                packetsInterval.current = v;

                localStorage.setItem(CONNECTIONS_INTERVAL_KEY, v.toString());

                setShowReloadWarning(true);
              }}
            />
          </FormGroup>
        </Form>
      </Modal>

      {tracing ? (
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
            arcColor={(d: any) =>
              (d as IArc).incoming ? "#A30000" : "#ACE12E"
            }
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
              className="pf-x-cta"
              onClick={() => {
                setIsInspectorTransparent(false);
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
                  setIsInspectorTransparent(false);
                }

                setInWindow(inWindow);
              }}
              minimized={isInspectorMinimized}
              modalTransparent={isInspectorTransparent}
              setModalTransparent={setIsInspectorTransparent}
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
                          <Button
                            variant="plain"
                            aria-label="Download as CSV"
                            onClick={() => {
                              const element = document.createElement("a");
                              element.setAttribute(
                                "href",
                                "data:text/plain;charset=utf-8," +
                                  encodeURIComponent(
                                    Papa.unparse({
                                      fields: [
                                        "timestamp",

                                        "layerType",
                                        "nextLayerType",
                                        "length",

                                        "srcIP",
                                        "srcCountryName",
                                        "srcCityName",
                                        "srcLatitude",
                                        "srcLongitude",

                                        "dstIP",
                                        "dstCountryName",
                                        "dstCityName",
                                        "dstLatitude",
                                        "dstLongitude",
                                      ],
                                      data: filteredPackets.map((packet) => [
                                        packet.timestamp,

                                        packet.layerType,
                                        packet.nextLayerType,
                                        packet.length,

                                        packet.srcIP,
                                        packet.srcCountryName,
                                        packet.srcCityName,
                                        packet.srcLatitude,
                                        packet.srcLongitude,

                                        packet.dstIP,
                                        packet.dstCountryName,
                                        packet.dstCityName,
                                        packet.dstLatitude,
                                        packet.dstLongitude,
                                      ]),
                                    })
                                  )
                              );
                              element.setAttribute("download", "packets.csv");

                              element.style.display = "none";
                              document.body.appendChild(element);

                              element.click();

                              document.body.removeChild(element);
                            }}
                          >
                            <DownloadIcon />
                          </Button>

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
                                    setIsInspectorTransparent(false);
                                  }}
                                >
                                  <CompressIcon />
                                </Button>
                              )}

                              <Button
                                variant="plain"
                                aria-label="Close"
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
                filteredPackets={filteredPackets}
                setFilteredPackets={setFilteredPackets}
                packetsInterval={packetsInterval}
              />
            </InWindowOrModal>
          )}
        </>
      ) : (
        !isDBDownloadRequired && (
          <Flex
            className="pf-u-p-lg pf-u-h-100"
            spaceItems={{ default: "spaceItemsMd" }}
            direction={{ default: "column" }}
            justifyContent={{ default: "justifyContentCenter" }}
            alignItems={{ default: "alignItemsCenter" }}
          >
            <FlexItem className="pf-x-c-title">
              {/* <Title headingLevel="h1">Connmapper</Title> */}

              <img
                src={logoDark}
                alt="Connmapper logo"
                className="pf-u-mb-xs pf-x-c-logo"
              />
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
                          await remote.TraceDevice(
                            selectedDevice || devices[0]
                          );

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
      )}
    </>
  ) : (
    <Flex
      className="pf-u-p-md pf-u-h-100"
      spaceItems={{ default: "spaceItemsMd" }}
      direction={{ default: "column" }}
      justifyContent={{ default: "justifyContentCenter" }}
      alignItems={{ default: "alignItemsCenter" }}
    >
      <FlexItem>
        <Spinner isSVG aria-label="Loading spinner" />
      </FlexItem>

      <FlexItem className="pf-x-c-spinner-description--main">
        <Title headingLevel="h1">Connecting to backend ...</Title>
      </FlexItem>
    </Flex>
  );
};

const sortableKeys = [
  "timestamp",
  "layerType",
  "nextLayerType",
  "length",

  "srcCountryName",

  "dstCountryName",
];

interface ITrafficTableProps {
  getPackets: () => Promise<ITracedConnectionDetails[]>;
  addLocalLocation: (packet: ITracedConnection) => void;
  searchQuery: string;
  setRegexErr: (err: boolean) => void;
  filteredPackets: ITracedConnectionDetails[];
  setFilteredPackets: (packets: ITracedConnectionDetails[]) => void;
  packetsInterval: React.MutableRefObject<number>;
}

const RealtimeTrafficTable: React.FC<ITrafficTableProps> = ({
  getPackets,
  addLocalLocation,
  searchQuery,
  setRegexErr,
  filteredPackets,
  setFilteredPackets,
  packetsInterval,
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
    }, packetsInterval.current);

    return () => clearInterval(interval);
  }, []);

  const [activeSortIndex, setActiveSortIndex] = useState<number | undefined>();
  const [activeSortDirection, setActiveSortDirection] = useState<
    "asc" | "desc" | undefined
  >();

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

  useEffect(() => {
    setFilteredPackets(
      packets
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

          return (activeSortDirection === "desc" ? (b as any) : (a as any))[key]
            .toString()
            .localeCompare(
              (activeSortDirection === "desc" ? (a as any) : (b as any))[
                key
              ].toString()
            );
        })
    );
  }, [activeSortDirection, activeSortIndex, packets, searchQuery, setRegexErr]);

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
        {filteredPackets.map((packet, i) => (
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
          className="pf-u-pl-lg pf-u-pt-md pf-u-pb-0 pf-u-pr-md"
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
