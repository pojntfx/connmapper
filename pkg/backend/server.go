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
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/cli/browser"
	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcap"
	"github.com/oschwald/geoip2-golang"
	uutils "github.com/pojntfx/connmapper/pkg/utils"
	"github.com/pojntfx/hydrapp/hydrapp/pkg/update"
	"github.com/pojntfx/hydrapp/hydrapp/pkg/utils"
	"github.com/pojntfx/panrpc/go/pkg/rpc"
	"nhooyr.io/websocket"
)

var (
	ErrDatabaseNotInArchive = errors.New("database not in archive")
)

const (
	flatpakSpawnCmd = "flatpak-spawn"
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

type Device struct {
	PcapName string
	NetName  string
	MTU      int
}

type local struct {
	connections     map[string]tracedConnection
	connectionsLock sync.Mutex

	tracingDevices     map[string]struct{}
	tracingDevicesLock sync.Mutex

	browserState *update.BrowserState

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

func (l *local) ListDevices(ctx context.Context) ([]Device, error) {
	pcapDevices, err := pcap.FindAllDevs()
	if err != nil {
		return []Device{}, err
	}

	netIfaces, err := net.Interfaces()
	if err != nil {
		return []Device{}, err
	}

	devices := []Device{}
	for _, pcapDevice := range pcapDevices {
		pcapAddresses := []string{}
		for _, cidr := range pcapDevice.Addresses {
			pcapAddresses = append(pcapAddresses, cidr.IP.String())
		}

		var netIface *net.Interface
		for _, candidate := range netIfaces {
			rawNetAddresses, err := candidate.Addrs()
			if err != nil {
				return []Device{}, err
			}

			netAddresses := []string{}
			for _, rawCandidateAddress := range rawNetAddresses {
				ip, _, err := net.ParseCIDR(rawCandidateAddress.String())
				if err != nil {
					return []Device{}, err
				}

				netAddresses = append(netAddresses, ip.String())
			}

			if slices.EqualFunc(netAddresses, pcapAddresses, func(a string, b string) bool {
				return a == b
			}) {
				netIface = &candidate

				break
			}
		}

		if netIface != nil {
			devices = append(devices, Device{
				PcapName: pcapDevice.Name,
				NetName:  netIface.Name,
				MTU:      netIface.MTU,
			})
		}
	}

	return devices, nil
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

func (l *local) RestartApp(ctx context.Context, fixPermissions bool) error {
	if fixPermissions {
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
				return nil
			}
		}
	}

	bin, err := os.Executable()
	if err != nil {
		return err
	}

	if fixPermissions {
		switch runtime.GOOS {
		case "linux":
			cmd := fmt.Sprintf("setcap cap_net_raw,cap_net_admin=eip %v", bin)
			if _, err := exec.LookPath(flatpakSpawnCmd); err == nil {
				cmd = flatpakSpawnCmd + " --host " + cmd
			}

			if err := uutils.RunElevatedCommand(cmd); err != nil {
				return err
			}
		default:
			if err := uutils.RunElevatedCommand(fmt.Sprintf("%v %v", bin, strings.Join(os.Args, " "))); err != nil {
				return err
			}
		}
	}

	if err := utils.ForkExec(
		bin,
		os.Args,
	); err != nil {
		return err
	}

	if err := uutils.KillBrowser(l.browserState); err != nil {
		return err
	}

	os.Exit(0)

	return nil
}

func (l *local) TraceDevice(ctx context.Context, device Device) error {
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

	handle, err := pcap.OpenLive(device.PcapName, int32(device.MTU), true, pcap.BlockForever)
	if err != nil {
		if strings.HasSuffix(err.Error(), "(socket: Operation not permitted)") {
			if err := l.RestartApp(ctx, true); err != nil {
				return err
			}
		} else {
			return err
		}
	}

	source := gopacket.NewPacketSource(handle, handle.LinkType())
	go func() {
		defer func() {
			handle.Close()
			_ = db.Close()

			l.tracingDevicesLock.Lock()
			delete(l.tracingDevices, device.PcapName)
			l.tracingDevicesLock.Unlock()
		}()

		for packet := range source.Packets() {
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

func StartServer(ctx context.Context, addr string, heartbeat time.Duration, localhostize bool, browserState *update.BrowserState) (string, func() error, error) {
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

	clients := 0
	registry := rpc.NewRegistry[remote, json.RawMessage](
		service,

		ctx,

		&rpc.Options{
			OnClientConnect: func(remoteID string) {
				clients++

				log.Printf("%v clients connected", clients)
			},
			OnClientDisconnect: func(remoteID string) {
				clients--

				log.Printf("%v clients connected", clients)
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

					log.Printf("Client disconnected with error: %v", err)
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

				encoder := json.NewEncoder(conn)
				decoder := json.NewDecoder(conn)

				go func() {
					if err := registry.LinkStream(
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
