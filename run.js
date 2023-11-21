const fsevents = require("fsevents");
const glob = require("glob");
const http = require("http");
const httpProxy = require("http-proxy");
const { responseInterceptor } = require("http-proxy-middleware");

const target = process.env.TARGET ?? process.argv[2]
//
// Create a proxy server with latency
//
const proxyServer = httpProxy.createProxyServer({
  target,
  secure: false,
  xfwd: false
});

const isDocumentRequest = (req) => {
  if (typeof req.headers['accept'] === "undefined") return false;
  // 크롬, 사파리, 파이어폭스, Arc 브라우저 테스트해본 결과 아래 타입들이 document를 기대하는 요청임
  if (!/text\/html/.test(req.headers["accept"])) return false;
  if (!/application\/xhtml\+xml/.test(req.headers["accept"])) return false;
  if (!/application\/xml/.test(req.headers["accept"])) return false;
  return true;
}

proxyServer.on("proxyReq", (proxyReq, req) => {
  if (typeof req.headers.referer === "undefined") return;
  const { pathname } = new URL(req.headers.referer || `${target}/`);
  proxyReq.setHeader("referer", target + pathname);
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
      Buffer.from("<!-- Hello World -->"),
    ]);
    
    return bodyBuffer
  })
);


//
// Create your server that makes an operation that waits a while
// and then proxies the request
//
http
  .createServer(function (req, res) {
    return proxyServer.web(req, res, {
      changeOrigin: true,
      selfHandleResponse: true,
      cookieDomainRewrite: {
        "*": "",
      },
    });
  })
  .listen(8800);

// text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
// To start observation
const stop = fsevents.watch(target, (path, flags, id) => {
  const info = fsevents.getInfo(path, flags);
  console.log("🚀 ~ file: run.js:5 ~ stop ~ __dirname:", target, info);
});

process.on("SIGINT", function () {
  console.log("Caught interrupt signal");
  stop();
  process.exit();
});
