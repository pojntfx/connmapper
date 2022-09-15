import { useEffect, useState } from "react";
import { v4 } from "uuid";
import "./index.css";

const getEventName = (id: string) => `rpc:${id}`;

export default () => {
  const [webSocket, setWebSocket] = useState<WebSocket>();

  useEffect(() => {
    const socket = new WebSocket("ws://localhost:1337");

    setWebSocket(socket);

    socket.addEventListener("open", () => {
      console.log("Connected to RPC server");
    });

    socket.addEventListener("message", (e) => {
      console.log("Dispatching message:", e.data);

      const msg = JSON.parse(e.data) as any[];

      document.dispatchEvent(
        new CustomEvent(getEventName(msg[0]), {
          detail: msg.slice(1),
        })
      );
    });

    socket.addEventListener("error", (e) =>
      console.error("Got error from RPC server:", e)
    );

    socket.addEventListener("close", () => {
      console.log("Disconnected from RPC server");
    });
  }, []);

  return (
    <main>
      <h1>Connmapper RPC Demo</h1>

      <div>
        <button
          onClick={async () => {
            const id = v4();

            webSocket?.send(
              JSON.stringify([
                id,
                "examplePrintString",
                [prompt("String to print")],
              ])
            );

            const rv = await new Promise((res) => {
              const handleResponse = (e: any) => {
                res((e as CustomEvent).detail);

                document.removeEventListener(getEventName(id), handleResponse);
              };

              document.addEventListener(getEventName(id), handleResponse);
            });

            console.log("Received response from print:", rv);
          }}
        >
          Print string
        </button>
      </div>
    </main>
  );
};
