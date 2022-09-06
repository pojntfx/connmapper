const root = document.getElementById("root");

const heading = document.createElement("h1");
heading.innerText = "Hello, world!";

root?.appendChild(heading);

setInterval(() => println("Hello from JS!"), 1000);
