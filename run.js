const fsevents = require("fsevents");
const glob = require("glob");
const http = require("http");
const httpProxy = require("http-proxy");
const { responseInterceptor } = require("http-proxy-middleware");
const { WebSocketServer } = require("ws");
// const fs = require("fs");
// const { program } = require("commander");

// program.option("-c, --config <file>", "config file path");
// program.option("-d, --debug", "config file path");


// node run.js "https://jissp.imtest.me" ~/imwebme/imweb
const [, , targetOrigin, watchPath] = process.argv;
const CWD = watchPath ?? process.cwd();
const msgRefresh = "refresh";
console.log("watch:", CWD);
// HARD CODE for now
const watchFiles = glob.sync(`${CWD}/**/*.{cm,sub,cls}`, {
  ignore: ["node_modules/**/*", ".git/**/*"],
});

const isDocumentRequest = (req) => {
  if (typeof req.headers["accept"] === "undefined") return false;
  // 크롬, 사파리, 파이어폭스, Arc 브라우저 테스트해본 결과 아래 타입들을 모두 포함하면 document를 기대하는 요청임
  if (!/text\/html/.test(req.headers["accept"])) return false;
  if (!/application\/xhtml\+xml/.test(req.headers["accept"])) return false;
  if (!/application\/xml/.test(req.headers["accept"])) return false;
  return true;
};

const proxyServer = httpProxy.createProxyServer({
  target: targetOrigin,
  secure: false,
  xfwd: false,
});

proxyServer.on("proxyReq", (proxyReq, req) => {
  if (typeof req.headers.referer === "undefined") return;
  const { pathname } = new URL(req.headers.referer || `${targetOrigin}/`);
  proxyReq.setHeader("referer", targetOrigin + pathname);
});

proxyServer.on(
  "proxyRes",
  responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
    // document를 기대하는 요청이 아니면 그냥 리턴
    if (!isDocumentRequest(req)) {
      return responseBuffer;
    }

    const bodyBuffer = Buffer.concat([
      responseBuffer,
      Buffer.from(`
<script>
const socket = new WebSocket("ws://localhost:8800");

socket.addEventListener("open", function (event) {
  socket.send("Hello Server!");
});

socket.addEventListener("message", function (event) {
  if (event.data === "${msgRefresh}") {
    window.location.reload();
  }
});

</script>`),
    ]);

    return bodyBuffer;
  })
);

//
// Create your server that makes an operation that waits a while
// and then proxies the request
//
const server = http.createServer(function (req, res) {
  return proxyServer.web(req, res, {
    changeOrigin: true,
    selfHandleResponse: true,
    cookieDomainRewrite: {
      "*": "",
    },
  });
});

server.listen(8800);

const wss = new WebSocketServer({ server });

wss.on("connection", function connection(ws) {
  ws.on("error", console.error);
  ws.on("message", function message(data) {
    console.log("received: %s", data);
    setTimeout(() => {
      ws.send(msgRefresh);
    }, 5000);
  });
});

// To start observation
const stop = fsevents.watch(CWD, (path, flags, id) => {
  const info = fsevents.getInfo(path, flags);
  console.log("🚀 ~ file: run.js:5 ~ stop ~ __dirname:", watchPath, info);
});

process.on("SIGINT", function () {
  console.log("Caught interrupt signal");
  stop();
  process.exit();
});
