const express = require('express');

const app = new express();

const random = (min, max) => Math.floor(Math.random() * (min - max + 1) + max);
const divisibleBy2 = number => number % 2 === 0;

app.get('/', async (request, response) => {
  const waitTime = random(1000, 3000);

  setTimeout(() => {
    return divisibleBy2(random(1, 100)) ?
      response.status(504).send('Gateway Timeout') :
      response.send('Ok');
  }, waitTime);
});

app.listen(3000);
