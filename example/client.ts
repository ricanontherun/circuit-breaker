import * as http from "http";

import {CircuitBreaker} from "../src";

const fn = () => {
  return new Promise((resolve, reject) => {
    http.get("http://localhost:3000", (resp) => {
      const {statusCode} = resp;

      if (statusCode !== 200) {
        return reject(new Error(`API returned ${statusCode}`));
      }

      let data = "";

      resp.on("data", (chunk) => {
        data += chunk;
      });

      resp.on("end", () => {
        resolve(data);
      });

      resp.on("error", (streamErr) => {
        reject(streamErr);
      });
    }).on("error", (requestErr) => {
      resolve(requestErr);
    });
  });
};

const circuitBreaker = new CircuitBreaker(fn);

circuitBreaker.call().then((data) => {
  console.log(data);
}).catch((callErr) => {
  console.log(`CircuitBreaker: Caught ${callErr}`);
});
