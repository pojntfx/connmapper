package backend

import (
	"context"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcap"
	"github.com/oschwald/geoip2-golang"
	"github.com/pojntfx/dudirekta/pkg/rpc"
	"github.com/pojntfx/hydrapp/hydrapp-utils/pkg/utils"
	"nhooyr.io/websocket"
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
}

func (l *local) ListDevices(ctx context.Context) ([]string, error) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return []string{}, err
	}

	devices := []string{}
	for _, iface := range ifaces {
		devices = append(devices, iface.Name)
	}

	return devices, nil
}

func (l *local) TraceDevice(ctx context.Context, name string) error {
	// TODO: Add API for setting DB path
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	dbPath := filepath.Join(home, ".local", "share", "connmapper", "GeoLite2-City.mmdb")

	if _, err := os.Stat(dbPath); err != nil {
		return err
	}

	db, err := geoip2.Open(dbPath)
	if err != nil {
		return err
	}

	iface, err := net.InterfaceByName(name)
	if err != nil {
		return err
	}

	handle, err := pcap.OpenLive(name, int32(iface.MTU), true, pcap.BlockForever)
	if err != nil {
		return err
	}

	source := gopacket.NewPacketSource(handle, handle.LinkType())
	go func() {
		defer func() {
			handle.Close()
			_ = db.Close()
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
				}

				l.connectionsLock.Lock()

				// TODO: Add API for maximum connections to store
				if len(l.connections) > 1000000 {
					l.connections = map[string]tracedConnection{}
				}

				id := getTracedConnectionID(connection)

				_, ok := l.connections[id]
				if !ok {
					l.connections[id] = connection

					time.AfterFunc(time.Second*10, func() {
						l.connectionsLock.Lock()

						delete(l.connections, id)

						l.connectionsLock.Unlock()
					})
				}
				l.connectionsLock.Unlock()
			}
		}
	}()

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

type remote struct{}

func StartServer(ctx context.Context, addr string, heartbeat time.Duration, localhostize bool) (string, func() error, error) {
	if strings.TrimSpace(addr) == "" {
		addr = ":0"
	}

	registry := rpc.NewRegistry(
		&local{
			connections: map[string]tracedConnection{},
		},
		remote{},

		time.Second*10,
		ctx,
	)

	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return "", nil, err
	}

	clients := 0
	go func() {
		if err := http.Serve(listener, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			clients++

			log.Printf("%v clients connected", clients)

			defer func() {
				clients--

				if err := recover(); err != nil {
					w.WriteHeader(http.StatusInternalServerError)

					log.Printf("Client disconnected with error: %v", err)
				}

				log.Printf("%v clients connected", clients)
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

				go func() {
					if err := registry.Link(conn); err != nil {
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
