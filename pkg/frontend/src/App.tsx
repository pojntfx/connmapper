import {
  Alert,
  AlertActionCloseButton,
  AlertGroup,
  Button,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  MenuToggle,
  Modal,
  ModalVariant,
  Select,
  SelectList,
  SelectOption,
  SelectOptionProps,
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
  Table,
  Tbody,
  Td,
  Th,
  ThProps,
  Thead,
  Tr,
} from "@patternfly/react-table";
import { ILocalContext, IRemoteContext, Registry } from "@pojntfx/panrpc";
import { JSONParser } from "@streamparser/json-whatwg";
import Papa from "papaparse";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactGlobeGl from "react-globe.gl";
import NewWindow from "react-new-window";
import useAsyncEffect from "use-async";
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
const DARK_THEME_CLASS_NAME = "pf-v6-theme-dark";

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

class Local {
  async GetEscalationPermission(ctx: ILocalContext, restart: boolean) {
    if (restart) {
      return confirm(
        "Connmapper requires admin privileges to capture packets. We'll ask you to authorize this in the next step, then restart the application."
      );
    }

    return confirm(
      "Connmapper requires admin privileges to capture packets. We'll ask you to authorize this in the next step."
    );
  }
}

interface IDevice {
  Name: string;
  IPAddresses: string[];
}

class Remote {
  async OpenExternalLink(ctx: IRemoteContext, url: string): Promise<void> {
    return;
  }

  async CheckDatabase(ctx: IRemoteContext): Promise<boolean> {
    return false;
  }

  async DownloadDatabase(
    ctx: IRemoteContext,
    licenseKey: string
  ): Promise<void> {
    return;
  }

  async ListDevices(ctx: IRemoteContext): Promise<IDevice[]> {
    return [];
  }

  async TraceDevice(ctx: IRemoteContext, device: IDevice): Promise<void> {}

  async GetConnections(ctx: IRemoteContext): Promise<ITracedConnection[]> {
    return [];
  }

  async GetPackets(ctx: IRemoteContext): Promise<ITracedConnectionDetails[]> {
    return [];
  }

  async SetIsSummarized(
    ctx: IRemoteContext,
    summarized: boolean
  ): Promise<void> {
    return;
  }

  async SetMaxPacketCache(
    ctx: IRemoteContext,
    packetCache: number
  ): Promise<void> {
    return;
  }

  async GetMaxPacketCache(ctx: IRemoteContext): Promise<number> {
    return 0;
  }

  async SetMaxConnectionsCache(
    ctx: IRemoteContext,
    maxConnectionsCache: number
  ): Promise<void> {
    return;
  }

  async GetMaxConnectionsCache(ctx: IRemoteContext): Promise<number> {
    return 0;
  }

  async SetDBPath(ctx: IRemoteContext, dbPath: string): Promise<void> {
    return;
  }

  async GetDBPath(ctx: IRemoteContext): Promise<string> {
    return "";
  }

  async SetDBDownloadURL(
    ctx: IRemoteContext,
    dbDownloadURL: string
  ): Promise<void> {
    return;
  }

  async GetDBDownloadURL(ctx: IRemoteContext): Promise<string> {
    return "";
  }

  async RestartApp(
    ctx: IRemoteContext,
    fixPermissions: boolean
  ): Promise<void> {
    return;
  }
}

