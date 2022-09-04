package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcap"
	"github.com/oschwald/geoip2-golang"
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

func main() {
	home, err := os.UserHomeDir()
	if err != nil {
		panic(err)
	}

	dev := flag.String("dev", "eth0", "Network device to get packets from")
	dbFlag := flag.String("db", filepath.Join(home, ".local", "share", "connmapper", "GeoLite2-City.mmdb"), "Path to the GeoLite database to use")

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

			fmt.Printf(
				"%v/%v %vB %v (%v, %v, %v, %v) -> %v (%v, %v, %v, %v)\n",
				layerType,
				nextLayerType,
				length,
				srcIP,
				srcCountryName,
				srcCityName,
				srcLongitude,
				srcLatitude,
				dstIP,
				dstCountryName,
				dstCityName,
				dstLongitude,
				dstLatitude,
			)
		}
	}
}
