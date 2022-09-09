import { useEffect } from "react";
import ReactGlobeGl from "react-globe.gl";
import earthTexture from "three-globe/example/img/earth-night.jpg";
import earthElevation from "three-globe/example/img/earth-topology.png";
import universeTexture from "three-globe/example/img/night-sky.png";
import { useWindowSize } from "use-window-size-hook";
import "./index.css";

export default () => {
  const { width, height } = useWindowSize();

  useEffect(() => {
    (window as any).handlePacket = async (packet: Packet) => {
      await println(packet);
    };
  }, []);

  return (
    <ReactGlobeGl
      globeImageUrl={earthTexture as string}
      bumpImageUrl={earthElevation as string}
      backgroundImageUrl={universeTexture as string}
      width={width}
      height={height}
    />
  );
};
