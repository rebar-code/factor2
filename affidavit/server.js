import { createRequestHandler } from "@remix-run/express";
import express from "express";

const app = express();

app.use(express.static("build/client"));

app.all(
  "*",
  createRequestHandler({
    build: () => import("./build/server/index.js"),
    mode: process.env.NODE_ENV,
  })
);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Express server listening on port ${port}`);
});

