import * as http from "http";

const random = (min, max) => Math.floor(Math.random() * (min - max + 1) + max);

const writeResponse = (response, statusCode, body, headers = {}) => {
  response.writeHead(statusCode, headers);
  response.write(body);
  response.end();
};

http.createServer((request, response) => {
  const waitTime = random(1000, 3000);

  setTimeout(() => {
    const randomNumber = random(1, 100);

    if (randomNumber % 2 === 0) {
      writeResponse(response, 504, "Gateway Timeout");
    } else {
      writeResponse(response, 200, "Ok");
    }
  }, waitTime);
}).listen(3000);
