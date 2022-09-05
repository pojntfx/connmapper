import { useCallback, useState } from "react";
import { Greet } from "../wailsjs/go/main/App";

export default () => {
  const [name, setName] = useState("");
  const handleOnSubmit = useCallback(async () => {
    const newName = await Greet(name);

    alert(newName);
  }, [name]);

  return (
    <div>
      <form onSubmit={handleOnSubmit}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input type="submit" value="Greet" />
      </form>
    </div>
  );
};
