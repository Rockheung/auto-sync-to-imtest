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

//
// Create your server that makes an operation that waits a while
// and then proxies the request
//
http
  .createServer(function (req, res) {
    proxyServer.web(req, res, {
      changeOrigin: true,
      selfHandleResponse: true,
      cookieDomainRewrite: {
        "*": "",
      },
    });
    // proxyServer.on("proxyReq", (proxyReq, req) => {
    //   if (typeof req.headers.referer === "undefined") return;
    //   const { pathname } = new URL(req.headers.referer || `${target}/`);
    //   proxyReq.setHeader("referer", target + pathname);
    // });
    proxyServer.on(
      "proxyRes",
      responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
        // document를 기대하는 요청이 아니면 그냥 리턴
        if (!/text\/html/.test(req.headers["accept"])) {
          return responseBuffer;
        }

        console.log(req.headers["accept"]);

        const bodyBuffer = Buffer.concat([
          responseBuffer,
          Buffer.from("<!-- Hello World -->"),
        ]);
        res.setHeader("content-length", bodyBuffer.length);
        
        return bodyBuffer
      })
    );
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
