const axios = require('axios');

const { CircuitBreaker } = require('circuit-breaker');

const circuitBreaker = new CircuitBreaker(() => {
  axios.get('http://localhost:3000').then(response => {
  }).catch(() => {
    throw new Error('504');
  });
});

circuitBreaker.call();
