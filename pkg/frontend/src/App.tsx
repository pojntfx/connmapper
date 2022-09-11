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

const getLocalPosition = (): Promise<number[]> =>
  new Promise((res) =>
    navigator.geolocation.getCurrentPosition((s) =>
      res([s.coords.longitude, s.coords.latitude])
    )
  );

export default () => {
  const { width, height } = useWindowSize();
  const [packets, setPackets] = useState<Point[]>([]);

  useEffect(() => {
    (window as any).handlePacket = async (packet: Packet) => {
      await println(packet);

      let srcLongitude = packet.srcLongitude;
      let srcLatitude = packet.srcLatitude;
      if (srcLongitude === 0 && srcLatitude === 0) {
        [srcLongitude, srcLongitude] = await getLocalPosition();
      }

      let dstLongitude = packet.dstLongitude;
      let dstLatitude = packet.dstLatitude;
      if (dstLongitude === 0 && dstLatitude === 0) {
        [dstLongitude, dstLongitude] = await getLocalPosition();
      }

      setPackets((packets) => [
        ...packets,
        {
          name: `${packet.layerType}/${packet.nextLayerType} ${packet.length}B ${packet.srcIP} (${packet.srcCountryName}, ${packet.srcCityName}, ${srcLongitude}, ${srcLatitude}) -> ${packet.dstIP} (${packet.dstCountryName}, ${packet.dstCityName}, ${dstLongitude}, ${dstLatitude})`,
          coords: [
            [srcLongitude, srcLatitude],
            [dstLongitude, dstLatitude],
          ],
        },
      ]);
    };
  }, []);

  return (
    <ReactGlobeGl
      arcsData={packets}
      arcLabel={(d: any) => (d as Point).name}
      arcStartLng={(d: any) => (d as Point).coords[0][0]}
      arcStartLat={(d: any) => (d as Point).coords[0][1]}
      arcEndLng={(d: any) => (d as Point).coords[1][0]}
      arcEndLat={(d: any) => (d as Point).coords[1][1]}
      arcDashLength={0.4}
      arcDashGap={0.2}
      arcDashAnimateTime={1500}
      arcsTransitionDuration={0}
      globeImageUrl={earthTexture as string}
      bumpImageUrl={earthElevation as string}
      backgroundImageUrl={universeTexture as string}
      width={width}
      height={height}
    />
  );
};
