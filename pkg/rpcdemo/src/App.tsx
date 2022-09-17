import { useEffect, useState } from "react";
import { v4 } from "uuid";
import "./index.css";

const getEventName = (id: string) => `rpc:${id}`;

const subscribe = (socket: WebSocket, broker: EventTarget) => {
  socket.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data) as any[];

    broker.dispatchEvent(
      new CustomEvent(getEventName(msg[0]), {
        detail: msg.slice(1),
      })
    );
  });
};

function call<Args extends any[], Return extends any[]>(
  socket: WebSocket,
  broker: EventTarget,
  name: string,
  args: Args
): Promise<Return> {
  const id = v4();

  socket.send(JSON.stringify([id, name, args]));

  return new Promise<Return>((res) => {
    const handleResponse = (e: any) => {
      res((e as CustomEvent).detail);

      broker.removeEventListener(getEventName(id), handleResponse);
    };

    broker.addEventListener(getEventName(id), handleResponse);
  });
}

export default () => {
  const [socket, setSocket] = useState<WebSocket>();

  useEffect(() => {
    const socket = new WebSocket(
      new URLSearchParams(window.location.search).get("socketURL") ||
        "ws://localhost:1337"
    );

    setSocket(socket);

    socket.addEventListener("open", () => {
      console.log("Connected to RPC server");
    });

    socket.addEventListener("error", (e) =>
      console.error("Got error from RPC server:", e)
    );

    socket.addEventListener("close", () => {
      console.log("Disconnected from RPC server");
    });

    subscribe(socket, document);
  }, []);

  return (
    <main>
      <h1>Connmapper RPC Demo</h1>

      <div>
        <button
          onClick={async () => {
            const res = await call(socket!, document, "examplePrintString", [
              prompt("String to print"),
            ]);

            alert(JSON.stringify(res));
          }}
        >
          Print string
        </button>

        <button
          onClick={async () => {
            const res = await call(socket!, document, "examplePrintStruct", [
              { name: prompt("Name to print") },
            ]);

            alert(JSON.stringify(res));
          }}
        >
          Print struct
        </button>

        <button
          onClick={async () => {
            const res = await call(socket!, document, "exampleReturnError", []);

            alert(JSON.stringify(res));
          }}
        >
          Return error
        </button>

        <button
          onClick={async () => {
            const res = await call(
              socket!,
              document,
              "exampleReturnString",
              []
            );

            alert(JSON.stringify(res));
          }}
        >
          Return string
        </button>

        <button
          onClick={async () => {
            const res = await call(
              socket!,
              document,
              "exampleReturnStruct",
              []
            );

            alert(JSON.stringify(res));
          }}
        >
          Return struct
        </button>

        <button
          onClick={async () => {
            const res = await call(
              socket!,
              document,
              "exampleReturnStringAndError",
              []
            );

            alert(JSON.stringify(res));
          }}
        >
          Return string and error
        </button>

        <button
          onClick={async () => {
            const res = await call(
              socket!,
              document,
              "exampleReturnStringAndNil",
              []
            );

            alert(JSON.stringify(res));
          }}
        >
          Return string and nil
        </button>
      </div>
    </main>
  );
};
