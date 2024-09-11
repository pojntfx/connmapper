package backend

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/cli/browser"
	"github.com/gopacket/gopacket"
	"github.com/gopacket/gopacket/layers"
	"github.com/oschwald/geoip2-golang"
	uutils "github.com/pojntfx/connmapper/pkg/utils"
	"github.com/pojntfx/hydrapp/hydrapp/pkg/ui"
	"github.com/pojntfx/hydrapp/hydrapp/pkg/utils"
	"github.com/pojntfx/panrpc/go/pkg/rpc"
	"nhooyr.io/websocket"
)

var (
	ErrDatabaseNotInArchive                     = errors.New("database not in archive")
	ErrUnexpectedErrorWhileStartingTraceCommand = errors.New("unexpected error while starting trace command")
	ErrUserDeniedEscalationPermission           = errors.New("user denied escalation permission")
	ErrCouldNotExecuteCommand                   = errors.New("could not execute command")
	ErrCouldNotCreateElevatedCommand            = errors.New("could not create elevated command")
)

const (
	TraceCommandEnv = "CONNMAPPER_TRACE"

	traceCommandHandshakeLen = 2
	flatpakIDEnv             = "FLATPAK_ID"
)

func lookupLocation(db *geoip2.Reader, ip net.IP) (
	countryName string,
	cityName string,
	longitude float64,
	latitude float64,
) {
	record, _ := db.City(ip)

	countryName = ""
	cityName = ""
	longitude = float64(0)
	latitude = float64(0)
	if record != nil {
		countryName = record.Country.Names["en"]
		cityName = record.City.Names["en"]
		longitude = record.Location.Longitude
		latitude = record.Location.Latitude
	}

	return
}

type tracedConnection struct {
	Timestamp int64 `json:"timestamp"`
	Length    int   `json:"length"`

	LayerType     string `json:"layerType"`
	NextLayerType string `json:"nextLayerType"`

	SrcIP          string  `json:"srcIP"`
	SrcCountryName string  `json:"srcCountryName"`
	SrcCityName    string  `json:"srcCityName"`
	SrcLongitude   float64 `json:"srcLongitude"`
	SrcLatitude    float64 `json:"srcLatitude"`

	DstIP          string  `json:"dstIP"`
	DstCountryName string  `json:"dstCountryName"`
	DstCityName    string  `json:"dstCityName"`
	DstLongitude   float64 `json:"dstLongitude"`
	DstLatitude    float64 `json:"dstLatitude"`

	timer *time.Timer
}

func getTracedConnectionID(connection tracedConnection) string {
	return connection.LayerType + "-" +
		connection.NextLayerType + "-" +
		connection.SrcIP + "-" +
		connection.DstIP + "-"
}

type local struct {
	connections     map[string]tracedConnection
	connectionsLock sync.Mutex

	tracingDevices     map[string]struct{}
	tracingDevicesLock sync.Mutex

	browserState *ui.BrowserState

	packetCache      []tracedConnection
	packetsCacheLock sync.Mutex

	summarized bool

	maxPacketCache      int
	maxConnectionsCache int
	dbPath              string
	dbDownloadURL       string

	ForRemotes func(cb func(remoteID string, remote remote) error) error
}

func (l *local) OpenExternalLink(ctx context.Context, url string) error {
	return browser.OpenURL(url)
}

func (l *local) CheckDatabase(ctx context.Context) (bool, error) {
	if _, err := os.Stat(l.dbPath); err != nil {
		return true, nil
	}

	return false, nil
}

func (l *local) DownloadDatabase(ctx context.Context, licenseKey string) error {
	if err := os.MkdirAll(filepath.Dir(l.dbPath), os.ModePerm); err != nil {
		return err
	}

	u, err := url.Parse(l.dbDownloadURL)
	if err != nil {
		return err
	}

	q := u.Query()
	q.Set("license_key", licenseKey)
	u.RawQuery = q.Encode()

	log.Println(u.String())

	hr, err := http.Get(u.String())
	if err != nil {
		return err
	}
	if hr.Body != nil {
		defer hr.Body.Close()
	}

	gr, err := gzip.NewReader(hr.Body)
	if err != nil {
		return err
	}
	defer gr.Close()

	tr := tar.NewReader(gr)
	found := false
	for {
		hdr, err := tr.Next()
		if err != nil {
			if err == io.EOF {
				break
			}

			return err
		}

		if !strings.HasSuffix(hdr.Name, ".mmdb") {
			continue
		}

		out, err := os.Create(l.dbPath)
		if err != nil {
			return err
		}
		defer out.Close()

		if _, err := io.Copy(out, tr); err != nil {
			return err
		}

		found = true
	}

	if !found {
		return ErrDatabaseNotInArchive
	}

	return nil
}

