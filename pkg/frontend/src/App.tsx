import {
  ActionGroup,
  Alert,
  AlertActionCloseButton,
  AlertGroup,
  Button,
  FileUpload,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  MenuToggle,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Progress,
  ProgressVariant,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  Switch,
  TextInput,
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
  TrashIcon,
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
import logoDarkCyberpunk from "./logo-dark-cyberpunk.png";
import logoDark from "./logo-dark.png";
import "./main.scss";
import { getIP } from "webrtc-ip";

const MAX_PACKET_CACHE_KEY = "latensee.maxPacketCache";
const MAX_CONNECTIONS_CACHE_KEY = "latensee.maxConnectionsCache";
const DB_DOWNLOAD_URL_KEY = "latensee.dbDownloadUrl";
const CONNECTIONS_INTERVAL_KEY = "latensee.connectionsInterval";
const PACKETS_INTERVAL_KEY = "latensee.packetsInterval";
const CYBERPUNK_MODE_KEY = "latensee.cyberpunkMode";

const DARK_THEME_CLASS_NAME = "pf-v6-theme-dark";
const CYBERPUNK_THEME_CLASS_NAME = "pf-v6-x-theme-cyberpunk";

interface ILocation {
  longitude: number;
  latitude: number;
}

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
  PcapName: string;
  NetName: string;
  MTU: number;
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
    accountID: string,
    licenseKey: string
  ): Promise<void> {
    return;
  }

  async UploadDatabase(
    ctx: IRemoteContext,
    read: (ctx: ILocalContext) => Promise<number[]>
  ): Promise<void> {
    return;
  }

  async DeleteDatabase(ctx: IRemoteContext): Promise<void> {
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

  async SetDBDownloadURL(
    ctx: IRemoteContext,
    dbDownloadURL: string
  ): Promise<void> {
    return;
  }

  async GetDBDownloadURL(ctx: IRemoteContext): Promise<string> {
    return "";
  }

  async RestartApp(ctx: IRemoteContext): Promise<void> {
    return;
  }

  async LookupLocation(ctx: IRemoteContext, ip: string): Promise<ILocation> {
    return {
      longitude: 0,
      latitude: 0,
    } as ILocation;
  }
}

