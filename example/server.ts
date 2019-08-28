/**
 * Spins up a simple HTTP server which returns a random HTTP response code, at random latency.
 *
 * Example:
 * > ts-node server.ts 3000 500 2000
 * will start a server listening on port 3000, producing responses at a latency
 * between 500 milliseconds and 2 seconds.
 */

import {createServer, STATUS_CODES} from "http";

const statusCodes: string[] = Object.keys(STATUS_CODES);

const parseCLI = (): {[key: string]: number} => {
  const defaultOptions: {[key: string]: number} = {
    latencyMax: 3000,
    latencyMin: 1000,
    port: 3000,
  };

  const config: {[key: string]: number} = {};
  const [port, latencyMin, latencyMax] = process.argv.slice(2);

  config.port = parseInt(port, 10) || defaultOptions.port;
  config.latencyMin = parseInt(latencyMin, 10) || defaultOptions.latencyMin;
  config.latencyMax = parseInt(latencyMax, 10) || defaultOptions.latencyMax;

  return config;
};

const random = (min, max): number => Math.floor(Math.random() * (min - max + 1) + max);

const writeResponse = (response, statusCode, body): void => {
  response.writeHead(statusCode);
  response.write(body);
  response.end();
};

const main = (config) => {
  console.log("Starting server:", Object.keys(config).reduce((accum, curr) => {
    return `${accum} ${curr}=${config[curr]}`;
  }, ""));

  createServer((request, response) => {
    const latency = random(config.latencyMin, config.latencyMax);

    setTimeout(() => {
      const randomStatusCode = statusCodes[random(0, statusCodes.length - 1)];

      writeResponse(
        response,
        randomStatusCode,
        STATUS_CODES[randomStatusCode],
      );
    }, latency);
  }).listen(config.port, () => {
    console.log(`Server started, listening on localhost:${config.port}`);
  });
};

main(parseCLI());