func (l *local) ListDevices(ctx context.Context) ([]uutils.Device, error) {
	return uutils.ListDevices(ctx)
}

func (l *local) SetMaxPacketCache(ctx context.Context, packetCache int) error {
	l.maxPacketCache = packetCache

	return nil
}

func (l *local) GetMaxPacketCache(ctx context.Context) (int, error) {
	return l.maxPacketCache, nil
}

func (l *local) SetDBDownloadURL(ctx context.Context, dbDownloadURL string) error {
	l.dbDownloadURL = dbDownloadURL

	return nil
}

func (l *local) GetDBDownloadURL(ctx context.Context) (string, error) {
	return l.dbDownloadURL, nil
}

func (l *local) SetMaxConnectionsCache(ctx context.Context, maxConnectionsCache int) error {
	l.maxConnectionsCache = maxConnectionsCache

	return nil
}

func (l *local) GetMaxConnectionsCache(ctx context.Context) (int, error) {
	return l.maxConnectionsCache, nil
}

func (l *local) SetDBPath(ctx context.Context, dbPath string) error {
	l.dbPath = dbPath

	return nil
}

func (l *local) GetDBPath(ctx context.Context) (string, error) {
	return l.dbPath, nil
}

func (l *local) RestartApp(ctx context.Context) error {
	bin, err := os.Executable()
	if err != nil {
		return err
	}

	if err := utils.ForkExec(
		bin,
		os.Args,
	); err != nil {
		return err
	}

	if err := uutils.KillBrowser(ctx, l.browserState); err != nil {
		return err
	}

	os.Exit(0)

	return nil
}

