import * as http from "http";

import { CircuitBreaker, CircuitState } from "../src";

const fn = () => {
  return new Promise((resolve, reject) => {
    console.log('-> GET "http://localhost:3000');

    http.get("http://localhost:3000", (resp) => {
      const { statusCode } = resp;

      console.log(`<- ${statusCode}`);
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

const circuitBreaker = new CircuitBreaker(fn, {
  // Close the circuit after 10 consecutive successful calls (no throw)
  closeThreshold: 10,

  // Open the circuit (if closed/half-open) after 5 consecutive failed calls.
  openThreshold: 5,

  // Automatically transition from closed to half-open after 5 seconds.
  halfOpenTimeout: 5000,

  // When the circuit is half-open, only allow 80% of calls to be made.
  halfOpenCallRate: 80.0,
});

circuitBreaker.on("state-change", ({ from, to }) => {
  console.log(`State: ${CircuitState[from]} -> ${CircuitState[to]}`);
});

(async () => {
  while (true) {
    setTimeout(() => {
      try {
        console.log(await circuitBreaker.call());
      } catch (err) {
        console.error(`${err}`);
      }
    }, 1000);
  }
})();
