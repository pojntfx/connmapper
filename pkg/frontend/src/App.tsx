import { useEffect } from "react";
import ReactGlobeGl from "react-globe.gl";
import "./index.css";

export default () => {
  useEffect(() => {
    (window as any).handlePacket = async (packet: Packet) => {
      await println(packet);
    };
  }, []);

  return <ReactGlobeGl />;
};
