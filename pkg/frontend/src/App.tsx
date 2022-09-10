import { useEffect, useState } from "react";
import ReactGlobeGl from "react-globe.gl";
import earthTexture from "three-globe/example/img/earth-night.jpg";
import earthElevation from "three-globe/example/img/earth-topology.png";
import universeTexture from "three-globe/example/img/night-sky.png";
import { useWindowSize } from "use-window-size-hook";
import "./index.css";

interface Point {
  name: string;
  coords: number[][];
}

export default () => {
  const { width, height } = useWindowSize();
  const [packets, setPackets] = useState<Point[]>([]);

  useEffect(() => {
    (window as any).handlePacket = async (packet: Packet) => {
      setPackets((packets) => [
        ...packets,
        {
          name: `${packet.layerType}/${packet.nextLayerType} ${packet.length}B ${packet.srcIP} (${packet.srcCountryName}, ${packet.srcCityName}, ${packet.srcLongitude}, ${packet.srcLatitude}) -> ${packet.dstIP} (${packet.dstCountryName}, ${packet.dstCityName}, ${packet.dstLongitude}, ${packet.dstLatitude})`,
          coords: [
            [packet.srcLongitude, packet.srcLatitude],
            [packet.dstLongitude, packet.dstLatitude],
          ],
        },
      ]);
    };
  }, []);

  println(packets);

  return (
    <ReactGlobeGl
      arcsData={packets}
      arcLabel={(d: any) => (d as Point).name}
      arcStartLat={(d: any) => (d as Point).coords[0][0]}
      arcStartLng={(d: any) => (d as Point).coords[0][1]}
      arcEndLat={(d: any) => (d as Point).coords[1][0]}
      arcEndLng={(d: any) => (d as Point).coords[1][1]}
      arcDashLength={0.4}
      arcDashGap={0.2}
      arcDashAnimateTime={1500}
      arcsTransitionDuration={0}
      arcColor={() => [`rgba(255, 255, 255, 0)`, `rgba(255, 255, 255, 255)`]}
      globeImageUrl={earthTexture as string}
      bumpImageUrl={earthElevation as string}
      backgroundImageUrl={universeTexture as string}
      width={width}
      height={height}
    />
  );
};
