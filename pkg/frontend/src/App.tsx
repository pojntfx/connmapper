import { useEffect, useState } from "react";
import ReactGlobeGl from "react-globe.gl";
import earthTexture from "three-globe/example/img/earth-night.jpg";
import earthElevation from "three-globe/example/img/earth-topology.png";
import universeTexture from "three-globe/example/img/night-sky.png";
import { useWindowSize } from "use-window-size-hook";
import { v4 } from "uuid";
import "./index.css";

interface Arc {
  id: string;
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
  const [arcs, setArcs] = useState<Arc[]>([]);

  useEffect(() => {
    (async () => {
      const config = await getConfig();

      (window as any).handlePacket = async (packet: Packet) => {
        let srcLongitude = packet.srcLongitude;
        let srcLatitude = packet.srcLatitude;
        if (srcLongitude === 0 && srcLatitude === 0) {
          if (config.localLongitude !== 0 && config.localLatitude !== 0) {
            srcLongitude = config.localLongitude;
            srcLatitude = config.localLatitude;
          } else {
            const src = await getLocalPosition();

            srcLongitude = src[1];
            srcLatitude = src[1];
          }
        }

        let dstLongitude = packet.dstLongitude;
        let dstLatitude = packet.dstLatitude;
        if (dstLongitude === 0 && dstLatitude === 0) {
          if (config.localLongitude !== 0 && config.localLatitude !== 0) {
            dstLongitude = config.localLongitude;
            dstLatitude = config.localLatitude;
          } else {
            const dst = await getLocalPosition();

            dstLongitude = dst[0];
            dstLatitude = dst[1];
          }
        }

        const id = v4();

        setInterval(() => {
          setArcs((arcs) => arcs.filter((a) => a.id !== id));
        }, config.arcDuration);

        setArcs((arcs) => [
          ...arcs,
          {
            id,
            name: `${packet.layerType}/${packet.nextLayerType} ${packet.length}B ${packet.srcIP} (${packet.srcCountryName}, ${packet.srcCityName}, ${srcLongitude}, ${srcLatitude}) -> ${packet.dstIP} (${packet.dstCountryName}, ${packet.dstCityName}, ${dstLongitude}, ${dstLatitude})`,
            coords: [
              [srcLongitude, srcLatitude],
              [dstLongitude, dstLatitude],
            ],
          },
        ]);
      };
    })();
  }, []);

  return (
    <ReactGlobeGl
      arcsData={arcs}
      arcLabel={(d: any) => (d as Arc).name}
      arcStartLng={(d: any) => (d as Arc).coords[0][0]}
      arcStartLat={(d: any) => (d as Arc).coords[0][1]}
      arcEndLng={(d: any) => (d as Arc).coords[1][0]}
      arcEndLat={(d: any) => (d as Arc).coords[1][1]}
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