const App = () => {
  const [darkMode, setDarkMode] = useState(false);
  useEffect(() => {
    const darkModeMediaQuery = window.matchMedia(
      "(prefers-color-scheme: dark)"
    );

    const updateTheme = () => {
      if (darkModeMediaQuery.matches) {
        setDarkMode(true);

        return;
      }

      setDarkMode(false);
    };

    darkModeMediaQuery.addEventListener("change", updateTheme);

    updateTheme();

    return () => {
      darkModeMediaQuery.removeEventListener("change", updateTheme);
    };
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add(DARK_THEME_CLASS_NAME);

      return;
    }

    document.documentElement.classList.remove(DARK_THEME_CLASS_NAME);
  }, [darkMode]);

  const [clients, setClients] = useState(0);
  useEffect(() => console.log(clients, "clients connected"), [clients]);

  const [reconnect, setReconnect] = useState(false);
  const [registry] = useState(
    new Registry(
      new Local(),
      new Remote(),

      {
        onClientConnect: () => setClients((v) => v + 1),
        onClientDisconnect: () =>
          setClients((v) => {
            if (v === 1) {
              setReconnect(true);
            }

            return v - 1;
          }),
      }
    )
  );

  useAsyncEffect(async () => {
    if (reconnect) {
      await new Promise((r) => {
        setTimeout(r, 100);
      });

      setReconnect(false);

      return () => {};
    }

    const addr =
      new URLSearchParams(window.location.search).get("socketURL") ||
      "ws://localhost:1337";

    const socket = new WebSocket(addr);

    socket.addEventListener("error", (e) => {
      console.error("Disconnected with error, reconnecting:", e);

      setReconnect(true);
    });

    await new Promise<void>((res, rej) => {
      socket.addEventListener("open", () => res());
      socket.addEventListener("error", rej);
    });

    const encoder = new WritableStream({
      write(chunk) {
        socket.send(JSON.stringify(chunk));
      },
    });

    const parser = new JSONParser({
      paths: ["$"],
      separator: "",
    });
    const parserWriter = parser.writable.getWriter();
    const parserReader = parser.readable.getReader();
    const decoder = new ReadableStream({
      start(controller) {
        parserReader
          .read()
          .then(async function process({ done, value }) {
            if (done) {
              controller.close();

              return;
            }

            controller.enqueue(value?.value);

            parserReader
              .read()
              .then(process)
              .catch((e) => controller.error(e));
          })
          .catch((e) => controller.error(e));
      },
    });
    socket.addEventListener("message", (m) =>
      parserWriter.write(m.data as string)
    );
    socket.addEventListener("close", () => {
      parserReader.cancel();
      parserWriter.abort();
    });

    registry.linkStream(
      encoder,
      decoder,

      (v) => v,
      (v) => v
    );

    console.log("Connected to", addr);

    return () => socket.close();
  }, [reconnect]);

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
        alert(JSON.stringify((e as Error).message));
      }
    })();
  }, []);

  const [devices, setDevices] = useState<IDevice[]>([]);
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
    if (clients <= 0) {
      return;
    }

    registry.forRemotes(async (_, remote) => {
      try {
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
          remote.ListDevices(undefined),
          remote.GetDBPath(undefined),
          remote.GetMaxConnectionsCache(undefined),
          remote.GetMaxPacketCache(undefined),
          remote.GetDBDownloadURL(undefined),
          remote.CheckDatabase(undefined),
        ]);

        setDevices(newDevices);

        if (newDevices.length > 0) {
          setSelectedDevice(newDevices[0].Name);
        }

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
      } catch (e) {
        alert(JSON.stringify((e as Error).message));
      }
    });
  }, [clients]);

  useEffect(() => {
    if (clients <= 0 || maxPacketCache <= 0) {
      return;
    }

    localStorage.setItem(MAX_PACKET_CACHE_KEY, maxPacketCache.toString());

    registry.forRemotes(async (_, remote) => {
      try {
        await remote.SetMaxPacketCache(undefined, maxPacketCache);
      } catch (e) {
        alert(JSON.stringify((e as Error).message));
      }
    });
  }, [clients, maxPacketCache]);

  useEffect(() => {
    if (clients <= 0 || maxConnectionsCache <= 0) {
      return;
    }

    localStorage.setItem(
      MAX_CONNECTIONS_CACHE_KEY,
      maxConnectionsCache.toString()
    );

    registry.forRemotes(async (_, remote) => {
      try {
        await remote.SetMaxConnectionsCache(undefined, maxConnectionsCache);
      } catch (e) {
        alert(JSON.stringify((e as Error).message));
      }
    });
  }, [clients, maxConnectionsCache]);

  useEffect(() => {
    if (clients <= 0 || dbPath.trim().length <= 0) {
      return;
    }

    localStorage.setItem(DB_PATH_KEY, dbPath);

    registry.forRemotes(async (_, remote) => {
      try {
        await remote.SetDBPath(undefined, dbPath);
      } catch (e) {
        alert(JSON.stringify((e as Error).message));
      }
    });
  }, [clients, dbPath]);

  useEffect(() => {
    if (clients <= 0 || dbDownloadURL.trim().length <= 0) {
      return;
    }

    localStorage.setItem(DB_DOWNLOAD_URL_KEY, dbDownloadURL);

    registry.forRemotes(async (_, remote) => {
      try {
        await remote.SetDBDownloadURL(undefined, dbDownloadURL);
      } catch (e) {
        alert(JSON.stringify((e as Error).message));
      }
    });
  }, [clients, dbDownloadURL]);

  const [deviceSelectorIsOpen, setDeviceSelectorIsOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [deviceSelectorInput, setDeviceSelectorInput] = useState("");

  const [visibleDevices, setVisibleDevices] = useState<SelectOptionProps[]>([]);
  useEffect(() => {
    setVisibleDevices(
      devices.map((device) => ({
        value: device.Name,
      }))
    );
  }, [devices]);

  const [deviceSelectorFilter, setDeviceSelectorFilter] = useState("");
  useEffect(() => {
    let newSelectOptions: SelectOptionProps[] = devices.map((device) => ({
      value: device.Name,
    }));

    if (deviceSelectorFilter) {
      newSelectOptions = devices
        .map((device) => ({
          value: device.Name,
        }))
        .filter((menuItem) =>
          String(menuItem.value)
            .toLowerCase()
            .includes(deviceSelectorFilter.toLowerCase())
        );

      if (!newSelectOptions.length) {
        newSelectOptions = [
          {
            isDisabled: false,
            children: `No devices found for "${deviceSelectorFilter}"`,
            value: "",
          },
        ];
      }

      if (!deviceSelectorIsOpen) {
        setDeviceSelectorIsOpen(true);
      }
    }

    setVisibleDevices(newSelectOptions);
    setActiveDevice(null);
    setFocusedDevice(null);
  }, [deviceSelectorFilter, devices]);

  const [focusedDevice, setFocusedDevice] = useState<number | null>(null);
  const [activeDevice, setActiveDevice] = useState<string | null>(null);
  const deviceSelectorInputRef = useRef<HTMLInputElement>();
  const [tracing, setTracing] = useState(false);

  const [arcs, setArcs] = useState<IArc[]>([]);

  useEffect(() => {
    if (tracing) {
      const interval = setInterval(async () => {
        registry.forRemotes(async (_, remote) => {
          try {
            const conns = await remote.GetConnections(undefined);

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
                  label: `${conn.layerType}/${conn.nextLayerType} ${
                    conn.srcIP
                  } (${
                    conn.srcCountryName && conn.srcCityName
                      ? conn.srcCountryName + ", " + conn.srcCityName
                      : conn.srcCountryName || conn.srcCityName || "-"
                  }, ${conn.srcLongitude}, ${conn.srcLatitude}) → ${
                    conn.dstIP
                  } (${
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
          } catch (e) {
            alert(JSON.stringify((e as Error).message));
          }
        });
      }, connectionsInterval.current);

      return () => clearInterval(interval);
    }
  }, [tracing]);

  const { width, height } = useWindowSize();

  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isInspectorMinimized, setIsInspectorMinimized] = useState(true);

  const [isSummarized, setIsSummarized] = useState(false);

  useEffect(() => {
    if (clients <= 0) {
      return;
    }

    registry.forRemotes(async (_, remote) => {
      try {
        await remote.SetIsSummarized(undefined, isSummarized);
      } catch (e) {
        alert(JSON.stringify((e as Error).message));
      }
    });
  }, [clients, isSummarized]);

  const [searchQuery, setSearchQuery] = useState("");
  const [regexErr, setRegexErr] = useState(false);

  const [inWindow, setInWindow] = useState(false);

  const [filteredPackets, setFilteredPackets] = useState<
    ITracedConnectionDetails[]
  >([]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [showRestartWarning, setShowRestartWarning] = useState(false);
  const [showReloadWarning, setShowReloadWarning] = useState(false);

  const [licenseKey, setLicenseKey] = useState("");
  const [dbIsDownloading, setDBIsDownloading] = useState(false);

  const handleExternalLink = useCallback(
    (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
      e.preventDefault();

      (async () => {
        registry.forRemotes(async (_, remote) => {
          try {
            await remote.OpenExternalLink(
              undefined,
              (e.target as HTMLAnchorElement).href
            );
          } catch (e) {
            alert(JSON.stringify((e as Error).message));
          }
        });
      })();
    },
    [registry]
  );

  return clients > 0 ? (
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
              size="sm"
              icon={<RedoIcon />}
              onClick={() =>
                registry.forRemotes(async (_, remote) => {
                  try {
                    await remote.RestartApp(undefined, false);
                  } catch (e) {
                    alert(JSON.stringify((e as Error).message));
                  }
                })
              }
              className="pf-v6-u-mt-sm"
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
              size="sm"
              icon={<RedoIcon />}
              onClick={() => window.location.reload()}
              className="pf-v6-u-mt-sm"
            >
              {" "}
              Reload app
            </Button>
          </Alert>
        )}
      </AlertGroup>

      <Modal
        isOpen={isDBDownloadRequired}
        className="pf-v6-u-mt-0 pf-v6-u-mb-0 pf-v6-c-modal-box--db-download"
        showClose={false}
        aria-labelledby="db-download-modal-title"
        header={
          <div className="pf-v6-u-pl-lg pf-v6-u-pt-md pf-v6-u-pb-0 pf-v6-u-pr-md">
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
                size="md"
                aria-label="Database download spinner"
                className="pf-v6-c-spinner--button"
              />
            )}{" "}
            Download database
          </Button>,
        ]}
      >
        <TextContent className="pf-v6-u-mb-md">
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

                registry.forRemotes(async (_, remote) => {
                  try {
                    await remote.DownloadDatabase(undefined, licenseKey);

                    setDBIsDownloading(false);

                    setIsDBDownloadRequired(false);
                  } catch (e) {
                    alert(JSON.stringify((e as Error).message));
                  }
                });
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
              onChange={(_, e) => {
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
          variant="control"
          aria-label="Settings"
          className="pf-v6-x-settings"
          onClick={() => setIsSettingsOpen(true)}
        >
          <CogIcon />
        </Button>
      )}

      <Modal
        isOpen={isSettingsOpen}
        onEscapePress={() => setIsSettingsOpen(false)}
        className="pf-v6-u-mt-0 pf-v6-u-mb-0 pf-v6-c-modal-box--settings"
        showClose={false}
        aria-labelledby="settings-modal-title"
        header={
          <div className="pf-v6-u-pl-lg pf-v6-u-pt-md pf-v6-u-pb-0 pf-v6-u-pr-md">
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
              onChange={(_, e) => {
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
              onChange={(_, e) => {
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
              onChange={(_, e) => {
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
              onChange={(_, e) => {
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
              onChange={(_, e) => {
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
              onChange={(_, e) => {
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

          {!isInspectorOpen && !isSettingsOpen && (
            <Button
              variant="primary"
              icon={<TableIcon />}
              className="pf-v6-x-cta"
              onClick={() => setIsInspectorOpen(true)}
            >
              {" "}
              Inspect Traffic
            </Button>
          )}

          {isInspectorOpen && (
            <InWindowOrModal
              inWindow={inWindow}
              open={isInspectorOpen && !isSettingsOpen}
              setOpen={(open) => {
                if (!open) {
                  setInWindow(false);
                }

                setIsInspectorOpen(open);
              }}
              setInWindow={(inWindow) => setInWindow(inWindow)}
              minimized={isInspectorMinimized}
              windowClassName={
                "pf-v6-x-new-window " + (darkMode ? DARK_THEME_CLASS_NAME : "")
              }
              modalClassName="pf-v6-c-modal--inspector"
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
                      className={
                        "pf-v6-u-ml-md " +
                        (inWindow ? "" : "pf-v6-u-mt-md pf-v6-u-mt-0-on-lg")
                      }
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
                            onChange={(_, e) => setSearchQuery(e)}
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
                              className="pf-v6-c-toggle-group__item--centered"
                            />

                            <ToggleGroupItem
                              icon={<ListIcon />}
                              text="Summarized"
                              isSelected={isSummarized}
                              onChange={() => setIsSummarized(true)}
                              className="pf-v6-c-toggle-group__item--centered"
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
                                  onClick={() => setIsInspectorMinimized(true)}
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
                registry={registry}
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
            className="pf-v6-u-p-lg pf-v6-u-h-100"
            spaceItems={{ default: "spaceItemsMd" }}
            direction={{ default: "column" }}
            justifyContent={{ default: "justifyContentCenter" }}
            alignItems={{ default: "alignItemsCenter" }}
          >
            <FlexItem className="pf-v6-x-c-title">
              <img
                src={logoDark}
                alt="Connmapper logo"
                className="pf-v6-u-mb-xs pf-v6-x-c-logo"
              />
            </FlexItem>

            <FlexItem>
              <Flex direction={{ default: "row" }}>
                <FlexItem>
                  <Select
                    isOpen={deviceSelectorIsOpen}
                    selected={selectedDevice}
                    onSelect={(_, e) => {
                      setSelectedDevice(e as string);
                      setDeviceSelectorIsOpen(false);
                    }}
                    onOpenChange={() => setDeviceSelectorIsOpen((v) => !v)}
                    toggle={(toggleRef) => (
                      <MenuToggle
                        ref={toggleRef}
                        onClick={() => setDeviceSelectorIsOpen((v) => !v)}
                        isExpanded={deviceSelectorIsOpen}
                      >
                        {selectedDevice}
                      </MenuToggle>
                    )}
                    shouldFocusToggleOnSelect
                  >
                    <SelectList>
                      {devices.map((d, i) => (
                        <SelectOption key={i} value={d.Name}>
                          {d.Name}
                        </SelectOption>
                      ))}
                    </SelectList>
                  </Select>
                </FlexItem>

                <FlexItem>
                  <Button
                    variant="primary"
                    onClick={() => {
                      (async () => {
                        registry.forRemotes(async (_, remote) => {
                          try {
                            await remote.TraceDevice(
                              undefined,
                              devices.find((d) => d.Name === selectedDevice) ||
                                devices[0]
                            );

                            setTracing(true);
                          } catch (e) {
                            alert(JSON.stringify((e as Error).message));
                          }
                        });
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
      className="pf-v6-u-p-md pf-v6-u-h-100"
      spaceItems={{ default: "spaceItemsMd" }}
      direction={{ default: "column" }}
      justifyContent={{ default: "justifyContentCenter" }}
      alignItems={{ default: "alignItemsCenter" }}
    >
      <FlexItem>
        <Spinner aria-label="Loading spinner" />
      </FlexItem>

      <FlexItem className="pf-v6-x-c-spinner-description--main">
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
  registry: Registry<Local, Remote>;
  addLocalLocation: (packet: ITracedConnection) => void;
  searchQuery: string;
  setRegexErr: (err: boolean) => void;
  filteredPackets: ITracedConnectionDetails[];
  setFilteredPackets: (packets: ITracedConnectionDetails[]) => void;
  packetsInterval: React.MutableRefObject<number>;
}

const RealtimeTrafficTable: React.FC<ITrafficTableProps> = ({
  registry,
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
      registry.forRemotes(async (_, remote) => {
        try {
          const packets = await remote.GetPackets(undefined);

          setPackets(
            packets.map((p) => {
              addLocalLocation(p);

              return p;
            })
          );
        } catch (e) {
          alert(JSON.stringify((e as Error).message));
        }
      });
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
    <Table
      aria-label="Traffic"
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
          <Tr isClickable key={i}>
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
    </Table>
  );
};

interface IInWindowOrModalProps {
  inWindow: boolean;

  open: boolean;
  setOpen: (open: boolean) => void;
  setInWindow: (open: boolean) => void;
  minimized: boolean;

  header: React.ReactNode;
  children: React.ReactNode;

  windowClassName?: string;
  modalClassName?: string;
}

const InWindowOrModal: React.FC<IInWindowOrModalProps> = ({
  inWindow,

  open,
  setOpen,
  setInWindow,
  minimized,

  header,
  children,

  ...rest
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
        <div className={rest?.windowClassName}>
          {header}
          {children}
        </div>
      </NewWindow>
    );
  }

  return (
    <Modal
      variant={ModalVariant.large}
      isOpen={open}
      showClose={false}
      onEscapePress={() => setOpen(false)}
      aria-labelledby="traffic-inspector-title"
      header={header}
      className={
        (minimized ? "pf-c-modal-box " : "pf-c-modal-box--fullscreen ") +
        (rest?.modalClassName || "")
      }
    >
      {children}
    </Modal>
  );
};

export default App;