func (l *local) TraceDevice(ctx context.Context, device uutils.Device) error {
	l.tracingDevicesLock.Lock()
	defer l.tracingDevicesLock.Unlock()

	_, ok := l.tracingDevices[device.PcapName]
	if ok {
		return nil
	}

	if _, err := os.Stat(l.dbPath); err != nil {
		return err
	}

	db, err := geoip2.Open(l.dbPath)
	if err != nil {
		return err
	}

	recreateCmd := true
restartTraceCommand:
	bin, err := os.Executable()
	if err != nil {
		return err
	}

	if _, err := exec.LookPath(uutils.FlatpakSpawnCmd); err == nil {
		output, err := exec.CommandContext(
			ctx,

			uutils.FlatpakSpawnCmd,
			"--host",
			"flatpak",
			"info",
			"--show-location",
			os.Getenv(flatpakIDEnv),
		).CombinedOutput()
		if err != nil {
			return errors.Join(fmt.Errorf("could not query app location with output: %s", output), err)
		}

		bin = filepath.Join(string(output), "files", bin)
	}

	var cmd *exec.Cmd
	if recreateCmd {
		cmd = exec.CommandContext(ctx, bin, device.PcapName, fmt.Sprintf("%v", device.MTU))
	}
	cmd.Env = append(cmd.Env, TraceCommandEnv+"=true")

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return errors.Join(err, cmd.Process.Kill())
	}

	if err := cmd.Start(); err != nil {
		return err
	}

	handshake := make([]byte, traceCommandHandshakeLen)
	if _, err := stdout.Read(handshake); err != nil {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()

			_ = cmd.Wait()
		}

		return err
	}

	switch string(handshake) {
	case uutils.TraceCommandHandshakeHandleAcquired:
		break

	case uutils.TraceCommandHandshakeHandlePermissionDenied:
		if cmd.Process != nil {
			_ = cmd.Process.Kill()

			_ = cmd.Wait()
		}

		var peer *remote

		_ = l.ForRemotes(func(remoteID string, remote remote) error {
			peer = &remote

			return nil
		})

		if peer != nil {
			confirm, nerr := peer.GetEscalationPermission(ctx, false)
			if nerr != nil {
				return nerr
			}

			if !confirm {
				return ErrUserDeniedEscalationPermission
			}
		}

		switch runtime.GOOS {
		case "linux":
			setcapCommand, err := uutils.CreateElevatedCommand(ctx, "Authentication Required", "Authentication is needed to capture packets.", fmt.Sprintf(`setcap cap_net_raw,cap_net_admin=eip '%v'`, bin))
			if err != nil {
				return errors.Join(ErrCouldNotCreateElevatedCommand, err)
			}

			if output, err := setcapCommand.CombinedOutput(); err != nil {
				return errors.Join(ErrCouldNotExecuteCommand, fmt.Errorf("could not execute command with output: %s", output), err)
			}

		default:
			cmd, err = uutils.CreateElevatedCommand(ctx, "Authentication Required", "Authentication is needed to capture packets.", fmt.Sprintf("%v %v", bin, strings.Join(cmd.Args, " ")))
			if err != nil {
				return errors.Join(ErrCouldNotCreateElevatedCommand, err)
			}

			// We need to run the elevated command next
			recreateCmd = false
		}

		goto restartTraceCommand

	default:
		if cmd.Process != nil {
			_ = cmd.Process.Kill()

			_ = cmd.Wait()
		}

		return errors.Join(ErrUnexpectedErrorWhileStartingTraceCommand, errors.New(string(handshake)))
	}

	go func() {
		defer func() {
			if cmd.Process != nil {
				_ = cmd.Process.Kill()

				_ = cmd.Wait()
			}
			_ = db.Close()

			l.tracingDevicesLock.Lock()
			delete(l.tracingDevices, device.PcapName)
			l.tracingDevicesLock.Unlock()
		}()

		decoder := json.NewDecoder(stdout)
		for {
			var rawPacket uutils.Packet
			if err := decoder.Decode(&rawPacket); err != nil {

				log.Println("Could not continue capturing:", err)

				return
			}

			packet := gopacket.NewPacket(rawPacket.Data, rawPacket.LinkType, rawPacket.DecodeOptions)

			layerType := ""
			nextLayerType := ""
			var srcIP net.IP
			var dstIP net.IP

			if ipv4 := packet.Layer(layers.LayerTypeIPv4); ipv4 != nil {
				layer, ok := ipv4.(*layers.IPv4)
				if !ok {
					continue
				}

				layerType = "IPv4"
				nextLayerType = layer.NextLayerType().String()
				srcIP = layer.SrcIP
				dstIP = layer.DstIP
			} else if ipv6 := packet.Layer(layers.LayerTypeIPv6); ipv6 != nil {
				layer, ok := ipv6.(*layers.IPv6)
				if !ok {
					continue
				}

				layerType = "IPv6"
				nextLayerType = layer.NextLayerType().String()
				srcIP = layer.SrcIP
				dstIP = layer.DstIP
			}

			if srcIP != nil && dstIP != nil {
				srcCountryName,
					srcCityName,
					srcLongitude,
					srcLatitude := lookupLocation(db, srcIP)

				dstCountryName,
					dstCityName,
					dstLongitude,
					dstLatitude := lookupLocation(db, dstIP)

				connection := tracedConnection{
					time.Now().UnixMilli(),
					packet.Metadata().Length,

					layerType,
					nextLayerType,

					srcIP.String(),
					srcCountryName,
					srcCityName,
					srcLongitude,
					srcLatitude,

					dstIP.String(),
					dstCountryName,
					dstCityName,
					dstLongitude,
					dstLatitude,

					nil,
				}

				l.connectionsLock.Lock()

				if len(l.connections) > l.maxConnectionsCache {
					l.connections = map[string]tracedConnection{}
				}

				id := getTracedConnectionID(connection)

				candidate, ok := l.connections[id]
				if !ok {
					connection.timer = time.AfterFunc(time.Second*10, func() {
						l.connectionsLock.Lock()

						delete(l.connections, id)

						l.connectionsLock.Unlock()
					})

					l.connections[id] = connection
				} else {
					candidate.timer.Reset(time.Second * 10)
				}
				l.connectionsLock.Unlock()

				if l.summarized {
					l.packetsCacheLock.Lock()

					exists := false
					for i, candidate := range l.packetCache {
						if getTracedConnectionID(candidate) == getTracedConnectionID(connection) {
							// Don't increment length of self
							if i != len(l.packetCache)-1 {
								l.packetCache[i].Length += connection.Length
							}

							exists = true

							break
						}
					}

					if !exists {
						l.packetCache = append([]tracedConnection{connection}, l.packetCache...)
					}

					l.packetsCacheLock.Unlock()
				} else {
					l.packetsCacheLock.Lock()
					l.packetCache = append([]tracedConnection{connection}, l.packetCache...)
					l.packetsCacheLock.Unlock()

					if len(l.packetCache) > l.maxPacketCache {
						l.packetsCacheLock.Lock()
						if len(l.packetCache) > l.maxPacketCache {
							l.packetCache = l.packetCache[:l.maxPacketCache]
						}
						l.packetsCacheLock.Unlock()
					}
				}
			}
		}
	}()

	l.tracingDevices[device.PcapName] = struct{}{}

	return nil
}