const App = () => {
  const [cyberpunkMode, setCyberpunkMode] = useState(
    (localStorage.getItem(CYBERPUNK_MODE_KEY) || "false") === "true"
  );

  const [darkMode, setDarkMode] = useState(false);
  useEffect(() => {
    if (cyberpunkMode) {
      setDarkMode(true);

      return;
    }

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
  }, [cyberpunkMode]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add(DARK_THEME_CLASS_NAME);

      return;
    }

    document.documentElement.classList.remove(DARK_THEME_CLASS_NAME);
  }, [darkMode]);

  useEffect(() => {
    if (cyberpunkMode) {
      document.documentElement.classList.add(CYBERPUNK_THEME_CLASS_NAME);

      return;
    }

    document.documentElement.classList.remove(CYBERPUNK_THEME_CLASS_NAME);
  }, [cyberpunkMode]);

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

    const linkSignal = new AbortController();

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
      linkSignal.abort();
    });

    registry.linkStream(
      linkSignal.signal,

      encoder,
      decoder,

      (v) => v,
      (v) => v
    );

    console.log("Connected to", addr);

    return () => socket.close();
  }, [reconnect]);

  const [currentLocation, setCurrentLocation] = useState<ILocation>();

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
      if (clients <= 0) {
        return;
      }

      registry.forRemotes(async (_, remote) => {
        try {
          // If available, do a STUN lookup and resolve the address to a location
          const ip = await getIP();

          const location = await remote.LookupLocation(undefined, ip);

          setCurrentLocation(location);
        } catch (e) {
          try {
            // If the STUN lookup doesn't work (e.g. if the client doesn't have a public internet connection),
            // try to use the geolocation API instead
            const pos = await new Promise<GeolocationPosition>((res, rej) =>
              navigator.geolocation.getCurrentPosition(res, rej)
            );

            setCurrentLocation(pos.coords);
          } catch (e) {
            alert(JSON.stringify((e as Error).message));
          }
        }
      });
    })();
  }, [clients]);

  const [devices, setDevices] = useState<IDevice[]>([]);
  const [maxConnectionsCache, setMaxConnectionsCache] = useState(0);
  const [maxPacketCache, setMaxPacketCache] = useState(0);
  const [dbDownloadURL, setDBDownloadURL] = useState("");
  const [isDBConfigurationRequired, setIsDBConfigurationRequired] =
    useState(false);

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

        setDBDownloadURL(localStorage.getItem(DB_DOWNLOAD_URL_KEY) || "");

        // Rehydrate from server and fetch devices
        const [
          newDevices,
          newMaxConnectionsCache,
          newMaxPacketCache,
          newDBDownloadURL,
          newIsDBDownloadRequired,
        ] = await Promise.all([
          remote.ListDevices(undefined),
          remote.GetMaxConnectionsCache(undefined),
          remote.GetMaxPacketCache(undefined),
          remote.GetDBDownloadURL(undefined),
          remote.CheckDatabase(undefined),
        ]);

        setDevices(newDevices);

        if (newDevices.length > 0) {
          setSelectedDevicePcapName(newDevices[0]?.PcapName || "");
        }

        // Set local values from server if they aren't set yet
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

        setIsDBConfigurationRequired(newIsDBDownloadRequired);
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
  const [selectedDevicePcapName, setSelectedDevicePcapName] = useState("");
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

  const [accountID, setAccountID] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [dbIsDownloading, setDBIsDownloading] = useState(false);
  const [dbIsUploading, setDBIsUploading] = useState(false);

  const [progress, setProgress] = useState(0);

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
                    await remote.RestartApp(undefined);
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
        isOpen={isDBConfigurationRequired}
        className="pf-v6-u-mt-0 pf-v6-u-mb-0 pf-v6-c-modal-box--db-download"
        aria-labelledby="db-config-modal-title"
      >
        <ModalHeader>
          <div className="pf-v6-u-pl-lg pf-v6-u-pt-md pf-v6-u-pb-0 pf-v6-u-pr-md">
            <Title id="db-config-modal-title" headingLevel="h1">
              Database Configuration
            </Title>
          </div>
        </ModalHeader>

        <ModalBody>
          <div className="pf-v6-u-mb-md">
            <p>
              Connmapper requires the GeoLite2 City database to resolve IP
              addresses to their physical location.
            </p>

            <Title headingLevel="h2" className="pf-v6-u-my-md">
              Option 1: Download the Database
            </Title>

            <p>
              To download a new copy of the database, please register for a
              (free) MaxMind Account ID and License Key by visiting{" "}
              <a
                href="https://support.maxmind.com/hc/en-us/articles/4407111582235-Generate-a-License-Key"
                target="_blank"
                onAuxClick={handleExternalLink}
                onClick={handleExternalLink}
              >
                support.maxmind.com
              </a>
              , then enter them below:
            </p>
          </div>

          <Form
            id="db-download"
            onSubmit={(e) => {
              e.preventDefault();

              if (accountID.trim().length <= 0) {
                return;
              }

              if (licenseKey.trim().length <= 0) {
                return;
              }

              (async () => {
                try {
                  setDBIsDownloading(true);

                  registry.forRemotes(async (_, remote) => {
                    try {
                      await remote.DownloadDatabase(
                        undefined,
                        accountID,
                        licenseKey
                      );

                      setDBIsDownloading(false);

                      setIsDBConfigurationRequired(false);
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
            <FormGroup label="Account ID" isRequired fieldId="account-id">
              <TextInput
                isRequired
                type="text"
                id="account-id"
                name="account-id"
                value={accountID}
                isDisabled={dbIsDownloading || dbIsUploading}
                onChange={(_, e) => {
                  const v = e.trim();

                  if (v.length <= 0) {
                    console.error("Could not work with empty account ID");

                    return;
                  }

                  setAccountID(v);
                }}
              />
            </FormGroup>

            <FormGroup label="License key" isRequired fieldId="license-id">
              <TextInput
                isRequired
                type="password"
                id="license-id"
                name="license-id"
                value={licenseKey}
                isDisabled={dbIsDownloading || dbIsUploading}
                onChange={(_, e) => {
                  const v = e.trim();

                  if (v.length <= 0) {
                    console.error("Could not work with empty license key");

                    return;
                  }

                  setLicenseKey(v);
                }}
              />

              <ActionGroup>
                <Button
                  key={1}
                  variant="secondary"
                  form="db-download"
                  type="submit"
                  disabled={dbIsDownloading || dbIsUploading}
                  isDisabled={dbIsDownloading || dbIsUploading}
                  isLoading={dbIsDownloading}
                  spinnerAriaLabel="Database download spinner"
                >
                  Download database
                </Button>
              </ActionGroup>
            </FormGroup>
          </Form>

          <div className="pf-v6-u-mb-md pf-v6-u-mt-lg">
            <Title headingLevel="h2" className="pf-v6-u-my-md">
              Option 2: Use Existing Database
            </Title>

            <p>
              Alternatively, if you already have a copy of the GeoLite2 City
              database, you can select it below:
            </p>
          </div>

          {dbIsUploading ? (
            <Progress
              value={progress}
              title="Uploading database ..."
              variant={progress >= 100 ? ProgressVariant.success : undefined}
            />
          ) : (
            <FileUpload
              id="db-upload"
              className="pf-v6-u-pl-0"
              filenamePlaceholder="Drag and drop a database file (.mmdb) or upload one"
              isClearButtonDisabled
              hideDefaultPreview
              disabled={dbIsDownloading || dbIsUploading}
              isDisabled={dbIsDownloading || dbIsUploading}
              dropzoneProps={{
                accept: { "application/octet-stream": [".mmdb"] },
                onDropRejected: () =>
                  alert("Not a valid database file, please try again"),
              }}
              onFileInputChange={(_, file) => {
                try {
                  setDBIsUploading(true);

                  const fileReader = file.stream().getReader();

                  registry.forRemotes(async (_, remote) => {
                    try {
                      let pulledChunks = 0;

                      await remote.UploadDatabase(undefined, async (_) => {
                        const { done, value } = await fileReader.read();
                        if (done) return [];

                        pulledChunks += value.length;
                        setProgress(
                          Math.floor((pulledChunks / file.size) * 100)
                        );

                        return Array.from(value);
                      });

                      setDBIsUploading(false);

                      setIsDBConfigurationRequired(false);
                    } catch (e) {
                      alert(JSON.stringify((e as Error).message));
                    }
                  });
                } catch (e) {
                  alert((e as Error).message);
                }
              }}
              browseButtonText="Upload"
            />
          )}
        </ModalBody>
      </Modal>

      {!isSettingsOpen && (
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
        className={
          "pf-v6-u-mt-0 pf-v6-u-mb-0 pf-v6-c-modal-box--settings " +
          (isInspectorOpen ? "pf-v6-c-modal-box--settings--secondary" : "")
        }
        aria-labelledby="settings-modal-title"
      >
        <ModalHeader>
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
        </ModalHeader>

        <ModalBody>
          <Form
            id="settings"
            onSubmit={(e) => {
              e.preventDefault();

              setIsSettingsOpen(false);
            }}
            noValidate={false}
          >
            <Title headingLevel="h2" className="pf-v6-u-mt-md">
              Cache
            </Title>

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

            <Title headingLevel="h2">Tracing</Title>

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
                    console.error(
                      "Could not parse connections polling interval"
                    );

                    return;
                  }

                  packetsInterval.current = v;

                  localStorage.setItem(CONNECTIONS_INTERVAL_KEY, v.toString());

                  setShowReloadWarning(true);
                }}
              />
            </FormGroup>

            <Title headingLevel="h2">Advanced</Title>

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

            <FormGroup label="Visual tweaks" fieldId="cyberpunk-mode">
              <Switch
                id="cyberpunk-mode"
                name="cyberpunk-mode"
                label="Cyberpunk mode"
                isChecked={cyberpunkMode}
                onChange={(_, e) => {
                  const v = e;

                  setCyberpunkMode(e);

                  localStorage.setItem(CYBERPUNK_MODE_KEY, v.toString());
                }}
              />
            </FormGroup>
          </Form>
        </ModalBody>

        <ModalFooter>
          <Button
            key={1}
            variant="primary"
            form="settings"
            onClick={() => setIsSettingsOpen(false)}
          >
            OK
          </Button>

          <Button
            variant="secondary"
            isDanger
            icon={<TrashIcon />}
            onClick={() => {
              setShowRestartWarning(true);

              try {
                setIsSettingsOpen(false);

                registry.forRemotes(async (_, remote) => {
                  try {
                    await remote.DeleteDatabase(undefined);

                    setShowRestartWarning(true);
                  } catch (e) {
                    alert(JSON.stringify((e as Error).message));
                  }
                });
              } catch (e) {
                alert((e as Error).message);
              }
            }}
          >
            Reset and Delete Database
          </Button>
        </ModalFooter>
      </Modal>

      {tracing ? (
        <>
          <ReactGlobeGl
            ringsData={arcs.flatMap((arc) =>
              arc.coords.map(([lat, lng]) => ({
                lat: lng,
                lng: lat,
                maxR: 2,
                propagationSpeed: 2,
                repeatPeriod: 400,
              }))
            )}
            ringColor={() => "#FF643280"}
            ringMaxRadius="maxR"
            ringPropagationSpeed="propagationSpeed"
            ringRepeatPeriod="repeatPeriod"
            arcsData={arcs}
            arcLabel={(d: any) => (d as IArc).label}
            arcStartLng={(d: any) => (d as IArc).coords[0][0]}
            arcStartLat={(d: any) => (d as IArc).coords[0][1]}
            arcEndLng={(d: any) => (d as IArc).coords[1][0]}
            arcEndLat={(d: any) => (d as IArc).coords[1][1]}
            arcDashLength={0.5}
            arcDashGap={0.25}
            arcDashInitialGap={1}
            arcDashAnimateTime={4000}
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
              open={isInspectorOpen}
              setOpen={(open) => {
                if (!open) {
                  setInWindow(false);
                }

                setIsInspectorOpen(open);
              }}
              setInWindow={(inWindow) => setInWindow(inWindow)}
              minimized={isInspectorMinimized}
              windowClassName={
                "pf-v6-x-new-window " +
                (darkMode ? `${DARK_THEME_CLASS_NAME} ` : "") +
                (cyberpunkMode ? `${CYBERPUNK_THEME_CLASS_NAME} ` : "")
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
        !isDBConfigurationRequired && (
          <Flex
            className="pf-v6-u-p-lg pf-v6-u-h-100"
            spaceItems={{ default: "spaceItemsMd" }}
            direction={{ default: "column" }}
            justifyContent={{ default: "justifyContentCenter" }}
            alignItems={{ default: "alignItemsCenter" }}
          >
            <FlexItem className="pf-v6-x-c-title">
              <img
                src={cyberpunkMode ? logoDarkCyberpunk : logoDark}
                alt="Connmapper logo"
                className="pf-v6-u-mb-xs pf-v6-x-c-logo"
              />
            </FlexItem>

            <FlexItem>
              <Flex direction={{ default: "row" }}>
                <FlexItem>
                  <Select
                    isOpen={deviceSelectorIsOpen}
                    selected={selectedDevicePcapName}
                    onSelect={(_, e) => {
                      setSelectedDevicePcapName(e as string);
                      setDeviceSelectorIsOpen(false);
                    }}
                    onOpenChange={() => setDeviceSelectorIsOpen((v) => !v)}
                    toggle={(toggleRef) => (
                      <MenuToggle
                        ref={toggleRef}
                        onClick={() => setDeviceSelectorIsOpen((v) => !v)}
                        isExpanded={deviceSelectorIsOpen}
                      >
                        {devices.find(
                          (d) => d.PcapName === selectedDevicePcapName
                        )?.NetName || ""}
                      </MenuToggle>
                    )}
                    shouldFocusToggleOnSelect
                  >
                    <SelectList>
                      {devices.map((d, i) => (
                        <SelectOption
                          key={i}
                          value={d.PcapName}
                          description={
                            d.PcapName === d.NetName
                              ? undefined
                              : `ID: ${d.PcapName}`
                          }
                        >
                          {d.NetName}
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
                              devices.find(
                                (d) => d.PcapName === selectedDevicePcapName
                              ) || devices[0]
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
      onEscapePress={() => setOpen(false)}
      aria-labelledby="traffic-inspector-title"
      className={
        (minimized ? "pf-v6-c-modal-box " : "pf-v6-c-modal-box--fullscreen ") +
        (rest?.modalClassName || "")
      }
    >
      <ModalHeader>{header}</ModalHeader>

      <ModalBody>{children}</ModalBody>
    </Modal>
  );
};

export default App;
