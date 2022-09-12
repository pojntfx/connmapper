package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcap"
	"github.com/oschwald/geoip2-golang"
	"github.com/phayes/freeport"
	"github.com/pojntfx/connmapper/pkg/frontend"
	"github.com/zserge/lorca"
)

const (
	packetHandlerFunc = `handlePacket`
)

type Packet struct {
	LayerType      string  `json:"layerType"`
	NextLayerType  string  `json:"nextLayerType"`
	Length         uint16  `json:"length"`
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

func main() {
	home, err := os.UserHomeDir()
	if err != nil {
		panic(err)
	}

	dev := flag.String("dev", "eth0", "Network device to get packets from")
	dbFlag := flag.String("db", filepath.Join(home, ".local", "share", "connmapper", "GeoLite2-City.mmdb"), "Path to the GeoLite database to use")
	addr := flag.String("addr", "", "URL to open instead of the embedded webserver")

	flag.Parse()

	if _, err := os.Stat(*dbFlag); err != nil {
		log.Fatal("Could not find database at path ", *dbFlag)
	}

	db, err := geoip2.Open(*dbFlag)
	if err != nil {
		panic(err)
	}
	defer db.Close()

	iface, err := net.InterfaceByName(*dev)
	if err != nil {
		panic(err)
	}

	handle, err := pcap.OpenLive(*dev, int32(iface.MTU), true, pcap.BlockForever)
	if err != nil {
		panic(err)
	}
	defer handle.Close()

	var u *url.URL
	if strings.TrimSpace(*addr) != "" {
		var err error
		u, err = url.Parse(*addr)
		if err != nil {
			panic(err)
		}
	} else {
		addr, err := net.ResolveTCPAddr("tcp", "localhost:0")
		if err != nil {
			panic(err)
		}

		port, err := freeport.GetFreePort()
		if err != nil {
			panic(err)
		}
		addr.Port = port

		stop := make(chan os.Signal, 1)
		signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

		root := fs.FS(frontend.UI)
		dist, err := fs.Sub(root, "dist")
		if err != nil {
			panic(err)
		}

		srv := http.Server{
			Addr:    addr.String(),
			Handler: http.FileServer(http.FS(dist)),
		}

		go func() {
			if err := srv.ListenAndServe(); err != nil {
				panic(err)
			}
		}()

		go func() {
			<-stop

			if err := srv.Close(); err != nil {
				panic(err)
			}
		}()

		u, err = url.Parse("http://" + addr.String())
		if err != nil {
			panic(err)
		}
	}

	ui, err := lorca.New(u.String(), "", 1024, 768, flag.Args()...)
	if err != nil {
		panic(err)
	}
	defer ui.Close()

	ui.Bind("println", func(val any) {
		log.Println("JS:", val)
	})

	go func() {
		source := gopacket.NewPacketSource(handle, handle.LinkType())
		for packet := range source.Packets() {
			layerType := ""
			nextLayerType := ""
			var srcIP net.IP
			var dstIP net.IP
			length := uint16(0)

			if ipv4 := packet.Layer(layers.LayerTypeIPv4); ipv4 != nil {
				layer, ok := ipv4.(*layers.IPv4)
				if !ok {
					continue
				}

				layerType = "IPv4"
				nextLayerType = layer.NextLayerType().String()
				srcIP = layer.SrcIP
				dstIP = layer.DstIP
				length = layer.Length
			} else if ipv6 := packet.Layer(layers.LayerTypeIPv6); ipv6 != nil {
				layer, ok := ipv6.(*layers.IPv6)
				if !ok {
					continue
				}

				layerType = "IPv6"
				nextLayerType = layer.NextLayerType().String()
				srcIP = layer.SrcIP
				dstIP = layer.DstIP
				length = layer.Length
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

				jsonPacket, err := json.Marshal(Packet{
					LayerType:      layerType,
					NextLayerType:  nextLayerType,
					Length:         length,
					SrcIP:          srcIP.String(),
					SrcCountryName: srcCountryName,
					SrcCityName:    srcCityName,
					SrcLongitude:   srcLongitude,
					SrcLatitude:    srcLatitude,
					DstIP:          dstIP.String(),
					DstCountryName: dstCountryName,
					DstCityName:    dstCityName,
					DstLongitude:   dstLongitude,
					DstLatitude:    dstLatitude,
				})
				if err != nil {
					panic(err)
				}

				ui.Eval(fmt.Sprintf(`%v(%v)`, packetHandlerFunc, string(jsonPacket)))
			}
		}
	}()

	<-ui.Done()
}
