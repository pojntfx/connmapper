import ReactGlobeGl from "react-globe.gl";
import "./index.css";

export default () => {
  (async () => {
    while (true) {
      const packet = await getPacket();

      await println(packet);
    }
  })();

  return <ReactGlobeGl />;
};
