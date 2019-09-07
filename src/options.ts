import {CircuitState} from "./state";

type IRandomNumberGenerator = (min: number, max: number) => number;

const random = (min: number, max: number): number => Math.floor((Math.random() * min) + max);

export class CircuitOptions {
  // The number of thrown Errors required to open the circuit, either
  // from an closed -> open state, or a half-open -> open state.
  public openThreshold: number = 1;

  // The number of successful calls required to close the circuit from a half-open state.
  public closeThreshold: number = 1;

  // When in a open state, the amount of time (milliseconds) before the circuit will
  // transition into the half-open state.
  public halfOpenTimeout: number = 60 * 1000;

  // When in a half-open state, the percentage of calls allowed to be made.
  public halfOpenCallRate: number = 50.0;

  // Initial circuit state, mostly useful for tests.
  public initialState: CircuitState = CircuitState.CLOSED;

  // Random number generator used in half-open state, also useful for tests.
  public random: IRandomNumberGenerator = random;
}
