# Circuit Breaker

Usage
```javascript
import Circuit from "./circuit";
```

Close on first caught Error
```javascript
const circuitOptions = {
  closeAfterFailedCalls: 1, // defaults to 1.
};
const circutBreaker = new CircuitBreaker(async () => {
  throw new Error('Yep');
});
```

```javascript
import Circuit from "./circuit";

const circutBreaker = new CircuitBreaker(async () => {
  throw new Error('Yep');
});

await circuitBreaker.call();

circuitBreaker.isClosed; // true

await circuitBreaker.call(); // Error
```