func (l *local) GetConnections(ctx context.Context) ([]tracedConnection, error) {
	l.connectionsLock.Lock()
	defer l.connectionsLock.Unlock()

	connections := []tracedConnection{}
	for _, connection := range l.connections {
		connections = append(connections, connection)
	}

	return connections, nil
}

func (l *local) GetPackets(ctx context.Context) ([]tracedConnection, error) {
	l.packetsCacheLock.Lock()
	defer l.packetsCacheLock.Unlock()

	return l.packetCache, nil
}

func (l *local) SetIsSummarized(ctx context.Context, summarized bool) error {
	l.packetsCacheLock.Lock()
	defer l.packetsCacheLock.Unlock()

	l.summarized = summarized

	l.packetCache = []tracedConnection{}

	return nil
}

type remote struct {
	GetEscalationPermission func(ctx context.Context, restart bool) (bool, error)
}

func StartServer(ctx context.Context, addr string, heartbeat time.Duration, localhostize bool, browserState *ui.BrowserState) (string, func() error, error) {
	if strings.TrimSpace(addr) == "" {
		addr = ":0"
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", nil, err
	}

	dbPath := filepath.Join(home, ".local", "share", "connmapper", "GeoLite2-City.mmdb")

	service := &local{
		connections:    map[string]tracedConnection{},
		tracingDevices: map[string]struct{}{},
		browserState:   browserState,
		packetCache:    []tracedConnection{},

		maxPacketCache:      100,
		maxConnectionsCache: 1000000,
		dbPath:              dbPath,
		dbDownloadURL:       "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&suffix=tar.gz",
	}

	var clients atomic.Int64
	registry := rpc.NewRegistry[remote, json.RawMessage](
		service,

		&rpc.RegistryHooks{
			OnClientConnect: func(remoteID string) {
				log.Printf("%v clients connected", clients.Add(1))
			},
			OnClientDisconnect: func(remoteID string) {
				log.Printf("%v clients connected", clients.Add(-1))
			},
		},
	)
	service.ForRemotes = registry.ForRemotes

	listener, err := net.Listen("tcp", addr)
	if err != nil {
		panic(err)
	}

	log.Println("Listening on", listener.Addr())

	go func() {
		defer listener.Close()

		if err := http.Serve(listener, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if err := recover(); err != nil {
					w.WriteHeader(http.StatusInternalServerError)

					log.Println("Client disconnected with error:", err)
				}
			}()

			switch r.Method {
			case http.MethodGet:
				c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
					OriginPatterns: []string{"*"},
				})
				if err != nil {
					panic(err)
				}

				pings := time.NewTicker(time.Second / 2)
				defer pings.Stop()

				errs := make(chan error)
				go func() {
					for range pings.C {
						if err := c.Ping(ctx); err != nil {
							errs <- err

							return
						}
					}
				}()

				conn := websocket.NetConn(ctx, c, websocket.MessageText)
				defer conn.Close()

				linkCtx, cancelLinkCtx := context.WithCancel(r.Context())
				defer cancelLinkCtx()

				encoder := json.NewEncoder(conn)
				decoder := json.NewDecoder(conn)

				go func() {
					if err := registry.LinkStream(
						linkCtx,

						func(v rpc.Message[json.RawMessage]) error {
							return encoder.Encode(v)
						},
						func(v *rpc.Message[json.RawMessage]) error {
							return decoder.Decode(v)
						},

						func(v any) (json.RawMessage, error) {
							b, err := json.Marshal(v)
							if err != nil {
								return nil, err
							}

							return json.RawMessage(b), nil
						},
						func(data json.RawMessage, v any) error {
							return json.Unmarshal([]byte(data), v)
						},

						nil,
					); err != nil {
						errs <- err

						return
					}
				}()

				if err := <-errs; err != nil {
					panic(err)
				}
			default:
				w.WriteHeader(http.StatusMethodNotAllowed)
			}
		})); err != nil {
			if strings.HasSuffix(err.Error(), "use of closed network connection") {
				return
			}

			panic(err)
		}
	}()

	url, err := url.Parse("ws://" + listener.Addr().String())
	if err != nil {
		return "", nil, err
	}

	if localhostize {
		return utils.Localhostize(url.String()), listener.Close, nil
	}

	return url.String(), listener.Close, nil
}
