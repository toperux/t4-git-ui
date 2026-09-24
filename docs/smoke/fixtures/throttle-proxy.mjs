// A CONNECT proxy the walk controls: node proxy.mjs <port> [bytesPerSecond]
// Logs each tunnel's host and bytes; a throttle slows the server→app direction so a download can be cut.
import net from "node:net";
const port = Number(process.argv[2] ?? 8888);
const rate = Number(process.argv[3] ?? 0);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
net
  .createServer((client) => {
    client.once("data", (head) => {
      const m = /^CONNECT ([^:\s]+):(\d+)/.exec(head.toString());
      if (!m) return client.destroy();
      const [, host, p] = m;
      const up = net.connect(Number(p), host, () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        client.pipe(up);
        let n = 0;
        up.on("data", (chunk) => {
          n += chunk.length;
          if (!rate) return client.write(chunk);
          up.pause();
          client.write(chunk);
          setTimeout(() => up.resume(), (chunk.length / rate) * 1000);
        });
        up.on("end", () => log("closed", host, n, "bytes"));
      });
      log("CONNECT", host);
      up.on("error", () => client.destroy());
      client.on("error", () => up.destroy());
      client.on("close", () => up.destroy());
    });
  })
  .listen(port, "127.0.0.1", () => log("listening", port, rate ? `${rate} B/s` : "full speed"));
